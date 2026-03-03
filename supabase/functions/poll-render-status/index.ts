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
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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

    // ========== Timeout check ==========
    const startedAt = breakdown._started_at;
    if (startedAt) {
      const elapsed = Date.now() - new Date(startedAt).getTime();
      if (elapsed > TIMEOUT_MS) {
        console.log(`[POLL] Timeout reached (${Math.round(elapsed / 1000)}s). Marking as FAILED.`);
        await supabaseAdmin.from("renders").update({
          status: "FAILED",
          cost_breakdown_json: {
            ...breakdown,
            _progress: { step: "failed", detail: "Timeout: la generación tardó más de 5 minutos.", updated_at: new Date().toISOString() },
          },
        }).eq("id", render_id);
        // NO credit deduction on timeout
        return json({ status: "FAILED", step: "failed", detail: "Timeout: la generación tardó más de 5 minutos." });
      }
    }

    const klingTaskId = breakdown._tasks.kling_task_id;
    const userId = breakdown._user_id;
    const assetId = breakdown._asset_id;
    const ttsAudioUrl = breakdown._tts_audio_url;

    if (!klingTaskId) {
      // Kling task not started yet — generate-final-video may still be running
      return json({ status: "RENDERING", step: "animating_image" });
    }

    // ========== Check Kling I2V task ==========
    console.log(`[POLL] Checking Kling I2V task: ${klingTaskId}`);
    const klingStatus = await checkTask(klingTaskId, KIE_API_KEY);

    if (klingStatus.state === "fail") {
      await supabaseAdmin.from("renders").update({
        status: "FAILED",
        cost_breakdown_json: { ...breakdown, _progress: { step: "failed", detail: `Kling I2V failed: ${klingStatus.failMsg}` } },
      }).eq("id", render_id);
      return json({ status: "FAILED", step: "failed", detail: `Kling I2V: ${klingStatus.failMsg}` });
    }

    if (klingStatus.state !== "success") {
      await supabaseAdmin.from("renders").update({
        cost_breakdown_json: {
          ...breakdown,
          _progress: { step: "animating_image", detail: "Animando imagen…", updated_at: new Date().toISOString() },
        },
      }).eq("id", render_id);
      return json({ status: "RENDERING", step: "animating_image" });
    }

    // ========== DONE! Download and finalize ==========
    console.log("[POLL] Kling I2V complete! Finalizing...");
    const videoFileUrl = klingStatus.resultJson?.resultUrls?.[0] || klingStatus.resultJson?.url;
    if (!videoFileUrl) throw new Error("Kling I2V returned no video URL");

    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        ...breakdown,
        _progress: { step: "finalizing", detail: "Descargando y subiendo video…", updated_at: new Date().toISOString() },
      },
    }).eq("id", render_id);

    const videoDownloadUrl = await getDownloadUrl(videoFileUrl, KIE_API_KEY);
    const videoBuffer = await (await fetch(videoDownloadUrl)).arrayBuffer();
    const videoPath = `${userId}/${assetId}/renders/${render_id}/final_video.mp4`;

    await supabaseAdmin.storage.from("ugc-assets").upload(videoPath, videoBuffer, { contentType: "video/mp4", upsert: true });
    const { data: videoSigned } = await supabaseAdmin.storage.from("ugc-assets").createSignedUrl(videoPath, 60 * 60 * 24 * 7);

    const ttsCost = 0.02;
    const klingCost = 0.08;
    const totalCost = ttsCost + klingCost;

    await supabaseAdmin.from("renders").update({
      status: "DONE",
      final_video_url: videoSigned?.signedUrl || videoFileUrl,
      render_cost: totalCost,
      cost_breakdown_json: {
        tts: { provider: "elevenlabs", model: "eleven_multilingual_v2", estimated_usd: ttsCost },
        kling_i2v: { provider: "kling", model: "v2.0/image2video", estimated_usd: klingCost },
        total_usd: totalCost,
        _tts_audio_url: ttsAudioUrl,
      },
    }).eq("id", render_id);

    await supabaseAdmin.from("assets").update({ status: "VIDEO_RENDERED" }).eq("id", assetId);

    // ========== Credit deduction ==========
    if (userId) {
      console.log("[POLL] Deducting 1 credit for user:", userId);
      const { data: creditData } = await supabaseAdmin
        .from("user_credits")
        .select("used_credits")
        .eq("user_id", userId)
        .single();
      
      if (creditData) {
        await supabaseAdmin
          .from("user_credits")
          .update({ used_credits: creditData.used_credits + 1 })
          .eq("user_id", userId);
        
        await supabaseAdmin.from("credit_transactions").insert({
          user_id: userId,
          type: "USAGE",
          credits_delta: -1,
          related_render_id: render_id,
        });
        console.log("[POLL] Credit deducted successfully");
      }
    }

    if (breakdown._job_id) {
      await supabaseAdmin.from("jobs").update({
        status: "DONE",
        cost_json: { tts: ttsCost, kling_i2v: klingCost, total: totalCost },
        provider_job_id: `kling:${klingTaskId}`,
      }).eq("id", breakdown._job_id);
    }

    console.log("[POLL] Pipeline complete!");
    return json({ status: "DONE", video_url: videoSigned?.signedUrl, tts_audio_url: ttsAudioUrl, cost: totalCost });
  } catch (err: any) {
    console.error("[POLL ERROR]", err.message);
    return json({ error: err.message }, 500);
  }
});
