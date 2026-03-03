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
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ElevenLabs voice mapping via KIE
const VOICE_MAP: Record<string, string> = {
  v1: "EXAVITQu4vr4xnSDxMaL", // Sarah
  v2: "JBFqnCBsd6RMkjVDRZzb", // George
  v3: "pFZP5JQG7iQjIQuC4Bku", // Lily
};

async function condensScript(scriptText: string, lovableApiKey: string): Promise<string> {
  console.log(`[CONDENSE] Original script (${scriptText.split(/\s+/).length} words): ${scriptText.substring(0, 100)}...`);
  
  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: "Eres un experto en copywriting UGC para TikTok. Tu trabajo es condensar guiones manteniendo la esencia, el hook, la propuesta de valor y el CTA."
        },
        {
          role: "user",
          content: `Condensa este guion UGC a exactamente 10 segundos de lectura (~25-30 palabras). Mantén el hook, la propuesta de valor y el CTA. Mismo tono y energía. Solo devuelve el guion condensado, nada más.\n\nGuion original:\n${scriptText}`
        }
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[CONDENSE] AI error:", res.status, errText);
    // Fallback: truncate to ~30 words
    const words = scriptText.split(/\s+/);
    if (words.length > 30) {
      return words.slice(0, 30).join(" ");
    }
    return scriptText;
  }

  const data = await res.json();
  const condensed = data.choices?.[0]?.message?.content?.trim() || scriptText;
  console.log(`[CONDENSE] Condensed (${condensed.split(/\s+/).length} words): ${condensed}`);
  return condensed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const KIE_API_KEY = Deno.env.get("KIE_AI_API_KEY");
    if (!KIE_API_KEY) throw new Error("KIE_AI_API_KEY not configured");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);
    const userId = user.id;

    const { render_id, script: clientScript } = await req.json();
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

    // Resolve script: prefer client-sent, fallback to blueprint
    let scriptText = clientScript || "";
    if (!scriptText) {
      const { data: bp } = await supabaseAdmin.from("blueprints").select("variations_json").eq("asset_id", assetId).single();
      if (bp?.variations_json) {
        const variations = bp.variations_json as any[];
        const match = variations.find((v: any) => v.nivel === render.variation_level);
        scriptText = match?.guion || "";
      }
    }
    if (!scriptText) return json({ error: "No script found for this render" }, 400);

    // Set status to RENDERING
    await supabaseAdmin.from("renders").update({ status: "RENDERING" }).eq("id", render_id);

    // Idempotency check
    const idempotencyKey = `final_video_lipsync:${render_id}`;
    const { data: existingJob } = await supabaseAdmin.from("jobs").select("*").eq("idempotency_key", idempotencyKey).eq("status", "DONE").maybeSingle();
    if (existingJob) return json({ message: "Already completed", job: existingJob });

    // Create/update job
    const { data: job } = await supabaseAdmin.from("jobs").upsert(
      { asset_id: assetId, render_id, type: "video" as any, status: "RUNNING" as any, idempotency_key: idempotencyKey, attempts: 1 },
      { onConflict: "idempotency_key" }
    ).select().single();

    // === STEP 0: Condense script to ~10s ===
    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        _tasks: {},
        _progress: { step: "condensing_script", detail: "Condensando guion a 10s…", updated_at: new Date().toISOString() },
        _job_id: job?.id, _image_url: baseImageUrl, _user_id: userId, _asset_id: assetId, _script: scriptText,
      },
    }).eq("id", render_id);

    const wordCount = scriptText.split(/\s+/).length;
    let condensedScript = scriptText;
    if (wordCount > 35) {
      condensedScript = await condensScript(scriptText, LOVABLE_API_KEY);
    }
    console.log(`[KICKOFF] Script: ${wordCount} words → condensed: ${condensedScript.split(/\s+/).length} words`);

    // === STEP 1: TTS via KIE (ElevenLabs) ===
    const voiceId = VOICE_MAP[render.voice_id || "v1"] || VOICE_MAP.v1;
    console.log(`[KICKOFF] Starting TTS for voice ${render.voice_id} → ElevenLabs ${voiceId}`);

    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        _tasks: { condensed_script: condensedScript },
        _progress: { step: "generating_tts", detail: "Generando voz con TTS…", updated_at: new Date().toISOString() },
        _job_id: job?.id, _image_url: baseImageUrl, _user_id: userId, _asset_id: assetId, _script: scriptText,
      },
    }).eq("id", render_id);

    const ttsRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "elevenlabs/text-to-speech-turbo-2-5",
        input: { text: condensedScript, voice_id: voiceId },
      }),
    });
    const ttsData = await ttsRes.json();
    if (ttsData.code !== 200) throw new Error(`TTS task failed: ${ttsData.msg}`);
    const ttsTaskId = ttsData.data.taskId;
    console.log(`[KICKOFF] TTS task started: ${ttsTaskId}`);

    // Save TTS task ID — lip-sync will be started by poll-render-status after TTS completes
    await supabaseAdmin.from("renders").update({
      cost_breakdown_json: {
        _tasks: { tts_task_id: ttsTaskId, condensed_script: condensedScript },
        _progress: { step: "generating_tts", detail: "Generando voz del guion condensado…", updated_at: new Date().toISOString() },
        _job_id: job?.id, _image_url: baseImageUrl, _user_id: userId, _asset_id: assetId, _script: scriptText,
      },
    }).eq("id", render_id);

    return json({ started: true, tts_task_id: ttsTaskId, condensed_script: condensedScript });
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
