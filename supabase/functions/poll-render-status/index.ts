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
const TIMEOUT_MS = 5 * 60 * 1000;

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

    if (taskStatus.state === "fail") {
      await supabase.from("jobs").update({ status: "FAILED", error_message: taskStatus.failMsg || "Sora failed" }).eq("id", job.id);
      return json({ status: "FAILED", detail: taskStatus.failMsg || "Animation failed" });
    }

    if (taskStatus.state !== "success") {
      return json({ status: "RENDERING", detail: "Animando con Sora2…" });
    }

    // ═══ SUCCESS — download and save ═══
    console.log("[POLL] Sora task complete! Finalizing...");

    const videoFileUrl = taskStatus.resultJson?.resultUrls?.[0] || taskStatus.resultJson?.url;
    if (!videoFileUrl) throw new Error("Sora returned no video URL");

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

    // Check if all variants with approved images are done
    const allDone = variants.every((v: any) => !v.base_image_approved || v.final_video_url);

    await supabase.from("assets").update({
      variants_json: variants,
      status: allDone ? "DONE" : "RENDERING",
    }).eq("id", asset_id);

    // Mark job done
    await supabase.from("jobs").update({
      status: "DONE",
      cost_json: { ...costJson, total_usd: 0.08 },
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

    console.log("[POLL] Pipeline complete!");
    return json({ status: "DONE", video_url: finalVideoUrl });
  } catch (err: any) {
    console.error("[POLL ERROR]", err.message);
    return json({ error: err.message }, 500);
  }
});
