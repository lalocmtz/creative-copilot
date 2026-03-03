import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "pending" | "active" | "done" | "failed";

interface Step {
  label: string;
  status: StepStatus;
  cost?: string;
}

interface PipelineStepperProps {
  steps: Step[];
}

const PipelineStepper = ({ steps }: PipelineStepperProps) => {
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50">
            {step.status === "done" && (
              <Check className="w-3.5 h-3.5 text-success" />
            )}
            {step.status === "active" && (
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            )}
            {step.status === "pending" && (
              <Circle className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            {step.status === "failed" && (
              <Circle className="w-3.5 h-3.5 text-destructive" />
            )}
            <span
              className={cn(
                "text-xs font-medium",
                step.status === "done" && "text-success",
                step.status === "active" && "text-primary",
                step.status === "pending" && "text-muted-foreground",
                step.status === "failed" && "text-destructive"
              )}
            >
              {step.label}
            </span>
            {step.cost && (
              <span className="text-xs text-warning font-mono">{step.cost}</span>
            )}
          </div>
          {i < steps.length - 1 && (
            <div className={cn(
              "w-6 h-px",
              step.status === "done" ? "bg-success/50" : "bg-border"
            )} />
          )}
        </div>
      ))}
    </div>
  );
};

export default PipelineStepper;
