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

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "No autorizado" }, 401);

    const { project_id, variant_id } = await req.json();
    if (!project_id || !variant_id) return json({ error: "project_id and variant_id required" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: project, error: fetchErr } = await supabase
      .from("motion_projects")
      .select("*")
      .eq("id", project_id)
      .single();
    if (fetchErr || !project) return json({ error: "Proyecto no encontrado" }, 404);
    if (project.user_id !== user.id) return json({ error: "No autorizado" }, 403);

    const variants = (project.variants_json as any[]) || [];
    const variantIdx = variants.findIndex((v: any) => v.variant_id === variant_id);
    if (variantIdx === -1) return json({ error: `Variante ${variant_id} no encontrada` }, 404);

    const variant = variants[variantIdx];
    if (!variant.image_prompt) return json({ error: "No hay image_prompt para esta variante" }, 400);

    // Already has image?
    if (variant.generated_image_url) {
      return json({ image_url: variant.generated_image_url, cached: true });
    }

    await supabase.from("motion_projects").update({ status: "GENERATING_IMAGES" }).eq("id", project_id);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Generate image with Nano Banana
    const imageRes = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: `Generate a photorealistic vertical 9:16 UGC-style image based on this description:\n\n${variant.image_prompt}\n\nIMPORTANT RULES:\n- Must be vertical portrait orientation (9:16)\n- Must look like a real smartphone photo, NOT AI-generated\n- Natural lighting, slight grain, authentic UGC quality\n- Person must look like a real TikTok creator\n- Product must be held/used naturally with proper finger occlusion\n- NO text overlays, NO logos, NO watermarks`,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!imageRes.ok) throw new Error(`Image generation error: ${imageRes.status}`);
    const imageData = await imageRes.json();
    const base64Image = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!base64Image) throw new Error("No image returned from AI");

    // Upload to storage
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const storagePath = `${user.id}/motion/${project_id}/variant_${variant_id}.png`;

    await supabase.storage.from("ugc-assets").upload(storagePath, imageBytes, {
      contentType: "image/png", upsert: true,
    });

    const { data: signedData } = await supabase.storage.from("ugc-assets").createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    const imageUrl = signedData?.signedUrl || "";

    // Update variant in variants_json
    variants[variantIdx] = { ...variant, generated_image_url: imageUrl };

    // Check if all variants have images
    const allDone = variants.every((v: any) => v.generated_image_url);

    await supabase.from("motion_projects").update({
      variants_json: variants,
      status: allDone ? "DONE" : "ANALYZED",
    }).eq("id", project_id);

    return json({ image_url: imageUrl, variant_id });
  } catch (err: any) {
    console.error("Motion image error:", err);
    return json({ error: err?.message || "Error generando imagen" }, 500);
  }
});
