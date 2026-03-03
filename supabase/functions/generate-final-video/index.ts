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

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);
    const userId = user.id;

    const { render_id } = await req.json();
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

    // Set status to RENDERING
    await supabaseAdmin.from("renders").update({ status: "RENDERING" }).eq("id", render_id);

    // Idempotency check
    const idempotencyKey = `motion_transfer:${render_id}`;
    const { data: existingJob } = await supabaseAdmin.from("jobs").select("*").eq("idempotency_key", idempotencyKey).eq("status", "DONE").maybeSingle();
    if (existingJob) return json({ message: "Already completed", job: existingJob });

    // Create/update job
    const { data: job } = await supabaseAdmin.from("jobs").upsert(
      { asset_id: assetId, render_id, type: "video" as any, status: "RUNNING" as any, idempotency_key: idempotencyKey, attempts: 1 },
      { onConflict: "idempotency_key" }
    ).select().single();

    // Step 1: Get signed URL for source video
    const sourceVideoPath = `${userId}/${assetId}/source.mp4`;
    const { data: signedData, error: signErr } = await supabaseAdmin.storage
      .from("ugc-assets")
      .createSignedUrl(sourceVideoPath, 60 * 60); // 1 hour
    if (signErr || !signedData?.signedUrl) throw new Error(`Failed to get source video URL: ${signErr?.message}`);
    const sourceVideoUrl = signedData.signedUrl;
    console.log("[KICKOFF] Source video signed URL obtained");

    // Step 2: Upload source video to KIE AI file service
    const videoFileName = `source_${render_id}.mp4`;
    const uploadVideoRes = await fetch(KIE_FILE_UPLOAD, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl: sourceVideoUrl, uploadPath: videoFileName }),
    });
    const uploadVideoData = await uploadVideoRes.json();
    if (!uploadVideoData?.data?.url) throw new Error(`Video upload to KIE failed: ${JSON.stringify(uploadVideoData)}`);
    const kieVideoUrl = uploadVideoData.data.url;
    console.log("[KICKOFF] Source video uploaded to KIE:", kieVideoUrl);

    // Step 3: Upload base image to KIE AI file service
    const imageFileName = `base_${render_id}.jpg`;
    const uploadImageRes = await fetch(KIE_FILE_UPLOAD, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl: baseImageUrl, uploadPath: imageFileName }),
    });
    const uploadImageData = await uploadImageRes.json();
    if (!uploadImageData?.data?.url) throw new Error(`Image upload to KIE failed: ${JSON.stringify(uploadImageData)}`);
    const kieImageUrl = uploadImageData.data.url;
    console.log("[KICKOFF] Base image uploaded to KIE:", kieImageUrl);

    // Step 4: Create motion control task (Kling 2.6)
    const motionPrompt = render.scenario_prompt
      ? `A person in ${render.scenario_prompt}. Natural movement and expression.`
      : "A person speaking naturally with expressive gestures.";

    const motionRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kling-2.6/motion-control",
        input: {
          input_urls: [kieImageUrl],
          video_urls: [kieVideoUrl],
          character_orientation: "video",
          mode: "1080p",
          prompt: motionPrompt,
        },
      }),
    });
    const motionData = await motionRes.json();
    if (motionData.code !== 200) throw new Error(`Motion control task failed: ${motionData.msg}`);
    const motionTaskId = motionData.data.taskId;
    console.log(`[KICKOFF] Motion control task started: ${motionTaskId}`);

    // Save task ID and progress
    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        _tasks: { motion_task_id: motionTaskId },
        _progress: { step: "motion_starting", detail: "Iniciando transferencia de movimiento…", updated_at: new Date().toISOString() },
        _job_id: job?.id,
        _image_url: baseImageUrl,
        _source_video_path: sourceVideoPath,
        _user_id: userId,
        _asset_id: assetId,
      },
    }).eq("id", render_id);

    return json({ started: true, motion_task_id: motionTaskId });
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
