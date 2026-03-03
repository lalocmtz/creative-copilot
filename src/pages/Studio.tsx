import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PipelineStepper from "@/components/PipelineStepper";
import CostDisplay from "@/components/CostDisplay";
import StatusBadge from "@/components/StatusBadge";
import { Image, Mic, Film, Upload, Check, Loader2, User, Wand2 } from "lucide-react";
import { motion } from "framer-motion";

const actors = [
  { id: "a1", name: "Sofia M.", style: "Natural, cercana" },
  { id: "a2", name: "Carlos R.", style: "Energético, joven" },
  { id: "a3", name: "Valentina L.", style: "Profesional, elegante" },
];

const voices = [
  { id: "v1", name: "Sarah", style: "Femenina, cálida" },
  { id: "v2", name: "George", style: "Masculino, confiable" },
  { id: "v3", name: "Lily", style: "Femenina, energética" },
];

const Studio = () => {
  const [level, setLevel] = useState("2");
  const [script, setScript] = useState(
    "Este producto me tiene obsesionada. Miren esta textura, se siente como seda en la piel. Lo uso cada mañana y la diferencia es real. Mi piel antes estaba apagada, ahora la gente me pregunta qué me hago. Link en bio, está en descuento."
  );
  const [actor, setActor] = useState("a1");
  const [voice, setVoice] = useState("v1");
  const [intensity, setIntensity] = useState([65]);
  const [scenario, setScenario] = useState("Baño moderno con luz natural suave, espejo grande");
  const [imageGenerated, setImageGenerated] = useState(false);
  const [imageApproved, setImageApproved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [rendering, setRendering] = useState(false);

  const wordCount = script.trim().split(/\s+/).length;
  const estDuration = Math.round((wordCount / 160) * 60);

  const handleGenerateImage = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setImageGenerated(true);
    }, 2000);
  };

  const handleRender = () => {
    setRendering(true);
    setTimeout(() => setRendering(false), 3000);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Studio</h1>
            <StatusBadge status={imageApproved ? "IMAGE_APPROVED" : imageGenerated ? "BLUEPRINT_GENERATED" : "DRAFT"} />
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
              <Select value={level} onValueChange={setLevel}>
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

            {level === "1" && (
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-xs text-warning">
                Nivel 1 requiere confirmación de derechos en la ingesta.
              </div>
            )}

            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="min-h-[200px] text-sm bg-muted/30 border-border font-mono resize-none"
            />

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{wordCount} palabras</span>
              <span>~{estDuration}s estimado</span>
            </div>

            <Button variant="outline" size="sm" className="w-full text-xs">
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

        {/* Column 3: Scenario + Product */}
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
                className="min-h-[70px] text-sm bg-muted/30 border-border resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Producto</label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 hover:border-primary/50 transition-colors cursor-pointer">
                <Upload className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Arrastrá o seleccioná imagen</span>
              </div>
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
                <CostDisplay amount="~$0.08" label="generación imagen" size="sm" />
                <Button onClick={handleGenerateImage} disabled={generating} className="w-full gap-2" size="sm">
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generando…
                    </>
                  ) : (
                    "Generar Imagen Base"
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="aspect-[9/16] bg-muted rounded-lg flex items-center justify-center border border-border">
                  <div className="text-center">
                    <Image className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <span className="text-xs text-muted-foreground">Preview imagen base</span>
                  </div>
                </div>
                {!imageApproved ? (
                  <Button onClick={() => setImageApproved(true)} variant="outline" className="w-full gap-2 border-success text-success hover:bg-success/10" size="sm">
                    <Check className="w-4 h-4" />
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
                <Button onClick={handleRender} disabled={rendering} className="w-full gap-2">
                  {rendering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Renderizando (~45s)…
                    </>
                  ) : (
                    <>
                      Generar Video Final
                      <Film className="w-4 h-4" />
                    </>
                  )}
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
