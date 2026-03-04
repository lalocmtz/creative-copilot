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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { asset_id, variant_id } = await req.json();
    if (!asset_id || !variant_id) return json({ error: "asset_id and variant_id are required" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch asset + verify ownership
    const { data: asset, error: assetErr } = await supabase.from("assets").select("*").eq("id", asset_id).single();
    if (assetErr || !asset) return json({ error: "Asset not found" }, 404);
    if (asset.user_id !== user.id) return json({ error: "Unauthorized" }, 403);

    const variants = (asset.variants_json as any[]) || [];
    const variantIndex = variants.findIndex((v: any) => v.variant_id === variant_id);
    if (variantIndex === -1) return json({ error: `Variant ${variant_id} not found` }, 404);

    const variant = variants[variantIndex];
    const imagePrompt = variant.image_prompt;
    if (!imagePrompt) return json({ error: "No image_prompt in variant" }, 400);

    // Idempotency
    const idempotencyKey = `base_image:${asset_id}:${variant_id}`;
    const { data: existingJob } = await supabase
      .from("jobs").select("*").eq("idempotency_key", idempotencyKey).eq("status", "DONE").maybeSingle();

    if (existingJob && variant.base_image_url) {
      return json({ image_url: variant.base_image_url, cached: true });
    }

    // Create job
    const { data: job } = await supabase.from("jobs").insert({
      asset_id, variant_id, type: "generate_base_image", status: "RUNNING",
      idempotency_key: `base_image:${asset_id}:${variant_id}:${Date.now()}`, attempts: 1,
    }).select().single();

    // Get thumbnail reference
    const thumbPath = `${user.id}/${asset_id}/thumbnail.jpg`;
    const { data: thumbSigned } = await supabase.storage.from("ugc-assets").createSignedUrl(thumbPath, 1800);

    // Build prompt
    const systemPrompt = `You are a photorealistic image compositor for UGC TikTok Shop content.

RULES:
- Generate a COMPLETELY DIFFERENT person from any reference — only match broad demographics
- Create a DIFFERENT environment of the same type (different furniture, colors, layout)
- Product must look like a real 3D photographed object, NOT a flat mockup
- Anatomically correct hands, natural finger positioning
- Match lighting, add contact shadows, realistic specular highlights
- Portrait 9:16, natural smartphone camera quality with subtle grain
- Must look like a real person filmed this on their phone
- NO CGI look, NO studio photography, NO watermarks`;

    const userContent: any[] = [];
    if (thumbSigned?.signedUrl) {
      userContent.push({ type: "image_url", image_url: { url: thumbSigned.signedUrl } });
    }
    userContent.push({ type: "text", text: imagePrompt });

    console.log(`[BASE IMAGE] Generating for variant ${variant_id}`);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
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
      await supabase.from("jobs").update({ status: "FAILED", error_message: `AI error: ${aiResponse.status}` }).eq("id", job!.id);
      if (aiResponse.status === 429) return json({ error: "Rate limit exceeded" }, 429);
      if (aiResponse.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: "Image generation failed" }, 500);
    }

    const aiData = await aiResponse.json();
    const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageData) {
      await supabase.from("jobs").update({ status: "FAILED", error_message: "No image in AI response" }).eq("id", job!.id);
      return json({ error: "AI did not return an image" }, 500);
    }

    // Decode and upload
    const base64Match = imageData.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
    if (!base64Match) {
      await supabase.from("jobs").update({ status: "FAILED", error_message: "Unexpected image format" }).eq("id", job!.id);
      return json({ error: "Unexpected image format" }, 500);
    }

    const imgType = base64Match[1];
    const imgBytes = Uint8Array.from(atob(base64Match[2]), (c) => c.charCodeAt(0));
    const storagePath = `${user.id}/${asset_id}/variant-${variant_id}-base.${imgType === "jpeg" ? "jpg" : imgType}`;

    const { error: uploadErr } = await supabase.storage.from("ugc-assets").upload(storagePath, imgBytes, { contentType: `image/${imgType}`, upsert: true });
    if (uploadErr) {
      await supabase.from("jobs").update({ status: "FAILED", error_message: uploadErr.message }).eq("id", job!.id);
      return json({ error: "Failed to upload image" }, 500);
    }

    // Create signed URL (7 days)
    const { data: signedData } = await supabase.storage.from("ugc-assets").createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    const signedUrl = signedData?.signedUrl || "";

    // Update variant in variants_json
    variants[variantIndex] = { ...variant, base_image_url: signedUrl };
    await supabase.from("assets").update({ variants_json: variants }).eq("id", asset_id);

    // Update job
    await supabase.from("jobs").update({
      status: "DONE",
      cost_json: { provider: "lovable_ai", model: "gemini-3-pro-image-preview", estimated_cost: 0.05 },
    }).eq("id", job!.id);

    console.log(`[BASE IMAGE] Generated for variant ${variant_id}: ${signedUrl.substring(0, 60)}...`);
    return json({ image_url: signedUrl, variant_id, cost: 0.05 });
  } catch (err: any) {
    console.error("[BASE IMAGE ERROR]", err.message);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});
