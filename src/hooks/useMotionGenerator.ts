import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type MotionProject = {
  id: string;
  user_id: string;
  source_url: string | null;
  source_type: string;
  video_storage_path: string | null;
  thumbnail_url: string | null;
  transcript: string | null;
  duration_seconds: number | null;
  num_variants: number;
  blueprint_json: any;
  variants_json: any[];
  status: string;
  error_message: string | null;
  created_at: string;
};

export const useMotionProject = (id: string | undefined) => {
  return useQuery({
    queryKey: ["motion_projects", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("motion_projects" as any)
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as MotionProject;
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const d = query.state.data as MotionProject | undefined;
      if (!d) return false;
      if (["INGESTING", "ANALYZING", "GENERATING_IMAGES"].includes(d.status)) return 3000;
      return false;
    },
  });
};

export const useMotionProjects = () => {
  return useQuery({
    queryKey: ["motion_projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("motion_projects" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as MotionProject[];
    },
  });
};

export const useCreateMotionProject = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ sourceUrl, numVariants }: { sourceUrl?: string; numVariants: number }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Create project record
      const { data: project, error } = await supabase
        .from("motion_projects" as any)
        .insert({
          user_id: session.user.id,
          source_url: sourceUrl || null,
          source_type: sourceUrl ? "url" : "upload",
          num_variants: numVariants,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return project as unknown as MotionProject;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["motion_projects"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
};

export const useStartMotionIngest = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      projectId,
      sourceUrl,
      videoStoragePath,
      numVariants,
    }: {
      projectId: string;
      sourceUrl?: string;
      videoStoragePath?: string;
      numVariants: number;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/motion-ingest`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            project_id: projectId,
            source_url: sourceUrl,
            video_storage_path: videoStoragePath,
            num_variants: numVariants,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Ingest failed");
      return result;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["motion_projects", vars.projectId] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
};

export const useGenerateMotionImage = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ projectId, variantId }: { projectId: string; variantId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/motion-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ project_id: projectId, variant_id: variantId }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Image generation failed");
      return result;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["motion_projects", vars.projectId] });
    },
    onError: (err: Error) => {
      toast({ title: "Error generando imagen", description: err.message, variant: "destructive" });
    },
  });
};

export const useUploadMotionVideo = () => {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ projectId, file }: { projectId: string; file: File }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const storagePath = `${session.user.id}/motion/${projectId}/source.mp4`;
      const { error } = await supabase.storage.from("ugc-assets").upload(storagePath, file, {
        contentType: file.type,
        upsert: true,
      });
      if (error) throw error;
      return storagePath;
    },
    onError: (err: Error) => {
      toast({ title: "Error subiendo video", description: err.message, variant: "destructive" });
    },
  });
};
