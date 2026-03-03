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

const VOICE_MAP: Record<string, string> = {
  v1: "Sarah",
  v2: "George",
  v3: "Lily",
};

async function pollTask(taskId: string, apiKey: string, maxAttempts = 60, intervalMs = 8000): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const result = await res.json();
    if (result.code !== 200) throw new Error(`Poll error: ${result.msg || result.message}`);
    const state = result.data?.state;
    console.log(`[poll ${i + 1}/${maxAttempts}] taskId=${taskId} state=${state}`);
    if (state === "success") {
      const resultJson = typeof result.data.resultJson === "string" ? JSON.parse(result.data.resultJson) : result.data.resultJson;
      return resultJson;
    }
    if (state === "fail") throw new Error(`Task failed: ${result.data.failMsg || "Unknown error"}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Task timed out after maximum polling attempts");
}

async function getDownloadUrl(fileUrl: string, apiKey: string): Promise<string> {
  const res = await fetch(`${KIE_BASE}/common/download-url`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: fileUrl }),
  });
  const result = await res.json();
  if (result.code !== 200) throw new Error(`Download URL error: ${result.msg}`);
  return result.data;
}

// Helper to update progress on the render record so frontend can poll it
async function updateProgress(supabaseAdmin: any, renderId: string, step: string, detail?: string) {
  await supabaseAdmin.from("renders").update({
    cost_breakdown_json: { _progress: { step, detail, updated_at: new Date().toISOString() } },
  }).eq("id", renderId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const KIE_API_KEY = Deno.env.get("KIE_AI_API_KEY");
    if (!KIE_API_KEY) throw new Error("KIE_AI_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsErr } = await supabaseUser.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const { render_id } = await req.json();
    if (!render_id) return json({ error: "render_id is required" }, 400);

    const { data: render, error: renderErr } = await supabaseAdmin.from("renders").select("*, assets!inner(id, user_id, status, transcript)").eq("id", render_id).single();
    if (renderErr || !render) return json({ error: "Render not found" }, 404);
    if ((render as any).assets.user_id !== userId) return json({ error: "Unauthorized" }, 403);
    if (render.status !== "IMAGE_APPROVED") return json({ error: `Render must be IMAGE_APPROVED, got ${render.status}` }, 409);

    const { data: blueprint } = await supabaseAdmin.from("blueprints").select("variations_json").eq("asset_id", render.asset_id).single();
    const variations = blueprint?.variations_json as any[];
    const variation = variations?.find((v: any) => v.nivel === render.variation_level);
    const script = variation?.guion || (render as any).assets.transcript || "";
    if (!script) return json({ error: "No script found" }, 400);

    await supabaseAdmin.from("renders").update({ status: "RENDERING" }).eq("id", render_id);
    await updateProgress(supabaseAdmin, render_id, "tts_starting", "Generando audio con IA…");

    const idempotencyKey = `final_video:${render_id}`;
    const { data: existingJob } = await supabaseAdmin.from("jobs").select("*").eq("idempotency_key", idempotencyKey).eq("status", "DONE").maybeSingle();
    if (existingJob) return json({ message: "Already completed", job: existingJob });

    const { data: job } = await supabaseAdmin.from("jobs").upsert({ asset_id: render.asset_id, render_id, type: "video" as any, status: "RUNNING" as any, idempotency_key: idempotencyKey, attempts: 1 }, { onConflict: "idempotency_key" }).select().single();

    const costBreakdown: Record<string, any> = {};

    // STEP 1: TTS
    console.log("[TTS] Starting...");
    const voiceName = VOICE_MAP[render.voice_id || "v1"] || "Sarah";
    const ttsRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "elevenlabs/text-to-speech-turbo-2-5", input: { text: script, voice: voiceName, stability: 0.5, similarity_boost: 0.75, speed: 1, language_code: "es" } }),
    });
    const ttsData = await ttsRes.json();
    if (ttsData.code !== 200) throw new Error(`TTS creation failed: ${ttsData.msg}`);
    const ttsTaskId = ttsData.data.taskId;
    console.log(`[TTS] Task: ${ttsTaskId}`);

    await updateProgress(supabaseAdmin, render_id, "tts_processing", "Procesando voz…");
    const ttsResult = await pollTask(ttsTaskId, KIE_API_KEY, 30, 5000);
    const ttsFileUrl = ttsResult.resultUrls?.[0];
    if (!ttsFileUrl) throw new Error("TTS returned no audio URL");
    console.log(`[TTS] Done`);
    costBreakdown.tts = { provider: "elevenlabs", estimated_usd: 0.03 };

    await updateProgress(supabaseAdmin, render_id, "tts_done", "Audio generado ✓");

    // STEP 2: Image-to-Video
    console.log("[VIDEO] Starting...");
    await updateProgress(supabaseAdmin, render_id, "video_starting", "Iniciando generación de video…");

    const imageUrl = render.base_image_url;
    if (!imageUrl) throw new Error("No base image URL");
    const motionPrompt = `A person naturally speaking and gesturing while presenting a product. ${render.scenario_prompt || "Clean, well-lit setting."}. Smooth, natural movement. 9:16 vertical video.`;

    const videoRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "kling/v2-1-master-image-to-video", input: { prompt: motionPrompt, image_url: imageUrl, duration: "5", negative_prompt: "blur, distort, low quality, watermark", cfg_scale: 0.5 } }),
    });
    const videoData = await videoRes.json();
    if (videoData.code !== 200) throw new Error(`Video creation failed: ${videoData.msg}`);
    const videoTaskId = videoData.data.taskId;
    console.log(`[VIDEO] Task: ${videoTaskId}`);

    await updateProgress(supabaseAdmin, render_id, "video_generating", "Video generándose (~3 min)…");
    const videoResult = await pollTask(videoTaskId, KIE_API_KEY, 60, 8000);
    const videoFileUrl = videoResult.resultUrls?.[0];
    if (!videoFileUrl) throw new Error("Video returned no URL");
    console.log(`[VIDEO] Done`);
    costBreakdown.video = { provider: "kling", model: "v2-1-master", estimated_usd: 0.80 };

    await updateProgress(supabaseAdmin, render_id, "uploading", "Subiendo archivos…");

    // STEP 3: Download + upload to storage
    console.log("[STORAGE] Uploading...");
    const ttsDownloadUrl = await getDownloadUrl(ttsFileUrl, KIE_API_KEY);
    const videoDownloadUrl = await getDownloadUrl(videoFileUrl, KIE_API_KEY);

    const audioBuffer = await (await fetch(ttsDownloadUrl)).arrayBuffer();
    const audioPath = `${userId}/${render.asset_id}/renders/${render_id}/audio.mp3`;
    await supabaseAdmin.storage.from("ugc-assets").upload(audioPath, audioBuffer, { contentType: "audio/mpeg", upsert: true });

    const videoBuffer = await (await fetch(videoDownloadUrl)).arrayBuffer();
    const videoPath = `${userId}/${render.asset_id}/renders/${render_id}/video.mp4`;
    await supabaseAdmin.storage.from("ugc-assets").upload(videoPath, videoBuffer, { contentType: "video/mp4", upsert: true });

    const { data: videoSigned } = await supabaseAdmin.storage.from("ugc-assets").createSignedUrl(videoPath, 60 * 60 * 24 * 7);
    const { data: audioSigned } = await supabaseAdmin.storage.from("ugc-assets").createSignedUrl(audioPath, 60 * 60 * 24 * 7);

    const totalCost = 0.83;

    await supabaseAdmin.from("renders").update({
      status: "DONE",
      final_video_url: videoSigned?.signedUrl || videoFileUrl,
      render_cost: totalCost,
      cost_breakdown_json: { ...costBreakdown, audio_url: audioSigned?.signedUrl || ttsFileUrl, total_usd: totalCost },
    }).eq("id", render_id);

    await supabaseAdmin.from("assets").update({ status: "VIDEO_RENDERED" }).eq("id", render.asset_id);
    await supabaseAdmin.from("jobs").update({ status: "DONE", cost_json: costBreakdown, provider_job_id: `tts:${ttsTaskId},video:${videoTaskId}` }).eq("id", job?.id);

    console.log("[DONE] Pipeline complete!");
    return json({ success: true, video_url: videoSigned?.signedUrl, audio_url: audioSigned?.signedUrl, cost: totalCost });
  } catch (err: any) {
    console.error("[ERROR]", err.message);
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body.render_id) {
        const sa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await sa.from("renders").update({ status: "FAILED", cost_breakdown_json: { _progress: { step: "failed", detail: err.message } } }).eq("id", body.render_id);
      }
    } catch (_) {}
    return json({ error: err.message }, 500);
  }
});
