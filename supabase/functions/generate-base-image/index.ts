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

    // Idempotency: skip cache when regenerating (status is IMAGE_GENERATED)
    const isRegenerate = render.status === "IMAGE_GENERATED";
    const idempotencyKey = isRegenerate
      ? `base_image:${render_id}:${Date.now()}`
      : `base_image:${render_id}`;

    if (!isRegenerate) {
      const { data: existingJob } = await supabase
        .from("jobs")
        .select("*")
        .eq("idempotency_key", `base_image:${render_id}`)
        .eq("status", "DONE")
        .maybeSingle();

      if (existingJob && render.base_image_url) {
        console.log("Base image already generated, returning cached result");
        return json({ image_url: render.base_image_url, cached: true });
      }
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

    // Build the prompt — photorealistic compositor strategy
    const scenarioDesc = render.scenario_prompt || "natural UGC-style scene, person talking to camera";
    const intensity = render.emotional_intensity ?? 50;
    const intensityLabel = intensity > 70 ? "high energy, very expressive" : intensity > 40 ? "moderate, natural" : "calm, composed";
    const productImageUrl = render.product_image_url || null;

    // System prompt: compositor realista
    const systemPrompt = `You are a photorealistic image compositor specializing in UGC content. Your job is to create a photo where a person naturally holds a real product.

ABSOLUTE RULES:
- NEVER replicate the reference person's face. Generate a COMPLETELY DIFFERENT person with only similar demographic traits (age range, gender, build, facial hair style).
- NEVER copy the exact room/background from the reference. Create a DIFFERENT environment of the same general type (e.g., if reference is a bedroom, create a DIFFERENT bedroom with different furniture, colors, and layout).
- NEVER paste a flat mockup onto the image. The product must be reconstructed as a real 3D photographed object.
- NEVER deform, add, or duplicate hands/fingers. Hands must look anatomically correct.
- NEVER duplicate the product (only ONE instance).
- NEVER add random objects (phones, other products) that weren't requested.
- The product label/text must look printed and wrapped with realistic curvature — NOT flat or digitally overlaid.

PHYSICAL COHERENCE RULES:
- Match the scene's lighting direction and color temperature on the product surface.
- Add contact shadows where fingers grip the product.
- Show correct finger occlusion (fingers in FRONT of the product where they naturally grip).
- Add realistic specular highlights based on the product material (plastic = soft highlights, glass = sharp reflections).
- Product scale must be physically correct relative to the hand size.
- If the product has a curved surface (bottle, jar), the label must follow that curvature.
- Add natural camera grain/noise matching the rest of the photo.`;

    // User prompt with clear image labeling
    const hasProduct = !!productImageUrl;
    const hasThumb = !!thumbRefUrl;

    let imageLabeling = "";
    if (hasThumb && hasProduct) {
      imageLabeling = `You are receiving TWO reference images:
- IMAGE 1 (first image): Use as INSPIRATION ONLY for camera angle and distance. Do NOT copy the room, furniture, wall colors, or any identifiable background elements. Create a completely different environment of the same general type (indoor/outdoor).
- IMAGE 2 (second image): The EXACT product the person must hold. Reconstruct this product as a real 3D object — study its shape, material, colors, label design, and texture.

`;
    } else if (hasThumb) {
      imageLabeling = `You are receiving ONE reference image: a scene/composition reference. Use as INSPIRATION ONLY for camera angle and distance. Do NOT copy the room, furniture, or background details.\n\n`;
    } else if (hasProduct) {
      imageLabeling = `You are receiving ONE reference image: the product the person must hold. Reconstruct it as a real 3D object.\n\n`;
    }

    const imagePrompt = `${imageLabeling}Generate a NEW UGC-style photo with these requirements:

PERSON: A COMPLETELY DIFFERENT person — different face, different hair, different skin tone variation. Only preserve broad traits: same gender, similar age range, similar build, similar facial hair style (if any). The person must NOT be recognizable as the same individual. Expression: ${intensityLabel}.
COMPOSITION: ${hasThumb ? "Similar camera distance and framing style as IMAGE 1, but in a DIFFERENT room/location. Change wall color, furniture, floor, decorations. Keep the same general vibe (e.g., casual indoor) but make the space clearly distinct." : scenarioDesc}
PRODUCT INTEGRATION (CRITICAL):
- The person MUST be holding ${hasProduct ? "the EXACT product from IMAGE 2" : "a product"} in their hand, showing it naturally to the camera.
- Reconstruct the product as a real photographed 3D object — NOT a flat mockup pasted on.
- Match the scene lighting direction and color temperature on the product surface.
- Add contact shadows where fingers touch/grip the product.
- Show correct finger overlap: fingers that grip the product must appear IN FRONT of it.
- Realistic specular highlights on the product surface (match material: plastic, glass, etc.).
- If the product has a label, it must look printed with natural curvature following the bottle/jar shape — NOT flat.
- Product scale must be physically correct for the hand size.

SCENE: ${scenarioDesc}

FORBIDDEN (do NOT include ANY of these):
- Copying the reference person's face or distinctive features
- Replicating the exact room, furniture placement, or background details from the reference
- Flat/pasted mockup look, unrealistic glow around product
- Extra fingers, deformed hands, extra hands
- Duplicated products (only ONE)
- Wrong product scale, floating product
- CGI/rendered look, overly smooth skin
- Random objects not requested (phones, other items)
- Watermarks, text overlays

FORMAT: Portrait 9:16 aspect ratio, natural smartphone camera quality with subtle grain. Must look like a real person filmed this on their phone — NOT studio photography.`;

    console.log("Generating image with Lovable AI (gemini-3-pro-image-preview)");
    console.log("Has thumbnail reference:", hasThumb);
    console.log("Has product image reference:", hasProduct);

    // Build messages — system + user with labeled reference images
    const userContent: any[] = [];
    if (thumbRefUrl) {
      userContent.push({ type: "image_url", image_url: { url: thumbRefUrl } });
    }
    if (productImageUrl) {
      userContent.push({ type: "image_url", image_url: { url: productImageUrl } });
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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
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
