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
const TIMEOUT_MS = 5 * 60 * 1000;

// ═══ SAME FALLBACK CHAIN AS animate-sora ═══
const ALL_MODELS = [
  "sora-2-pro-image-to-video",
  "sora-2-image-to-video",
  "kling/v2-1-master-image-to-video",
  "wan-2.6-image-to-video",
  "bytedance-v1-pro-fast-image-to-video",
];

interface ModelConfig {
  id: string;
  buildInput: (kieImageUrl: string, prompt: string, nFrames: string) => Record<string, unknown>;
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
    buildInput: (url, prompt) => ({
      image_url: url, prompt, ratio: "9:16",
    }),
  },
  "bytedance-v1-pro-fast-image-to-video": {
    id: "bytedance-v1-pro-fast-image-to-video",
    buildInput: (url, prompt) => ({
      image_url: url, prompt, aspect_ratio: "9:16",
    }),
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

// ═══ CONTINGENCY: create a new task with next model ═══
async function retryWithNextModel(
  failedModelId: string,
  failedModels: string[],
  kieImageUrl: string,
  prompt: string,
  nFrames: string,
  apiKey: string,
): Promise<{ taskId: string; modelUsed: string } | null> {
  const allFailed = [...failedModels, failedModelId];
  const remaining = ALL_MODELS.filter(m => !allFailed.includes(m));

  for (const modelId of remaining) {
    const config = MODEL_CONFIGS[modelId];
    if (!config) continue;
    console.log(`[CONTINGENCY] Trying fallback: ${modelId}`);
    try {
      const input = config.buildInput(kieImageUrl, prompt, nFrames);
      const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.id, input }),
      });
      const data = await res.json();
      if (data.code === 200 && data.data?.taskId) {
        console.log(`[CONTINGENCY] ✅ ${modelId} accepted: ${data.data.taskId}`);
        return { taskId: data.data.taskId, modelUsed: modelId };
      }
      console.warn(`[CONTINGENCY] ❌ ${modelId} rejected: ${data.msg || JSON.stringify(data)}`);
      allFailed.push(modelId);
    } catch (err: any) {
      console.warn(`[CONTINGENCY] ❌ ${modelId} exception: ${err.message}`);
      allFailed.push(modelId);
    }
  }
  return null;
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

    const { asset_id, variant_id } = await req.json();
    if (!asset_id || !variant_id) return json({ error: "asset_id and variant_id required" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    // Find the animate_sora job for this variant
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("*")
      .eq("asset_id", asset_id)
      .eq("variant_id", variant_id)
      .eq("type", "animate_sora")
      .eq("status", "RUNNING")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!job) return json({ status: "NO_JOB", detail: "No running animation job found" });

    const costJson = job.cost_json as any;
    const taskId = costJson?._tasks?.kie_task_id || job.provider_job_id;
    if (!taskId) return json({ status: "PENDING", detail: "Task not started yet" });

    // Timeout check
    const startedAt = costJson?._started_at;
    if (startedAt) {
      const elapsed = Date.now() - new Date(startedAt).getTime();
      if (elapsed > TIMEOUT_MS) {
        await supabase.from("jobs").update({ status: "FAILED", error_message: "Timeout: > 5 minutes" }).eq("id", job.id);
        return json({ status: "FAILED", detail: "Timeout: la generación tardó más de 5 minutos." });
      }
    }

    // Check KIE task
    console.log(`[POLL] Checking task: ${taskId}`);
    const taskStatus = await checkTask(taskId, KIE_API_KEY);

    // ═══ CONTINGENCY PROTOCOL: on fail, try next model ═══
    if (taskStatus.state === "fail") {
      const currentModel = costJson?._tasks?.model_used || costJson?._tasks?.model_id || "sora-2-pro-image-to-video";
      const previouslyFailed: string[] = costJson?._failed_models || [];
      console.log(`[CONTINGENCY] Model ${currentModel} failed: ${taskStatus.failMsg}. Trying next...`);

      // We need the KIE image URL and prompt from the job
      const kieImageUrl = costJson?._tasks?.kie_image_url;
      const videoPrompt = costJson?._tasks?.video_prompt;
      const nFrames = costJson?._tasks?.n_frames || "15";

      if (kieImageUrl && videoPrompt) {
        const retry = await retryWithNextModel(currentModel, previouslyFailed, kieImageUrl, videoPrompt, nFrames, KIE_API_KEY);

        if (retry) {
          // Update job with new task info, keep it RUNNING
          await supabase.from("jobs").update({
            provider_job_id: retry.taskId,
            cost_json: {
              ...costJson,
              _tasks: { ...costJson._tasks, kie_task_id: retry.taskId, model_used: retry.modelUsed },
              _failed_models: [...previouslyFailed, currentModel],
              _started_at: new Date().toISOString(), // reset timeout
            },
          }).eq("id", job.id);

          return json({
            status: "RENDERING",
            detail: `Modelo ${currentModel} falló. Contingencia activada: ${retry.modelUsed}`,
            contingency: true,
            new_model: retry.modelUsed,
          });
        }
      }

      // All models exhausted
      await supabase.from("jobs").update({
        status: "FAILED",
        error_message: `All models failed. Last: ${currentModel}. ${taskStatus.failMsg || ""}`,
      }).eq("id", job.id);
      return json({ status: "FAILED", detail: "Todos los modelos fallaron. " + (taskStatus.failMsg || "") });
    }

    if (taskStatus.state !== "success") {
      const modelLabel = costJson?._tasks?.model_used || "Sora2";
      return json({ status: "RENDERING", detail: `Animando con ${modelLabel}…` });
    }

    // ═══ SUCCESS — download and save ═══
    console.log("[POLL] Task complete! Finalizing...");

    const videoFileUrl = taskStatus.resultJson?.resultUrls?.[0] || taskStatus.resultJson?.url;
    if (!videoFileUrl) throw new Error("Provider returned no video URL");

    const videoDownloadUrl = await getDownloadUrl(videoFileUrl, KIE_API_KEY);
    const videoBuffer = await (await fetch(videoDownloadUrl)).arrayBuffer();

    const userId = costJson._user_id || user.id;
    const videoPath = `${userId}/${asset_id}/variant-${variant_id}-final.mp4`;

    await supabase.storage.from("ugc-assets").upload(videoPath, videoBuffer, { contentType: "video/mp4", upsert: true });
    const { data: videoSigned } = await supabase.storage.from("ugc-assets").createSignedUrl(videoPath, 60 * 60 * 24 * 7);
    const finalVideoUrl = videoSigned?.signedUrl || videoFileUrl;

    // Update variants_json
    const { data: asset } = await supabase.from("assets").select("variants_json").eq("id", asset_id).single();
    const variants = (asset?.variants_json as any[]) || [];
    const variantIndex = variants.findIndex((v: any) => v.variant_id === variant_id);
    if (variantIndex !== -1) {
      variants[variantIndex] = { ...variants[variantIndex], final_video_url: finalVideoUrl };
    }

    const allDone = variants.every((v: any) => !v.base_image_approved || v.final_video_url);

    await supabase.from("assets").update({
      variants_json: variants,
      status: allDone ? "DONE" : "RENDERING",
    }).eq("id", asset_id);

    // Mark job done
    const modelUsed = costJson?._tasks?.model_used || "unknown";
    await supabase.from("jobs").update({
      status: "DONE",
      cost_json: { ...costJson, total_usd: 0.08, final_model: modelUsed },
    }).eq("id", job.id);

    // Deduct credit
    console.log("[POLL] Deducting 1 credit for user:", userId);
    const { data: creditData } = await supabase.from("user_credits").select("used_credits").eq("user_id", userId).single();
    if (creditData) {
      await supabase.from("user_credits").update({ used_credits: creditData.used_credits + 1 }).eq("user_id", userId);
      await supabase.from("credit_transactions").insert({
        user_id: userId, type: "USAGE", credits_delta: -1,
      });
    }

    console.log(`[POLL] Pipeline complete! Model: ${modelUsed}`);
    return json({ status: "DONE", video_url: finalVideoUrl, model_used: modelUsed });
  } catch (err: any) {
    console.error("[POLL ERROR]", err.message);
    return json({ error: err.message }, 500);
  }
});
