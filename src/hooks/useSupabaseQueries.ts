import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/** Fetch all assets for the current user, ordered by newest first */
export const useAssets = () =>
  useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

/** Fetch a single asset by ID */
export const useAsset = (id: string | undefined) =>
  useQuery({
    queryKey: ["assets", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

/** Fetch the blueprint for a given asset */
export const useBlueprint = (assetId: string | undefined) =>
  useQuery({
    queryKey: ["blueprints", assetId],
    enabled: !!assetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blueprints")
        .select("*")
        .eq("asset_id", assetId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

/** Fetch jobs for a given asset, ordered by newest first */
export const useJobs = (assetId: string | undefined) =>
  useQuery({
    queryKey: ["jobs", assetId],
    enabled: !!assetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("asset_id", assetId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

/** Generate blueprint via edge function */
export const useGenerateBlueprint = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ assetId, force = false }: { assetId: string; force?: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-blueprint`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ asset_id: assetId, force }),
        }
      );

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Blueprint generation failed");
      return body;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["blueprints", data.asset_id] });
      queryClient.invalidateQueries({ queryKey: ["assets", data.asset_id] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast({ title: "Blueprint generado", description: "Análisis estratégico completado." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
};
