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

/** Fetch and store TikTok cover/thumbnail for an existing asset that was ingested before thumbnail support */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");
    if (!rapidApiKey) return json({ error: "RAPIDAPI_KEY not configured" }, 500);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { asset_id } = await req.json();
    if (!asset_id) return json({ error: "asset_id required" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: asset } = await supabase.from("assets").select("*").eq("id", asset_id).single();
    if (!asset || asset.user_id !== user.id) return json({ error: "Not found" }, 404);

    // Check if thumbnail already exists
    const thumbPath = `${user.id}/${asset_id}/thumbnail.jpg`;
    const { data: existing } = await supabase.storage.from("ugc-assets").createSignedUrl(thumbPath, 60);
    if (existing?.signedUrl) return json({ message: "Thumbnail already exists", thumbnail_url: existing.signedUrl });

    // Fetch from TikTok API
    const encodedUrl = encodeURIComponent(asset.source_url);
    const rapidRes = await fetch(
      `https://tiktok-download-video1.p.rapidapi.com/getVideo?url=${encodedUrl}&hd=1`,
      { headers: { "x-rapidapi-host": "tiktok-download-video1.p.rapidapi.com", "x-rapidapi-key": rapidApiKey } },
    );
    const rapidData = await rapidRes.json();
    const videoInfo = rapidData?.data;
    const coverUrl = videoInfo?.origin_cover || videoInfo?.cover || videoInfo?.ai_dynamic_cover;

    if (!coverUrl) return json({ error: "No cover image found in TikTok response" }, 404);

    console.log("Downloading cover:", coverUrl);
    const coverRes = await fetch(coverUrl);
    if (!coverRes.ok) return json({ error: "Failed to download cover" }, 500);
    const coverBlob = await coverRes.blob();

    const { error: uploadErr } = await supabase.storage.from("ugc-assets").upload(thumbPath, coverBlob, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (uploadErr) return json({ error: uploadErr.message }, 500);

    const { data: signed } = await supabase.storage.from("ugc-assets").createSignedUrl(thumbPath, 3600);
    console.log("Thumbnail saved successfully");

    return json({ message: "Thumbnail fetched and stored", thumbnail_url: signed?.signedUrl });
  } catch (err) {
    console.error("fetch-thumbnail error:", err);
    return json({ error: err.message || "Unknown error" }, 500);
  }
});
