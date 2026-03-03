import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/** Fetch the latest render for an asset — polls every 5s when RENDERING */
export const useRender = (assetId: string | undefined) =>
  useQuery({
    queryKey: ["renders", assetId],
    enabled: !!assetId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "RENDERING" ? 5000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renders")
        .select("*")
        .eq("asset_id", assetId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

/** Create a DRAFT render for an asset if none exists */
export const useCreateRenderDraft = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ assetId, config }: {
      assetId: string;
      config: { variation_level?: number; actor_id?: string; voice_id?: string; emotional_intensity?: number; scenario_prompt?: string };
    }) => {
      const { data, error } = await supabase
        .from("renders")
        .insert({
          asset_id: assetId,
          status: "DRAFT",
          variation_level: config.variation_level ?? 2,
          actor_id: config.actor_id ?? null,
          voice_id: config.voice_id ?? null,
          emotional_intensity: config.emotional_intensity ?? 50,
          scenario_prompt: config.scenario_prompt ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["renders", variables.assetId] });
    },
  });
};

/** Update render draft fields */
export const useUpdateRender = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ renderId, fields }: {
      renderId: string;
      fields: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase
        .from("renders")
        .update(fields)
        .eq("id", renderId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["renders", data.asset_id] });
    },
  });
};

/** Generate base image via edge function */
export const useGenerateBaseImage = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (renderId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/generate-base-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ render_id: renderId }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to generate image");
      return result;
    },
    onSuccess: (_, renderId) => {
      toast({ title: "Imagen generada", description: "La imagen base fue creada exitosamente." });
      // Invalidate to refetch render with new image URL
      queryClient.invalidateQueries({ queryKey: ["renders"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
};

/** Approve the base image */
export const useApproveImage = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ renderId, assetId }: { renderId: string; assetId: string }) => {
      // Update render status
      const { error: renderErr } = await supabase
        .from("renders")
        .update({ status: "IMAGE_APPROVED" })
        .eq("id", renderId);
      if (renderErr) throw renderErr;

      // Update asset status
      const { error: assetErr } = await supabase
        .from("assets")
        .update({ status: "IMAGE_APPROVED" })
        .eq("id", assetId);
      if (assetErr) throw assetErr;
    },
    onSuccess: () => {
      toast({ title: "Imagen aprobada", description: "Podés continuar con el render final." });
      queryClient.invalidateQueries({ queryKey: ["renders"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
};

/** Generate final video via edge function */
export const useGenerateFinalVideo = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (renderId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/generate-final-video`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ render_id: renderId }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to generate video");
      return result;
    },
    onSuccess: () => {
      toast({ title: "¡Video generado!", description: "Tu video final está listo para descargar." });
      queryClient.invalidateQueries({ queryKey: ["renders"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error en render", description: err.message, variant: "destructive" });
    },
  });
};
