import { Link } from "react-router-dom";
import { Plus, Film, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import CostDisplay from "@/components/CostDisplay";
import { motion } from "framer-motion";
import { useAssets } from "@/hooks/useSupabaseQueries";

const Dashboard = () => {
  const { data: assets, isLoading } = useAssets();

  const totalCost = "$0.00"; // TODO: aggregate from jobs
  const rendersCount = assets?.filter((a) => a.status === "VIDEO_RENDERED").length ?? 0;

  const getAssetLink = (asset: { id: string; status: string }) => {
    switch (asset.status) {
      case "PENDING":
      case "FAILED":
        return `/ingest`;
      case "VIDEO_INGESTED":
      case "BLUEPRINT_GENERATED":
        return `/asset/${asset.id}/blueprint`;
      case "IMAGE_APPROVED":
      case "VIDEO_RENDERED":
        return `/asset/${asset.id}/studio`;
      default:
        return `/asset/${asset.id}/blueprint`;
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mis Assets</h1>
          <p className="text-sm text-muted-foreground mt-1">Videos analizados y en proceso</p>
        </div>
        <Link to="/ingest">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Nueva Ingesta
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Assets Totales", value: String(assets?.length ?? 0) },
          { label: "Renders Completos", value: String(rendersCount) },
          { label: "Gasto Total", value: totalCost },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="gradient-card rounded-xl border border-border p-5"
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Cargando assets…</div>
      ) : !assets?.length ? (
        <div className="text-center py-16 border border-border rounded-xl bg-muted/20">
          <Film className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-foreground font-medium">No hay assets aún</p>
          <p className="text-sm text-muted-foreground mt-1">Comienza analizando tu primer video ganador.</p>
          <Link to="/ingest">
            <Button className="mt-4 gap-2">
              <Plus className="w-4 h-4" />
              Nueva Ingesta
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 bg-muted/30 text-xs text-muted-foreground font-medium uppercase tracking-wider">
            <span>Video URL</span>
            <span>Estado</span>
            <span>Fecha</span>
            <span></span>
          </div>
          {assets.map((asset, i) => (
            <motion.div
              key={asset.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.03 }}
            >
              <Link
                to={getAssetLink(asset)}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-5 py-4 border-t border-border hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <Film className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm text-foreground font-mono truncate max-w-[320px]">
                    {asset.source_url}
                  </span>
                </div>
                <StatusBadge status={asset.status} />
                <span className="text-xs text-muted-foreground">
                  {new Date(asset.created_at).toLocaleDateString()}
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
