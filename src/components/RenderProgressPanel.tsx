import { Loader2, Check, Music, Film, Upload } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ProgressInfo {
  step?: string;
  detail?: string;
  updated_at?: string;
}

const STEPS = [
  { key: "tts_starting", label: "Iniciando TTS", pct: 5 },
  { key: "tts_processing", label: "Procesando voz", pct: 15 },
  { key: "tts_done", label: "Audio generado", pct: 25 },
  { key: "video_starting", label: "Iniciando video", pct: 30 },
  { key: "video_generating", label: "Generando video", pct: 55 },
  { key: "uploading", label: "Subiendo archivos", pct: 90 },
];

const RenderProgressPanel = ({ progress }: { progress?: ProgressInfo }) => {
  const currentStep = progress?.step || "tts_starting";
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  const pct = currentIdx >= 0 ? STEPS[currentIdx].pct : 5;

  return (
    <div className="bg-muted/30 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-xs font-medium text-foreground">
          {progress?.detail || "Preparando pipeline…"}
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
        El video puede tardar ~3-5 minutos
      </p>
    </div>
  );
};

export default RenderProgressPanel;
