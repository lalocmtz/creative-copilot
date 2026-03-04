import { useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useAsset } from "@/hooks/useSupabaseQueries";
import { useGenerateBaseImage, useApproveVariantImage, useGenerateAllBaseImages, useUploadProductImage } from "@/hooks/useVariants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatusBadge from "@/components/StatusBadge";
import { Loader2, Image, Check, ArrowRight, Wand2, Film, Upload, X, Package } from "lucide-react";
import { motion } from "framer-motion";

const BEAT_COLORS: Record<string, string> = {
  hook: "bg-destructive/20 text-destructive border-destructive/30",
  demo: "bg-primary/20 text-primary border-primary/30",
  proof: "bg-warning/20 text-warning border-warning/30",
  cta: "bg-success/20 text-success border-success/30",
};

const VariantsPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: asset, isLoading, refetch } = useAsset(id);
  const generateImage = useGenerateBaseImage();
  const approveImage = useApproveVariantImage();
  const generateAll = useGenerateAllBaseImages();
  const uploadProduct = useUploadProductImage();
  const [activeTab, setActiveTab] = useState("A");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    uploadProduct.mutate({ assetId: id!, file }, { onSuccess: () => refetch() });
  }, [id, uploadProduct, refetch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) handleFileUpload(file);
        break;
      }
    }
  }, [handleFileUpload]);

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!asset) return <div className="p-8 text-center text-muted-foreground">Asset no encontrado</div>;

  const variants = (asset.variants_json as any[]) || [];
  if (!variants.length) return (
    <div className="p-8 text-center text-muted-foreground">
      <p>No hay variantes generadas.</p>
      <Link to="/assets/new"><Button className="mt-4">Crear nueva ingesta</Button></Link>
    </div>
  );

  const metadata = (asset.metadata_json as any) || {};
  const productImageUrl = metadata.product_image_url;

  const handleGenerateImage = (variantId: string) => {
    generateImage.mutate({ assetId: id!, variantId }, { onSuccess: () => refetch() });
  };

  const handleApproveImage = (variantId: string) => {
    approveImage.mutate({ assetId: id!, variantId }, { onSuccess: () => refetch() });
  };

  const handleGenerateAll = () => {
    const ids = variants.map((v: any) => v.variant_id);
    generateAll.mutate({ assetId: id!, variantIds: ids }, { onSuccess: () => refetch() });
  };

  const handleRemoveProduct = () => {
    uploadProduct.mutate({ assetId: id!, file: null }, { onSuccess: () => refetch() });
  };

  const anyApproved = variants.some((v: any) => v.base_image_approved);

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6" onPaste={handlePaste}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Variantes A/B/C</h1>
          <p className="text-sm text-muted-foreground mt-1">Sube la imagen del producto y genera imágenes base.</p>
        </div>
        <StatusBadge status={asset.status} />
      </div>

      {/* Product Image Upload */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Package className="w-4 h-4" /> Imagen del Producto
        </h3>
        {productImageUrl ? (
          <div className="relative inline-block">
            <div className="rounded-lg overflow-hidden border border-border bg-card w-32 h-32">
              <img src={productImageUrl} alt="Producto" className="w-full h-full object-contain" />
            </div>
            <button
              onClick={handleRemoveProduct}
              className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground w-6 h-6 flex items-center justify-center hover:bg-destructive/80 transition-colors"
              disabled={uploadProduct.isPending}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
              dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 bg-card"
            }`}
          >
            {uploadProduct.isPending ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Subiendo…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Arrastra, pega (Ctrl+V) o haz clic para subir
                </p>
                <p className="text-xs text-muted-foreground/60">
                  La IA integrará el producto de forma realista en las imágenes
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
          </div>
        )}
      </div>

      {/* Batch action */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={handleGenerateAll}
          disabled={generateAll.isPending || generateImage.isPending}
          className="gap-2"
        >
          {generateAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          Generar las 3 imágenes base
        </Button>
        {anyApproved && (
          <Link to={`/assets/${id}/render`}>
            <Button className="gap-2">
              <Film className="w-4 h-4" /> Animar con Sora2
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-xs">
          {variants.map((v: any) => (
            <TabsTrigger key={v.variant_id} value={v.variant_id} className="gap-1.5">
              Variante {v.variant_id}
              {v.base_image_approved && <Check className="w-3 h-3 text-success" />}
            </TabsTrigger>
          ))}
        </TabsList>

        {variants.map((variant: any) => (
          <TabsContent key={variant.variant_id} value={variant.variant_id}>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {/* Beat Timeline */}
              <div>
                <h3 className="text-sm font-medium text-foreground mb-3">Beat Timeline</h3>
                <div className="grid grid-cols-4 gap-2">
                  {(variant.shotlist || []).map((shot: any, i: number) => (
                    <div key={i} className={`rounded-lg border p-3 ${BEAT_COLORS[shot.beat] || "bg-muted/20 text-muted-foreground border-border"}`}>
                      <p className="text-xs font-semibold uppercase mb-1">{shot.beat}</p>
                      <p className="text-xs opacity-80">{shot.camera}</p>
                      <p className="text-xs mt-1">{shot.action}</p>
                      {shot.on_screen_text && <p className="text-[10px] mt-1 opacity-60">📝 {shot.on_screen_text}</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actor + Scene */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Actor</p>
                  <p className="text-sm text-foreground">{variant.variant?.actor_profile || "N/A"}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Escena</p>
                  <p className="text-sm text-foreground">{variant.variant?.scene_type || "N/A"}</p>
                  <p className="text-xs text-muted-foreground mt-1">{variant.variant?.wardrobe || ""}</p>
                </div>
              </div>

              {/* Script */}
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2">Script</h3>
                {variant.script?.mode === "silent_visual" ? (
                  <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground italic">
                    Sin voz, solo acciones visuales
                  </div>
                ) : (
                  <Textarea
                    value={(variant.script?.lines || []).join("\n")}
                    readOnly
                    className="min-h-[100px] text-sm bg-muted/20 border-border resize-none"
                  />
                )}
              </div>

              {/* Image generation + preview */}
              <div className="space-y-3">
                {variant.base_image_url ? (
                  <div className="space-y-3">
                    <div className="rounded-lg overflow-hidden border border-border bg-black">
                      <img
                        src={variant.base_image_url}
                        alt={`Variante ${variant.variant_id} base image`}
                        className="w-full max-h-[400px] object-contain"
                      />
                    </div>
                    <div className="flex gap-2">
                      {!variant.base_image_approved ? (
                        <>
                          <Button
                            onClick={() => handleApproveImage(variant.variant_id)}
                            disabled={approveImage.isPending}
                            className="gap-2 flex-1"
                          >
                            {approveImage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Aprobar Imagen
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleGenerateImage(variant.variant_id)}
                            disabled={generateImage.isPending}
                            className="gap-2"
                          >
                            Regenerar
                          </Button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-success text-sm font-medium">
                          <Check className="w-4 h-4" /> Imagen aprobada
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => handleGenerateImage(variant.variant_id)}
                    disabled={generateImage.isPending}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {generateImage.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando imagen…</> : <><Image className="w-4 h-4" /> Generate Base Image</>}
                  </Button>
                )}
              </div>
            </motion.div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default VariantsPage;
