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
    const idempotencyKey = `image_to_video:${render_id}`;
    const { data: existingJob } = await supabaseAdmin.from("jobs").select("*").eq("idempotency_key", idempotencyKey).eq("status", "DONE").maybeSingle();
    if (existingJob) return json({ message: "Already completed", job: existingJob });

    // Create/update job
    const { data: job } = await supabaseAdmin.from("jobs").upsert(
      { asset_id: assetId, render_id, type: "video" as any, status: "RUNNING" as any, idempotency_key: idempotencyKey, attempts: 1 },
      { onConflict: "idempotency_key" }
    ).select().single();

    // Step 1: Upload base image to KIE AI file service
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

    // Step 2: Create image-to-video task (Kling 2.6)
    const animPrompt = render.scenario_prompt
      ? `A person naturally presenting a product in ${render.scenario_prompt}. Subtle natural movement, gentle head turns, slight hand gestures, natural blinking. Cinematic lighting, 9:16 vertical format.`
      : "A person speaking naturally to camera with subtle movements, gentle head turns, natural blinking, slight hand gestures. Warm lighting, 9:16 vertical format.";

    console.log(`[KICKOFF] Creating image-to-video task with prompt: ${animPrompt.substring(0, 80)}...`);

    const taskRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kling-2.6/image-to-video",
        input: {
          prompt: animPrompt,
          image_urls: [kieImageUrl],
          duration: "5",
          sound: false,
        },
      }),
    });
    const taskData = await taskRes.json();
    if (taskData.code !== 200) throw new Error(`Image-to-video task failed: ${taskData.msg}`);
    const taskId = taskData.data.taskId;
    console.log(`[KICKOFF] Image-to-video task started: ${taskId}`);

    // Save task ID and progress
    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        _tasks: { video_task_id: taskId },
        _progress: {
          step: "video_starting",
          detail: "Iniciando generación de video (5s)…",
          updated_at: new Date().toISOString(),
        },
        _job_id: job?.id,
        _image_url: baseImageUrl,
        _user_id: userId,
        _asset_id: assetId,
      },
    }).eq("id", render_id);

    return json({ started: true, task_id: taskId });
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
