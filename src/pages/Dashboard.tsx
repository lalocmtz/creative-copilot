import { Link } from "react-router-dom";
import { Plus, Film, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import CostDisplay from "@/components/CostDisplay";
import { motion } from "framer-motion";

const mockAssets = [
  { id: "1", url: "tiktok.com/@seller/video/1234", status: "BLUEPRINT_GENERATED" as const, date: "2026-03-02", cost: "$1.20" },
  { id: "2", url: "tiktok.com/@brand/video/5678", status: "VIDEO_RENDERED" as const, date: "2026-03-01", cost: "$8.50" },
  { id: "3", url: "tiktok.com/@ugc/video/9012", status: "VIDEO_INGESTED" as const, date: "2026-02-28", cost: "$0.30" },
  { id: "4", url: "tiktok.com/@creator/video/3456", status: "PENDING" as const, date: "2026-02-27", cost: "$0.00" },
];

const Dashboard = () => {
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
          { label: "Assets Totales", value: "4" },
          { label: "Renders Completos", value: "1" },
          { label: "Gasto Total", value: "$10.00" },
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
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 bg-muted/30 text-xs text-muted-foreground font-medium uppercase tracking-wider">
          <span>Video URL</span>
          <span>Estado</span>
          <span>Costo</span>
          <span>Fecha</span>
          <span></span>
        </div>
        {mockAssets.map((asset, i) => (
          <motion.div
            key={asset.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.05 }}
          >
            <Link
              to={`/asset/${asset.id}/blueprint`}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-4 border-t border-border hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <Film className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="text-sm text-foreground font-mono truncate max-w-[280px]">{asset.url}</span>
              </div>
              <StatusBadge status={asset.status} />
              <CostDisplay amount={asset.cost} />
              <span className="text-xs text-muted-foreground">{asset.date}</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
