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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    // Client-level supabase to get user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: "No autorizado" }, 401);

    const { source_url, rights_confirmed } = await req.json();
    if (!source_url?.trim()) return json({ error: "source_url es requerido" }, 400);

    // Service role client for DB operations
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Compute simple hash for dedupe
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(source_url.trim().toLowerCase()));
    const sourceHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Check dedupe: same user + same source_hash
    const { data: existing } = await supabase
      .from("assets")
      .select("*")
      .eq("user_id", user.id)
      .eq("source_hash", sourceHash)
      .maybeSingle();

    if (existing) {
      return json({ asset: existing, cached: true });
    }

    // Insert new asset
    const { data: asset, error: insertError } = await supabase
      .from("assets")
      .insert({
        user_id: user.id,
        source_url: source_url.trim(),
        source_hash: sourceHash,
        rights_confirmed: rights_confirmed ?? false,
        status: "PENDING",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return json({ error: "Error creando asset" }, 500);
    }

    return json({ asset, cached: false }, 201);
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: "Error interno del servidor" }, 500);
  }
});
