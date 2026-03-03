import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import PipelineStepper, { StepStatus } from "@/components/PipelineStepper";
import CostDisplay from "@/components/CostDisplay";
import { ArrowRight, Loader2, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const Ingest = () => {
  const [url, setUrl] = useState("");
  const [rights, setRights] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [done, setDone] = useState(false);

  const steps: { label: string; status: StepStatus; cost?: string }[] = analyzing || done
    ? [
        { label: "Descarga", status: done ? "done" : "done", cost: "$0.05" },
        { label: "Transcripción", status: done ? "done" : "active", cost: done ? "$0.25" : "~$0.25" },
        { label: "Listo", status: done ? "done" : "pending" },
      ]
    : [
        { label: "Descarga", status: "pending" },
        { label: "Transcripción", status: "pending" },
        { label: "Listo", status: "pending" },
      ];

  const logMessages = [
    "Conectando con TikTok…",
    "Video descargado (18s, 1080×1920)",
    "Extrayendo audio…",
    "Transcribiendo con Whisper… esto toma ~15s",
  ];

  const handleAnalyze = () => {
    setAnalyzing(true);
    setTimeout(() => {
      setDone(true);
      setAnalyzing(false);
    }, 3000);
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
              disabled={analyzing || done}
            />
          </div>

          {/* Rights */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border">
            <Checkbox
              id="rights"
              checked={rights}
              onCheckedChange={(v) => setRights(v === true)}
              disabled={analyzing || done}
              className="mt-0.5"
            />
            <label htmlFor="rights" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
              <Shield className="w-3.5 h-3.5 inline mr-1 text-warning" />
              Confirmo que tengo derechos o autorización para recrear esta pieza.
              <span className="block text-xs text-muted-foreground/70 mt-1">Requerido para habilitar Nivel 1 (guion exacto).</span>
            </label>
          </div>

          {/* Cost estimate */}
          <div className="flex items-center justify-between">
            <CostDisplay amount="~$0.30" label="costo estimado ingesta" size="md" />
            <Button
              onClick={handleAnalyze}
              disabled={!url.trim() || analyzing || done}
              className="gap-2"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analizando…
                </>
              ) : done ? (
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
          {(analyzing || done) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-8 space-y-4"
            >
              <PipelineStepper steps={steps} />

              <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-2 font-mono text-xs">
                {logMessages.slice(0, done ? 4 : 3).map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.4 }}
                    className="flex items-center gap-2"
                  >
                    <span className="text-muted-foreground/50">›</span>
                    <span className="text-muted-foreground">{msg}</span>
                  </motion.div>
                ))}
                {analyzing && (
                  <div className="flex items-center gap-2 text-primary">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Procesando…</span>
                  </div>
                )}
              </div>

              {done && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end"
                >
                  <Button className="gap-2" asChild>
                    <a href="/asset/1/blueprint">
                      Generar Blueprint
                      <ArrowRight className="w-4 h-4" />
                    </a>
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
