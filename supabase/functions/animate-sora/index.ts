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
const REQUEST_TIMEOUT_MS = 45_000;

// ═══ ERROR CLASSIFICATION ═══
const TRANSIENT_CODES = new Set([429, 455, 500, 501]);
const TRANSIENT_MESSAGES = ["heavy load", "not responding", "try again later", "temporarily unavailable", "rate limit"];
const FATAL_CODES = new Set([401, 402, 422]);

function classifyError(httpStatus: number | null, message: string): "TRANSIENT" | "FATAL" {
  if (httpStatus && FATAL_CODES.has(httpStatus)) return "FATAL";
  if (httpStatus && TRANSIENT_CODES.has(httpStatus)) return "TRANSIENT";
  const lower = message.toLowerCase();
  if (TRANSIENT_MESSAGES.some(t => lower.includes(t))) return "TRANSIENT";
  if (lower.includes("timeout") || lower.includes("econnreset") || lower.includes("aborted")) return "TRANSIENT";
  if (lower.includes("insufficient") && lower.includes("credit")) return "FATAL";
  if (lower.includes("auth") || lower.includes("unauthorized")) return "FATAL";
  if (lower.includes("validation") || lower.includes("invalid")) return "FATAL";
  return "TRANSIENT"; // default to transient for unknown errors
}

// ═══ BACKOFF SCHEDULE (seconds) ═══
const BACKOFF_DELAYS = [10, 25, 60, 120, 240];
const JITTER_FACTOR = 0.2;

function getNextRetryAt(retryCount: number): string {
  const idx = Math.min(retryCount, BACKOFF_DELAYS.length - 1);
  const baseDelay = BACKOFF_DELAYS[idx];
  const jitter = baseDelay * JITTER_FACTOR * (Math.random() * 2 - 1);
  const delayMs = (baseDelay + jitter) * 1000;
  return new Date(Date.now() + delayMs).toISOString();
}

// ═══ MODEL CONFIGS ═══
interface I2VModel {
  id: string;
  label: string;
  buildInput: (kieImageUrl: string, prompt: string, nFrames: string) => Record<string, unknown>;
}

const I2V_MODELS: I2VModel[] = [
  {
    id: "sora-2-pro-image-to-video",
    label: "Sora 2 Pro",
    buildInput: (url, prompt, nFrames) => ({
      image_urls: [url], prompt, aspect_ratio: "portrait", n_frames: nFrames,
      size: "high", remove_watermark: true, character_id_list: [],
    }),
  },
  {
    id: "sora-2-image-to-video",
    label: "Sora 2",
    buildInput: (url, prompt, nFrames) => ({
      image_urls: [url], prompt, aspect_ratio: "portrait", n_frames: nFrames,
      remove_watermark: true, character_id_list: [],
    }),
  },
  {
    id: "kling/v2-1-master-image-to-video",
    label: "Kling V2.1 Master",
    buildInput: (url, prompt) => ({
      image_url: url, prompt,
      negative_prompt: "blurry, distorted, low quality, watermark, text overlay, extra limbs, artifacts",
      cfg_scale: 0.5, duration: "10",
    }),
  },
  {
    id: "wan-2.6-image-to-video",
    label: "Wan 2.6",
    buildInput: (url, prompt) => ({
      image_url: url, prompt, ratio: "9:16",
    }),
  },
  {
    id: "bytedance-v1-pro-fast-image-to-video",
    label: "Bytedance Fast",
    buildInput: (url, prompt) => ({
      image_url: url, prompt, aspect_ratio: "9:16",
    }),
  },
];

// ═══ VALIDATE IMAGE URL IS ACCESSIBLE ═══
async function validateImageUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// ═══ CREATE TASK WITH TIMEOUT ═══
async function createTaskWithTimeout(
  model: I2VModel,
  kieImageUrl: string,
  prompt: string,
  nFrames: string,
  apiKey: string,
  callbackUrl: string,
): Promise<{ taskId: string; modelUsed: string; httpStatus: number | null; error: string | null }> {
  const input = model.buildInput(kieImageUrl, prompt, nFrames);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: model.id, input, callBackUrl: callbackUrl }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();

    if (data.code === 200 && data.data?.taskId) {
      return { taskId: data.data.taskId, modelUsed: model.label, httpStatus: null, error: null };
    }
    return { taskId: "", modelUsed: model.label, httpStatus: res.status, error: data.msg || data.message || JSON.stringify(data) };
  } catch (err: any) {
    clearTimeout(timeout);
    const isTimeout = err.name === "AbortError";
    return { taskId: "", modelUsed: model.label, httpStatus: null, error: isTimeout ? "Request timeout (45s)" : err.message };
  }
}

// ═══ TRY ALL MODELS (single pass, no inline backoff) ═══
async function tryAllModels(
  kieImageUrl: string,
  prompt: string,
  nFrames: string,
  apiKey: string,
  callbackUrl: string,
  skipModels: string[] = [],
): Promise<{ taskId: string; modelUsed: string; failedModels: string[]; lastError: string; lastErrorType: "TRANSIENT" | "FATAL" }> {
  const failed: string[] = [...skipModels];
  let lastError = "";
  let lastErrorType: "TRANSIENT" | "FATAL" = "TRANSIENT";

  for (const model of I2V_MODELS) {
    if (failed.includes(model.id)) continue;
    console.log(`[SORA] Trying: ${model.label} (${model.id})`);

    const result = await createTaskWithTimeout(model, kieImageUrl, prompt, nFrames, apiKey, callbackUrl);

    if (result.taskId) {
      console.log(`[SORA] ✅ ${model.label}: ${result.taskId}`);
      return { taskId: result.taskId, modelUsed: model.label, failedModels: failed, lastError: "", lastErrorType: "TRANSIENT" };
    }

    const errorType = classifyError(result.httpStatus, result.error || "");
    console.warn(`[SORA] ❌ ${model.label} [${errorType}]: ${result.error}`);
    failed.push(model.id);
    lastError = result.error || "Unknown error";
    lastErrorType = errorType;

    // If FATAL (like 402 credits), skip to next model but don't retry this one
    if (errorType === "FATAL") continue;
  }

  return { taskId: "", modelUsed: "", failedModels: failed, lastError, lastErrorType };
}

// ═══ CIRCUIT BREAKER HELPERS ═══
async function checkCircuitBreaker(supabase: any): Promise<{ isDegraded: boolean; degradedUntil: string | null }> {
  const { data } = await supabase.from("provider_status").select("*").eq("provider", "kie").single();
  if (!data) return { isDegraded: false, degradedUntil: null };
  if (data.status === "DEGRADED" && data.degraded_until && new Date(data.degraded_until) > new Date()) {
    return { isDegraded: true, degradedUntil: data.degraded_until };
  }
  // Auto-recover if degraded_until has passed
  if (data.status === "DEGRADED") {
    await supabase.from("provider_status").update({ status: "OK", failure_count: 0, updated_at: new Date().toISOString() }).eq("provider", "kie");
  }
  return { isDegraded: false, degradedUntil: null };
}

async function recordProviderFailure(supabase: any) {
  const { data } = await supabase.from("provider_status").select("*").eq("provider", "kie").single();
  const failureCount = (data?.failure_count || 0) + 1;
  const now = new Date();

  // Check if 3+ failures in last 5 minutes → DEGRADED for 10 minutes
  if (failureCount >= 3) {
    const degradedUntil = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    await supabase.from("provider_status").upsert({
      provider: "kie", status: "DEGRADED", failure_count: failureCount,
      last_failure_at: now.toISOString(), degraded_until: degradedUntil, updated_at: now.toISOString(),
    });
    console.log(`[CIRCUIT BREAKER] KIE marked DEGRADED until ${degradedUntil}`);
  } else {
    await supabase.from("provider_status").upsert({
      provider: "kie", status: "OK", failure_count: failureCount,
      last_failure_at: now.toISOString(), updated_at: now.toISOString(),
    });
  }
}

async function recordProviderSuccess(supabase: any) {
  await supabase.from("provider_status").upsert({
    provider: "kie", status: "OK", failure_count: 0, updated_at: new Date().toISOString(),
  });
}

// ═══ CREDIT RESERVATION ═══
async function reserveCredit(supabase: any, userId: string): Promise<{ reservationId: string | null; error: string | null }> {
  // Check balance
  const { data: credits } = await supabase.from("user_credits").select("total_credits, used_credits").eq("user_id", userId).single();
  if (!credits || (credits.total_credits - credits.used_credits) < 1) {
    return { reservationId: null, error: "No tienes créditos disponibles" };
  }
  const { data: reservation, error } = await supabase.from("credit_reservations").insert({
    user_id: userId, credits: 1, status: "RESERVED",
  }).select().single();
  if (error) return { reservationId: null, error: "Error reservando crédito" };
  return { reservationId: reservation.id, error: null };
}

async function captureCredit(supabase: any, reservationId: string, jobId: string) {
  await supabase.from("credit_reservations").update({ status: "CAPTURED", job_id: jobId, updated_at: new Date().toISOString() }).eq("id", reservationId);
}

async function releaseCredit(supabase: any, reservationId: string) {
  await supabase.from("credit_reservations").update({ status: "RELEASED", updated_at: new Date().toISOString() }).eq("id", reservationId);
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

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { asset_id, variant_id, n_frames = "10" } = await req.json();
    if (!asset_id || !variant_id) return json({ error: "asset_id and variant_id required" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    // ═══ 1. VALIDATE ASSET + VARIANT ═══
    const { data: asset, error: assetErr } = await supabase.from("assets").select("*").eq("id", asset_id).single();
    if (assetErr || !asset) return json({ error: "Asset not found" }, 404);
    if (asset.user_id !== user.id) return json({ error: "Unauthorized" }, 403);

    const variants = (asset.variants_json as any[]) || [];
    const variant = variants.find((v: any) => v.variant_id === variant_id);
    if (!variant) return json({ error: `Variant ${variant_id} not found` }, 404);
    if (!variant.base_image_approved) return json({ error: "Image must be approved before animating" }, 400);
    if (!variant.base_image_url) return json({ error: "No base image URL" }, 400);
    if (!variant.video_motion_prompt) return json({ error: "No video_motion_prompt in variant" }, 400);

    // ═══ 2. CHECK CIRCUIT BREAKER ═══
    const { isDegraded } = await checkCircuitBreaker(supabase);
    if (isDegraded) {
      console.log("[SORA] Provider DEGRADED — queueing job");
      const { data: job } = await supabase.from("jobs").insert({
        asset_id, variant_id, type: "animate_sora", status: "DELAYED_PROVIDER_DEGRADED",
        idempotency_key: `animate_sora:${asset_id}:${variant_id}:${Date.now()}`, attempts: 0,
        cost_json: { _user_id: user.id, _n_frames: n_frames, _queued_at: new Date().toISOString() },
      }).select().single();

      return json({
        status: "QUEUED",
        detail: "Proveedor saturado. Tu render quedó en cola y se reintentará automáticamente. No se cobrarán créditos hasta que el proveedor acepte el task.",
        job_id: job?.id,
      });
    }

    // ═══ 3. RESERVE CREDIT ═══
    const { reservationId, error: creditError } = await reserveCredit(supabase, user.id);
    if (!reservationId) return json({ error: creditError }, 402);

    // ═══ 4. VALIDATE IMAGE URL ═══
    console.log("[SORA] Validating image URL accessibility...");
    const imageAccessible = await validateImageUrl(variant.base_image_url);
    if (!imageAccessible) {
      await releaseCredit(supabase, reservationId);
      return json({ error: "La imagen base no es accesible. Regenera la imagen e inténtalo de nuevo." }, 422);
    }

    // ═══ 5. IDEMPOTENCY CHECK ═══
    const { data: existingJob } = await supabase
      .from("jobs").select("*").eq("asset_id", asset_id).eq("variant_id", variant_id)
      .eq("type", "animate_sora").in("status", ["RUNNING", "RETRY_SCHEDULED"]).maybeSingle();
    if (existingJob) {
      await releaseCredit(supabase, reservationId);
      return json({ status: "ALREADY_RUNNING", detail: "Ya hay una animación en progreso para esta variante.", job_id: existingJob.id });
    }

    // ═══ 6. UPLOAD IMAGE TO KIE ═══
    console.log("[SORA] Uploading base image to KIE...");
    const uploadRes = await fetch(KIE_FILE_UPLOAD, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl: variant.base_image_url, uploadPath: `base_${asset_id}_${variant_id}.jpg` }),
    });
    const uploadData = await uploadRes.json();
    const kieImageUrl = uploadData?.data?.downloadUrl || uploadData?.data?.url;
    if (!kieImageUrl) {
      await releaseCredit(supabase, reservationId);
      throw new Error(`Image upload to KIE failed: ${JSON.stringify(uploadData)}`);
    }
    console.log("[SORA] Image uploaded:", kieImageUrl);

    // ═══ 7. CREATE JOB ═══
    const { data: job } = await supabase.from("jobs").insert({
      asset_id, variant_id, type: "animate_sora", status: "RUNNING",
      idempotency_key: `animate_sora:${asset_id}:${variant_id}:${Date.now()}`, attempts: 1,
    }).select().single();

    await supabase.from("assets").update({ status: "RENDERING" }).eq("id", asset_id);

    // ═══ 8. TRY ALL MODELS ═══
    const callbackUrl = `${supabaseUrl}/functions/v1/kie-callback`;
    const result = await tryAllModels(kieImageUrl, variant.video_motion_prompt, n_frames, KIE_API_KEY, callbackUrl);

    if (result.taskId) {
      // ═══ SUCCESS — task accepted ═══
      await captureCredit(supabase, reservationId, job!.id);
      await recordProviderSuccess(supabase);

      await supabase.from("jobs").update({
        provider_job_id: result.taskId,
        cost_json: {
          _tasks: { kie_task_id: result.taskId, model_used: result.modelUsed, model_id: result.modelUsed, n_frames, kie_image_url: kieImageUrl, video_prompt: variant.video_motion_prompt },
          _user_id: user.id, _asset_id: asset_id, _variant_id: variant_id,
          _started_at: new Date().toISOString(), _failed_models: result.failedModels,
          _reservation_id: reservationId,
        },
      }).eq("id", job!.id);

      console.log(`[SORA] ✅ Task started: ${result.taskId} with ${result.modelUsed}`);
      return json({ started: true, task_id: result.taskId, model_used: result.modelUsed, job_id: job!.id });
    }

    // ═══ ALL MODELS FAILED — schedule retry or fail permanently ═══
    await recordProviderFailure(supabase);

    if (result.lastErrorType === "FATAL") {
      // FATAL error — no point retrying
      await releaseCredit(supabase, reservationId);
      await supabase.from("jobs").update({
        status: "FAILED_FATAL", error_message: `Fatal: ${result.lastError}`,
        cost_json: { _user_id: user.id, _failed_models: result.failedModels, _reservation_id: reservationId },
      }).eq("id", job!.id);
      console.log(`[SORA] ❌ FATAL error: ${result.lastError}`);
      return json({ status: "FAILED", detail: result.lastError, fatal: true });
    }

    // TRANSIENT — schedule retry
    const nextRetryAt = getNextRetryAt(0);
    await supabase.from("jobs").update({
      status: "RETRY_SCHEDULED", error_message: `Transient: ${result.lastError}`,
      cost_json: {
        _user_id: user.id, _n_frames: n_frames, _kie_image_url: kieImageUrl,
        _video_prompt: variant.video_motion_prompt, _failed_models: result.failedModels,
        _retry_count: 1, _next_retry_at: nextRetryAt, _max_retries: 5,
        _reservation_id: reservationId, _asset_id: asset_id, _variant_id: variant_id,
      },
    }).eq("id", job!.id);

    console.log(`[SORA] ⏳ RETRY_SCHEDULED (attempt 1/5), next at ${nextRetryAt}`);
    return json({
      status: "QUEUED",
      detail: "Proveedor saturado. Tu render quedó en cola y se reintentará automáticamente. No se cobrarán créditos hasta que el proveedor acepte el task.",
      job_id: job!.id,
    });
  } catch (err: any) {
    console.error("[SORA ERROR]", err.message);
    return json({ error: err.message }, 500);
  }
});
