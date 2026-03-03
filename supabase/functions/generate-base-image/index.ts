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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

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
    const assetId = (render as any).assets.id;
    const { data: job } = await supabase.from("jobs").insert({
      asset_id: assetId,
      render_id: render_id,
      type: "base_image",
      status: "RUNNING",
      idempotency_key: idempotencyKey,
      attempts: 1,
    }).select().single();

    // Get signed URL for the original video thumbnail as reference
    const thumbPath = `${userId}/${assetId}/thumbnail.jpg`;
    const { data: thumbSignedData } = await supabase.storage
      .from("ugc-assets")
      .createSignedUrl(thumbPath, 60 * 30);
    const thumbRefUrl = thumbSignedData?.signedUrl || null;

    // Build the prompt
    const scenarioDesc = render.scenario_prompt || "natural UGC-style scene, person talking to camera";
    const intensityLabel = (render.emotional_intensity ?? 50) > 70 ? "high energy, very expressive" : (render.emotional_intensity ?? 50) > 40 ? "moderate, natural" : "calm, composed";

    const imagePrompt = thumbRefUrl
      ? `Look at this reference image (a frame from the original TikTok video). Generate a NEW photo that replicates the EXACT same composition:
- Same camera distance and angle
- Same type of background and setting
- Same lighting conditions and color temperature
- Same framing (how much of the person is visible)

But change the PERSON completely — different face, different identity. Keep everything else as close to the original as possible.

Additional scene details: ${scenarioDesc}
Expression/energy: ${intensityLabel}
Format: Portrait 9:16, natural smartphone camera quality (NOT studio photography). Should look like a real person filmed this on their phone.`
      : `Generate a natural UGC-style photo matching this description exactly:
${scenarioDesc}
Expression/energy: ${intensityLabel}
Format: Portrait 9:16, natural smartphone camera quality. Should look like a real selfie/video screenshot, NOT a professional studio photo.`;

    console.log("Generating image with Lovable AI (gemini-3-pro-image-preview)");
    console.log("Has thumbnail reference:", !!thumbRefUrl);

    // Build messages for the AI
    const userContent: any[] = [];
    if (thumbRefUrl) {
      userContent.push({
        type: "image_url",
        image_url: { url: thumbRefUrl },
      });
    }
    userContent.push({ type: "text", text: imagePrompt });

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [{ role: "user", content: userContent }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI image generation error:", aiResponse.status, errText);
      await supabase.from("jobs").update({ status: "FAILED", error_message: `AI error: ${aiResponse.status} - ${errText}` }).eq("id", job!.id);

      if (aiResponse.status === 429) return json({ error: "Rate limit exceeded. Try again in a moment." }, 429);
      if (aiResponse.status === 402) return json({ error: "AI credits exhausted." }, 402);
      return json({ error: "Image generation failed" }, 500);
    }

    const aiData = await aiResponse.json();
    const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      console.error("No image in AI response:", JSON.stringify(aiData).slice(0, 500));
      await supabase.from("jobs").update({ status: "FAILED", error_message: "No image in AI response" }).eq("id", job!.id);
      return json({ error: "AI did not return an image" }, 500);
    }

    // Decode base64 image and upload to Storage
    const base64Match = imageData.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
    if (!base64Match) {
      console.error("Unexpected image format");
      await supabase.from("jobs").update({ status: "FAILED", error_message: "Unexpected image format from AI" }).eq("id", job!.id);
      return json({ error: "Unexpected image format" }, 500);
    }

    const imgType = base64Match[1];
    const imgBase64 = base64Match[2];
    const imgBytes = Uint8Array.from(atob(imgBase64), (c) => c.charCodeAt(0));

    const storagePath = `${userId}/${assetId}/base-image-${render_id}.${imgType === "jpeg" ? "jpg" : imgType}`;

    const { error: uploadErr } = await supabase.storage
      .from("ugc-assets")
      .upload(storagePath, imgBytes, {
        contentType: `image/${imgType}`,
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
      cost_json: { provider: "lovable_ai", model: "gemini-3-pro-image-preview", has_reference: !!thumbRefUrl, estimated_cost: 0.05 },
    }).eq("id", job!.id);

    console.log("Base image generated successfully with Lovable AI");
    return json({ image_url: signedUrl, cost: 0.05 });
  } catch (err) {
    console.error("generate-base-image error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});
