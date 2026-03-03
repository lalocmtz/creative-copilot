import { cn } from "@/lib/utils";

type Status = "PENDING" | "VIDEO_INGESTED" | "BLUEPRINT_GENERATED" | "IMAGE_APPROVED" | "VIDEO_RENDERED" | "FAILED" | "DRAFT" | "RENDERING";

const statusConfig: Record<Status, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "bg-muted text-muted-foreground" },
  VIDEO_INGESTED: { label: "Video Ingestado", className: "bg-primary/15 text-primary" },
  BLUEPRINT_GENERATED: { label: "Blueprint Listo", className: "bg-success/15 text-success" },
  IMAGE_APPROVED: { label: "Imagen Aprobada", className: "bg-success/15 text-success" },
  VIDEO_RENDERED: { label: "Render Completo", className: "bg-primary/15 text-primary" },
  FAILED: { label: "Error", className: "bg-destructive/15 text-destructive" },
  DRAFT: { label: "Borrador", className: "bg-muted text-muted-foreground" },
  RENDERING: { label: "Renderizando…", className: "bg-warning/15 text-warning" },
};

const StatusBadge = ({ status }: { status: Status }) => {
  const config = statusConfig[status] || statusConfig.PENDING;
  return (
    <span className={cn("px-2.5 py-1 rounded-md text-xs font-medium", config.className)}>
      {config.label}
    </span>
  );
};

export default StatusBadge;
