import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PipelineStepper from "@/components/PipelineStepper";
import CostDisplay from "@/components/CostDisplay";
import StatusBadge from "@/components/StatusBadge";
import BlueprintViewer from "@/components/BlueprintViewer";
import { ArrowRight, Brain, Loader2, Wand2, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { useAsset, useBlueprint, useGenerateBlueprint } from "@/hooks/useSupabaseQueries";

const Blueprint = () => {
  const { id } = useParams<{ id: string }>();
  const { data: asset, isLoading: assetLoading } = useAsset(id);
  const { data: blueprint, isLoading: bpLoading } = useBlueprint(id);
  const generateBlueprint = useGenerateBlueprint();

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

  const analysis = (blueprint?.analysis_json as any) || {};
  const variations = (blueprint?.variations_json as any[]) || [];
  const transcript = asset.transcript || "Sin transcript disponible.";

  const handleGenerate = (force = false) => {
    if (!id) return;
    generateBlueprint.mutate({ assetId: id, force });
  };

  const canGenerate = asset.status === "VIDEO_INGESTED" || asset.status === "BLUEPRINT_GENERATED" || asset.status === "IMAGE_APPROVED" || asset.status === "VIDEO_RENDERED";

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
            { label: "Blueprint", status: blueprint ? "done" : "active", cost: blueprint ? `$${blueprint.token_cost?.toFixed(2) ?? '0.00'}` : undefined },
            { label: "Studio", status: "pending" },
            { label: "Render", status: "pending" },
          ]}
        />
      </div>

      <div className="grid grid-cols-[1fr_1.3fr] gap-6">
        {/* Left: Transcript + Cost */}
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
                  <span className="font-mono text-foreground">~{Math.round(transcript.length / 4)} tokens</span>
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

        {/* Right: Blueprint Viewer */}
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
          {blueprint ? (
            <>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => handleGenerate(true)}
                  disabled={generateBlueprint.isPending}
                >
                  <RefreshCw className={`w-3 h-3 ${generateBlueprint.isPending ? 'animate-spin' : ''}`} />
                  Regenerar
                </Button>
              </div>
              <BlueprintViewer analysis={analysis} variations={variations} />
            </>
          ) : (
            <div className="rounded-xl border border-border gradient-card p-8 text-center space-y-4">
              <Brain className="w-10 h-10 text-muted-foreground mx-auto" />
              <div>
                <p className="text-sm text-foreground font-medium">Blueprint no generado aún</p>
                <p className="text-xs text-muted-foreground mt-1">
                  El AI analizará el transcript y generará la estructura estratégica, guion clonado, escenario y variaciones.
                </p>
              </div>
              <CostDisplay amount="~$0.02" label="análisis con Gemini" size="sm" />
              <Button
                onClick={() => handleGenerate(false)}
                disabled={generateBlueprint.isPending || !canGenerate}
                className="gap-2"
              >
                {generateBlueprint.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analizando…
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Generar Blueprint
                  </>
                )}
              </Button>
            </div>
          )}

          <div className="flex justify-end">
            <Link to={`/asset/${id}/studio`}>
              <Button className="gap-2" disabled={!blueprint}>
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
