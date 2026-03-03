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
    if (!breakdown?._tasks) {
      return json({ error: "No task data found. Use retry to reset this render.", status: "STUCK" }, 400);
    }

    const lipsyncTaskId = breakdown._tasks.lipsync_task_id;
    const userId = breakdown._user_id;
    const assetId = breakdown._asset_id;

    if (!lipsyncTaskId) {
      // Lip-sync not started yet — generate-final-video may still be running
      return json({ status: "RENDERING", step: "starting_lipsync" });
    }

    // ========== Check lip-sync task ==========
    console.log(`[POLL] Checking lip-sync task: ${lipsyncTaskId}`);
    const lipsyncStatus = await checkTask(lipsyncTaskId, KIE_API_KEY);

    if (lipsyncStatus.state === "fail") {
      await supabaseAdmin.from("renders").update({
        status: "FAILED",
        cost_breakdown_json: { ...breakdown, _progress: { step: "failed", detail: `Lip-sync failed: ${lipsyncStatus.failMsg}` } },
      }).eq("id", render_id);
      return json({ status: "FAILED", step: "failed", detail: `Lip-sync: ${lipsyncStatus.failMsg}` });
    }

    if (lipsyncStatus.state !== "success") {
      await supabaseAdmin.from("renders").update({
        cost_breakdown_json: {
          ...breakdown,
          _progress: { step: "generating_lipsync", detail: "Sincronizando labios + audio…", updated_at: new Date().toISOString() },
        },
      }).eq("id", render_id);
      return json({ status: "RENDERING", step: "generating_lipsync" });
    }

    // ========== DONE! Download and finalize ==========
    console.log("[POLL] Lip-sync complete! Finalizing...");
    const videoFileUrl = lipsyncStatus.resultJson?.resultUrls?.[0] || lipsyncStatus.resultJson?.url;
    if (!videoFileUrl) throw new Error("Lip-sync returned no video URL");

    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        ...breakdown,
        _progress: { step: "downloading", detail: "Descargando video final…", updated_at: new Date().toISOString() },
      },
    }).eq("id", render_id);

    const videoDownloadUrl = await getDownloadUrl(videoFileUrl, KIE_API_KEY);
    const videoBuffer = await (await fetch(videoDownloadUrl)).arrayBuffer();
    const videoPath = `${userId}/${assetId}/renders/${render_id}/final_lipsync.mp4`;

    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        ...breakdown,
        _progress: { step: "uploading", detail: "Subiendo video final…", updated_at: new Date().toISOString() },
      },
    }).eq("id", render_id);

    await supabaseAdmin.storage.from("ugc-assets").upload(videoPath, videoBuffer, { contentType: "video/mp4", upsert: true });
    const { data: videoSigned } = await supabaseAdmin.storage.from("ugc-assets").createSignedUrl(videoPath, 60 * 60 * 24 * 7);

    const ttsCost = 0.02;
    const lipsyncCost = 0.13;
    const totalCost = ttsCost + lipsyncCost;

    await supabaseAdmin.from("renders").update({
      status: "DONE",
      final_video_url: videoSigned?.signedUrl || videoFileUrl,
      render_cost: totalCost,
      cost_breakdown_json: {
        tts: { provider: "elevenlabs", model: "eleven_multilingual_v2", estimated_usd: ttsCost },
        lipsync: { provider: "infinitalk", model: "from-audio", estimated_usd: lipsyncCost },
        total_usd: totalCost,
      },
    }).eq("id", render_id);

    await supabaseAdmin.from("assets").update({ status: "VIDEO_RENDERED" }).eq("id", assetId);

    if (breakdown._job_id) {
      await supabaseAdmin.from("jobs").update({
        status: "DONE",
        cost_json: { tts: ttsCost, lipsync: lipsyncCost, total: totalCost },
        provider_job_id: `lipsync:${lipsyncTaskId}`,
      }).eq("id", breakdown._job_id);
    }

    console.log("[POLL] Pipeline complete!");
    return json({ status: "DONE", video_url: videoSigned?.signedUrl, cost: totalCost });
  } catch (err: any) {
    console.error("[POLL ERROR]", err.message);
    return json({ error: err.message }, 500);
  }
});
