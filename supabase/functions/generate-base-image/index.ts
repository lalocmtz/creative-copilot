import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const KIE_API_BASE = "https://api.kie.ai/api/v1";

async function pollKieTask(taskId: string, apiKey: string, maxAttempts = 24): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    console.log(`Polling KIE AI task ${taskId}, attempt ${i + 1}/${maxAttempts}`);

    const res = await fetch(`${KIE_API_BASE}/flux/kontext/record-info?taskId=${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json();
    console.log("KIE poll response:", JSON.stringify(data));

    if (data?.data?.status === 1) {
      const imageUrl = data?.data?.info?.images?.[0];
      if (imageUrl) return { success: true, imageUrl };
      return { success: false, error: "No image URL in success response" };
    }
    if (data?.data?.status === 2 || data?.data?.status === 3) {
      return { success: false, error: `KIE AI generation failed with status ${data.data.status}` };
    }
    // status 0 = still generating, continue polling
  }
  return { success: false, error: "Timeout: KIE AI did not complete within 2 minutes" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const kieApiKey = Deno.env.get("KIE_AI_API_KEY");

    if (!kieApiKey) return json({ error: "KIE_AI_API_KEY not configured" }, 500);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const { render_id } = await req.json();
    if (!render_id) return json({ error: "render_id is required" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch render + validate ownership
    const { data: render, error: renderErr } = await supabase
      .from("renders")
      .select("*, assets!inner(id, user_id, status)")
      .eq("id", render_id)
      .maybeSingle();

    if (renderErr || !render) return json({ error: "Render not found" }, 404);
    if ((render as any).assets.user_id !== userId) return json({ error: "Unauthorized" }, 403);
    if (render.status !== "DRAFT" && render.status !== "IMAGE_GENERATED") {
      return json({ error: `Cannot generate image: render status is ${render.status}` }, 400);
    }

    // Idempotency check
    const idempotencyKey = `base_image:${render_id}`;
    const { data: existingJob } = await supabase
      .from("jobs")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .eq("status", "DONE")
      .maybeSingle();

    if (existingJob && render.base_image_url) {
      console.log("Base image already generated, returning cached result");
      return json({ image_url: render.base_image_url, cached: true });
    }

    // Create job record
    const { data: job } = await supabase.from("jobs").insert({
      asset_id: (render as any).assets.id,
      render_id: render_id,
      type: "base_image",
      status: "RUNNING",
      idempotency_key: idempotencyKey,
      attempts: 1,
    }).select().single();

    // Build prompt
    const actorDesc = render.actor_id || "a young, natural-looking person";
    const scenarioDesc = render.scenario_prompt || "modern, well-lit interior";
    const intensityLabel = (render.emotional_intensity ?? 50) > 70 ? "high energy, expressive" : (render.emotional_intensity ?? 50) > 40 ? "moderate, natural" : "calm, composed";
    const productCtx = render.product_image_url ? "Person is holding/showing a beauty product." : "";

    const prompt = `Professional UGC-style photo of ${actorDesc} in ${scenarioDesc}. ${intensityLabel} expression. Portrait orientation 9:16 aspect ratio. Natural lighting, authentic social media aesthetic. ${productCtx} No text overlays.`;

    console.log("KIE AI prompt:", prompt);

    // Call KIE AI to create task
    const createRes = await fetch(`${KIE_API_BASE}/flux/kontext/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kieApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        aspectRatio: "9:16",
        model: "flux-kontext-pro",
      }),
    });

    const createData = await createRes.json();
    console.log("KIE AI create response:", JSON.stringify(createData));

    if (createData?.code !== 200 || !createData?.data?.taskId) {
      await supabase.from("jobs").update({ status: "FAILED", error_message: JSON.stringify(createData) }).eq("id", job!.id);
      return json({ error: "Failed to create KIE AI task", details: createData }, 500);
    }

    const taskId = createData.data.taskId;
    await supabase.from("jobs").update({ provider_job_id: taskId }).eq("id", job!.id);

    // Poll for result
    const result = await pollKieTask(taskId, kieApiKey);

    if (!result.success) {
      await supabase.from("jobs").update({ status: "FAILED", error_message: result.error }).eq("id", job!.id);
      await supabase.from("renders").update({ status: "FAILED" }).eq("id", render_id);
      return json({ error: result.error }, 500);
    }

    // Download image and upload to Storage
    console.log("Downloading image from:", result.imageUrl);
    const imgRes = await fetch(result.imageUrl!);
    const imgBlob = await imgRes.blob();
    const imgBuffer = new Uint8Array(await imgBlob.arrayBuffer());

    const assetId = (render as any).assets.id;
    const storagePath = `${userId}/${assetId}/base-image-${render_id}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("ugc-assets")
      .upload(storagePath, imgBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      console.error("Storage upload error:", uploadErr);
      await supabase.from("jobs").update({ status: "FAILED", error_message: uploadErr.message }).eq("id", job!.id);
      return json({ error: "Failed to upload image to storage" }, 500);
    }

    // Create signed URL (7 days)
    const { data: signedData } = await supabase.storage
      .from("ugc-assets")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    const signedUrl = signedData?.signedUrl || "";

    // Update render
    await supabase.from("renders").update({
      base_image_url: signedUrl,
      status: "IMAGE_GENERATED",
    }).eq("id", render_id);

    // Update job
    await supabase.from("jobs").update({
      status: "DONE",
      cost_json: { provider: "kie_ai", model: "flux-kontext-pro", estimated_cost: 0.08 },
    }).eq("id", job!.id);

    console.log("Base image generated successfully");
    return json({ image_url: signedUrl, cost: 0.08 });
  } catch (err) {
    console.error("generate-base-image error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});
