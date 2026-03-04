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

interface I2VModel {
  id: string;
  label: string;
  buildInput: (kieImageUrl: string, prompt: string) => Record<string, unknown>;
}

const I2V_MODELS: I2VModel[] = [
  {
    id: "sora-2-pro-image-to-video",
    label: "Sora 2 Pro",
    buildInput: (kieImageUrl, prompt) => ({
      image_urls: [kieImageUrl],
      prompt,
      aspect_ratio: "portrait",
      n_frames: "15",
      size: "high",
      remove_watermark: true,
      character_id_list: [],
    }),
  },
  {
    id: "sora-2-image-to-video",
    label: "Sora 2",
    buildInput: (kieImageUrl, prompt) => ({
      image_urls: [kieImageUrl],
      prompt,
      aspect_ratio: "portrait",
      n_frames: "15",
      remove_watermark: true,
      character_id_list: [],
    }),
  },
  {
    id: "kling/v2-1-master-image-to-video",
    label: "Kling V2.1 Master",
    buildInput: (kieImageUrl, prompt) => ({
      image_url: kieImageUrl,
      prompt,
      negative_prompt: "blurry, distorted, low quality, watermark, text overlay, extra limbs, artifacts",
      cfg_scale: 0.5,
      duration: "10",
    }),
  },
  {
    id: "wan-2.6-image-to-video",
    label: "Wan 2.6",
    buildInput: (kieImageUrl, prompt) => ({
      image_url: kieImageUrl,
      prompt,
      ratio: "9:16",
    }),
  },
  {
    id: "bytedance-v1-pro-fast-image-to-video",
    label: "Bytedance Fast",
    buildInput: (kieImageUrl, prompt) => ({
      image_url: kieImageUrl,
      prompt,
      aspect_ratio: "9:16",
    }),
  },
];

async function tryCreateI2VTask(
  models: I2VModel[],
  kieImageUrl: string,
  prompt: string,
  nFrames: string,
  apiKey: string,
): Promise<{ taskId: string; modelUsed: string }> {
  for (const model of models) {
    console.log(`[SORA] Trying model: ${model.label} (${model.id})`);
    try {
      const input = model.buildInput(kieImageUrl, prompt);
      // Override n_frames
      (input as any).n_frames = nFrames;

      const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: model.id, input }),
      });
      const data = await res.json();
      if (data.code === 200 && data.data?.taskId) {
        console.log(`[SORA] ✅ ${model.label} succeeded: ${data.data.taskId}`);
        return { taskId: data.data.taskId, modelUsed: model.label };
      }
      console.warn(`[SORA] ❌ ${model.label} failed: ${data.msg || JSON.stringify(data)}`);
    } catch (err: any) {
      console.warn(`[SORA] ❌ ${model.label} exception: ${err.message}`);
    }
  }
  throw new Error("All I2V models failed. Tried: " + models.map(m => m.label).join(", "));
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

    const { asset_id, variant_id, n_frames = "15" } = await req.json();
    if (!asset_id || !variant_id) return json({ error: "asset_id and variant_id required" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: asset, error: assetErr } = await supabase.from("assets").select("*").eq("id", asset_id).single();
    if (assetErr || !asset) return json({ error: "Asset not found" }, 404);
    if (asset.user_id !== user.id) return json({ error: "Unauthorized" }, 403);

    const variants = (asset.variants_json as any[]) || [];
    const variant = variants.find((v: any) => v.variant_id === variant_id);
    if (!variant) return json({ error: `Variant ${variant_id} not found` }, 404);
    if (!variant.base_image_approved) return json({ error: "Image must be approved before animating" }, 400);
    if (!variant.base_image_url) return json({ error: "No base image URL" }, 400);

    const videoMotionPrompt = variant.video_motion_prompt;
    if (!videoMotionPrompt) return json({ error: "No video_motion_prompt in variant" }, 400);

    // Idempotency
    const idempotencyKey = `animate_sora:${asset_id}:${variant_id}:${n_frames}`;
    const { data: existingJob } = await supabase
      .from("jobs").select("*").eq("idempotency_key", idempotencyKey).eq("status", "DONE").maybeSingle();
    if (existingJob && variant.final_video_url) {
      return json({ video_url: variant.final_video_url, cached: true });
    }

    // Create job
    const { data: job } = await supabase.from("jobs").insert({
      asset_id, variant_id, type: "animate_sora", status: "RUNNING",
      idempotency_key: `${idempotencyKey}:${Date.now()}`, attempts: 1,
    }).select().single();

    // Update asset status
    await supabase.from("assets").update({ status: "RENDERING" }).eq("id", asset_id);

    // Upload base image to KIE
    console.log("[SORA] Uploading base image to KIE...");
    const uploadRes = await fetch(KIE_FILE_UPLOAD, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl: variant.base_image_url, uploadPath: `base_${asset_id}_${variant_id}.jpg` }),
    });
    const uploadData = await uploadRes.json();
    const kieImageUrl = uploadData?.data?.downloadUrl || uploadData?.data?.url;
    if (!kieImageUrl) throw new Error(`Image upload to KIE failed: ${JSON.stringify(uploadData)}`);

    console.log("[SORA] Base image uploaded to KIE:", kieImageUrl);

    // Create I2V task with fallback
    const { taskId, modelUsed } = await tryCreateI2VTask(I2V_MODELS, kieImageUrl, videoMotionPrompt, n_frames, KIE_API_KEY);

    // Save task info to job
    await supabase.from("jobs").update({
      provider_job_id: taskId,
      cost_json: {
        _tasks: { kie_task_id: taskId, model_used: modelUsed, model_id: modelUsed, n_frames, kie_image_url: kieImageUrl, video_prompt: videoMotionPrompt },
        _user_id: user.id,
        _asset_id: asset_id,
        _variant_id: variant_id,
        _started_at: new Date().toISOString(),
        _failed_models: [],
      },
    }).eq("id", job!.id);

    console.log(`[SORA] Task started: ${taskId} with ${modelUsed}`);
    return json({ started: true, task_id: taskId, model_used: modelUsed, job_id: job!.id });
  } catch (err: any) {
    console.error("[SORA ERROR]", err.message);
    return json({ error: err.message }, 500);
  }
});
