import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: "No autorizado" }, 401);

    const { asset_id } = await req.json();
    if (!asset_id) return json({ error: "asset_id es requerido" }, 400);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch asset and verify ownership
    const { data: asset, error: fetchError } = await supabase
      .from("assets")
      .select("*")
      .eq("id", asset_id)
      .single();

    if (fetchError || !asset) return json({ error: "Asset no encontrado" }, 404);
    if (asset.user_id !== user.id) return json({ error: "No autorizado" }, 403);

    // If already ingested, return cached
    if (asset.status === "VIDEO_INGESTED" || asset.status === "BLUEPRINT_GENERATED" ||
        asset.status === "IMAGE_APPROVED" || asset.status === "VIDEO_RENDERED") {
      return json({ asset, message: "Asset ya fue ingestado", cached: true });
    }

    const sourceHash = asset.source_hash || asset_id;

    // ── Step 1: Download video ──
    const downloadKey = `download_video:${asset_id}:${sourceHash}`;

    // Check idempotency
    const { data: existingDownload } = await supabase
      .from("jobs")
      .select("*")
      .eq("idempotency_key", downloadKey)
      .eq("status", "DONE")
      .maybeSingle();

    let videoUrl = (asset.metadata_json as Record<string, unknown>)?.video_url as string | undefined;

    if (!existingDownload) {
      // Create download job
      const { data: downloadJob } = await supabase
        .from("jobs")
        .insert({
          asset_id,
          type: "download_video" as const,
          idempotency_key: downloadKey,
          status: "RUNNING" as const,
          attempts: 1,
        })
        .select()
        .single();

      try {
        const apifyKey = Deno.env.get("APIFY_API_KEY");
        if (!apifyKey) {
          throw new Error("APIFY_API_KEY no configurado. Agrega el secret en la configuración.");
        }

        // Call Apify TikTok scraper
        const apifyResponse = await fetch(
          `https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=${apifyKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              postURLs: [asset.source_url],
              resultsPerPage: 1,
            }),
          }
        );

        if (!apifyResponse.ok) {
          const errText = await apifyResponse.text();
          throw new Error(`Apify error (${apifyResponse.status}): ${errText}`);
        }

        const apifyData = await apifyResponse.json();
        const videoData = apifyData?.[0];

        if (!videoData?.videoUrl) {
          throw new Error("No se pudo obtener la URL del video de TikTok");
        }

        // Download the video binary
        const videoResponse = await fetch(videoData.videoUrl);
        if (!videoResponse.ok) throw new Error("Error descargando video");
        const videoBlob = await videoResponse.blob();

        // Upload to Supabase Storage
        const storagePath = `${user.id}/${asset_id}/source.mp4`;
        const { error: uploadError } = await supabase.storage
          .from("ugc-assets")
          .upload(storagePath, videoBlob, {
            contentType: "video/mp4",
            upsert: true,
          });

        if (uploadError) throw new Error(`Storage upload error: ${uploadError.message}`);

        const { data: publicUrl } = supabase.storage
          .from("ugc-assets")
          .getPublicUrl(storagePath);

        videoUrl = publicUrl.publicUrl;

        // Update asset metadata
        await supabase
          .from("assets")
          .update({
            metadata_json: {
              video_url: videoUrl,
              duration: videoData.videoMeta?.duration || null,
              resolution: videoData.videoMeta?.height
                ? `${videoData.videoMeta.width}x${videoData.videoMeta.height}`
                : null,
              original_description: videoData.text || null,
              author: videoData.authorMeta?.name || null,
            },
          })
          .eq("id", asset_id);

        // Mark download job as done
        await supabase
          .from("jobs")
          .update({
            status: "DONE" as const,
            cost_json: { provider: "apify", estimated_cost: 0.05 },
          })
          .eq("id", downloadJob!.id);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Error en descarga";
        console.error("Download error:", errorMsg);

        if (downloadJob) {
          await supabase
            .from("jobs")
            .update({ status: "FAILED" as const, error_message: errorMsg })
            .eq("id", downloadJob.id);
        }

        await supabase
          .from("assets")
          .update({
            status: "FAILED" as const,
            metadata_json: { ...(asset.metadata_json as object || {}), error: errorMsg },
          })
          .eq("id", asset_id);

        return json({ error: errorMsg, step: "download" }, 500);
      }
    } else {
      videoUrl = (asset.metadata_json as Record<string, unknown>)?.video_url as string;
    }

    // ── Step 2: Transcribe ──
    const transcribeKey = `transcribe:${asset_id}:${sourceHash}`;

    const { data: existingTranscribe } = await supabase
      .from("jobs")
      .select("*")
      .eq("idempotency_key", transcribeKey)
      .eq("status", "DONE")
      .maybeSingle();

    if (!existingTranscribe) {
      const { data: transcribeJob } = await supabase
        .from("jobs")
        .insert({
          asset_id,
          type: "transcribe" as const,
          idempotency_key: transcribeKey,
          status: "RUNNING" as const,
          attempts: 1,
        })
        .select()
        .single();

      try {
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        if (!openaiKey) {
          throw new Error("OPENAI_API_KEY no configurado. Agrega el secret en la configuración.");
        }

        // Download video for transcription
        if (!videoUrl) throw new Error("No hay URL de video para transcribir");

        const videoForTranscript = await fetch(videoUrl);
        if (!videoForTranscript.ok) throw new Error("Error descargando video para transcripción");
        const videoBytes = await videoForTranscript.arrayBuffer();

        // Call Whisper API
        const formData = new FormData();
        formData.append("file", new Blob([videoBytes], { type: "video/mp4" }), "audio.mp4");
        formData.append("model", "whisper-1");
        formData.append("language", "es");

        const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: formData,
        });

        if (!whisperResponse.ok) {
          const errText = await whisperResponse.text();
          throw new Error(`Whisper error (${whisperResponse.status}): ${errText}`);
        }

        const whisperData = await whisperResponse.json();
        const transcript = whisperData.text;

        // Save transcript on asset
        await supabase
          .from("assets")
          .update({ transcript, status: "VIDEO_INGESTED" as const })
          .eq("id", asset_id);

        // Mark transcribe job as done
        await supabase
          .from("jobs")
          .update({
            status: "DONE" as const,
            cost_json: { provider: "openai_whisper", estimated_cost: 0.25 },
          })
          .eq("id", transcribeJob!.id);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Error en transcripción";
        console.error("Transcribe error:", errorMsg);

        if (transcribeJob) {
          await supabase
            .from("jobs")
            .update({ status: "FAILED" as const, error_message: errorMsg })
            .eq("id", transcribeJob.id);
        }

        await supabase
          .from("assets")
          .update({
            status: "FAILED" as const,
            metadata_json: { ...(asset.metadata_json as object || {}), error: errorMsg },
          })
          .eq("id", asset_id);

        return json({ error: errorMsg, step: "transcribe" }, 500);
      }
    } else {
      // Transcript already exists, just ensure status is updated
      await supabase
        .from("assets")
        .update({ status: "VIDEO_INGESTED" as const })
        .eq("id", asset_id);
    }

    // Fetch final state
    const { data: updatedAsset } = await supabase
      .from("assets")
      .select("*")
      .eq("id", asset_id)
      .single();

    const { data: jobs } = await supabase
      .from("jobs")
      .select("*")
      .eq("asset_id", asset_id)
      .order("created_at", { ascending: true });

    return json({ asset: updatedAsset, jobs });
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: "Error interno del servidor" }, 500);
  }
});
