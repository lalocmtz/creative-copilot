import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/** Upload or remove product image for an asset */
export const useUploadProductImage = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ assetId, file }: { assetId: string; file: File | null }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const userId = session.user.id;

      if (!file) {
        // Remove product image
        const { data: asset } = await supabase.from("assets").select("metadata_json").eq("id", assetId).single();
        const metadata = (asset?.metadata_json as any) || {};
        delete metadata.product_image_url;
        await supabase.from("assets").update({ metadata_json: metadata }).eq("id", assetId);
        return { removed: true };
      }

      // Upload to storage
      const ext = file.name.split(".").pop() || "jpg";
      const storagePath = `${userId}/${assetId}/product.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("ugc-assets").upload(storagePath, file, {
        contentType: file.type, upsert: true,
      });
      if (uploadErr) throw new Error(uploadErr.message);

      // Get signed URL (7 days)
      const { data: signedData } = await supabase.storage.from("ugc-assets").createSignedUrl(storagePath, 60 * 60 * 24 * 7);
      const signedUrl = signedData?.signedUrl || "";

      // Update metadata_json
      const { data: asset } = await supabase.from("assets").select("metadata_json").eq("id", assetId).single();
      const metadata = (asset?.metadata_json as any) || {};
      metadata.product_image_url = signedUrl;
      await supabase.from("assets").update({ metadata_json: metadata }).eq("id", assetId);

      return { url: signedUrl };
    },
    onSuccess: (result, vars) => {
      toast({ title: result.removed ? "Imagen eliminada" : "Imagen subida", description: result.removed ? "Se quitó la imagen del producto." : "El producto se usará en las imágenes base." });
      queryClient.invalidateQueries({ queryKey: ["assets", vars.assetId] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
};

/** Generate base image for a specific variant */
export const useGenerateBaseImage = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ assetId, variantId }: { assetId: string; variantId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-base-image`,
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
      if (!res.ok) throw new Error(result.error || "Failed to generate image");
      return result;
    },
    onSuccess: (_, vars) => {
      toast({ title: "Imagen generada", description: `Variante ${vars.variantId} lista.` });
      queryClient.invalidateQueries({ queryKey: ["assets", vars.assetId] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
};

/** Approve a variant's base image */
export const useApproveVariantImage = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ assetId, variantId }: { assetId: string; variantId: string }) => {
      // Fetch current asset to update variants_json
      const { data: asset, error } = await supabase
        .from("assets")
        .select("variants_json")
        .eq("id", assetId)
        .single();
      if (error || !asset) throw new Error("Asset not found");

      const variants = (asset.variants_json as any[]) || [];
      const idx = variants.findIndex((v: any) => v.variant_id === variantId);
      if (idx === -1) throw new Error("Variant not found");

      variants[idx] = { ...variants[idx], base_image_approved: true };

      // Check if any variant has approved image
      const anyApproved = variants.some((v: any) => v.base_image_approved);

      const { error: updateErr } = await supabase
        .from("assets")
        .update({
          variants_json: variants,
          status: anyApproved ? "IMAGE_READY" : undefined,
        })
        .eq("id", assetId);
      if (updateErr) throw updateErr;
    },
    onSuccess: (_, vars) => {
      toast({ title: "Imagen aprobada", description: `Variante ${vars.variantId} lista para animar.` });
      queryClient.invalidateQueries({ queryKey: ["assets", vars.assetId] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
};

/** Generate base images for all 3 variants */
export const useGenerateAllBaseImages = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ assetId, variantIds }: { assetId: string; variantIds: string[] }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const results = [];
      for (const variantId of variantIds) {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-base-image`,
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
        results.push({ variantId, ...result, ok: res.ok });
      }
      return results;
    },
    onSuccess: (_, vars) => {
      toast({ title: "Imágenes generadas", description: "Las 3 variantes tienen imagen base." });
      queryClient.invalidateQueries({ queryKey: ["assets", vars.assetId] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
};
