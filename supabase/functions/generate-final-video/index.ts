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
      .select("*, assets!inner(id, user_id, status, transcript)")
      .eq("id", render_id)
      .single();
    if (renderErr || !render) return json({ error: "Render not found" }, 404);
    if ((render as any).assets.user_id !== userId) return json({ error: "Unauthorized" }, 403);
    if (render.status !== "IMAGE_APPROVED") return json({ error: `Render must be IMAGE_APPROVED, got ${render.status}` }, 409);

    // Get script
    const { data: blueprint } = await supabaseAdmin.from("blueprints").select("variations_json").eq("asset_id", render.asset_id).single();
    const variations = blueprint?.variations_json as any[];
    const variation = variations?.find((v: any) => v.nivel === render.variation_level);
    const script = variation?.guion || (render as any).assets.transcript || "";
    if (!script) return json({ error: "No script found" }, 400);

    // Set status to RENDERING
    await supabaseAdmin.from("renders").update({ status: "RENDERING" }).eq("id", render_id);

    // Idempotency check
    const idempotencyKey = `final_video:${render_id}`;
    const { data: existingJob } = await supabaseAdmin.from("jobs").select("*").eq("idempotency_key", idempotencyKey).eq("status", "DONE").maybeSingle();
    if (existingJob) return json({ message: "Already completed", job: existingJob });

    // Create/update job
    const { data: job } = await supabaseAdmin.from("jobs").upsert(
      { asset_id: render.asset_id, render_id, type: "video" as any, status: "RUNNING" as any, idempotency_key: idempotencyKey, attempts: 1 },
      { onConflict: "idempotency_key" }
    ).select().single();

    // KICKOFF: Start TTS task only
    const voiceName = VOICE_MAP[render.voice_id || "v1"] || "Sarah";
    const ttsRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "elevenlabs/text-to-speech-turbo-2-5",
        input: { text: script, voice: voiceName, stability: 0.5, similarity_boost: 0.75, speed: 1, language_code: "es" },
      }),
    });
    const ttsData = await ttsRes.json();
    if (ttsData.code !== 200) throw new Error(`TTS creation failed: ${ttsData.msg}`);
    const ttsTaskId = ttsData.data.taskId;
    console.log(`[KICKOFF] TTS task started: ${ttsTaskId}`);

    // Save task IDs and progress into the render record
    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        _tasks: { tts_task_id: ttsTaskId, video_task_id: null },
        _progress: { step: "tts_processing", detail: "Procesando voz…", updated_at: new Date().toISOString() },
        _job_id: job?.id,
        _image_url: render.base_image_url,
        _scenario_prompt: render.scenario_prompt,
        _user_id: userId,
        _asset_id: render.asset_id,
      },
    }).eq("id", render_id);

    // Return immediately — frontend will poll
    return json({ started: true, tts_task_id: ttsTaskId });
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
