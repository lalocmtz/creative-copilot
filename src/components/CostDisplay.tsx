import { DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface CostDisplayProps {
  amount: string;
  label?: string;
  size?: "sm" | "md";
}

const CostDisplay = ({ amount, label, size = "sm" }: CostDisplayProps) => {
  return (
    <div className={cn(
      "flex items-center gap-1.5 rounded-md bg-warning/10 border border-warning/20",
      size === "sm" ? "px-2 py-1" : "px-3 py-2"
    )}>
      <DollarSign className={cn("text-warning", size === "sm" ? "w-3 h-3" : "w-4 h-4")} />
      <span className={cn("font-mono text-warning font-medium", size === "sm" ? "text-xs" : "text-sm")}>
        {amount}
      </span>
      {label && (
        <span className="text-xs text-muted-foreground ml-1">{label}</span>
      )}
    </div>
  );
};

export default CostDisplay;
