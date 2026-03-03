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

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { render_id } = await req.json();
    if (!render_id) return json({ error: "render_id is required" }, 400);

    const { data: render, error: renderErr } = await supabaseAdmin
      .from("renders")
      .select("*")
      .eq("id", render_id)
      .single();
    if (renderErr || !render) return json({ error: "Render not found" }, 404);
    if (render.status !== "RENDERING") return json({ status: render.status, step: "done" });

    const breakdown = render.cost_breakdown_json as any;
    const tasks = breakdown?._tasks;
    if (!tasks) return json({ error: "No task data found" }, 400);

    const motionTaskId = tasks.motion_task_id;
    if (!motionTaskId) return json({ error: "No motion task ID found" }, 400);

    // Check motion control task status
    console.log(`[POLL] Checking motion task: ${motionTaskId}`);
    const motionStatus = await checkTask(motionTaskId, KIE_API_KEY);

    if (motionStatus.state === "fail") {
      await supabaseAdmin.from("renders").update({
        status: "FAILED",
        cost_breakdown_json: { ...breakdown, _progress: { step: "failed", detail: `Motion transfer failed: ${motionStatus.failMsg}` } },
      }).eq("id", render_id);
      return json({ status: "FAILED", step: "failed", detail: motionStatus.failMsg });
    }

    if (motionStatus.state !== "success") {
      // Still processing
      await supabaseAdmin.from("renders").update({
        cost_breakdown_json: {
          ...breakdown,
          _progress: { step: "motion_transferring", detail: "Transfiriendo movimiento (~3-5 min)…", updated_at: new Date().toISOString() },
        },
      }).eq("id", render_id);
      return json({ status: "RENDERING", step: "motion_transferring" });
    }

    // Motion transfer done! Download and finalize
    console.log("[POLL] Motion transfer complete! Finalizing...");
    const videoFileUrl = motionStatus.resultJson?.resultUrls?.[0];
    if (!videoFileUrl) throw new Error("Motion transfer returned no URL");

    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        ...breakdown,
        _progress: { step: "downloading", detail: "Descargando resultado…", updated_at: new Date().toISOString() },
      },
    }).eq("id", render_id);

    const userId = breakdown._user_id;
    const assetId = breakdown._asset_id;

    // Download and upload final video
    const videoDownloadUrl = await getDownloadUrl(videoFileUrl, KIE_API_KEY);
    const videoBuffer = await (await fetch(videoDownloadUrl)).arrayBuffer();
    const videoPath = `${userId}/${assetId}/renders/${render_id}/video.mp4`;

    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        ...breakdown,
        _progress: { step: "uploading", detail: "Subiendo video final…", updated_at: new Date().toISOString() },
      },
    }).eq("id", render_id);

    await supabaseAdmin.storage.from("ugc-assets").upload(videoPath, videoBuffer, { contentType: "video/mp4", upsert: true });

    // Get signed URL for the final video
    const { data: videoSigned } = await supabaseAdmin.storage.from("ugc-assets").createSignedUrl(videoPath, 60 * 60 * 24 * 7);

    // Get signed URL for the source audio (original video)
    const sourceVideoPath = breakdown._source_video_path || `${userId}/${assetId}/source.mp4`;
    const { data: audioSigned } = await supabaseAdmin.storage.from("ugc-assets").createSignedUrl(sourceVideoPath, 60 * 60 * 24 * 7);

    const totalCost = 0.45; // ~$0.023/s × 20s at 720p (económico)

    await supabaseAdmin.from("renders").update({
      status: "DONE",
      final_video_url: videoSigned?.signedUrl || videoFileUrl,
      render_cost: totalCost,
      cost_breakdown_json: {
        motion_transfer: { provider: "kling", model: "2.6-motion-control", mode: "720p", estimated_usd: totalCost },
        audio_url: audioSigned?.signedUrl,
        total_usd: totalCost,
      },
    }).eq("id", render_id);

    await supabaseAdmin.from("assets").update({ status: "VIDEO_RENDERED" }).eq("id", assetId);

    if (breakdown._job_id) {
      await supabaseAdmin.from("jobs").update({
        status: "DONE",
        cost_json: { motion_transfer: totalCost, total: totalCost },
        provider_job_id: `motion:${motionTaskId}`,
      }).eq("id", breakdown._job_id);
    }

    console.log("[POLL] Motion transfer pipeline complete!");
    return json({ status: "DONE", video_url: videoSigned?.signedUrl, audio_url: audioSigned?.signedUrl, cost: totalCost });
  } catch (err: any) {
    console.error("[POLL ERROR]", err.message);
    return json({ error: err.message }, 500);
  }
});
