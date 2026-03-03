import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const KIE_BASE = "https://api.kie.ai/api/v1";
const KIE_FILE_UPLOAD = "https://kieai.redpandaai.co/api/file-url-upload";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// ElevenLabs voice IDs — full catalog
const VOICE_MAP: Record<string, string> = {
  // Female
  sarah: "EXAVITQu4vr4xnSDxMaL",
  lily: "pFZP5JQG7iQjIQuC4Bku",
  jessica: "cgSgspJ2msm6clMCkdW9",
  laura: "FGY2WhTYpPnrIDTdsKH5",
  alice: "Xb7hH8MSUJpSbSDYk0k2",
  // Male
  george: "JBFqnCBsd6RMkjVDRZzb",
  charlie: "IKne3meq5aSn9XLyUdCD",
  brian: "nPczCjzI2devNBz1zQrb",
  liam: "TX3LPaxmHKxFdv7VOQHJ",
  eric: "cjVigY5qzO86Huf0OWal",
  // Legacy IDs (backward compat)
  v1: "EXAVITQu4vr4xnSDxMaL",
  v2: "JBFqnCBsd6RMkjVDRZzb",
  v3: "pFZP5JQG7iQjIQuC4Bku",
};

async function condensScript(scriptText: string, lovableApiKey: string): Promise<string> {
  console.log(`[CONDENSE] Original script (${scriptText.split(/\s+/).length} words): ${scriptText.substring(0, 100)}...`);
  
  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: "Eres un experto en copywriting UGC para TikTok. Tu trabajo es condensar guiones manteniendo la esencia, el hook, la propuesta de valor y el CTA."
        },
        {
          role: "user",
          content: `Condensa este guion UGC a exactamente 10 segundos de lectura (~25-30 palabras). Mantén el hook, la propuesta de valor y el CTA. Mismo tono y energía. Solo devuelve el guion condensado, nada más.\n\nGuion original:\n${scriptText}`
        }
      ],
    }),
  });

  if (!res.ok) {
    console.error("[CONDENSE] AI error:", res.status, await res.text());
    const words = scriptText.split(/\s+/);
    return words.length > 30 ? words.slice(0, 30).join(" ") : scriptText;
  }

  const data = await res.json();
  const condensed = data.choices?.[0]?.message?.content?.trim() || scriptText;
  console.log(`[CONDENSE] Condensed (${condensed.split(/\s+/).length} words): ${condensed}`);
  return condensed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const KIE_API_KEY = Deno.env.get("KIE_AI_API_KEY");
    if (!KIE_API_KEY) throw new Error("KIE_AI_API_KEY not configured");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);
    const userId = user.id;

    const { render_id, script: clientScript } = await req.json();
    if (!render_id) return json({ error: "render_id is required" }, 400);

    const { data: render, error: renderErr } = await supabaseAdmin
      .from("renders")
      .select("*, assets!inner(id, user_id, status)")
      .eq("id", render_id)
      .single();
    if (renderErr || !render) return json({ error: "Render not found" }, 404);
    if ((render as any).assets.user_id !== userId) return json({ error: "Unauthorized" }, 403);
    if (render.status !== "IMAGE_APPROVED") return json({ error: `Render must be IMAGE_APPROVED, got ${render.status}` }, 409);

    const assetId = render.asset_id;
    const baseImageUrl = render.base_image_url;
    if (!baseImageUrl) return json({ error: "No base image URL" }, 400);

    // Resolve script
    let scriptText = clientScript || "";
    if (!scriptText) {
      const { data: bp } = await supabaseAdmin.from("blueprints").select("variations_json").eq("asset_id", assetId).single();
      if (bp?.variations_json) {
        const variations = bp.variations_json as any[];
        const match = variations.find((v: any) => v.nivel === render.variation_level);
        scriptText = match?.guion || "";
      }
    }
    if (!scriptText) return json({ error: "No script found for this render" }, 400);

    // Set status to RENDERING
    await supabaseAdmin.from("renders").update({ status: "RENDERING" }).eq("id", render_id);

    // Idempotency check
    const idempotencyKey = `final_video_lipsync:${render_id}`;
    const { data: existingJob } = await supabaseAdmin.from("jobs").select("*").eq("idempotency_key", idempotencyKey).eq("status", "DONE").maybeSingle();
    if (existingJob) return json({ message: "Already completed", job: existingJob });

    // Create/update job
    const { data: job } = await supabaseAdmin.from("jobs").upsert(
      { asset_id: assetId, render_id, type: "video" as any, status: "RUNNING" as any, idempotency_key: idempotencyKey, attempts: 1 },
      { onConflict: "idempotency_key" }
    ).select().single();

    // === STEP 0: Condense script to ~10s ===
    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        _tasks: {},
        _progress: { step: "condensing_script", detail: "Condensando guion a 10s…", updated_at: new Date().toISOString() },
        _job_id: job?.id, _image_url: baseImageUrl, _user_id: userId, _asset_id: assetId, _script: scriptText,
      },
    }).eq("id", render_id);

    const wordCount = scriptText.split(/\s+/).length;
    let condensedScript = scriptText;
    if (wordCount > 35) {
      condensedScript = await condensScript(scriptText, LOVABLE_API_KEY);
    }
    console.log(`[KICKOFF] Script: ${wordCount} words → condensed: ${condensedScript.split(/\s+/).length} words`);

    // === STEP 1: TTS via ElevenLabs directly (synchronous) ===
    const voiceId = VOICE_MAP[render.voice_id || "sarah"] || VOICE_MAP.sarah;
    console.log(`[KICKOFF] Starting ElevenLabs TTS for voice ${render.voice_id} → ${voiceId}`);

    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        _tasks: { condensed_script: condensedScript },
        _progress: { step: "generating_tts", detail: "Generando voz con ElevenLabs…", updated_at: new Date().toISOString() },
        _job_id: job?.id, _image_url: baseImageUrl, _user_id: userId, _asset_id: assetId, _script: scriptText,
      },
    }).eq("id", render_id);

    const ttsRes = await fetch(
      `${ELEVENLABS_TTS_URL}/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: condensedScript,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      throw new Error(`ElevenLabs TTS failed (${ttsRes.status}): ${errText}`);
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    console.log(`[KICKOFF] TTS audio received: ${audioBuffer.byteLength} bytes`);

    // Upload audio to Supabase Storage
    const audioPath = `${userId}/${assetId}/renders/${render_id}/tts_audio.mp3`;
    await supabaseAdmin.storage.from("ugc-assets").upload(audioPath, audioBuffer, { contentType: "audio/mpeg", upsert: true });
    const { data: audioSigned } = await supabaseAdmin.storage.from("ugc-assets").createSignedUrl(audioPath, 60 * 60 * 2); // 2h expiry
    const ttsAudioUrl = audioSigned?.signedUrl;
    if (!ttsAudioUrl) throw new Error("Failed to get signed URL for TTS audio");
    console.log(`[KICKOFF] TTS audio uploaded to storage`);

    // === STEP 2: Upload files to KIE and start lip-sync ===
    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        _tasks: { condensed_script: condensedScript },
        _progress: { step: "starting_lipsync", detail: "Preparando lip-sync…", updated_at: new Date().toISOString() },
        _job_id: job?.id, _image_url: baseImageUrl, _user_id: userId, _asset_id: assetId, _script: scriptText, _tts_audio_url: ttsAudioUrl,
      },
    }).eq("id", render_id);

    // Upload TTS audio to KIE
    const audioFileName = `tts_${render_id}.mp3`;
    const uploadAudioRes = await fetch(KIE_FILE_UPLOAD, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl: ttsAudioUrl, uploadPath: audioFileName }),
    });
    const uploadAudioData = await uploadAudioRes.json();
    const kieAudioUrl = uploadAudioData?.data?.downloadUrl || uploadAudioData?.data?.url;
    if (!kieAudioUrl) throw new Error(`Audio upload to KIE failed: ${JSON.stringify(uploadAudioData)}`);
    console.log("[KICKOFF] TTS audio uploaded to KIE:", kieAudioUrl);

    // Upload base image to KIE
    const imageFileName = `base_${render_id}.jpg`;
    const uploadImageRes = await fetch(KIE_FILE_UPLOAD, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl: baseImageUrl, uploadPath: imageFileName }),
    });
    const uploadImageData = await uploadImageRes.json();
    const kieImageUrl = uploadImageData?.data?.downloadUrl || uploadImageData?.data?.url;
    if (!kieImageUrl) throw new Error(`Image upload to KIE failed: ${JSON.stringify(uploadImageData)}`);
    console.log("[KICKOFF] Base image uploaded to KIE:", kieImageUrl);

    // Start InfiniteTalk lip-sync
    const lipsyncPrompt = "Natural head movement, subtle expressions matching speech tone, gentle eye movement, realistic lip sync.";
    const lipsyncRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "infinitalk/from-audio",
        input: {
          image_url: kieImageUrl,
          audio_url: kieAudioUrl,
          prompt: lipsyncPrompt,
          resolution: "720p",
        },
      }),
    });
    const lipsyncData = await lipsyncRes.json();
    if (lipsyncData.code !== 200) throw new Error(`Lip-sync task failed: ${lipsyncData.msg}`);
    const lipsyncTaskId = lipsyncData.data.taskId;
    console.log(`[KICKOFF] Lip-sync task started: ${lipsyncTaskId}`);

    // Save lip-sync task ID for polling
    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        _tasks: { lipsync_task_id: lipsyncTaskId, condensed_script: condensedScript },
        _progress: { step: "generating_lipsync", detail: "Sincronizando labios + audio (~2-4 min)…", updated_at: new Date().toISOString() },
        _job_id: job?.id, _image_url: baseImageUrl, _user_id: userId, _asset_id: assetId, _script: scriptText, _tts_audio_url: ttsAudioUrl,
      },
    }).eq("id", render_id);

    return json({ started: true, lipsync_task_id: lipsyncTaskId, condensed_script: condensedScript });
  } catch (err: any) {
    console.error("[ERROR]", err.message);
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body.render_id) {
        const sa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await sa.from("renders").update({
          status: "FAILED",
          cost_breakdown_json: { _progress: { step: "failed", detail: err.message } },
        }).eq("id", body.render_id);
      }
    } catch (_) {}
    return json({ error: err.message }, 500);
  }
});
