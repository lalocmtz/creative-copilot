import { useState } from "react";
import { Button } from "@/components/ui/button";
import PipelineStepper from "@/components/PipelineStepper";
import CostDisplay from "@/components/CostDisplay";
import StatusBadge from "@/components/StatusBadge";
import { ArrowRight, Brain, Loader2, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const mockTranscript = `"Chicas, necesitan esto para el verano. Este sérum me cambió la piel en 2 semanas. Miren la textura, se absorbe al instante. Yo lo uso mañana y noche. Antes mi piel estaba opaca, ahora brilla. Link en bio, corran que se acaba."`;

const mockBlueprint = {
  hook: "Chicas, necesitan esto para el verano",
  hook_type: "Llamado de identidad + urgencia temporal",
  angulo: "Transformación personal (antes/después implícito)",
  emocion_dominante: "Deseo aspiracional + confianza social",
  mecanismo: "Demostración sensorial (textura + absorción)",
  estructura_beats: [
    { beat: "Hook", tiempo: "0-3s", descripcion: "Llamado directo al target" },
    { beat: "Claim", tiempo: "3-7s", descripcion: "Resultado + timeframe (2 semanas)" },
    { beat: "Demo", tiempo: "7-13s", descripcion: "Prueba visual del producto" },
    { beat: "Rutina", tiempo: "13-16s", descripcion: "Contexto de uso personal" },
    { beat: "Contraste", tiempo: "16-18s", descripcion: "Antes vs ahora" },
    { beat: "CTA", tiempo: "18-20s", descripcion: "Urgencia + link" },
  ],
  riesgos_politica: [
    "Claim 'me cambió la piel en 2 semanas' requiere evidencia o disclaimer",
    "Implica resultado cosmético sin disclaimer médico",
  ],
  variaciones: [
    { nivel: 1, descripcion: "Guion exacto con nuevo actor y escenario", palabras: 48 },
    { nivel: 2, descripcion: "Misma estructura, hooks alternativos: 'Este producto me tiene obsesionada'", palabras: 52 },
    { nivel: 3, descripcion: "Nuevo ángulo: rutina minimalista, tono educativo-relajado", palabras: 45 },
  ],
};

const Blueprint = () => {
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(true);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Blueprint</h1>
            <StatusBadge status="BLUEPRINT_GENERATED" />
          </div>
          <p className="text-sm text-muted-foreground">Estructura estratégica del video analizado</p>
        </div>
        <PipelineStepper
          steps={[
            { label: "Ingesta", status: "done", cost: "$0.30" },
            { label: "Blueprint", status: "done", cost: "$0.15" },
            { label: "Studio", status: "pending" },
            { label: "Render", status: "pending" },
          ]}
        />
      </div>

      <div className="grid grid-cols-[1fr_1.3fr] gap-6">
        {/* Left: Transcript */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="rounded-xl border border-border gradient-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary" />
              Transcript
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed font-mono">{mockTranscript}</p>
          </div>

          <div className="rounded-xl border border-border gradient-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Costo Blueprint</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Tokens entrada</span>
                <span className="font-mono text-foreground">~820 tokens</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Tokens salida</span>
                <span className="font-mono text-foreground">~1,200 tokens</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between text-xs">
                <span className="text-muted-foreground">Subtotal</span>
                <CostDisplay amount="$0.15" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right: Blueprint Analysis */}
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
          {/* Core analysis */}
          <div className="rounded-xl border border-border gradient-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Análisis Estratégico
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Hook", value: mockBlueprint.hook },
                { label: "Tipo de Hook", value: mockBlueprint.hook_type },
                { label: "Ángulo", value: mockBlueprint.angulo },
                { label: "Emoción", value: mockBlueprint.emocion_dominante },
                { label: "Mecanismo", value: mockBlueprint.mecanismo },
              ].map((item) => (
                <div key={item.label} className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{item.label}</p>
                  <p className="text-xs text-foreground font-medium">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Beats */}
          <div className="rounded-xl border border-border gradient-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Estructura de Beats</h3>
            <div className="space-y-2">
              {mockBlueprint.estructura_beats.map((beat, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="font-mono text-primary w-14 text-right">{beat.tiempo}</span>
                  <span className="font-semibold text-foreground w-16">{beat.beat}</span>
                  <span className="text-muted-foreground">{beat.descripcion}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Warnings */}
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
            <h3 className="text-xs font-semibold text-warning flex items-center gap-2 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              Riesgos de Política
            </h3>
            <ul className="space-y-1">
              {mockBlueprint.riesgos_politica.map((r, i) => (
                <li key={i} className="text-xs text-muted-foreground">• {r}</li>
              ))}
            </ul>
          </div>

          {/* Variations */}
          <div className="rounded-xl border border-border gradient-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Variaciones Sugeridas</h3>
            <div className="space-y-2">
              {mockBlueprint.variaciones.map((v) => (
                <div key={v.nivel} className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-md bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">
                      N{v.nivel}
                    </span>
                    <span className="text-xs text-foreground">{v.descripcion}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">{v.palabras} palabras</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Link to="/asset/1/studio">
              <Button className="gap-2">
                Abrir Studio
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Blueprint;
