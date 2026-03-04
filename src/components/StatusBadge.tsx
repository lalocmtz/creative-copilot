import { cn } from "@/lib/utils";

type Status = string;

const statusConfig: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "bg-muted text-muted-foreground" },
  DOWNLOADING: { label: "Descargando…", className: "bg-warning/15 text-warning" },
  DOWNLOADED: { label: "Descargado", className: "bg-primary/15 text-primary" },
  TRANSCRIBING: { label: "Transcribiendo…", className: "bg-warning/15 text-warning" },
  UNDERSTANDING: { label: "Analizando…", className: "bg-warning/15 text-warning" },
  VARIANTS_READY: { label: "Variantes Listas", className: "bg-success/15 text-success" },
  IMAGE_READY: { label: "Imagen Lista", className: "bg-success/15 text-success" },
  RENDERING: { label: "Renderizando…", className: "bg-warning/15 text-warning" },
  DONE: { label: "Completo", className: "bg-primary/15 text-primary" },
  FAILED: { label: "Error", className: "bg-destructive/15 text-destructive" },
  // Legacy statuses
  VIDEO_INGESTED: { label: "Video Ingestado", className: "bg-primary/15 text-primary" },
  BLUEPRINT_GENERATED: { label: "Blueprint Listo", className: "bg-success/15 text-success" },
  IMAGE_APPROVED: { label: "Imagen Aprobada", className: "bg-success/15 text-success" },
  VIDEO_RENDERED: { label: "Render Completo", className: "bg-primary/15 text-primary" },
  DRAFT: { label: "Borrador", className: "bg-muted text-muted-foreground" },
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
