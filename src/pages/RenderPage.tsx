import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useAsset } from "@/hooks/useSupabaseQueries";
import { useAnimateSora, usePollVariantRender } from "@/hooks/useRender";
import { useCredits } from "@/hooks/useCredits";
import CreditConfirmModal from "@/components/CreditConfirmModal";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Film, Download, ArrowLeft, RefreshCw, Clock, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const RenderPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: asset, isLoading, refetch } = useAsset(id);
  const animateSora = useAnimateSora();
  const pollRender = usePollVariantRender();
  const { data: credits, refetch: refetchCredits } = useCredits();
  const { toast } = useToast();

  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [nFrames, setNFrames] = useState("10");
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderDetail, setRenderDetail] = useState<string>("");
  const [renderStatus, setRenderStatus] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const variants = (asset?.variants_json as any[]) || [];
  const approvedVariants = variants.filter((v: any) => v.base_image_approved);

  useEffect(() => {
    if (!selectedVariant && approvedVariants.length > 0) {
      setSelectedVariant(approvedVariants[0].variant_id);
    }
  }, [approvedVariants, selectedVariant]);

  const currentVariant = variants.find((v: any) => v.variant_id === selectedVariant);

  // Polling
  useEffect(() => {
    if (!isRendering || !id || !selectedVariant) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }

    const poll = () => {
      pollRender.mutate({ assetId: id, variantId: selectedVariant }, {
        onSuccess: (data) => {
          setRenderDetail(data.detail || "");
          setRenderStatus(data.status || "");
          if (data.elapsed_seconds != null) setElapsedSeconds(data.elapsed_seconds);

          if (data.status === "DONE") {
            setIsRendering(false);
            refetch();
            refetchCredits();
            toast({ title: "¡Video generado!", description: "Tu video está listo para descargar." });
          } else if (data.status === "FAILED") {
            setIsRendering(false);
            refetch();
            toast({
              title: "Error",
              description: data.detail || "La animación falló",
              variant: "destructive",
            });
          }
          // QUEUED and RENDERING keep polling
        },
        onError: () => { setIsRendering(false); },
      });
    };

    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isRendering, id, selectedVariant]);

  useEffect(() => {
    if (asset?.status === "RENDERING") setIsRendering(true);
  }, [asset?.status]);

  const handleAnimate = () => {
    if (!id || !selectedVariant) return;
    animateSora.mutate({ assetId: id, variantId: selectedVariant, nFrames }, {
      onSuccess: (data) => {
        setIsRendering(true);
        setShowCreditModal(false);
        if (data.status === "QUEUED") {
          setRenderStatus("QUEUED");
          setRenderDetail(data.detail || "En cola…");
        }
      },
    });
  };

  const handleForceRetry = () => {
    if (!id || !selectedVariant) return;
    animateSora.mutate({ assetId: id, variantId: selectedVariant, nFrames }, {
      onSuccess: () => {
        setIsRendering(true);
        setRenderStatus("RENDERING");
        setRenderDetail("Reintentando…");
      },
    });
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!asset) return <div className="p-8 text-center text-muted-foreground">Asset no encontrado</div>;

  const isQueued = renderStatus === "QUEUED";

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to={`/assets/${id}/variants`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
            <ArrowLeft className="w-3 h-3" /> Volver a variantes
          </Link>
          <h1 className="text-xl font-bold text-foreground">Animación (Sora2)</h1>
          <p className="text-sm text-muted-foreground mt-1">Animá tus imágenes aprobadas con I2V.</p>
        </div>
        <StatusBadge status={asset.status} />
      </div>

      {approvedVariants.length === 0 ? (
        <div className="text-center py-16 border border-border rounded-xl bg-card">
          <Film className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-foreground font-medium">No hay imágenes aprobadas</p>
          <p className="text-sm text-muted-foreground mt-1">Aprobá al menos una imagen base antes de animar.</p>
          <Link to={`/assets/${id}/variants`}>
            <Button className="mt-4">Ir a variantes</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Variant selector */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Seleccionar variante</label>
            <div className="flex gap-2">
              {approvedVariants.map((v: any) => (
                <Button
                  key={v.variant_id}
                  variant={selectedVariant === v.variant_id ? "default" : "outline"}
                  onClick={() => setSelectedVariant(v.variant_id)}
                  className="gap-2"
                  disabled={isRendering}
                >
                  Variante {v.variant_id}
                  {v.final_video_url && <span className="text-xs">✓</span>}
                </Button>
              ))}
            </div>
          </div>

          {/* Frame toggle — Short is default */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Duración</label>
            <div className="flex gap-2">
              <Button variant={nFrames === "10" ? "default" : "outline"} onClick={() => setNFrames("10")} disabled={isRendering} size="sm">
                Short (10 frames)
              </Button>
              <Button variant={nFrames === "15" ? "default" : "outline"} onClick={() => setNFrames("15")} disabled={isRendering} size="sm">
                Long (15 frames)
              </Button>
            </div>
          </div>

          {/* Base image preview */}
          {currentVariant?.base_image_url && (
            <div className="rounded-lg overflow-hidden border border-border bg-black">
              <img src={currentVariant.base_image_url} alt="Base image" className="w-full max-h-[300px] object-contain" />
            </div>
          )}

          {/* Video result */}
          {currentVariant?.final_video_url && !isRendering && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <div className="aspect-[9/16] max-h-[400px] rounded-lg overflow-hidden border border-border bg-black">
                <video src={currentVariant.final_video_url} controls className="w-full h-full object-contain" />
              </div>
              <a href={currentVariant.final_video_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full gap-2">
                  <Download className="w-4 h-4" /> Descargar Video
                </Button>
              </a>
            </motion.div>
          )}

          {/* Progress — handles RENDERING, QUEUED, RETRY states */}
          {isRendering && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                {isQueued ? (
                  <Clock className="w-5 h-5 text-warning" />
                ) : (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {isQueued ? "En cola — reintento automático" : "Animando con I2V…"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {renderDetail || "Te avisamos en cuanto esté listo."}
                    {!isQueued && elapsedSeconds > 0 && (
                      <span className="ml-2 text-primary font-medium">({elapsedSeconds}s)</span>
                    )}
                  </p>
                </div>
              </div>

              {!isQueued && <Progress value={undefined} className="h-2" />}

              {isQueued && (
                <div className="flex items-start gap-2 bg-warning/10 rounded-lg p-3 mt-2">
                  <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    No se cobrarán créditos hasta que el proveedor acepte el task. El sistema reintenta automáticamente.
                  </p>
                </div>
              )}

              {isQueued && (
                <Button variant="outline" size="sm" onClick={handleForceRetry} disabled={animateSora.isPending} className="w-full gap-2 mt-2">
                  <RefreshCw className="w-3 h-3" /> Intentar ahora
                </Button>
              )}
            </motion.div>
          )}

          {/* CTA */}
          {!isRendering && (
            <div className="flex gap-3">
              <Button
                onClick={() => setShowCreditModal(true)}
                disabled={!selectedVariant || animateSora.isPending}
                className="flex-1 gap-2"
                size="lg"
              >
                <Film className="w-4 h-4" />
                {currentVariant?.final_video_url ? "Regenerar Video" : "Animate (Sora2)"}
              </Button>
            </div>
          )}
        </div>
      )}

      <CreditConfirmModal
        open={showCreditModal}
        onOpenChange={setShowCreditModal}
        remainingCredits={credits?.remaining ?? 0}
        onConfirm={handleAnimate}
        isPending={animateSora.isPending}
      />
    </div>
  );
};

export default RenderPage;
