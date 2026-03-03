import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PipelineStepper from "@/components/PipelineStepper";
import CostDisplay from "@/components/CostDisplay";
import StatusBadge from "@/components/StatusBadge";
import { Image, Mic, Film, Upload, Check, Loader2, User, Wand2 } from "lucide-react";
import { motion } from "framer-motion";
import { useAsset, useBlueprint } from "@/hooks/useSupabaseQueries";
import { useRender, useCreateRenderDraft, useUpdateRender, useGenerateBaseImage, useApproveImage } from "@/hooks/useRender";
import { useAuth } from "@/contexts/AuthContext";

const actors = [
  { id: "a1", name: "Sofia M.", style: "Natural, cercana", gender: "femenino" },
  { id: "a2", name: "Carlos R.", style: "Energético, joven", gender: "masculino" },
  { id: "a3", name: "Valentina L.", style: "Profesional, elegante", gender: "femenino" },
];

const voices = [
  { id: "v1", name: "Sarah", style: "Femenina, cálida", gender: "femenino" },
  { id: "v2", name: "George", style: "Masculino, confiable", gender: "masculino" },
  { id: "v3", name: "Lily", style: "Femenina, energética", gender: "femenino" },
];

const Studio = () => {
  const { id: assetId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: asset, isLoading: assetLoading } = useAsset(assetId);
  const { data: blueprint, isLoading: bpLoading } = useBlueprint(assetId);
  const { data: render, isLoading: renderLoading } = useRender(assetId);
  const createDraft = useCreateRenderDraft();
  const updateRender = useUpdateRender();
  const generateImage = useGenerateBaseImage();
  const approveImage = useApproveImage();

  const [level, setLevel] = useState("2");
  const [script, setScript] = useState("");
  const [actor, setActor] = useState("a1");
  const [voice, setVoice] = useState("v1");
  const [intensity, setIntensity] = useState([50]);
  const [scenario, setScenario] = useState("");
  const [populated, setPopulated] = useState(false);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [uploadingProduct, setUploadingProduct] = useState(false);

  // Auto-populate from blueprint data
  useEffect(() => {
    if (populated || !blueprint) return;

    const analysis = blueprint.analysis_json as any;
    const variations = blueprint.variations_json as any[];

    // Script: use Nivel 1 (exact clone)
    const nivel1 = variations?.find((v: any) => v.nivel === 1);
    if (nivel1?.guion) setScript(nivel1.guion);

    // Gender-based actor/voice selection
    const gender = analysis?.genero_detectado;
    if (gender === "masculino") {
      setActor("a2");
      setVoice("v2");
    } else {
      setActor("a1");
      setVoice("v1");
    }

    // Scenario from blueprint
    if (analysis?.escenario_sugerido) setScenario(analysis.escenario_sugerido);

    // Emotional intensity
    if (analysis?.intensidad_emocional != null) {
      setIntensity([analysis.intensidad_emocional]);
    }

    setPopulated(true);
  }, [blueprint, populated]);

  // Auto-create draft render if none exists
  useEffect(() => {
    if (!assetId || !asset || renderLoading || render || createDraft.isPending) return;
    if (asset.status === "BLUEPRINT_GENERATED" || asset.status === "IMAGE_APPROVED" || asset.status === "VIDEO_RENDERED") {
      createDraft.mutate({ assetId, config: { variation_level: 2 } });
    }
  }, [assetId, asset, render, renderLoading]);

  // Sync local state from existing render record (if no blueprint population happened)
  useEffect(() => {
    if (populated || !render) return;
    setLevel(String(render.variation_level ?? 2));
    setActor(render.actor_id ?? "a1");
    setVoice(render.voice_id ?? "v1");
    setIntensity([render.emotional_intensity ?? 50]);
    setScenario(render.scenario_prompt ?? "");
  }, [render, populated]);

  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const estDuration = Math.round((wordCount / 160) * 60);

  const imageGenerated = render?.status === "IMAGE_GENERATED" || render?.status === "IMAGE_APPROVED" || render?.status === "RENDERING" || render?.status === "DONE";
  const imageApproved = render?.status === "IMAGE_APPROVED" || render?.status === "RENDERING" || render?.status === "DONE";

  const handleSaveDraft = () => {
    if (!render) return;
    updateRender.mutate({
      renderId: render.id,
      fields: {
        variation_level: parseInt(level),
        actor_id: actor,
        voice_id: voice,
        emotional_intensity: intensity[0],
        scenario_prompt: scenario,
      },
    });
  };

  const handleProductImageSelect = async (file: File) => {
    setProductImage(file);
    setProductPreview(URL.createObjectURL(file));
  };

  const uploadProductImage = async (): Promise<string | null> => {
    if (!productImage || !assetId || !user) return render?.product_image_url || null;
    setUploadingProduct(true);
    try {
      const ext = productImage.name.split(".").pop() || "jpg";
      const path = `${user.id}/${assetId}/product.${ext}`;
      const { error } = await supabase.storage.from("ugc-assets").upload(path, productImage, { upsert: true });
      if (error) throw error;
      const { data: signed } = await supabase.storage.from("ugc-assets").createSignedUrl(path, 60 * 60 * 24 * 7);
      return signed?.signedUrl || null;
    } finally {
      setUploadingProduct(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!render) return;
    if (!productImage && !render.product_image_url) {
      return; // Button is already disabled, this is a safety check
    }
    // Upload product image first
    const productUrl = await uploadProductImage();
    // Save draft with product URL
    updateRender.mutate({
      renderId: render.id,
      fields: {
        variation_level: parseInt(level),
        actor_id: actor,
        voice_id: voice,
        emotional_intensity: intensity[0],
        scenario_prompt: scenario,
        product_image_url: productUrl,
      },
    });
    generateImage.mutate(render.id);
  };

  const handleApproveImage = () => {
    if (!render || !assetId) return;
    approveImage.mutate({ renderId: render.id, assetId });
  };

  // Handle variation level change — update script from blueprint
  const handleLevelChange = (newLevel: string) => {
    setLevel(newLevel);
    if (!blueprint) return;
    const variations = blueprint.variations_json as any[];
    const match = variations?.find((v: any) => v.nivel === parseInt(newLevel));
    if (match?.guion) setScript(match.guion);
  };

  if (assetLoading || renderLoading || bpLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Asset no encontrado.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Studio</h1>
            <StatusBadge status={render?.status === "IMAGE_APPROVED" ? "IMAGE_APPROVED" : render?.status === "IMAGE_GENERATED" ? "BLUEPRINT_GENERATED" : "DRAFT"} />
          </div>
          <p className="text-sm text-muted-foreground">Modulá guion, actor, voz y escenario</p>
        </div>
        <PipelineStepper
          steps={[
            { label: "Ingesta", status: "done" },
            { label: "Blueprint", status: "done" },
            { label: "Studio", status: "active" },
            { label: "Render", status: "pending" },
          ]}
        />
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Column 1: Script */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="rounded-xl border border-border gradient-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Film className="w-4 h-4 text-primary" />
                Guion
              </h3>
              <Select value={level} onValueChange={handleLevelChange}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Nivel 1 — Exacto</SelectItem>
                  <SelectItem value="2">Nivel 2 — Variación</SelectItem>
                  <SelectItem value="3">Nivel 3 — Nuevo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {level === "1" && !asset.rights_confirmed && (
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-xs text-warning">
                Nivel 1 requiere confirmación de derechos en la ingesta.
              </div>
            )}

            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Escribí el guion del video aquí…"
              className="min-h-[200px] text-sm bg-muted/30 border-border font-mono resize-none"
            />

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{wordCount} palabras</span>
              <span>~{estDuration}s estimado</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={handleSaveDraft}
              disabled={!render || updateRender.isPending}
            >
              {updateRender.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Guardar Borrador
            </Button>
          </div>
        </motion.div>

        {/* Column 2: Actor + Voice */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
          <div className="rounded-xl border border-border gradient-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Actor
            </h3>
            <div className="space-y-2">
              {actors.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setActor(a.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                    actor === a.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.name}</p>
                    <p className="text-[10px] text-muted-foreground">{a.style}</p>
                  </div>
                  {actor === a.id && <Check className="w-4 h-4 text-primary ml-auto" />}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border gradient-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Mic className="w-4 h-4 text-primary" />
              Voz
            </h3>
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {voices.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} — {v.style}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-xs text-muted-foreground">Intensidad Emocional</span>
                <span className="text-xs font-mono text-primary">{intensity[0]}%</span>
              </div>
              <Slider
                value={intensity}
                onValueChange={setIntensity}
                max={100}
                step={5}
                className="py-1"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>Calma</span>
                <span>Intenso</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Column 3: Scenario + Product + Image */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-4">
          <div className="rounded-xl border border-border gradient-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Image className="w-4 h-4 text-primary" />
              Escenario + Producto
            </h3>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Escenario</label>
              <Textarea
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                placeholder="Ej: Baño moderno con luz natural suave"
                className="min-h-[100px] text-sm bg-muted/30 border-border resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Producto <span className="text-destructive">*</span>
              </label>
              {productPreview || render?.product_image_url ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <img
                    src={productPreview || render?.product_image_url || ""}
                    alt="Product"
                    className="w-full h-32 object-contain bg-muted/20"
                  />
                  <button
                    onClick={() => { setProductImage(null); setProductPreview(null); }}
                    className="absolute top-1 right-1 bg-background/80 rounded-full p-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 hover:border-primary/50 transition-colors cursor-pointer">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Arrastrá o seleccioná imagen</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleProductImageSelect(f);
                    }}
                  />
                </label>
              )}
              {!productImage && !render?.product_image_url && (
                <p className="text-[10px] text-destructive mt-1">Requerido para generar imagen</p>
              )}
            </div>
          </div>

          {/* Image Generation */}
          <div className="rounded-xl border border-border gradient-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-primary" />
              Imagen Base
            </h3>

            {!imageGenerated ? (
              <div className="space-y-3">
                <CostDisplay amount="~$0.05" label="generación imagen" size="sm" />
                <Button
                  onClick={handleGenerateImage}
                  disabled={generateImage.isPending || uploadingProduct || !render || (!productImage && !render?.product_image_url)}
                  className="w-full gap-2"
                  size="sm"
                >
                  {generateImage.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generando (~60s)…
                    </>
                  ) : (
                    "Generar Imagen Base"
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {render?.base_image_url ? (
                  <div className="aspect-[9/16] rounded-lg overflow-hidden border border-border">
                    <img
                      src={render.base_image_url}
                      alt="Base image preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-[9/16] bg-muted rounded-lg flex items-center justify-center border border-border">
                    <div className="text-center">
                      <Image className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <span className="text-xs text-muted-foreground">Preview imagen base</span>
                    </div>
                  </div>
                )}
                {!imageApproved ? (
                  <Button
                    onClick={handleApproveImage}
                    disabled={approveImage.isPending}
                    variant="outline"
                    className="w-full gap-2 border-success text-success hover:bg-success/10"
                    size="sm"
                  >
                    {approveImage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Aprobar Imagen
                  </Button>
                ) : (
                  <p className="text-xs text-success text-center font-medium">✓ Imagen aprobada</p>
                )}
              </div>
            )}
          </div>

          {/* Final Render */}
          {imageApproved && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Render Final</h3>
                <CostDisplay amount="~$2.50" label="TTS + video + lipsync" size="md" />
                <p className="text-xs text-muted-foreground">
                  Aprobá la imagen antes de renderizar: así controlás calidad y costo.
                </p>
                <Button disabled className="w-full gap-2">
                  Generar Video Final
                  <Film className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Studio;
