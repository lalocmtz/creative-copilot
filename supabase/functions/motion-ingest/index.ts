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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "No autorizado" }, 401);

    const { project_id, source_url, video_storage_path, num_variants = 1 } = await req.json();
    if (!project_id) return json({ error: "project_id requerido" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify ownership
    const { data: project, error: fetchErr } = await supabase
      .from("motion_projects")
      .select("*")
      .eq("id", project_id)
      .single();
    if (fetchErr || !project) return json({ error: "Proyecto no encontrado" }, 404);
    if (project.user_id !== user.id) return json({ error: "No autorizado" }, 403);

    if (project.status !== "PENDING") {
      return json({ project, message: "Ya procesado", cached: true });
    }

    await supabase.from("motion_projects").update({ status: "INGESTING" }).eq("id", project_id);

    // ═══════════════════════════════════════
    // STEP 1: DOWNLOAD VIDEO (TikTok URL)
    // ═══════════════════════════════════════
    let videoUrl = "";
    let thumbnailUrl = "";
    let duration = 0;

    if (source_url) {
      try {
        const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");
        if (!rapidApiKey) throw new Error("RAPIDAPI_KEY no configurado");

        const cleanedUrl = normalizeTikTokUrl(source_url);
        const encodedUrl = encodeURIComponent(cleanedUrl);
        const rapidRes = await fetch(
          `https://tiktok-download-video1.p.rapidapi.com/getVideo?url=${encodedUrl}&hd=1`,
          { headers: { "x-rapidapi-host": "tiktok-download-video1.p.rapidapi.com", "x-rapidapi-key": rapidApiKey } }
        );
        if (!rapidRes.ok) throw new Error(`RapidAPI error (${rapidRes.status})`);

        const rapidData = await rapidRes.json();
        const videoInfo = rapidData?.data;
        if (!videoInfo) throw new Error("No video data from API");

        const downloadUrl = videoInfo.hdplay || videoInfo.play;
        if (!downloadUrl) throw new Error("No download URL");

        // Download and store video
        const videoRes = await fetch(downloadUrl);
        if (!videoRes.ok) throw new Error("Error downloading video");
        const videoBlob = await videoRes.blob();

        const storagePath = `${user.id}/motion/${project_id}/source.mp4`;
        await supabase.storage.from("ugc-assets").upload(storagePath, videoBlob, {
          contentType: "video/mp4", upsert: true,
        });

        const { data: signedData } = await supabase.storage.from("ugc-assets").createSignedUrl(storagePath, 3600);
        videoUrl = signedData?.signedUrl || "";

        // Save thumbnail
        const coverUrl = videoInfo.origin_cover || videoInfo.cover;
        if (coverUrl) {
          try {
            const coverRes = await fetch(coverUrl);
            if (coverRes.ok) {
              const coverBlob = await coverRes.blob();
              const thumbPath = `${user.id}/motion/${project_id}/thumbnail.jpg`;
              await supabase.storage.from("ugc-assets").upload(thumbPath, coverBlob, {
                contentType: "image/jpeg", upsert: true,
              });
              const { data: thumbSigned } = await supabase.storage.from("ugc-assets").createSignedUrl(thumbPath, 3600);
              thumbnailUrl = thumbSigned?.signedUrl || "";
            }
          } catch (e) { console.error("Thumbnail failed (non-fatal):", e); }
        }

        duration = videoInfo.duration || 0;

        await supabase.from("motion_projects").update({
          video_storage_path: storagePath,
          thumbnail_url: thumbnailUrl,
          duration_seconds: duration,
        }).eq("id", project_id);
      } catch (err: any) {
        await supabase.from("motion_projects").update({
          status: "FAILED", error_message: `Download: ${err.message}`,
        }).eq("id", project_id);
        return json({ error: err.message, step: "download" }, 500);
      }
    } else if (video_storage_path) {
      // Direct upload — video already in storage
      const { data: signedData } = await supabase.storage.from("ugc-assets").createSignedUrl(video_storage_path, 3600);
      videoUrl = signedData?.signedUrl || "";
      await supabase.from("motion_projects").update({
        video_storage_path,
      }).eq("id", project_id);
    }

    // ═══════════════════════════════════════
    // STEP 2: TRANSCRIBE
    // ═══════════════════════════════════════
    let transcript = "";
    try {
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (openaiKey && videoUrl) {
        const storagePath = video_storage_path || `${user.id}/motion/${project_id}/source.mp4`;
        const { data: audioSigned } = await supabase.storage.from("ugc-assets").createSignedUrl(storagePath, 3600);
        const audioUrl = audioSigned?.signedUrl || videoUrl;

        const audioRes = await fetch(audioUrl);
        if (audioRes.ok) {
          const audioBytes = await audioRes.arrayBuffer();
          if (audioBytes.byteLength <= 25 * 1024 * 1024) {
            const formData = new FormData();
            formData.append("file", new Blob([audioBytes], { type: "video/mp4" }), "audio.mp4");
            formData.append("model", "whisper-1");
            formData.append("language", "es");

            const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
              method: "POST",
              headers: { Authorization: `Bearer ${openaiKey}` },
              body: formData,
            });
            if (whisperRes.ok) {
              const whisperData = await whisperRes.json();
              transcript = whisperData.text || "";
            }
          }
        }
      }
    } catch (e) {
      console.error("Transcribe failed (non-fatal):", e);
    }

    await supabase.from("motion_projects").update({ transcript }).eq("id", project_id);

    // ═══════════════════════════════════════
    // STEP 3: LLM ANALYSIS (Blueprint + Variants + Motion Prompts)
    // ═══════════════════════════════════════
    await supabase.from("motion_projects").update({ status: "ANALYZING" }).eq("id", project_id);

    try {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const userContent: any[] = [];

      // Add thumbnail if available
      if (thumbnailUrl) {
        userContent.push({ type: "image_url", image_url: { url: thumbnailUrl } });
      }

      const numV = Math.min(Math.max(num_variants, 1), 5);

      userContent.push({
        type: "text",
        text: `Analyze this TikTok UGC sales video and generate a structured blueprint + ${numV} controlled variant(s).

TRANSCRIPT: "${transcript || '(silent video — no transcript)'}"
VIDEO DURATION: ${duration || 'unknown'}s

Return this EXACT JSON structure:
{
  "video_blueprint": {
    "scene_type": "bedroom|bathroom|kitchen|car|office|outdoor|studio",
    "actor_role": "description of actor appearance, age, gender, vibe",
    "product_interaction": "how the person interacts with the product",
    "camera_distance": "close-up|medium|wide",
    "motion_type": "static|slow-pan|handheld|selfie",
    "gesture_patterns": ["list of key gestures"],
    "hook_moment": "what happens in first 2 seconds",
    "demonstration": "how the product is shown/used",
    "proof": "social proof or result shown",
    "cta": "call to action at the end",
    "on_screen_text": ["list of text overlays seen"],
    "script_mode": "voiceover|silent_visual",
    "language": "es-MX|en-US|etc",
    "pacing": "fast|medium|slow",
    "energy_level": "high|medium|low"
  },
  "variants": [
    {
      "variant_id": "A",
      "actor_profile": "DIFFERENT actor: age, gender, appearance, vibe (MUST differ from original)",
      "scene_type": "equivalent but NOT identical scene",
      "scene_details": "specific differences in layout, furniture, colors",
      "wardrobe": "outfit description",
      "gesture_adaptation": "how original gestures translate to this variant",
      "script_lines": ["paraphrased lines if voiceover, empty if silent"],
      "image_prompt": "Highly detailed photorealistic prompt for generating a vertical 9:16 UGC-style base image. Must describe: DIFFERENT person (age/gender/ethnicity different from original), equivalent scene setting, natural smartphone-quality lighting, product being held or used naturally. The person must look like a real TikTok creator, not a model. Include specific details about clothing, background elements, camera angle, and product placement.",
      "animation_prompt": "MASTER MOTION PROMPT for Kling Motion Control / Hisfield. This prompt must instruct the model to: 1) Replicate the exact motion pattern from the reference video, 2) Match the pacing: [beat-by-beat timing], 3) Body gestures: [specific movements frame by frame], 4) Hand movements: [product interaction details], 5) Camera distance: [maintain same framing], 6) Facial expressions: [emotional beats]. BUT: different actor, equivalent environment (not identical), NO logos or text overlays, compress to 10-12 seconds if original is longer. Format as a single continuous motion instruction paragraph."
    }
  ]
}

RULES:
- Generate exactly ${numV} variant(s) (IDs: A, B, C, D, E)
- Each variant MUST have a DIFFERENT actor (different age, gender, or ethnicity from original AND from each other)
- Scene must be EQUIVALENT but NOT identical (same type of room, different furniture/colors)
- Product remains IDENTICAL in all variants
- Gestures and timing must remain SIMILAR
- Spoken lines must be PARAPHRASED, never exact copies
- If no transcript, set script_lines to [] and note silent_visual
- If video > 25s, compress the story structure to 10-12 seconds in the animation_prompt
- image_prompt must be detailed enough for photorealistic generation
- animation_prompt must be copy-pasteable into Kling/Hisfield directly`
      });

      const aiRes = await fetch(LOVABLE_AI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "You are a TikTok Shop UGC video analyst and creative director. You analyze winning videos and generate controlled variant concepts for replication. Output ONLY valid JSON, no markdown fences, no explanation.",
            },
            { role: "user", content: userContent },
          ],
        }),
      });

      if (!aiRes.ok) throw new Error(`AI error: ${aiRes.status}`);
      const aiData = await aiRes.json();
      let rawContent = aiData.choices?.[0]?.message?.content || "{}";
      rawContent = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(rawContent);

      const blueprint = parsed.video_blueprint || {};
      const variants = (parsed.variants || []).map((v: any) => ({
        ...v,
        generated_image_url: null,
      }));

      await supabase.from("motion_projects").update({
        blueprint_json: blueprint,
        variants_json: variants,
        status: "ANALYZED",
      }).eq("id", project_id);
    } catch (err: any) {
      console.error("Analysis error:", err.message);
      await supabase.from("motion_projects").update({
        status: "FAILED", error_message: `Analysis: ${err.message}`,
      }).eq("id", project_id);
      return json({ error: err.message, step: "analysis" }, 500);
    }

    // Fetch final state
    const { data: updated } = await supabase.from("motion_projects").select("*").eq("id", project_id).single();
    return json({ project: updated });
  } catch (err: any) {
    console.error("Unexpected error:", err);
    return json({ error: err?.message || "Error interno" }, 500);
  }
});
