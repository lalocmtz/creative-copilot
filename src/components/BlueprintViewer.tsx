import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Brain, BarChart3, Lightbulb } from "lucide-react";

interface BlueprintViewerProps {
  analysis: any;
  variations: any[];
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

const BlueprintViewer = ({ analysis, variations }: BlueprintViewerProps) => {
  const beats = analysis?.estructura_beats || [];
  const risks = analysis?.riesgos_politica || [];

  return (
    <Tabs defaultValue="analysis" className="w-full">
      <TabsList className="grid w-full grid-cols-3 mb-4">
        <TabsTrigger value="analysis" className="text-xs gap-1.5">
          <Brain className="w-3.5 h-3.5" />
          Análisis
        </TabsTrigger>
        <TabsTrigger value="variations" className="text-xs gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          Variaciones
        </TabsTrigger>
        <TabsTrigger value="risks" className="text-xs gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          Riesgos
        </TabsTrigger>
      </TabsList>

      {/* Tab: Análisis */}
      <TabsContent value="analysis" className="space-y-4">
        <div className="rounded-xl border border-border gradient-card p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Hook", value: analysis?.hook },
              { label: "Tipo de Hook", value: analysis?.hook_type },
              { label: "Ángulo", value: analysis?.angulo },
              { label: "Emoción", value: analysis?.emocion_dominante },
              { label: "Mecanismo", value: analysis?.mecanismo },
              { label: "Género Detectado", value: analysis?.genero_detectado },
            ]
              .filter((item) => item.value)
              .map((item) => (
                <div key={item.label} className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    {item.label}
                  </p>
                  <p className="text-xs text-foreground font-medium">{item.value}</p>
                </div>
              ))}
          </div>
          {analysis?.escenario_sugerido && (
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Escenario Sugerido
              </p>
              <p className="text-xs text-foreground leading-relaxed">
                {analysis.escenario_sugerido}
              </p>
            </div>
          )}
        </div>

        {beats.length > 0 && (
          <div className="rounded-xl border border-border gradient-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Estructura de Beats</h3>
            <div className="space-y-2">
              {beats.map((beat: any, i: number) => (
                <div key={i} className="flex items-start gap-3 text-xs">
                  <span className="font-mono text-primary w-14 text-right shrink-0">
                    {beat.tiempo}
                  </span>
                  <span className="font-semibold text-foreground w-auto shrink-0">
                    {beat.beat}
                  </span>
                  <span className="text-muted-foreground">{beat.descripcion}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {analysis?.intensidad_emocional != null && (
          <div className="rounded-xl border border-border gradient-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-2">Intensidad Emocional</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${analysis.intensidad_emocional}%` }}
                />
              </div>
              <span className="text-xs font-mono text-primary">{analysis.intensidad_emocional}%</span>
            </div>
          </div>
        )}
      </TabsContent>

      {/* Tab: Variaciones */}
      <TabsContent value="variations" className="space-y-3">
        {variations.map((v: any, i: number) => {
          const wordCount = v.guion?.split(/\s+/).length || 0;
          const estDuration = Math.round((wordCount / 160) * 60);
          return (
            <div
              key={i}
              className="rounded-xl border border-border gradient-card p-5 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">
                  N{v.nivel || i + 1}
                </span>
                <div className="flex-1">
                  <span className="text-sm font-semibold text-foreground">{v.titulo}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground font-mono block">
                    {wordCount} palabras
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    ~{estDuration}s
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pl-10">
                "{v.guion}"
              </p>
              {v.cambios_clave?.length > 0 && (
                <div className="pl-10 flex flex-wrap gap-1 mt-1">
                  {v.cambios_clave.map((c: string, ci: number) => (
                    <span
                      key={ci}
                      className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </TabsContent>

      {/* Tab: Riesgos */}
      <TabsContent value="risks" className="space-y-4">
        {risks.length > 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-5">
            <h3 className="text-xs font-semibold text-warning flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4" />
              Riesgos de Política
            </h3>
            <ul className="space-y-2">
              {risks.map((r: string, i: number) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-warning mt-0.5">•</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis?.sugerencia_mejora_retencion && (
          <div className="rounded-xl border border-border gradient-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              Sugerencia de Mejora de Retención
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {analysis.sugerencia_mejora_retencion}
            </p>
          </div>
        )}

        {risks.length === 0 && !analysis?.sugerencia_mejora_retencion && (
          <div className="rounded-xl border border-border gradient-card p-8 text-center">
            <p className="text-xs text-muted-foreground">Sin riesgos detectados ni sugerencias adicionales.</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
};

export default BlueprintViewer;
