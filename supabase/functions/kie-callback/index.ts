import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const KIE_BASE = "https://api.kie.ai/api/v1";

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
  console.log(`[KIE-CALLBACK] Boot OK — ${req.method} received`);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const KIE_API_KEY = Deno.env.get("KIE_AI_API_KEY");
    if (!KIE_API_KEY) throw new Error("KIE_AI_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    console.log("[KIE-CALLBACK] Received:", JSON.stringify(body).substring(0, 500));

    // KIE sends: { taskId, state: "success"|"fail", resultJson?, failMsg? }
    const taskId = body.taskId || body.task_id;
    const state = body.state || body.status;

    if (!taskId) return json({ error: "No taskId in callback" }, 400);

    // Find job by provider_job_id
    const { data: job } = await supabase
      .from("jobs").select("*")
      .eq("provider_job_id", taskId)
      .in("status", ["RUNNING"])
      .maybeSingle();

    if (!job) {
      console.log(`[KIE-CALLBACK] No matching RUNNING job for taskId: ${taskId}`);
      return json({ ok: true, detail: "No matching job" });
    }

    const costJson = job.cost_json as any;

    if (state === "success") {
      console.log("[KIE-CALLBACK] Task succeeded, finalizing...");

      const resultJson = typeof body.resultJson === "string" ? JSON.parse(body.resultJson) : (body.resultJson || body.result);
      const videoFileUrl = resultJson?.resultUrls?.[0] || resultJson?.url;

      if (!videoFileUrl) {
        console.error("[KIE-CALLBACK] No video URL in result");
        return json({ ok: false, error: "No video URL" });
      }

      const videoDownloadUrl = await getDownloadUrl(videoFileUrl, KIE_API_KEY);
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

      // Deduct credit
      const { data: creditData } = await supabase.from("user_credits").select("used_credits").eq("user_id", userId).single();
      if (creditData) {
        await supabase.from("user_credits").update({ used_credits: creditData.used_credits + 1 }).eq("user_id", userId);
        await supabase.from("credit_transactions").insert({ user_id: userId, type: "USAGE", credits_delta: -1 });
      }

      // Circuit breaker: success
      await supabase.from("provider_status").upsert({ provider: "kie", status: "OK", failure_count: 0, updated_at: new Date().toISOString() });

      console.log(`[KIE-CALLBACK] ✅ Video finalized for variant ${variantId}`);
      return json({ ok: true, status: "DONE" });
    }

    if (state === "fail") {
      console.log(`[KIE-CALLBACK] Task failed: ${body.failMsg || "unknown"}`);
      // Mark job for contingency — poll-render-status will handle retry
      await supabase.from("jobs").update({
        error_message: body.failMsg || "Task failed via callback",
      }).eq("id", job.id);
      // Don't change status — let poll handle contingency
      return json({ ok: true, detail: "Failure noted, contingency will be handled by poll" });
    }

    // Progress update
    console.log(`[KIE-CALLBACK] Progress update: ${state}`);
    return json({ ok: true });
  } catch (err: any) {
    console.error("[KIE-CALLBACK ERROR]", err.message);
    return json({ error: err.message }, 500);
  }
});
