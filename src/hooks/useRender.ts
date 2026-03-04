import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/** Animate a variant with Sora2 (with retry+backoff+circuit breaker) */
export const useAnimateSora = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ assetId, variantId, nFrames = "10" }: { assetId: string; variantId: string; nFrames?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/animate-sora`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ asset_id: assetId, variant_id: variantId, n_frames: nFrames }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to start animation");
      return result;
    },
    onSuccess: (data, vars) => {
      const isQueued = data.status === "QUEUED";
      toast({
        title: isQueued ? "En cola" : "Animación iniciada",
        description: isQueued
          ? "Proveedor saturado. Se reintentará automáticamente."
          : `Animando variante ${vars.variantId}…`,
      });
      queryClient.invalidateQueries({ queryKey: ["assets", vars.assetId] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
};

/** Poll render status for a variant */
export const usePollVariantRender = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assetId, variantId }: { assetId: string; variantId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/poll-render-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ asset_id: assetId, variant_id: variantId }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Poll failed");
      return result;
    },
    onSuccess: (data, vars) => {
      if (data.status === "DONE" || data.status === "FAILED") {
        queryClient.invalidateQueries({ queryKey: ["assets", vars.assetId] });
        queryClient.invalidateQueries({ queryKey: ["assets"] });
        queryClient.invalidateQueries({ queryKey: ["credits"] });
      }
    },
  });
};
