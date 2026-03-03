import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
