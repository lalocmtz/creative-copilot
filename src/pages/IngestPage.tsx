import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import PipelineStepper, { StepStatus } from "@/components/PipelineStepper";
import { ArrowRight, Loader2, Shield, AlertCircle, Wand2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type IngestPhase = "idle" | "creating" | "downloading" | "transcribing" | "understanding" | "variants" | "done" | "error";

const IngestPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [rights, setRights] = useState(false);
  const [phase, setPhase] = useState<IngestPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const isProcessing = !["idle", "done", "error"].includes(phase);
  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const steps: { label: string; status: StepStatus }[] = (() => {
    const phases: IngestPhase[] = ["downloading", "transcribing", "understanding", "variants"];
    const labels = ["Descargando video", "Transcribiendo", "Entendiendo estructura", "Variantes listas"];
    const currentIdx = phases.indexOf(phase);

    return labels.map((label, i) => ({
      label,
      status: phase === "done" ? "done" as StepStatus :
        phase === "error" ? (i <= currentIdx ? "failed" : "pending") as StepStatus :
        i < currentIdx ? "done" as StepStatus :
        i === currentIdx ? "active" as StepStatus :
        "pending" as StepStatus,
    }));
  })();

  const handleAnalyze = async () => {
    if (!user) return;
    setError(null);
    setLogs([]);
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

    // Cached — redirect if variants ready
    if (createData.cached && ["VARIANTS_READY", "IMAGE_READY", "RENDERING", "DONE"].includes(asset.status)) {
      addLog("Asset existente (cache hit) ✓");
      setPhase("done");
      setTimeout(() => navigate(`/assets/${asset.id}/variants`), 500);
      return;
    }

    addLog(`Asset creado: ${asset.id.slice(0, 8)}…`);
    setPhase("downloading");
    addLog("Conectando con TikTok…");

    const { data: ingestData, error: ingestErr } = await supabase.functions.invoke("ingest-asset", {
      body: { asset_id: asset.id },
    });

    if (ingestErr || ingestData?.error) {
      setError(ingestData?.error || ingestErr?.message || "Error en ingesta");
      setPhase("error");
      return;
    }

    addLog("Video descargado ✓");
    addLog("Transcripción completa ✓");
    addLog("Estructura analizada ✓");
    addLog("Variantes A/B/C generadas ✓");
    setPhase("done");

    // Auto-redirect to variants page
    setTimeout(() => navigate(`/assets/${asset.id}/variants`), 1000);
  };

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold text-foreground mb-2">Nueva Ingesta</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Pegá la URL del video de TikTok para analizar su estructura ganadora.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Video URL</label>
            <Textarea
              placeholder="https://www.tiktok.com/@seller/video/1234567890"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="min-h-[72px] font-mono text-sm bg-muted/30 border-border resize-none"
              disabled={isProcessing || phase === "done"}
            />
          </div>

          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/20 border border-border">
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
            </label>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button onClick={handleAnalyze} disabled={!url.trim() || isProcessing || phase === "done"} className="w-full gap-2" size="lg">
            {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando estructura ganadora…</> :
              phase === "done" ? "Variantes listas ✓" :
              <><Wand2 className="w-4 h-4" /> Download & Analyze</>}
          </Button>
        </div>

        <AnimatePresence>
          {phase !== "idle" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-8 space-y-4">
              <PipelineStepper steps={steps} />

              <div className="rounded-lg bg-muted/20 border border-border p-4 space-y-2 font-mono text-xs">
                {logs.map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="flex items-center gap-2">
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
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default IngestPage;
