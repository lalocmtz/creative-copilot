import { Loader2, Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ProgressInfo {
  step?: string;
  detail?: string;
  updated_at?: string;
}

const STEPS = [
  { key: "uploading_reference", label: "Subiendo video de referencia", pct: 10 },
  { key: "motion_starting", label: "Iniciando transferencia de movimiento", pct: 20 },
  { key: "motion_transferring", label: "Transfiriendo movimiento (~3-5 min)", pct: 55 },
  { key: "downloading", label: "Descargando resultado", pct: 80 },
  { key: "uploading", label: "Subiendo video final", pct: 95 },
];

const RenderProgressPanel = ({ progress }: { progress?: ProgressInfo }) => {
  const currentStep = progress?.step || "uploading_reference";
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  const pct = currentIdx >= 0 ? STEPS[currentIdx].pct : 5;

  return (
    <div className="bg-muted/30 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-xs font-medium text-foreground">
          {progress?.detail || "Preparando transferencia de movimiento…"}
        </span>
      </div>
      <Progress value={pct} className="h-2" />
      <div className="space-y-1.5">
        {STEPS.map((step, i) => {
          const isDone = currentIdx > i;
          const isActive = currentIdx === i;
          return (
            <div
              key={step.key}
              className={`flex items-center gap-2 text-[11px] ${
                isDone
                  ? "text-success"
                  : isActive
                  ? "text-primary font-medium"
                  : "text-muted-foreground/50"
              }`}
            >
              {isDone ? (
                <Check className="w-3 h-3" />
              ) : isActive ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <div className="w-3 h-3 rounded-full border border-muted-foreground/30" />
              )}
              {step.label}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        Transferencia estructural de movimiento — misma duración y gestos del original
      </p>
    </div>
  );
};

export default RenderProgressPanel;
