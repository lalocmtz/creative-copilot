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

const KIE_BASE = "https://api.kie.ai/api/v1";
const KIE_FILE_UPLOAD = "https://kieai.redpandaai.co/api/file-url-upload";
const TIMEOUT_MS = 8 * 60 * 1000; // 8 minutes

// ═══ ERROR CLASSIFICATION ═══
const TRANSIENT_MESSAGES = ["heavy load", "not responding", "try again later", "temporarily unavailable", "rate limit"];

function isTransientFailure(msg: string): boolean {
  const lower = (msg || "").toLowerCase();
  return TRANSIENT_MESSAGES.some(t => lower.includes(t));
}

// ═══ BACKOFF ═══
const BACKOFF_DELAYS = [10, 25, 60, 120, 240];
function getNextRetryAt(retryCount: number): string {
  const idx = Math.min(retryCount, BACKOFF_DELAYS.length - 1);
  const base = BACKOFF_DELAYS[idx];
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return new Date(Date.now() + (base + jitter) * 1000).toISOString();
}

// ═══ MODEL CONFIGS (same as animate-sora) ═══
const ALL_MODELS = [
  "sora-2-pro-image-to-video", "sora-2-image-to-video",
  "kling/v2-1-master-image-to-video", "wan-2.6-image-to-video",
  "bytedance-v1-pro-fast-image-to-video",
];

interface ModelConfig {
  id: string;
  buildInput: (url: string, prompt: string, nFrames: string) => Record<string, unknown>;
}

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  "sora-2-pro-image-to-video": {
    id: "sora-2-pro-image-to-video",
    buildInput: (url, prompt, nFrames) => ({
      image_urls: [url], prompt, aspect_ratio: "portrait", n_frames: nFrames,
      size: "high", remove_watermark: true, character_id_list: [],
    }),
  },
  "sora-2-image-to-video": {
    id: "sora-2-image-to-video",
    buildInput: (url, prompt, nFrames) => ({
      image_urls: [url], prompt, aspect_ratio: "portrait", n_frames: nFrames,
      remove_watermark: true, character_id_list: [],
    }),
  },
  "kling/v2-1-master-image-to-video": {
    id: "kling/v2-1-master-image-to-video",
    buildInput: (url, prompt) => ({
      image_url: url, prompt,
      negative_prompt: "blurry, distorted, low quality, watermark, text overlay, extra limbs, artifacts",
      cfg_scale: 0.5, duration: "10",
    }),
  },
  "wan-2.6-image-to-video": {
    id: "wan-2.6-image-to-video",
    buildInput: (url, prompt) => ({ image_url: url, prompt, ratio: "9:16" }),
  },
  "bytedance-v1-pro-fast-image-to-video": {
    id: "bytedance-v1-pro-fast-image-to-video",
    buildInput: (url, prompt) => ({ image_url: url, prompt, aspect_ratio: "9:16" }),
  },
};

async function checkTask(taskId: string, apiKey: string) {
  const res = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const result = await res.json();
  if (result.code !== 200) throw new Error(`Poll error: ${result.msg || result.message}`);
  const state = result.data?.state;
  let resultJson = null;
  if (state === "success") {
    resultJson = typeof result.data.resultJson === "string" ? JSON.parse(result.data.resultJson) : result.data.resultJson;
  }
  return { state, resultJson, failMsg: result.data?.failMsg };
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

// ═══ RETRY: create new task with next model ═══
async function retryWithNextModel(
  failedModels: string[], kieImageUrl: string, prompt: string, nFrames: string, apiKey: string, callbackUrl: string,
): Promise<{ taskId: string; modelUsed: string } | null> {
  const remaining = ALL_MODELS.filter(m => !failedModels.includes(m));
  for (const modelId of remaining) {
    const config = MODEL_CONFIGS[modelId];
    if (!config) continue;
    console.log(`[CONTINGENCY] Trying: ${modelId}`);
    try {
      const input = config.buildInput(kieImageUrl, prompt, nFrames);
      const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.id, input, callBackUrl: callbackUrl }),
      });
      const data = await res.json();
      if (data.code === 200 && data.data?.taskId) {
        console.log(`[CONTINGENCY] ✅ ${modelId}: ${data.data.taskId}`);
        return { taskId: data.data.taskId, modelUsed: modelId };
      }
      console.warn(`[CONTINGENCY] ❌ ${modelId}: ${data.msg || JSON.stringify(data)}`);
      failedModels.push(modelId);
    } catch (err: any) {
      console.warn(`[CONTINGENCY] ❌ ${modelId}: ${err.message}`);
      failedModels.push(modelId);
    }
  }
  return null;
}

// ═══ FINALIZE: download video and update DB ═══
async function finalizeVideo(
  supabase: any, taskStatus: any, job: any, costJson: any, apiKey: string,
): Promise<{ videoUrl: string; modelUsed: string }> {
  const videoFileUrl = taskStatus.resultJson?.resultUrls?.[0] || taskStatus.resultJson?.url;
  if (!videoFileUrl) throw new Error("Provider returned no video URL");

  const videoDownloadUrl = await getDownloadUrl(videoFileUrl, apiKey);
  const videoBuffer = await (await fetch(videoDownloadUrl)).arrayBuffer();

  const userId = costJson._user_id;
  const assetId = costJson._asset_id || job.asset_id;
  const variantId = costJson._variant_id || job.variant_id;
  const videoPath = `${userId}/${assetId}/variant-${variantId}-final.mp4`;

  await supabase.storage.from("ugc-assets").upload(videoPath, videoBuffer, { contentType: "video/mp4", upsert: true });
  const { data: videoSigned } = await supabase.storage.from("ugc-assets").createSignedUrl(videoPath, 60 * 60 * 24 * 7);
  const finalVideoUrl = videoSigned?.signedUrl || videoFileUrl;

  // Update variants_json
  const { data: asset } = await supabase.from("assets").select("variants_json").eq("id", assetId).single();
  const variants = (asset?.variants_json as any[]) || [];
  const idx = variants.findIndex((v: any) => v.variant_id === variantId);
  if (idx !== -1) variants[idx] = { ...variants[idx], final_video_url: finalVideoUrl };

  const allDone = variants.every((v: any) => !v.base_image_approved || v.final_video_url);
  await supabase.from("assets").update({ variants_json: variants, status: allDone ? "DONE" : "RENDERING" }).eq("id", assetId);

  const modelUsed = costJson?._tasks?.model_used || "unknown";
  await supabase.from("jobs").update({
    status: "DONE", cost_json: { ...costJson, total_usd: 0.08, final_model: modelUsed },
  }).eq("id", job.id);

  // Deduct credit (if not using reservation system)
  const reservationId = costJson?._reservation_id;
  if (!reservationId) {
    // Legacy: direct deduction
    const { data: creditData } = await supabase.from("user_credits").select("used_credits").eq("user_id", userId).single();
    if (creditData) {
      await supabase.from("user_credits").update({ used_credits: creditData.used_credits + 1 }).eq("user_id", userId);
      await supabase.from("credit_transactions").insert({ user_id: userId, type: "USAGE", credits_delta: -1 });
    }
  } else {
    // New: deduct from reservation
    const { data: creditData } = await supabase.from("user_credits").select("used_credits").eq("user_id", userId).single();
    if (creditData) {
      await supabase.from("user_credits").update({ used_credits: creditData.used_credits + 1 }).eq("user_id", userId);
      await supabase.from("credit_transactions").insert({ user_id: userId, type: "USAGE", credits_delta: -1 });
    }
  }

  // Update circuit breaker: success
  await supabase.from("provider_status").upsert({ provider: "kie", status: "OK", failure_count: 0, updated_at: new Date().toISOString() });

  return { videoUrl: finalVideoUrl, modelUsed };
}

// ═══ HANDLE RETRY_SCHEDULED JOBS ═══
async function handleRetryScheduled(
  supabase: any, job: any, apiKey: string, callbackUrl: string,
): Promise<Response> {
  const costJson = job.cost_json as any;
  const nextRetryAt = costJson?._next_retry_at;
  
  if (nextRetryAt && new Date(nextRetryAt) > new Date()) {
    const remaining = Math.ceil((new Date(nextRetryAt).getTime() - Date.now()) / 1000);
    return json({
      status: "QUEUED",
      detail: `Reintento en ${remaining}s. El render se ejecutará automáticamente.`,
      retry_in: remaining,
    });
  }

  // Time to retry
  const retryCount = (costJson?._retry_count || 0);
  const maxRetries = costJson?._max_retries || 5;
  const kieImageUrl = costJson?._kie_image_url;
  const videoPrompt = costJson?._video_prompt;
  const nFrames = costJson?._n_frames || "10";
  const failedModels: string[] = costJson?._failed_models || [];
  const reservationId = costJson?._reservation_id;

  if (!kieImageUrl || !videoPrompt) {
    // Can't retry without essential data
    if (reservationId) await supabase.from("credit_reservations").update({ status: "RELEASED", updated_at: new Date().toISOString() }).eq("id", reservationId);
    await supabase.from("jobs").update({ status: "FAILED_FATAL", error_message: "Missing retry data" }).eq("id", job.id);
    return json({ status: "FAILED", detail: "Error: datos de reintento no disponibles." });
  }

  console.log(`[RETRY] Attempt ${retryCount + 1}/${maxRetries} for job ${job.id}`);

  const result = await retryWithNextModel(failedModels, kieImageUrl, videoPrompt, nFrames, apiKey, callbackUrl);

  if (result) {
    // SUCCESS — task accepted
    await supabase.from("jobs").update({
      status: "RUNNING", provider_job_id: result.taskId, error_message: null,
      cost_json: {
        ...costJson,
        _tasks: { kie_task_id: result.taskId, model_used: result.modelUsed, model_id: result.modelUsed, n_frames: nFrames, kie_image_url: kieImageUrl, video_prompt: videoPrompt },
        _started_at: new Date().toISOString(), _failed_models: failedModels,
      },
    }).eq("id", job.id);

    // Record success for circuit breaker
    await supabase.from("provider_status").upsert({ provider: "kie", status: "OK", failure_count: 0, updated_at: new Date().toISOString() });

    return json({ status: "RENDERING", detail: `Reintento exitoso con ${result.modelUsed}`, contingency: true });
  }

  // All models failed again
  const newRetryCount = retryCount + 1;
  if (newRetryCount >= maxRetries) {
    // Exhausted retries
    if (reservationId) await supabase.from("credit_reservations").update({ status: "RELEASED", updated_at: new Date().toISOString() }).eq("id", reservationId);
    await supabase.from("jobs").update({ status: "FAILED_PROVIDER", error_message: `Agotados ${maxRetries} reintentos` }).eq("id", job.id);

    // Update provider status
    await supabase.from("provider_status").upsert({
      provider: "kie", status: "DEGRADED", failure_count: 3,
      degraded_until: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      last_failure_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });

    return json({ status: "FAILED", detail: "Proveedor no disponible después de múltiples reintentos. No se consumieron créditos." });
  }

  // Schedule next retry
  const nextAt = getNextRetryAt(newRetryCount);
  await supabase.from("jobs").update({
    status: "RETRY_SCHEDULED",
    cost_json: { ...costJson, _retry_count: newRetryCount, _next_retry_at: nextAt, _failed_models: failedModels },
  }).eq("id", job.id);

  console.log(`[RETRY] Scheduled attempt ${newRetryCount + 1}/${maxRetries} at ${nextAt}`);
  return json({
    status: "QUEUED",
    detail: `Reintento ${newRetryCount}/${maxRetries}. Próximo intento automático en breve.`,
    retry_count: newRetryCount,
  });
}

// ═══ HANDLE DELAYED_PROVIDER_DEGRADED JOBS ═══
async function handleDelayedJob(
  supabase: any, job: any, apiKey: string, callbackUrl: string,
): Promise<Response> {
  // Check if provider has recovered
  const { data: provider } = await supabase.from("provider_status").select("*").eq("provider", "kie").single();
  if (provider?.status === "DEGRADED" && provider.degraded_until && new Date(provider.degraded_until) > new Date()) {
    const remaining = Math.ceil((new Date(provider.degraded_until).getTime() - Date.now()) / 1000);
    return json({
      status: "QUEUED",
      detail: `Proveedor saturado. Recuperación estimada en ${Math.ceil(remaining / 60)} min. No se cobrarán créditos.`,
    });
  }

  // Provider recovered — attempt the render
  const costJson = job.cost_json as any;
  const nFrames = costJson?._n_frames || "10";
  const userId = costJson?._user_id;

  // Need to set up the full flow: reserve credit, upload image, try models
  // For simplicity, update job to RETRY_SCHEDULED and let the retry handler take over
  await supabase.from("jobs").update({
    status: "RETRY_SCHEDULED",
    cost_json: {
      ...costJson, _retry_count: 0, _next_retry_at: new Date().toISOString(),
      _max_retries: 5, _failed_models: [],
    },
  }).eq("id", job.id);

  return json({ status: "QUEUED", detail: "Proveedor recuperado. Iniciando render..." });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const KIE_API_KEY = Deno.env.get("KIE_AI_API_KEY");
    if (!KIE_API_KEY) throw new Error("KIE_AI_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callbackUrl = `${supabaseUrl}/functions/v1/kie-callback`;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { asset_id, variant_id } = await req.json();
    if (!asset_id || !variant_id) return json({ error: "asset_id and variant_id required" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    // Find the latest job for this variant
    const { data: job } = await supabase
      .from("jobs").select("*")
      .eq("asset_id", asset_id).eq("variant_id", variant_id).eq("type", "animate_sora")
      .in("status", ["RUNNING", "RETRY_SCHEDULED", "DELAYED_PROVIDER_DEGRADED"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (!job) return json({ status: "NO_JOB", detail: "No hay animación en progreso." });

    // ═══ ROUTE BY JOB STATUS ═══
    if (job.status === "RETRY_SCHEDULED") {
      return handleRetryScheduled(supabase, job, KIE_API_KEY, callbackUrl);
    }

    if (job.status === "DELAYED_PROVIDER_DEGRADED") {
      return handleDelayedJob(supabase, job, KIE_API_KEY, callbackUrl);
    }

    // ═══ RUNNING — check KIE task ═══
    const costJson = job.cost_json as any;
    const taskId = costJson?._tasks?.kie_task_id || job.provider_job_id;
    if (!taskId) return json({ status: "QUEUED", detail: "Task pendiente…" });

    // Timeout check
    const startedAt = costJson?._started_at;
    if (startedAt) {
      const elapsed = Date.now() - new Date(startedAt).getTime();
      if (elapsed > TIMEOUT_MS) {
        // Timeout → try contingency
        console.log("[POLL] Timeout reached, trying contingency...");
        const failedModels: string[] = costJson?._failed_models || [];
        const currentModel = costJson?._tasks?.model_used || costJson?._tasks?.model_id || "";
        if (currentModel) failedModels.push(currentModel);

        const kieImageUrl = costJson?._tasks?.kie_image_url;
        const videoPrompt = costJson?._tasks?.video_prompt;
        const nFrames = costJson?._tasks?.n_frames || "10";

        if (kieImageUrl && videoPrompt) {
          const retry = await retryWithNextModel(failedModels, kieImageUrl, videoPrompt, nFrames, KIE_API_KEY, callbackUrl);
          if (retry) {
            await supabase.from("jobs").update({
              provider_job_id: retry.taskId,
              cost_json: {
                ...costJson,
                _tasks: { ...costJson._tasks, kie_task_id: retry.taskId, model_used: retry.modelUsed },
                _failed_models: failedModels, _started_at: new Date().toISOString(),
              },
            }).eq("id", job.id);
            return json({ status: "RENDERING", detail: `Timeout → contingencia: ${retry.modelUsed}`, contingency: true });
          }
        }

        // All models exhausted
        const reservationId = costJson?._reservation_id;
        if (reservationId) await supabase.from("credit_reservations").update({ status: "RELEASED", updated_at: new Date().toISOString() }).eq("id", reservationId);
        await supabase.from("jobs").update({ status: "FAILED_PROVIDER", error_message: "Timeout + all models exhausted" }).eq("id", job.id);
        return json({ status: "FAILED", detail: "Timeout: todos los modelos agotados. No se consumieron créditos." });
      }
    }

    // Check KIE task
    console.log(`[POLL] Checking task: ${taskId}`);
    const taskStatus = await checkTask(taskId, KIE_API_KEY);

    // ═══ TASK FAILED — contingency ═══
    if (taskStatus.state === "fail") {
      const failMsg = taskStatus.failMsg || "";
      console.log(`[POLL] Task failed: ${failMsg}`);

      if (isTransientFailure(failMsg)) {
        // Transient failure during rendering — try next model
        const failedModels: string[] = [...(costJson?._failed_models || [])];
        const currentModel = costJson?._tasks?.model_used || costJson?._tasks?.model_id || "";
        if (currentModel && !failedModels.includes(currentModel)) failedModels.push(currentModel);

        const kieImageUrl = costJson?._tasks?.kie_image_url;
        const videoPrompt = costJson?._tasks?.video_prompt;
        const nFrames = costJson?._tasks?.n_frames || "10";

        if (kieImageUrl && videoPrompt) {
          const retry = await retryWithNextModel(failedModels, kieImageUrl, videoPrompt, nFrames, KIE_API_KEY, callbackUrl);
          if (retry) {
            await supabase.from("jobs").update({
              provider_job_id: retry.taskId,
              cost_json: {
                ...costJson,
                _tasks: { ...costJson._tasks, kie_task_id: retry.taskId, model_used: retry.modelUsed },
                _failed_models: failedModels, _started_at: new Date().toISOString(),
              },
            }).eq("id", job.id);
            return json({ status: "RENDERING", detail: `Contingencia activada: ${retry.modelUsed}`, contingency: true });
          }
        }
      }

      // Non-transient or all models exhausted
      const reservationId = costJson?._reservation_id;
      if (reservationId) await supabase.from("credit_reservations").update({ status: "RELEASED", updated_at: new Date().toISOString() }).eq("id", reservationId);
      await supabase.from("jobs").update({ status: "FAILED_PROVIDER", error_message: failMsg }).eq("id", job.id);
      return json({ status: "FAILED", detail: `Error del proveedor: ${failMsg}. No se consumieron créditos.` });
    }

    if (taskStatus.state !== "success") {
      const modelLabel = costJson?._tasks?.model_used || "Sora2";
      return json({ status: "RENDERING", detail: `Animando con ${modelLabel}…` });
    }

    // ═══ SUCCESS ═══
    console.log("[POLL] Task complete! Finalizing...");
    const { videoUrl, modelUsed } = await finalizeVideo(supabase, taskStatus, job, costJson, KIE_API_KEY);
    console.log(`[POLL] ✅ Pipeline complete! Model: ${modelUsed}`);
    return json({ status: "DONE", video_url: videoUrl, model_used: modelUsed });
  } catch (err: any) {
    console.error("[POLL ERROR]", err.message);
    return json({ error: err.message }, 500);
  }
});
