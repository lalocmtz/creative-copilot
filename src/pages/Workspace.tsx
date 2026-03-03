import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import BlueprintViewer from "@/components/BlueprintViewer";
import RenderProgressPanel from "@/components/RenderProgressPanel";
import CreditConfirmModal from "@/components/CreditConfirmModal";
import StatusBadge from "@/components/StatusBadge";
import { useCredits } from "@/hooks/useCredits";
import { useAsset, useBlueprint, useGenerateBlueprint } from "@/hooks/useSupabaseQueries";
import { useRender, useCreateRenderDraft, useUpdateRender, useGenerateBaseImage, useApproveImage, useGenerateFinalVideo, usePollRenderStatus, useResetRender } from "@/hooks/useRender";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Loader2, Shield, AlertCircle, Film, Mic, User, Wand2, Check,
  Upload, Image, Brain, RefreshCw, AlertTriangle, ChevronDown,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ─── Video + Audio Overlay Component ───
const VideoWithAudioOverlay = ({ videoUrl, audioUrl }: { videoUrl: string; audioUrl?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const syncPlay = () => {
    if (audioRef.current && videoRef.current) {
      audioRef.current.currentTime = videoRef.current.currentTime;
      audioRef.current.play().catch(() => {});
    }
  };
  const syncPause = () => { audioRef.current?.pause(); };
  const syncSeek = () => {
    if (audioRef.current && videoRef.current) {
      audioRef.current.currentTime = videoRef.current.currentTime;
    }
  };

  return (
    <div className="space-y-3">
      <div className="aspect-[9/16] max-h-[400px] rounded-lg overflow-hidden border border-border bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          className="w-full h-full object-contain"
          onPlay={syncPlay}
          onPause={syncPause}
          onSeeked={syncSeek}
        />
      </div>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}
      <a href={videoUrl} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm" className="w-full gap-2"><Film className="w-4 h-4" /> Descargar Video</Button>
      </a>
      <p className="text-xs text-success text-center font-medium">✓ Video animado + voiceover</p>
    </div>
  );
};

// ─── Static Data ───
const actors = [
  { id: "a1", name: "Sofia M.", style: "Natural, cercana", gender: "femenino" },
  { id: "a2", name: "Carlos R.", style: "Energético, joven", gender: "masculino" },
  { id: "a3", name: "Valentina L.", style: "Profesional, elegante", gender: "femenino" },
];

const voices = [
  { id: "sarah", name: "Sarah", style: "Cálida, natural", gender: "femenino" },
  { id: "lily", name: "Lily", style: "Energética, joven", gender: "femenino" },
  { id: "jessica", name: "Jessica", style: "Joven, dinámica", gender: "femenino" },
  { id: "laura", name: "Laura", style: "Profesional, clara", gender: "femenino" },
  { id: "alice", name: "Alice", style: "Amigable, fresca", gender: "femenino" },
  { id: "george", name: "George", style: "Confiable, firme", gender: "masculino" },
  { id: "charlie", name: "Charlie", style: "Casual, cercano", gender: "masculino" },
  { id: "brian", name: "Brian", style: "Firme, profesional", gender: "masculino" },
  { id: "liam", name: "Liam", style: "Joven, enérgico", gender: "masculino" },
  { id: "eric", name: "Eric", style: "Versátil, neutro", gender: "masculino" },
];

type IngestPhase = "idle" | "creating" | "downloading" | "transcribing" | "done" | "error";

const sectionAnim = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

const Workspace = () => {
  const { id: paramId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: credits, refetch: refetchCredits } = useCredits();

  // ─── Asset state (from URL param or new) ───
  const [assetId, setAssetId] = useState<string | undefined>(paramId);
  const { data: asset, isLoading: assetLoading } = useAsset(assetId);
  const { data: blueprint, isLoading: bpLoading } = useBlueprint(assetId);
  const { data: render, isLoading: renderLoading } = useRender(assetId);
  const generateBlueprint = useGenerateBlueprint();
  const createDraft = useCreateRenderDraft();
  const updateRender = useUpdateRender();
  const generateImage = useGenerateBaseImage();
  const approveImage = useApproveImage();
  const generateFinalVideo = useGenerateFinalVideo();
  const pollRenderStatus = usePollRenderStatus();
  const resetRender = useResetRender();

  // ─── Ingest state ───
  const [url, setUrl] = useState("");
  const [rights, setRights] = useState(false);
  const [ingestPhase, setIngestPhase] = useState<IngestPhase>(paramId ? "done" : "idle");
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // ─── Studio state ───
  const [level, setLevel] = useState("2");
  const [script, setScript] = useState("");
  const [actor, setActor] = useState("a1");
  const [voice, setVoice] = useState("sarah");
  const [intensity, setIntensity] = useState([50]);
  const [scenario, setScenario] = useState("");
  const [populated, setPopulated] = useState(false);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [uploadingProduct, setUploadingProduct] = useState(false);
  const [showAllVoices, setShowAllVoices] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isProcessing = ingestPhase === "creating" || ingestPhase === "downloading" || ingestPhase === "transcribing";
  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  // ─── Computed states ───
  const assetReady = asset && (asset.status !== "PENDING" && asset.status !== "FAILED");
  const blueprintReady = !!blueprint;
  const hasRequiredFields = script.trim() && actor && voice;
  const imageGenerated = render?.status === "IMAGE_GENERATED" || render?.status === "IMAGE_APPROVED" || render?.status === "RENDERING" || render?.status === "DONE";
  const imageApproved = render?.status === "IMAGE_APPROVED" || render?.status === "RENDERING" || render?.status === "DONE";
  const isRendering = render?.status === "RENDERING" || generateFinalVideo.isPending;
  const videoDone = render?.status === "DONE";

  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const estDuration = Math.round((wordCount / 160) * 60);

  // ─── Auto-populate from blueprint ───
  useEffect(() => {
    if (populated || !blueprint) return;
    const analysis = blueprint.analysis_json as any;
    const variations = blueprint.variations_json as any[];
    const nivel1 = variations?.find((v: any) => v.nivel === 1);
    if (nivel1?.guion) setScript(nivel1.guion);
    const gender = analysis?.genero_detectado;
    if (gender === "masculino") { setActor("a2"); setVoice("george"); }
    else { setActor("a1"); setVoice("sarah"); }
    if (analysis?.escenario_sugerido) setScenario(analysis.escenario_sugerido);
    if (analysis?.intensidad_emocional != null) setIntensity([analysis.intensidad_emocional]);
    setPopulated(true);
  }, [blueprint, populated]);

  // ─── Auto-create draft render ───
  useEffect(() => {
    if (!assetId || !asset || renderLoading || render || createDraft.isPending) return;
    if (["BLUEPRINT_GENERATED", "IMAGE_APPROVED", "VIDEO_RENDERED"].includes(asset.status)) {
      createDraft.mutate({ assetId, config: { variation_level: 2 } });
    }
  }, [assetId, asset, render, renderLoading]);

  // ─── Sync from existing render ───
  useEffect(() => {
    if (populated || !render) return;
    setLevel(String(render.variation_level ?? 2));
    setActor(render.actor_id ?? "a1");
    setVoice(render.voice_id ?? "sarah");
    setIntensity([render.emotional_intensity ?? 50]);
    setScenario(render.scenario_prompt ?? "");
  }, [render, populated]);

  // ─── Polling for render ───
  useEffect(() => {
    if (render?.status !== "RENDERING" || !render?.id) {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      return;
    }
    const poll = () => {
      if (!pollRenderStatus.isPending) {
        pollRenderStatus.mutate(render.id, {
          onSuccess: (data) => {
            if (data.status === "DONE") {
              toast({ title: "¡Video generado!", description: "Tu video final está listo." });
              refetchCredits();
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            } else if (data.status === "FAILED") {
              toast({ title: "Error en render", description: data.detail || "La generación falló", variant: "destructive" });
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            }
          },
          onError: () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); },
        });
      }
    };
    poll();
    pollIntervalRef.current = setInterval(poll, 5000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [render?.status, render?.id]);

  // ─── Auto-save draft (debounced) ───
  const autoSave = useCallback(() => {
    if (!render || render.status !== "DRAFT") return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      updateRender.mutate({
        renderId: render.id,
        fields: {
          variation_level: parseInt(level),
          actor_id: actor,
          voice_id: voice,
          emotional_intensity: intensity[0],
          scenario_prompt: scenario,
        },
      });
    }, 1500);
  }, [render, level, actor, voice, intensity, scenario]);

  useEffect(() => { autoSave(); }, [script, actor, voice, intensity, scenario, level]);

  // ─── Handlers ───
  const handleAnalyze = async () => {
    if (!user) return;
    setIngestError(null); setLogs([]);
    setIngestPhase("creating"); addLog("Creando asset…");

    const { data: createData, error: createError } = await supabase.functions.invoke("create-asset", {
      body: { source_url: url.trim(), rights_confirmed: rights },
    });
    if (createError || !createData?.asset) {
      setIngestError(createData?.error || createError?.message || "Error creando asset");
      setIngestPhase("error"); return;
    }
    const newAsset = createData.asset;
    setAssetId(newAsset.id);
    navigate(`/workspace/${newAsset.id}`, { replace: true });

    if (createData.cached && newAsset.status !== "PENDING") {
      addLog("Asset existente (cache hit) ✓"); setIngestPhase("done");
      // Auto-trigger blueprint if not yet generated
      if (newAsset.status === "VIDEO_INGESTED") {
        addLog("Generando blueprint automáticamente…");
        generateBlueprint.mutate({ assetId: newAsset.id, force: false });
      }
      return;
    }
    addLog(`Asset creado: ${newAsset.id.slice(0, 8)}…`);
    setIngestPhase("downloading"); addLog("Conectando con TikTok…");

    const { data: ingestData, error: ingestErr } = await supabase.functions.invoke("ingest-asset", {
      body: { asset_id: newAsset.id },
    });
    if (ingestErr || ingestData?.error) {
      setIngestError(ingestData?.error || ingestErr?.message || "Error en ingesta");
      setIngestPhase("error"); return;
    }
    addLog("Video descargado ✓"); addLog("Transcripción completa ✓");
    setIngestPhase("done");
    // Auto-trigger blueprint
    addLog("Generando blueprint automáticamente…");
    generateBlueprint.mutate({ assetId: newAsset.id, force: false });
  };

  const handleLevelChange = (newLevel: string) => {
    setLevel(newLevel);
    if (!blueprint) return;
    const variations = blueprint.variations_json as any[];
    const match = variations?.find((v: any) => v.nivel === parseInt(newLevel));
    if (match?.guion) setScript(match.guion);
  };

  const uploadProductImage = async (): Promise<string | null> => {
    if (!productImage || !assetId || !user) return render?.product_image_url || null;
    setUploadingProduct(true);
    try {
      const ext = productImage.name.split(".").pop() || "jpg";
      const path = `${user.id}/${assetId}/product.${ext}`;
      const { error } = await supabase.storage.from("ugc-assets").upload(path, productImage, { upsert: true });
      if (error) throw error;
      const { data: signed } = await supabase.storage.from("ugc-assets").createSignedUrl(path, 60 * 60 * 24 * 7);
      return signed?.signedUrl || null;
    } finally { setUploadingProduct(false); }
  };

  const handleGenerateImage = async () => {
    if (!render) return;
    const productUrl = await uploadProductImage();
    updateRender.mutate({
      renderId: render.id,
      fields: {
        variation_level: parseInt(level), actor_id: actor, voice_id: voice,
        emotional_intensity: intensity[0], scenario_prompt: scenario, product_image_url: productUrl,
      },
    });
    generateImage.mutate(render.id);
  };

  const handleGenerateVideo = () => {
    if (!render) return;
    generateFinalVideo.mutate({ renderId: render.id, script });
    setShowCreditModal(false);
  };

  // ─── Voice filtering ───
  const detectedGender = (blueprint?.analysis_json as any)?.genero_detectado;
  const filteredVoices = showAllVoices || !detectedGender ? voices : voices.filter(v => v.gender === detectedGender);
  const filteredActors = showAllVoices || !detectedGender ? actors : actors.filter(a => a.gender === detectedGender);

  if (assetLoading && paramId) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-8">
      {/* ═══════ SECTION 1: INPUT ═══════ */}
      <motion.section {...sectionAnim}>
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-xl font-bold text-foreground">
            {assetId ? "Workspace" : "Nuevo Video"}
          </h1>
          {asset && <StatusBadge status={asset.status} />}
        </div>

        {!assetId || !assetReady ? (
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Video URL</label>
              <Textarea
                placeholder="https://www.tiktok.com/@seller/video/1234567890"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="min-h-[72px] font-mono text-sm bg-muted/30 border-border resize-none"
                disabled={isProcessing || ingestPhase === "done"}
              />
            </div>

            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/20 border border-border">
              <Checkbox
                id="rights"
                checked={rights}
                onCheckedChange={(v) => setRights(v === true)}
                disabled={isProcessing || ingestPhase === "done"}
                className="mt-0.5"
              />
              <label htmlFor="rights" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                <Shield className="w-3.5 h-3.5 inline mr-1 text-warning" />
                Confirmo que tengo derechos o autorización para recrear esta pieza.
              </label>
            </div>

            {ingestError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{ingestError}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleAnalyze} disabled={!url.trim() || isProcessing || ingestPhase === "done"} className="w-full gap-2" size="lg">
              {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando…</> :
               ingestPhase === "done" ? "Ingesta Completa ✓" :
               <><Wand2 className="w-4 h-4" /> Analizar Video</>}
            </Button>

            <AnimatePresence>
              {ingestPhase !== "idle" && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2">
                  <div className="rounded-lg bg-muted/20 border border-border p-3 space-y-1.5 font-mono text-xs">
                    {logs.map((msg, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
                        <span className="text-muted-foreground/50">›</span>
                        <span className="text-muted-foreground">{msg}</span>
                      </motion.div>
                    ))}
                    {isProcessing && <div className="flex items-center gap-2 text-primary"><Loader2 className="w-3 h-3 animate-spin" /><span>Procesando…</span></div>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground font-mono truncate">{asset?.source_url}</p>
          </div>
        )}
      </motion.section>

      {/* ═══════ SECTION 2: BLUEPRINT ═══════ */}
      <AnimatePresence>
        {assetReady && (
          <motion.section {...sectionAnim}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                Blueprint
              </h2>
              {blueprint && (
                <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => assetId && generateBlueprint.mutate({ assetId, force: true })} disabled={generateBlueprint.isPending}>
                  <RefreshCw className={`w-3 h-3 ${generateBlueprint.isPending ? 'animate-spin' : ''}`} />
                  Regenerar
                </Button>
              )}
            </div>

            {!blueprint ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
                <Brain className="w-10 h-10 text-muted-foreground mx-auto" />
                <p className="text-sm text-foreground font-medium">Analizar la estructura estratégica del video</p>
                <p className="text-xs text-muted-foreground">El AI extraerá hook, ángulo, emoción, guion y variaciones.</p>
                <Button
                  onClick={() => assetId && generateBlueprint.mutate({ assetId, force: false })}
                  disabled={generateBlueprint.isPending || !assetId}
                  className="gap-2"
                >
                  {generateBlueprint.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando…</> :
                   <><Wand2 className="w-4 h-4" /> Generar Blueprint</>}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Accordion type="single" collapsible>
                  <AccordionItem value="transcript" className="border border-border rounded-xl bg-card">
                    <AccordionTrigger className="px-5 py-3 text-sm font-medium hover:no-underline">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary" />
                        Transcript
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="px-5 pb-4">
                      <p className="text-sm text-muted-foreground leading-relaxed font-mono">"{asset?.transcript || "Sin transcript."}"</p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <BlueprintViewer
                  analysis={(blueprint.analysis_json as any) || {}}
                  variations={(blueprint.variations_json as any[]) || []}
                />
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {/* ═══════ SECTION 3: CONTROL PANEL ═══════ */}
      <AnimatePresence>
        {blueprintReady && (
          <motion.section {...sectionAnim}>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Film className="w-5 h-5 text-primary" />
              Control Panel
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Script */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Guion</h3>
                  <Select value={level} onValueChange={handleLevelChange}>
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Nivel 1 — Exacto</SelectItem>
                      <SelectItem value="2">Nivel 2 — Variación</SelectItem>
                      <SelectItem value="3">Nivel 3 — Nuevo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {level === "1" && !asset?.rights_confirmed && (
                  <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-xs text-warning">
                    Nivel 1 requiere confirmación de derechos.
                  </div>
                )}
                <Textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="Escribí el guion del video…"
                  className="min-h-[180px] text-sm bg-muted/20 border-border font-mono resize-none"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{wordCount} palabras</span>
                  <span>~{estDuration}s</span>
                </div>
              </div>

              {/* Actor + Voice + Intensity */}
              <div className="space-y-5">
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" />
                      Actor
                    </h3>
                    <button onClick={() => setShowAllVoices(!showAllVoices)} className="text-[10px] text-muted-foreground hover:text-primary transition-colors">
                      {showAllVoices ? "Solo género detectado" : "Ver todos"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(showAllVoices ? actors : filteredActors).map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setActor(a.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                          actor === a.id ? "border-primary bg-primary/10" : "border-border bg-muted/10 hover:bg-muted/20"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{a.name}</p>
                          <p className="text-[10px] text-muted-foreground">{a.style}</p>
                        </div>
                        {actor === a.id && <Check className="w-4 h-4 text-primary ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Mic className="w-4 h-4 text-primary" />
                    Voz
                  </h3>
                  <Select value={voice} onValueChange={setVoice}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {filteredVoices.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} — {v.style}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Intensidad Emocional</span>
                      <span className="text-xs font-mono text-primary">{intensity[0]}%</span>
                    </div>
                    <Slider value={intensity} onValueChange={setIntensity} max={100} step={5} className="py-1" />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>Calma</span>
                      <span>Intenso</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">Afecta tono, entrega y energía facial.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Scenario + Product */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Image className="w-4 h-4 text-primary" />
                  Escenario
                </h3>
                <Textarea
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                  placeholder="Ej: Baño moderno con luz natural suave"
                  className="min-h-[80px] text-sm bg-muted/20 border-border resize-none"
                />
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  Producto <span className="text-destructive text-xs">*</span>
                </h3>
                {productPreview || render?.product_image_url ? (
                  <div className="relative rounded-lg overflow-hidden border border-border">
                    <img src={productPreview || render?.product_image_url || ""} alt="Product" className="w-full h-28 object-contain bg-muted/10" />
                    <button onClick={() => { setProductImage(null); setProductPreview(null); }} className="absolute top-1 right-1 bg-background/80 rounded-full p-1 text-xs text-muted-foreground hover:text-foreground">✕</button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-border rounded-lg p-5 flex flex-col items-center gap-2 hover:border-primary/50 transition-colors cursor-pointer">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Seleccionar imagen</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setProductImage(f); setProductPreview(URL.createObjectURL(f)); } }} />
                  </label>
                )}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ═══════ SECTION 4: OUTPUT ═══════ */}
      <AnimatePresence>
        {blueprintReady && hasRequiredFields && (
          <motion.section {...sectionAnim}>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" />
              Output
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Image */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Imagen Base</h3>
                {!imageGenerated ? (
                  <div className="space-y-3">
                    <Button onClick={handleGenerateImage} disabled={generateImage.isPending || uploadingProduct || !render || (!productImage && !render?.product_image_url)} className="w-full gap-2">
                      {generateImage.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando (~60s)…</> : "Generar Imagen Base"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {render?.base_image_url ? (
                      <div className="aspect-[9/16] max-h-[400px] rounded-lg overflow-hidden border border-border">
                        <img src={render.base_image_url} alt="Base" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="aspect-[9/16] max-h-[300px] bg-muted rounded-lg flex items-center justify-center border border-border">
                        <Image className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    {!imageApproved ? (
                      <div className="flex gap-2">
                        <Button onClick={() => render && assetId && approveImage.mutate({ renderId: render.id, assetId })} disabled={approveImage.isPending} variant="outline" className="flex-1 gap-2 border-success text-success hover:bg-success/10" size="sm">
                          {approveImage.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Aprobar
                        </Button>
                        <Button onClick={() => render && generateImage.mutate(render.id)} disabled={generateImage.isPending} variant="outline" className="flex-1 gap-2" size="sm">
                          {generateImage.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Regenerar
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-success text-center font-medium">✓ Imagen aprobada</p>
                    )}
                  </div>
                )}
              </div>

              {/* Final Video */}
              <div className={`rounded-xl border p-5 space-y-4 ${imageApproved ? "border-primary/30 bg-primary/5" : "border-border bg-card opacity-50"}`}>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Film className="w-4 h-4 text-primary" />
                  Video Final
                </h3>

                {videoDone && render?.final_video_url ? (
                  <VideoWithAudioOverlay
                    videoUrl={render.final_video_url}
                    audioUrl={(render.cost_breakdown_json as any)?._tts_audio_url}
                  />
                  
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground text-center">Genera voz + sincroniza labios + audio integrado</p>
                    {isRendering && <RenderProgressPanel progress={(render?.cost_breakdown_json as any)?._progress} />}
                    {(render?.status === "FAILED" || render?.status === "RENDERING") && (
                      <Button variant="outline" size="sm" className="w-full gap-2 border-warning text-warning hover:bg-warning/10" onClick={() => render && assetId && resetRender.mutate({ renderId: render.id, assetId })} disabled={resetRender.isPending}>
                        {resetRender.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />} Resetear y Reintentar
                      </Button>
                    )}
                    <Button onClick={() => setShowCreditModal(true)} disabled={!imageApproved || isRendering || !render || render.status === "FAILED"} className="w-full gap-2" size="lg">
                      {isRendering ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando video…</> : <><Film className="w-4 h-4" /> Generar Video Final</>}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Credit Confirmation Modal */}
      <CreditConfirmModal
        open={showCreditModal}
        onOpenChange={setShowCreditModal}
        remainingCredits={credits?.remaining ?? 0}
        onConfirm={handleGenerateVideo}
        isPending={generateFinalVideo.isPending}
      />
    </div>
  );
};

export default Workspace;
