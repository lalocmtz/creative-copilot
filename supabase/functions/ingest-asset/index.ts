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

function normalizeTikTokUrl(input: string): string {
  try {
    const u = new URL(input.trim());
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return input.trim().split("?")[0].replace(/\/$/, "");
  }
}

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: "No autorizado" }, 401);

    const { asset_id } = await req.json();
    if (!asset_id) return json({ error: "asset_id es requerido" }, 400);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: asset, error: fetchError } = await supabase
      .from("assets")
      .select("*")
      .eq("id", asset_id)
      .single();

    if (fetchError || !asset) return json({ error: "Asset no encontrado" }, 404);
    if (asset.user_id !== user.id) return json({ error: "No autorizado" }, 403);

    // If already has variants, return cached
    if (["VARIANTS_READY", "IMAGE_READY", "RENDERING", "DONE"].includes(asset.status)) {
      return json({ asset, message: "Asset ya procesado", cached: true });
    }
    // Legacy statuses
    if (["VIDEO_INGESTED", "BLUEPRINT_GENERATED", "IMAGE_APPROVED", "VIDEO_RENDERED"].includes(asset.status)) {
      return json({ asset, message: "Asset ya fue ingestado (legacy)", cached: true });
    }

    const sourceHash = asset.source_hash || asset_id;

    // ══════════════════════════════════════
    // STEP 1: DOWNLOAD VIDEO
    // ══════════════════════════════════════
    const downloadKey = `download_video:${asset_id}:${sourceHash}`;
    const { data: existingDownload } = await supabase
      .from("jobs").select("*").eq("idempotency_key", downloadKey).eq("status", "DONE").maybeSingle();

    let videoUrl = (asset.metadata_json as any)?.video_url as string | undefined;

    await supabase.from("assets").update({ status: "DOWNLOADING" }).eq("id", asset_id);

    if (!existingDownload) {
      const { data: downloadJob } = await supabase
        .from("jobs")
        .insert({ asset_id, type: "download_video", idempotency_key: downloadKey, status: "RUNNING", attempts: 1 })
        .select().single();

      try {
        const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");
        if (!rapidApiKey) throw new Error("RAPIDAPI_KEY no configurado");

        const cleanedUrl = normalizeTikTokUrl(asset.source_url);
        const encodedUrl = encodeURIComponent(cleanedUrl);
        const rapidResponse = await fetch(
          `https://tiktok-download-video1.p.rapidapi.com/getVideo?url=${encodedUrl}&hd=1`,
          { headers: { "x-rapidapi-host": "tiktok-download-video1.p.rapidapi.com", "x-rapidapi-key": rapidApiKey } }
        );
        if (!rapidResponse.ok) throw new Error(`RapidAPI error (${rapidResponse.status})`);

        const rapidData = await rapidResponse.json();
        const videoInfo = rapidData?.data;
        if (!videoInfo) throw new Error("No se pudo obtener datos del video");

        const downloadUrl = videoInfo.hdplay || videoInfo.play;
        if (!downloadUrl) throw new Error("No se encontró URL de descarga");

        const videoResponse = await fetch(downloadUrl);
        if (!videoResponse.ok) throw new Error("Error descargando video");
        const videoBlob = await videoResponse.blob();

        const storagePath = `${user.id}/${asset_id}/source.mp4`;
        const { error: uploadError } = await supabase.storage.from("ugc-assets").upload(storagePath, videoBlob, { contentType: "video/mp4", upsert: true });
        if (uploadError) throw new Error(`Storage upload error: ${uploadError.message}`);

        // Save thumbnail
        const coverUrl = videoInfo.origin_cover || videoInfo.cover;
        if (coverUrl) {
          try {
            const coverRes = await fetch(coverUrl);
            if (coverRes.ok) {
              const coverBlob = await coverRes.blob();
              await supabase.storage.from("ugc-assets").upload(`${user.id}/${asset_id}/thumbnail.jpg`, coverBlob, { contentType: "image/jpeg", upsert: true });
            }
          } catch (e) { console.error("Cover download failed (non-fatal):", e); }
        }

        const { data: signedUrlData } = await supabase.storage.from("ugc-assets").createSignedUrl(storagePath, 3600);
        videoUrl = signedUrlData?.signedUrl;

        const musicUrl = videoInfo.music || videoInfo.music_info?.play || null;
        await supabase.from("assets").update({
          status: "DOWNLOADED",
          metadata_json: {
            video_url: videoUrl, music_url: musicUrl,
            duration: videoInfo.duration || null,
            resolution: videoInfo.height ? `${videoInfo.width}x${videoInfo.height}` : null,
            original_description: videoInfo.title || null,
            author: videoInfo.author?.nickname || null,
            has_thumbnail: !!coverUrl,
          },
        }).eq("id", asset_id);

        await supabase.from("jobs").update({ status: "DONE", cost_json: { provider: "rapidapi_tiktok", estimated_cost: 0.01 } }).eq("id", downloadJob!.id);
      } catch (err: any) {
        if (downloadJob) await supabase.from("jobs").update({ status: "FAILED", error_message: err.message }).eq("id", downloadJob.id);
        await supabase.from("assets").update({ status: "FAILED", error_json: { step: "download", message: err.message } }).eq("id", asset_id);
        return json({ error: err.message, step: "download" }, 500);
      }
    } else {
      const storagePath = `${user.id}/${asset_id}/source.mp4`;
      const { data: signedData } = await supabase.storage.from("ugc-assets").createSignedUrl(storagePath, 3600);
      videoUrl = signedData?.signedUrl || (asset.metadata_json as any)?.video_url;
      await supabase.from("assets").update({ status: "DOWNLOADED" }).eq("id", asset_id);
    }

    // ══════════════════════════════════════
    // STEP 2: TRANSCRIBE
    // ══════════════════════════════════════
    const transcribeKey = `transcribe:${asset_id}:${sourceHash}`;
    const { data: existingTranscribe } = await supabase
      .from("jobs").select("*").eq("idempotency_key", transcribeKey).eq("status", "DONE").maybeSingle();

    await supabase.from("assets").update({ status: "TRANSCRIBING" }).eq("id", asset_id);

    let transcript = asset.transcript || "";

    if (!existingTranscribe) {
      const { data: transcribeJob } = await supabase
        .from("jobs")
        .insert({ asset_id, type: "transcribe", idempotency_key: transcribeKey, status: "RUNNING", attempts: 1 })
        .select().single();

      try {
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        if (!openaiKey) throw new Error("OPENAI_API_KEY no configurado");

        const freshAsset = await supabase.from("assets").select("metadata_json").eq("id", asset_id).single();
        const meta = freshAsset.data?.metadata_json as any;
        const musicUrl = meta?.music_url;

        const storagePath = `${user.id}/${asset_id}/source.mp4`;
        const { data: audioSignedData } = await supabase.storage.from("ugc-assets").createSignedUrl(storagePath, 3600);
        const fallbackUrl = audioSignedData?.signedUrl || videoUrl;

        let audioBytes: ArrayBuffer | null = null;
        let usedMusicUrl = false;

        if (musicUrl) {
          try {
            const musicRes = await fetch(musicUrl);
            if (musicRes.ok) {
              const bytes = await musicRes.arrayBuffer();
              if (bytes.byteLength > 0 && bytes.byteLength <= 25 * 1024 * 1024) { audioBytes = bytes; usedMusicUrl = true; }
            }
          } catch { /* fallback */ }
        }

        if (!audioBytes) {
          if (!fallbackUrl) throw new Error("No hay URL de audio/video");
          const audioResponse = await fetch(fallbackUrl);
          if (!audioResponse.ok) throw new Error("Error descargando audio");
          audioBytes = await audioResponse.arrayBuffer();
        }

        if (audioBytes.byteLength > 25 * 1024 * 1024) throw new Error("Archivo demasiado grande para Whisper");

        const formData = new FormData();
        formData.append("file", new Blob([audioBytes], { type: usedMusicUrl ? "audio/mpeg" : "video/mp4" }), usedMusicUrl ? "audio.mp3" : "audio.mp4");
        formData.append("model", "whisper-1");
        formData.append("language", "es");

        const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: formData,
        });
        if (!whisperResponse.ok) throw new Error(`Whisper error (${whisperResponse.status})`);

        const whisperData = await whisperResponse.json();
        transcript = whisperData.text || "";

        await supabase.from("assets").update({ transcript }).eq("id", asset_id);
        await supabase.from("jobs").update({ status: "DONE", cost_json: { provider: "openai_whisper", estimated_cost: 0.25 } }).eq("id", transcribeJob!.id);
      } catch (err: any) {
        if (transcribeJob) await supabase.from("jobs").update({ status: "FAILED", error_message: err.message }).eq("id", transcribeJob.id);
        // Non-fatal: continue without transcript
        console.error("Transcribe failed (non-fatal):", err.message);
        transcript = "";
      }
    } else {
      const freshAsset = await supabase.from("assets").select("transcript").eq("id", asset_id).single();
      transcript = freshAsset.data?.transcript || "";
    }

    // ══════════════════════════════════════
    // STEP 3: UNDERSTAND (LLM analysis)
    // ══════════════════════════════════════
    const understandKey = `understand:${asset_id}:${sourceHash}`;
    const { data: existingUnderstand } = await supabase
      .from("jobs").select("*").eq("idempotency_key", understandKey).eq("status", "DONE").maybeSingle();

    await supabase.from("assets").update({ status: "UNDERSTANDING" }).eq("id", asset_id);

    let understandingJson: any = {};

    if (!existingUnderstand) {
      const { data: understandJob } = await supabase
        .from("jobs")
        .insert({ asset_id, type: "understand", idempotency_key: understandKey, status: "RUNNING", attempts: 1 })
        .select().single();

      try {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

        // Get thumbnail for visual analysis
        const thumbPath = `${user.id}/${asset_id}/thumbnail.jpg`;
        const { data: thumbSigned } = await supabase.storage.from("ugc-assets").createSignedUrl(thumbPath, 1800);

        const userContent: any[] = [];
        if (thumbSigned?.signedUrl) {
          userContent.push({ type: "image_url", image_url: { url: thumbSigned.signedUrl } });
        }

        const meta = (await supabase.from("assets").select("metadata_json").eq("id", asset_id).single()).data?.metadata_json as any;

        userContent.push({
          type: "text",
          text: `Analyze this TikTok UGC sales video. Return JSON ONLY.

TRANSCRIPT: "${transcript || '(no transcript — silent video)'}"

VIDEO INFO:
- Duration: ${meta?.duration || 'unknown'}s
- Description: "${meta?.original_description || 'none'}"
- Author: ${meta?.author || 'unknown'}

Return this exact JSON structure:
{
  "hook": "description of the hook used in first 2 seconds",
  "angle": "the sales angle (problem-solution, testimonial, before-after, etc.)",
  "emotion": "dominant emotion (excitement, curiosity, urgency, trust, etc.)",
  "beat_structure": [
    {"beat": "hook", "seconds": "0-2", "description": "what happens"},
    {"beat": "demo", "seconds": "2-6", "description": "what happens"},
    {"beat": "proof", "seconds": "6-8", "description": "what happens"},
    {"beat": "cta", "seconds": "8-10", "description": "what happens"}
  ],
  "visual_description": "describe the visual scene, person, setting, camera angle",
  "product_category": "what type of product is being sold",
  "script_mode": "voiceover or silent_visual",
  "language": "es-MX or en-US etc.",
  "gender": "masculino or femenino",
  "retention_suggestion": "one suggestion to improve retention"
}`
        });

        const aiRes = await fetch(LOVABLE_AI_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are a UGC video analyst for TikTok Shop. Output ONLY valid JSON, no markdown, no explanation." },
              { role: "user", content: userContent },
            ],
          }),
        });

        if (!aiRes.ok) throw new Error(`AI error: ${aiRes.status}`);
        const aiData = await aiRes.json();
        let rawContent = aiData.choices?.[0]?.message?.content || "{}";
        // Strip markdown code fences if present
        rawContent = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        understandingJson = JSON.parse(rawContent);

        await supabase.from("assets").update({ understanding_json: understandingJson }).eq("id", asset_id);
        await supabase.from("jobs").update({ status: "DONE", cost_json: { provider: "lovable_ai", model: "gemini-2.5-flash", estimated_cost: 0.02 } }).eq("id", understandJob!.id);
      } catch (err: any) {
        console.error("Understand error:", err.message);
        if (understandJob) await supabase.from("jobs").update({ status: "FAILED", error_message: err.message }).eq("id", understandJob.id);
        // Non-fatal, continue with empty understanding
      }
    } else {
      const freshAsset = await supabase.from("assets").select("understanding_json").eq("id", asset_id).single();
      understandingJson = freshAsset.data?.understanding_json || {};
    }

    // ══════════════════════════════════════
    // STEP 4: BUILD VARIANTS (Prompt Maestro)
    // ══════════════════════════════════════
    const variantsKey = `build_variants:${asset_id}:${sourceHash}`;
    const { data: existingVariants } = await supabase
      .from("jobs").select("*").eq("idempotency_key", variantsKey).eq("status", "DONE").maybeSingle();

    if (!existingVariants) {
      const { data: variantsJob } = await supabase
        .from("jobs")
        .insert({ asset_id, type: "build_variants", idempotency_key: variantsKey, status: "RUNNING", attempts: 1 })
        .select().single();

      try {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

        const promptMaestroSystem = `You are Prompt Maestro — a UGC video strategist for TikTok Shop. You receive an analysis of a winning video and must generate 3 variant concepts (A, B, C) that replicate the winning structure with new actors and settings.

OUTPUT: Return ONLY valid JSON with this exact structure:
{
  "variants": [
    {
      "variant_id": "A",
      "format": { "aspect_ratio": "portrait", "n_frames_default": "15" },
      "variant": {
        "actor_profile": "description of actor appearance, age, vibe",
        "scene_type": "bedroom|bathroom|kitchen|car|office|outdoor",
        "scene_constraints": "same context, different layout, different furniture",
        "wardrobe": "casual outfit, different colors"
      },
      "shotlist": [
        { "beat": "hook", "camera": "selfie close-up handheld", "action": "what happens", "on_screen_text": "max 6-8 words", "emotion": "emotion" },
        { "beat": "demo", "camera": "same distance slight angle shift", "action": "what happens", "on_screen_text": "max 6-8 words", "emotion": "emotion" },
        { "beat": "proof", "camera": "same framing quick cut vibe", "action": "what happens", "on_screen_text": "max 6-8 words", "emotion": "emotion" },
        { "beat": "cta", "camera": "return to hook framing", "action": "what happens", "on_screen_text": "max 6-8 words", "emotion": "emotion" }
      ],
      "script": {
        "mode": "voiceover|silent_visual",
        "language": "es-MX",
        "lines": ["line1", "line2", "line3", "line4"]
      },
      "image_prompt": "Detailed prompt for generating the base image with Nano Banana. Must describe: person appearance (DIFFERENT from original), setting, camera angle, product placement, lighting. Portrait 9:16. UGC smartphone quality.",
      "video_motion_prompt": "Detailed prompt for Sora2 I2V animation. Must describe: 10-15 second motion plan with 4 beats (hook/demo/proof/cta), camera movement, gestures, product interaction, facial expressions. UGC TikTok Shop sales energy.",
      "negative_rules": ["no logos", "no copy exact identity", "no same room layout", "no artifacts", "no extra fingers"]
    }
  ]
}

RULES:
- Exactly 3 variants (A, B, C)
- Each variant has a DIFFERENT actor profile and DIFFERENT scene layout
- Scripts are PARAPHRASED, never exact copies of the original
- If original has no voice, use script.mode = "silent_visual" and lines = []
- Hook must be equivalent but reworded
- On-screen text max 6-8 words per beat
- image_prompt must be detailed enough to generate a photorealistic UGC-style base image
- video_motion_prompt must describe the full 10-15 second motion plan
- Always include negative_rules
- Different background/furniture/setting for each variant`;

        const aiRes = await fetch(LOVABLE_AI_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: promptMaestroSystem },
              {
                role: "user",
                content: `Generate 3 UGC variant concepts based on this winning video analysis:

TRANSCRIPT: "${transcript || '(silent video, no transcript)'}"

UNDERSTANDING:
${JSON.stringify(understandingJson, null, 2)}

Generate the variants JSON now. Remember: different actors, different rooms, paraphrased scripts, same winning structure.`
              },
            ],
          }),
        });

        if (!aiRes.ok) throw new Error(`AI error: ${aiRes.status}`);
        const aiData = await aiRes.json();
        let rawContent = aiData.choices?.[0]?.message?.content || "{}";
        rawContent = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(rawContent);
        
        // Add tracking fields to each variant
        const variants = (parsed.variants || []).map((v: any) => ({
          ...v,
          base_image_url: null,
          base_image_approved: false,
          final_video_url: null,
        }));

        await supabase.from("assets").update({
          variants_json: variants,
          status: "VARIANTS_READY",
        }).eq("id", asset_id);

        await supabase.from("jobs").update({ status: "DONE", cost_json: { provider: "lovable_ai", model: "gemini-2.5-flash", estimated_cost: 0.03 } }).eq("id", variantsJob!.id);
      } catch (err: any) {
        console.error("Build variants error:", err.message);
        if (variantsJob) await supabase.from("jobs").update({ status: "FAILED", error_message: err.message }).eq("id", variantsJob.id);
        await supabase.from("assets").update({ status: "FAILED", error_json: { step: "build_variants", message: err.message } }).eq("id", asset_id);
        return json({ error: err.message, step: "build_variants" }, 500);
      }
    } else {
      await supabase.from("assets").update({ status: "VARIANTS_READY" }).eq("id", asset_id);
    }

    // Fetch final state
    const { data: updatedAsset } = await supabase.from("assets").select("*").eq("id", asset_id).single();
    const { data: jobs } = await supabase.from("jobs").select("*").eq("asset_id", asset_id).order("created_at", { ascending: true });

    return json({ asset: updatedAsset, jobs });
  } catch (err: any) {
    console.error("Unexpected error:", err);
    return json({ error: err?.message || "Error interno del servidor" }, 500);
  }
});
