import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PipelineStepper from "@/components/PipelineStepper";
import CostDisplay from "@/components/CostDisplay";
import StatusBadge from "@/components/StatusBadge";
import { ArrowRight, Brain, Loader2, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { useAsset, useBlueprint } from "@/hooks/useSupabaseQueries";

const Blueprint = () => {
  const { id } = useParams<{ id: string }>();
  const { data: asset, isLoading: assetLoading } = useAsset(id);
  const { data: blueprint, isLoading: bpLoading } = useBlueprint(id);

  if (assetLoading || bpLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!asset) {
    return <div className="p-8 text-center text-muted-foreground">Asset no encontrado.</div>;
  }

  // Parse blueprint JSON or use fallback
  const analysis = (blueprint?.analysis_json as any) || {};
  const variations = (blueprint?.variations_json as any[]) || [];
  const transcript = asset.transcript || "Sin transcript disponible.";

  const beats = analysis.estructura_beats || [];
  const risks = analysis.riesgos_politica || [];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Blueprint</h1>
            <StatusBadge status={asset.status} />
          </div>
          <p className="text-sm text-muted-foreground">Estructura estratégica del video analizado</p>
        </div>
        <PipelineStepper
          steps={[
            { label: "Ingesta", status: "done", cost: "$0.30" },
            { label: "Blueprint", status: blueprint ? "done" : "pending", cost: blueprint ? `$${blueprint.token_cost?.toFixed(2) ?? '0.00'}` : undefined },
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
            <p className="text-sm text-muted-foreground leading-relaxed font-mono">"{transcript}"</p>
          </div>

          {blueprint && (
            <div className="rounded-xl border border-border gradient-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Costo Blueprint</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Tokens entrada</span>
                  <span className="font-mono text-foreground">~{Math.round((transcript.length / 4))} tokens</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Tokens salida</span>
                  <span className="font-mono text-foreground">~{Math.round(JSON.stringify(blueprint.analysis_json).length / 4)} tokens</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">Subtotal</span>
                  <CostDisplay amount={`$${blueprint.token_cost?.toFixed(2) ?? '0.00'}`} />
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Right: Blueprint Analysis */}
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
          {blueprint ? (
            <>
              {/* Core analysis */}
              <div className="rounded-xl border border-border gradient-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  Análisis Estratégico
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Hook", value: analysis.hook },
                    { label: "Tipo de Hook", value: analysis.hook_type || analysis.tipo_hook },
                    { label: "Ángulo", value: analysis.angulo },
                    { label: "Emoción", value: analysis.emocion_dominante || analysis.emocion },
                    { label: "Mecanismo", value: analysis.mecanismo },
                  ].filter(item => item.value).map((item) => (
                    <div key={item.label} className="bg-muted/30 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{item.label}</p>
                      <p className="text-xs text-foreground font-medium">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Beats */}
              {beats.length > 0 && (
                <div className="rounded-xl border border-border gradient-card p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Estructura de Beats</h3>
                  <div className="space-y-2">
                    {beats.map((beat: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 text-xs">
                        <span className="font-mono text-primary w-14 text-right">{beat.tiempo}</span>
                        <span className="font-semibold text-foreground w-16">{beat.beat}</span>
                        <span className="text-muted-foreground">{beat.descripcion}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {risks.length > 0 && (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                  <h3 className="text-xs font-semibold text-warning flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Riesgos de Política
                  </h3>
                  <ul className="space-y-1">
                    {risks.map((r: string, i: number) => (
                      <li key={i} className="text-xs text-muted-foreground">• {r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Variations */}
              {variations.length > 0 && (
                <div className="rounded-xl border border-border gradient-card p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Variaciones Sugeridas</h3>
                  <div className="space-y-2">
                    {variations.map((v: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-md bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">
                            N{v.nivel || i + 1}
                          </span>
                          <span className="text-xs text-foreground">{v.descripcion}</span>
                        </div>
                        {v.palabras && <span className="text-[10px] text-muted-foreground font-mono">{v.palabras} palabras</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-border gradient-card p-8 text-center">
              <Brain className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-foreground font-medium">Blueprint no generado aún</p>
              <p className="text-xs text-muted-foreground mt-1">Genera el blueprint para analizar la estructura del video.</p>
            </div>
          )}

          <div className="flex justify-end">
            <Link to={`/asset/${id}/studio`}>
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
