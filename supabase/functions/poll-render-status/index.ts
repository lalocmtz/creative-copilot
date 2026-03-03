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

    // Get render with its stored task data
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

    const ttsTaskId = tasks.tts_task_id;
    const videoTaskId = tasks.video_task_id;

    // CASE 1: Video task exists — check its status
    if (videoTaskId) {
      console.log(`[POLL] Checking video task: ${videoTaskId}`);
      const videoStatus = await checkTask(videoTaskId, KIE_API_KEY);

      if (videoStatus.state === "fail") {
        await supabaseAdmin.from("renders").update({
          status: "FAILED",
          cost_breakdown_json: { ...breakdown, _progress: { step: "failed", detail: `Video failed: ${videoStatus.failMsg}` } },
        }).eq("id", render_id);
        return json({ status: "FAILED", step: "failed", detail: videoStatus.failMsg });
      }

      if (videoStatus.state !== "success") {
        // Still processing
        await supabaseAdmin.from("renders").update({
          cost_breakdown_json: {
            ...breakdown,
            _progress: { step: "video_generating", detail: "Video generándose (~3 min)…", updated_at: new Date().toISOString() },
          },
        }).eq("id", render_id);
        return json({ status: "RENDERING", step: "video_generating" });
      }

      // Video done! Download, upload, finalize
      console.log("[POLL] Video complete! Finalizing...");
      const videoFileUrl = videoStatus.resultJson?.resultUrls?.[0];
      if (!videoFileUrl) throw new Error("Video returned no URL");

      await supabaseAdmin.from("renders").update({
        cost_breakdown_json: {
          ...breakdown,
          _progress: { step: "uploading", detail: "Subiendo archivos…", updated_at: new Date().toISOString() },
        },
      }).eq("id", render_id);

      // Download TTS result too
      const ttsStatus = await checkTask(ttsTaskId, KIE_API_KEY);
      const ttsFileUrl = ttsStatus.resultJson?.resultUrls?.[0];

      const userId = breakdown._user_id;
      const assetId = breakdown._asset_id;

      // Download and upload files
      const videoDownloadUrl = await getDownloadUrl(videoFileUrl, KIE_API_KEY);
      const videoBuffer = await (await fetch(videoDownloadUrl)).arrayBuffer();
      const videoPath = `${userId}/${assetId}/renders/${render_id}/video.mp4`;
      await supabaseAdmin.storage.from("ugc-assets").upload(videoPath, videoBuffer, { contentType: "video/mp4", upsert: true });

      let audioSignedUrl = null;
      if (ttsFileUrl) {
        const ttsDownloadUrl = await getDownloadUrl(ttsFileUrl, KIE_API_KEY);
        const audioBuffer = await (await fetch(ttsDownloadUrl)).arrayBuffer();
        const audioPath = `${userId}/${assetId}/renders/${render_id}/audio.mp3`;
        await supabaseAdmin.storage.from("ugc-assets").upload(audioPath, audioBuffer, { contentType: "audio/mpeg", upsert: true });
        const { data: audioSigned } = await supabaseAdmin.storage.from("ugc-assets").createSignedUrl(audioPath, 60 * 60 * 24 * 7);
        audioSignedUrl = audioSigned?.signedUrl;
      }

      const { data: videoSigned } = await supabaseAdmin.storage.from("ugc-assets").createSignedUrl(videoPath, 60 * 60 * 24 * 7);
      const totalCost = 0.83;

      await supabaseAdmin.from("renders").update({
        status: "DONE",
        final_video_url: videoSigned?.signedUrl || videoFileUrl,
        render_cost: totalCost,
        cost_breakdown_json: {
          tts: { provider: "elevenlabs", estimated_usd: 0.03 },
          video: { provider: "kling", model: "v2-1-master", estimated_usd: 0.80 },
          audio_url: audioSignedUrl,
          total_usd: totalCost,
        },
      }).eq("id", render_id);

      await supabaseAdmin.from("assets").update({ status: "VIDEO_RENDERED" }).eq("id", assetId);

      if (breakdown._job_id) {
        await supabaseAdmin.from("jobs").update({
          status: "DONE",
          cost_json: { tts: 0.03, video: 0.80, total: totalCost },
          provider_job_id: `tts:${ttsTaskId},video:${videoTaskId}`,
        }).eq("id", breakdown._job_id);
      }

      console.log("[POLL] Pipeline complete!");
      return json({ status: "DONE", video_url: videoSigned?.signedUrl, audio_url: audioSignedUrl, cost: totalCost });
    }

    // CASE 2: Only TTS task — check its status
    console.log(`[POLL] Checking TTS task: ${ttsTaskId}`);
    const ttsStatus = await checkTask(ttsTaskId, KIE_API_KEY);

    if (ttsStatus.state === "fail") {
      await supabaseAdmin.from("renders").update({
        status: "FAILED",
        cost_breakdown_json: { ...breakdown, _progress: { step: "failed", detail: `TTS failed: ${ttsStatus.failMsg}` } },
      }).eq("id", render_id);
      return json({ status: "FAILED", step: "failed", detail: ttsStatus.failMsg });
    }

    if (ttsStatus.state !== "success") {
      return json({ status: "RENDERING", step: "tts_processing" });
    }

    // TTS done! Start video generation
    console.log("[POLL] TTS complete, starting video generation...");
    const imageUrl = breakdown._image_url;
    if (!imageUrl) throw new Error("No base image URL");

    const motionPrompt = `A person naturally speaking and gesturing while presenting a product. ${breakdown._scenario_prompt || "Clean, well-lit setting."}. Smooth, natural movement. 9:16 vertical video.`;

    const videoRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kling/v2-1-master-image-to-video",
        input: {
          prompt: motionPrompt,
          image_url: imageUrl,
          duration: "5",
          negative_prompt: "blur, distort, low quality, watermark",
          cfg_scale: 0.5,
        },
      }),
    });
    const videoData = await videoRes.json();
    if (videoData.code !== 200) throw new Error(`Video creation failed: ${videoData.msg}`);
    const newVideoTaskId = videoData.data.taskId;
    console.log(`[POLL] Video task started: ${newVideoTaskId}`);

    // Save the video task ID
    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        ...breakdown,
        _tasks: { ...tasks, video_task_id: newVideoTaskId },
        _progress: { step: "video_starting", detail: "Iniciando generación de video…", updated_at: new Date().toISOString() },
      },
    }).eq("id", render_id);

    return json({ status: "RENDERING", step: "video_starting", video_task_id: newVideoTaskId });
  } catch (err: any) {
    console.error("[POLL ERROR]", err.message);
    return json({ error: err.message }, 500);
  }
});
