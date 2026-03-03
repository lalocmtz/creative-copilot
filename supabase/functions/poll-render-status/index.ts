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

    const ttsTaskId = breakdown._tasks.tts_task_id;
    const videoTaskId = breakdown._tasks.video_task_id || breakdown._tasks.motion_task_id;
    if (!videoTaskId) return json({ error: "No video task ID found" }, 400);

    const userId = breakdown._user_id;
    const assetId = breakdown._asset_id;

    // === Check TTS task first ===
    let ttsComplete = !ttsTaskId; // If no TTS task, consider it done
    let ttsResultUrl: string | null = breakdown._tts_result_url || null;

    if (ttsTaskId && !ttsResultUrl) {
      console.log(`[POLL] Checking TTS task: ${ttsTaskId}`);
      const ttsStatus = await checkTask(ttsTaskId, KIE_API_KEY);

      if (ttsStatus.state === "fail") {
        await supabaseAdmin.from("renders").update({
          status: "FAILED",
          cost_breakdown_json: { ...breakdown, _progress: { step: "failed", detail: `TTS failed: ${ttsStatus.failMsg}` } },
        }).eq("id", render_id);
        return json({ status: "FAILED", step: "failed", detail: `TTS: ${ttsStatus.failMsg}` });
      }

      if (ttsStatus.state === "success") {
        ttsResultUrl = ttsStatus.resultJson?.resultUrls?.[0] || ttsStatus.resultJson?.url || null;
        ttsComplete = true;
        // Cache TTS result URL in breakdown
        await supabaseAdmin.from("renders").update({
          cost_breakdown_json: {
            ...breakdown,
            _tts_result_url: ttsResultUrl,
            _progress: { step: "generating_video", detail: "Voz lista. Generando video (~3-5 min)…", updated_at: new Date().toISOString() },
          },
        }).eq("id", render_id);
        console.log("[POLL] TTS complete:", ttsResultUrl);
      } else {
        await supabaseAdmin.from("renders").update({
          cost_breakdown_json: {
            ...breakdown,
            _progress: { step: "generating_tts", detail: "Generando voz…", updated_at: new Date().toISOString() },
          },
        }).eq("id", render_id);
        return json({ status: "RENDERING", step: "generating_tts" });
      }
    } else if (ttsTaskId && ttsResultUrl) {
      ttsComplete = true;
    }

    // === Check video task ===
    console.log(`[POLL] Checking video task: ${videoTaskId}`);
    const taskStatus = await checkTask(videoTaskId, KIE_API_KEY);

    if (taskStatus.state === "fail") {
      await supabaseAdmin.from("renders").update({
        status: "FAILED",
        cost_breakdown_json: { ...breakdown, _progress: { step: "failed", detail: `Video generation failed: ${taskStatus.failMsg}` } },
      }).eq("id", render_id);
      return json({ status: "FAILED", step: "failed", detail: taskStatus.failMsg });
    }

    if (taskStatus.state !== "success") {
      // Re-read breakdown in case TTS updated it
      const { data: freshRender } = await supabaseAdmin.from("renders").select("cost_breakdown_json").eq("id", render_id).single();
      const freshBreakdown = freshRender?.cost_breakdown_json as any || breakdown;
      await supabaseAdmin.from("renders").update({
        cost_breakdown_json: {
          ...freshBreakdown,
          _progress: { step: "generating_video", detail: "Generando video 10s (~3-5 min)…", updated_at: new Date().toISOString() },
        },
      }).eq("id", render_id);
      return json({ status: "RENDERING", step: "generating_video" });
    }

    // === Both done! Download and finalize ===
    console.log("[POLL] Video generation complete! Finalizing...");
    const videoFileUrl = taskStatus.resultJson?.resultUrls?.[0];
    if (!videoFileUrl) throw new Error("Video generation returned no URL");

    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        ...breakdown,
        _progress: { step: "downloading", detail: "Descargando video y audio…", updated_at: new Date().toISOString() },
      },
    }).eq("id", render_id);

    // Download video
    const videoDownloadUrl = await getDownloadUrl(videoFileUrl, KIE_API_KEY);
    const videoBuffer = await (await fetch(videoDownloadUrl)).arrayBuffer();
    const videoPath = `${userId}/${assetId}/renders/${render_id}/video.mp4`;

    // Download TTS audio (if available)
    let ttsAudioSignedUrl: string | null = null;
    if (ttsResultUrl) {
      try {
        const ttsDownloadUrl = await getDownloadUrl(ttsResultUrl, KIE_API_KEY);
        const ttsBuffer = await (await fetch(ttsDownloadUrl)).arrayBuffer();
        const ttsPath = `${userId}/${assetId}/renders/${render_id}/tts_audio.mp3`;
        await supabaseAdmin.storage.from("ugc-assets").upload(ttsPath, ttsBuffer, { contentType: "audio/mpeg", upsert: true });
        const { data: ttsSigned } = await supabaseAdmin.storage.from("ugc-assets").createSignedUrl(ttsPath, 60 * 60 * 24 * 7);
        ttsAudioSignedUrl = ttsSigned?.signedUrl || null;
        console.log("[POLL] TTS audio uploaded to storage");
      } catch (ttsErr: any) {
        console.error("[POLL] TTS download/upload failed (non-fatal):", ttsErr.message);
      }
    }

    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        ...breakdown,
        _progress: { step: "uploading", detail: "Subiendo video final…", updated_at: new Date().toISOString() },
      },
    }).eq("id", render_id);

    await supabaseAdmin.storage.from("ugc-assets").upload(videoPath, videoBuffer, { contentType: "video/mp4", upsert: true });
    const { data: videoSigned } = await supabaseAdmin.storage.from("ugc-assets").createSignedUrl(videoPath, 60 * 60 * 24 * 7);

    const ttsCost = ttsTaskId ? 0.02 : 0;
    const videoCost = 0.10;
    const totalCost = ttsCost + videoCost;

    await supabaseAdmin.from("renders").update({
      status: "DONE",
      final_video_url: videoSigned?.signedUrl || videoFileUrl,
      render_cost: totalCost,
      cost_breakdown_json: {
        tts: ttsTaskId ? { provider: "elevenlabs", model: "turbo-2.5", estimated_usd: ttsCost } : undefined,
        image_to_video: { provider: "kling", model: "2.6-image-to-video", duration: "10s", estimated_usd: videoCost },
        tts_audio_url: ttsAudioSignedUrl,
        total_usd: totalCost,
      },
    }).eq("id", render_id);

    await supabaseAdmin.from("assets").update({ status: "VIDEO_RENDERED" }).eq("id", assetId);

    if (breakdown._job_id) {
      await supabaseAdmin.from("jobs").update({
        status: "DONE",
        cost_json: { tts: ttsCost, image_to_video: videoCost, total: totalCost },
        provider_job_id: `tts:${ttsTaskId}|i2v:${videoTaskId}`,
      }).eq("id", breakdown._job_id);
    }

    console.log("[POLL] Pipeline complete! TTS + 10s video.");
    return json({ status: "DONE", video_url: videoSigned?.signedUrl, tts_audio_url: ttsAudioSignedUrl, cost: totalCost });
  } catch (err: any) {
    console.error("[POLL ERROR]", err.message);
    return json({ error: err.message }, 500);
  }
});
