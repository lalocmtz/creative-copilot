import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  useMotionProject,
  useMotionProjects,
  useCreateMotionProject,
  useStartMotionIngest,
  useGenerateMotionImage,
  useUploadMotionVideo,
  MotionProject,
} from "@/hooks/useMotionGenerator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Upload, Link as LinkIcon, Copy, Download, Image, Wand2,
  CheckCircle, AlertCircle, Film, ArrowRight, Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const MotionGeneratorPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  // Input state
  const [inputMode, setInputMode] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState("");
  const [numVariants, setNumVariants] = useState(1);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active project tracking
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const { data: activeProject, refetch: refetchProject } = useMotionProject(activeProjectId ?? undefined);

  // Mutations
  const createProject = useCreateMotionProject();
  const startIngest = useStartMotionIngest();
  const generateImage = useGenerateMotionImage();
  const uploadVideo = useUploadMotionVideo();

  const isProcessing = ["INGESTING", "ANALYZING", "GENERATING_IMAGES"].includes(activeProject?.status || "");
  const isDone = activeProject?.status === "DONE" || activeProject?.status === "ANALYZED";
  const isFailed = activeProject?.status === "FAILED";

  const handleGenerate = async () => {
    try {
      // 1. Create project
      const project = await createProject.mutateAsync({
        sourceUrl: inputMode === "url" ? url : undefined,
        numVariants,
      });
      setActiveProjectId(project.id);

      // 2. Upload video if file mode
      let videoStoragePath: string | undefined;
      if (inputMode === "upload" && videoFile) {
        videoStoragePath = await uploadVideo.mutateAsync({ projectId: project.id, file: videoFile });
      }

      // 3. Start ingest + analysis
      await startIngest.mutateAsync({
        projectId: project.id,
        sourceUrl: inputMode === "url" ? url : undefined,
        videoStoragePath,
        numVariants,
      });
    } catch {
      // Errors handled by mutation hooks
    }
  };

  const handleGenerateAllImages = async () => {
    if (!activeProject) return;
    const variants = activeProject.variants_json || [];
    for (const v of variants) {
      if (!v.generated_image_url) {
        try {
          await generateImage.mutateAsync({ projectId: activeProject.id, variantId: v.variant_id });
          await refetchProject();
        } catch {
          break;
        }
      }
    }
    await refetchProject();
  };

  const handleGenerateSingleImage = async (variantId: string) => {
    if (!activeProject) return;
    await generateImage.mutateAsync({ projectId: activeProject.id, variantId });
    await refetchProject();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: "Prompt copiado al portapapeles." });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("video/")) {
      setVideoFile(file);
      setInputMode("upload");
    }
  }, []);

  const canStart = inputMode === "url" ? url.trim().length > 5 : !!videoFile;
  const isStarting = createProject.isPending || startIngest.isPending || uploadVideo.isPending;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          Motion Prompt Generator
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analiza un video TikTok UGC y genera variantes con prompts de animación listos para copiar.
        </p>
      </div>

      {/* Input Section */}
      {!activeProjectId && (
        <Card className="p-6 space-y-5">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              variant={inputMode === "url" ? "default" : "outline"}
              size="sm"
              onClick={() => setInputMode("url")}
              className="gap-2"
            >
              <LinkIcon className="w-4 h-4" /> URL de TikTok
            </Button>
            <Button
              variant={inputMode === "upload" ? "default" : "outline"}
              size="sm"
              onClick={() => setInputMode("upload")}
              className="gap-2"
            >
              <Upload className="w-4 h-4" /> Subir Video
            </Button>
          </div>

          {inputMode === "url" ? (
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@user/video/..."
              className="text-sm"
            />
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
            >
              {videoFile ? (
                <div className="flex flex-col items-center gap-2">
                  <Film className="w-8 h-8 text-primary" />
                  <p className="text-sm font-medium text-foreground">{videoFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Arrastra o haz clic para subir un video</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setVideoFile(f);
                }}
              />
            </div>
          )}

          {/* Variant count */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-foreground">Variantes:</label>
            <Select value={String(numVariants)} onValueChange={(v) => setNumVariants(Number(v))}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canStart || isStarting}
            size="lg"
            className="w-full gap-2"
          >
            {isStarting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
            Analizar y Generar
          </Button>
        </Card>
      )}

      {/* Processing state */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {activeProject?.status === "INGESTING" && "Descargando y transcribiendo video…"}
                    {activeProject?.status === "ANALYZING" && "Analizando estructura con IA…"}
                    {activeProject?.status === "GENERATING_IMAGES" && "Generando imágenes de variantes…"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Esto puede tomar 30-60 segundos.</p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      {isFailed && (
        <Card className="p-6 border-destructive/50">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Error en el proceso</p>
              <p className="text-xs text-muted-foreground mt-1">{activeProject?.error_message}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setActiveProjectId(null)}
          >
            Intentar de nuevo
          </Button>
        </Card>
      )}

      {/* Results */}
      {isDone && activeProject && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Blueprint summary */}
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">📋 Video Blueprint</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              {Object.entries(activeProject.blueprint_json || {}).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-muted/50 p-2.5">
                  <p className="text-muted-foreground mb-0.5">{key.replace(/_/g, " ")}</p>
                  <p className="text-foreground font-medium truncate">
                    {Array.isArray(value) ? (value as string[]).join(", ") : String(value)}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          {/* Generate images CTA */}
          {activeProject.variants_json?.some((v: any) => !v.generated_image_url) && (
            <Button
              onClick={handleGenerateAllImages}
              disabled={generateImage.isPending}
              size="lg"
              className="w-full gap-2"
            >
              {generateImage.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Image className="w-5 h-5" />}
              Generar Imágenes ({activeProject.variants_json?.filter((v: any) => !v.generated_image_url).length} pendientes)
            </Button>
          )}

          {/* Variant cards */}
          <Tabs defaultValue={activeProject.variants_json?.[0]?.variant_id || "A"}>
            <TabsList>
              {activeProject.variants_json?.map((v: any) => (
                <TabsTrigger key={v.variant_id} value={v.variant_id} className="gap-1.5">
                  Variante {v.variant_id}
                  {v.generated_image_url && <CheckCircle className="w-3 h-3 text-success" />}
                </TabsTrigger>
              ))}
            </TabsList>

            {activeProject.variants_json?.map((variant: any) => (
              <TabsContent key={variant.variant_id} value={variant.variant_id}>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                  {/* Variant info */}
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">Actor</p>
                      <p className="text-sm text-foreground">{variant.actor_profile}</p>
                    </Card>
                    <Card className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">Escena</p>
                      <p className="text-sm text-foreground">{variant.scene_type}</p>
                      <p className="text-xs text-muted-foreground mt-1">{variant.scene_details}</p>
                    </Card>
                  </div>

                  {/* Image */}
                  <Card className="p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Image className="w-4 h-4" /> Imagen Base
                    </h3>
                    {variant.generated_image_url ? (
                      <div className="space-y-3">
                        <div className="rounded-lg overflow-hidden border border-border bg-black max-w-xs mx-auto">
                          <img
                            src={variant.generated_image_url}
                            alt={`Variante ${variant.variant_id}`}
                            className="w-full object-contain"
                          />
                        </div>
                        <div className="flex gap-2 justify-center">
                          <a href={variant.generated_image_url} download target="_blank" rel="noreferrer">
                            <Button variant="outline" size="sm" className="gap-1.5">
                              <Download className="w-3.5 h-3.5" /> Descargar
                            </Button>
                          </a>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => handleGenerateSingleImage(variant.variant_id)}
                            disabled={generateImage.isPending}
                          >
                            Regenerar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={() => handleGenerateSingleImage(variant.variant_id)}
                        disabled={generateImage.isPending}
                        className="w-full gap-2"
                      >
                        {generateImage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
                        Generar Imagen
                      </Button>
                    )}
                  </Card>

                  {/* Animation Prompt */}
                  <Card className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Film className="w-4 h-4" /> Motion Prompt
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => copyToClipboard(variant.animation_prompt || "")}
                      >
                        <Copy className="w-3.5 h-3.5" /> Copiar
                      </Button>
                    </div>
                    <Textarea
                      value={variant.animation_prompt || ""}
                      readOnly
                      className="min-h-[120px] text-xs bg-muted/30 border-border resize-none font-mono"
                    />
                  </Card>

                  {/* Image Prompt (collapsible) */}
                  <Card className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Wand2 className="w-4 h-4" /> Image Prompt
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => copyToClipboard(variant.image_prompt || "")}
                      >
                        <Copy className="w-3.5 h-3.5" /> Copiar
                      </Button>
                    </div>
                    <Textarea
                      value={variant.image_prompt || ""}
                      readOnly
                      className="min-h-[80px] text-xs bg-muted/30 border-border resize-none font-mono"
                    />
                  </Card>

                  {/* Script lines */}
                  {variant.script_lines?.length > 0 && (
                    <Card className="p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">📝 Script</h3>
                      <div className="space-y-1.5">
                        {variant.script_lines.map((line: string, i: number) => (
                          <p key={i} className="text-sm text-foreground bg-muted/30 rounded px-3 py-1.5">
                            {line}
                          </p>
                        ))}
                      </div>
                    </Card>
                  )}
                </motion.div>
              </TabsContent>
            ))}
          </Tabs>

          {/* Start new */}
          <Button
            variant="outline"
            onClick={() => {
              setActiveProjectId(null);
              setUrl("");
              setVideoFile(null);
            }}
            className="gap-2"
          >
            <ArrowRight className="w-4 h-4" /> Nuevo análisis
          </Button>
        </motion.div>
      )}
    </div>
  );
};

export default MotionGeneratorPage;
