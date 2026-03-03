import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import PipelineStepper, { StepStatus } from "@/components/PipelineStepper";
import CostDisplay from "@/components/CostDisplay";
import { ArrowRight, Loader2, Shield, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type IngestPhase = "idle" | "creating" | "downloading" | "transcribing" | "done" | "error";

const Ingest = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [rights, setRights] = useState(false);
  const [phase, setPhase] = useState<IngestPhase>("idle");
  const [assetId, setAssetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [costs, setCosts] = useState<{ download?: string; transcribe?: string }>({});

  const isProcessing = phase === "creating" || phase === "downloading" || phase === "transcribing";

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const steps: { label: string; status: StepStatus; cost?: string }[] = (() => {
    switch (phase) {
      case "idle":
        return [
          { label: "Descarga", status: "pending" },
          { label: "Transcripción", status: "pending" },
          { label: "Listo", status: "pending" },
        ];
      case "creating":
        return [
          { label: "Creando asset", status: "active" },
          { label: "Descarga", status: "pending" },
          { label: "Transcripción", status: "pending" },
        ];
      case "downloading":
        return [
          { label: "Descarga", status: "active" },
          { label: "Transcripción", status: "pending" },
          { label: "Listo", status: "pending" },
        ];
      case "transcribing":
        return [
          { label: "Descarga", status: "done", cost: costs.download },
          { label: "Transcripción", status: "active", cost: "~$0.25" },
          { label: "Listo", status: "pending" },
        ];
      case "done":
        return [
          { label: "Descarga", status: "done", cost: costs.download },
          { label: "Transcripción", status: "done", cost: costs.transcribe },
          { label: "Listo", status: "done" },
        ];
      case "error":
        return [
          { label: "Descarga", status: phase === "error" ? "failed" : "done" },
          { label: "Transcripción", status: "pending" },
          { label: "Listo", status: "pending" },
        ];
      default:
        return [];
    }
  })();

  const handleAnalyze = async () => {
    if (!user) return;
    setError(null);
    setLogs([]);
    setCosts({});

    // Step 1: Create asset
    setPhase("creating");
    addLog("Creando asset…");

    const { data: createData, error: createError } = await supabase.functions.invoke("create-asset", {
      body: { source_url: url.trim(), rights_confirmed: rights },
    });

    if (createError || !createData?.asset) {
      setError(createData?.error || createError?.message || "Error creando asset");
      setPhase("error");
      return;
    }

    const asset = createData.asset;
    setAssetId(asset.id);

    if (createData.cached && asset.status !== "PENDING") {
      addLog("Asset ya existente (cache hit)");
      if (asset.status === "VIDEO_INGESTED" || asset.status === "BLUEPRINT_GENERATED" || asset.status === "IMAGE_APPROVED" || asset.status === "VIDEO_RENDERED") {
        setCosts({ download: "$0.00", transcribe: "$0.00" });
        setPhase("done");
        addLog("Video ya fue ingestado previamente ✓");
        return;
      }
    }

    addLog(`Asset creado: ${asset.id.slice(0, 8)}…`);

    // Step 2: Ingest (download + transcribe)
    setPhase("downloading");
    addLog("Conectando con TikTok…");

    const { data: ingestData, error: ingestError } = await supabase.functions.invoke("ingest-asset", {
      body: { asset_id: asset.id },
    });

    if (ingestError || ingestData?.error) {
      const errMsg = ingestData?.error || ingestError?.message || "Error en ingesta";
      setError(errMsg);
      setPhase("error");
      addLog(`Error: ${errMsg}`);
      return;
    }

    // Calculate costs from jobs
    const jobs = ingestData.jobs || [];
    const downloadCost = jobs.find((j: any) => j.type === "download_video")?.cost_json?.estimated_cost;
    const transcribeCost = jobs.find((j: any) => j.type === "transcribe")?.cost_json?.estimated_cost;
    setCosts({
      download: downloadCost ? `$${downloadCost}` : "$0.05",
      transcribe: transcribeCost ? `$${transcribeCost}` : "$0.25",
    });

    addLog("Video descargado ✓");
    addLog("Transcripción completa ✓");
    setPhase("done");
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground mb-2">Nueva Ingesta</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Pegá la URL del video de TikTok para analizar su estructura ganadora.
        </p>

        {/* URL Input */}
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Video URL</label>
            <Textarea
              placeholder="https://www.tiktok.com/@seller/video/1234567890"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="min-h-[80px] font-mono text-sm bg-muted/50 border-border focus:ring-primary resize-none"
              disabled={isProcessing || phase === "done"}
            />
          </div>

          {/* Rights */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border">
            <Checkbox
              id="rights"
              checked={rights}
              onCheckedChange={(v) => setRights(v === true)}
              disabled={isProcessing || phase === "done"}
              className="mt-0.5"
            />
            <label htmlFor="rights" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
              <Shield className="w-3.5 h-3.5 inline mr-1 text-warning" />
              Confirmo que tengo derechos o autorización para recrear esta pieza.
              <span className="block text-xs text-muted-foreground/70 mt-1">Requerido para habilitar Nivel 1 (guion exacto).</span>
            </label>
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Cost estimate + CTA */}
          <div className="flex items-center justify-between">
            <CostDisplay amount="~$0.30" label="costo estimado ingesta" size="md" />
            <Button
              onClick={handleAnalyze}
              disabled={!url.trim() || isProcessing || phase === "done"}
              className="gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Procesando…
                </>
              ) : phase === "done" ? (
                "Ingesta Completa ✓"
              ) : (
                <>
                  Analizar Video
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Pipeline Progress */}
        <AnimatePresence>
          {phase !== "idle" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-8 space-y-4"
            >
              <PipelineStepper steps={steps} />

              <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-2 font-mono text-xs">
                {logs.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.15 }}
                    className="flex items-center gap-2"
                  >
                    <span className="text-muted-foreground/50">›</span>
                    <span className="text-muted-foreground">{msg}</span>
                  </motion.div>
                ))}
                {isProcessing && (
                  <div className="flex items-center gap-2 text-primary">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Procesando…</span>
                  </div>
                )}
              </div>

              {phase === "done" && assetId && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end"
                >
                  <Button className="gap-2" onClick={() => navigate(`/asset/${assetId}/blueprint`)}>
                    Generar Blueprint
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default Ingest;
