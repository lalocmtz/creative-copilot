import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub;

    const { asset_id, force } = await req.json();
    if (!asset_id) return json({ error: "asset_id is required" }, 400);

    // Fetch asset
    const { data: asset, error: assetErr } = await supabaseAdmin
      .from("assets")
      .select("*")
      .eq("id", asset_id)
      .single();

    if (assetErr || !asset) return json({ error: "Asset not found" }, 404);
    if (asset.user_id !== userId) return json({ error: "Forbidden" }, 403);

    // Validate status
    const validStatuses = ["VIDEO_INGESTED", "BLUEPRINT_GENERATED", "IMAGE_APPROVED", "VIDEO_RENDERED"];
    if (!validStatuses.includes(asset.status)) {
      return json({ error: `Asset must be at least VIDEO_INGESTED. Current: ${asset.status}` }, 400);
    }

    if (!asset.transcript) {
      return json({ error: "Asset has no transcript. Run ingest first." }, 400);
    }

    // Check existing blueprint
    const { data: existingBp } = await supabaseAdmin
      .from("blueprints")
      .select("*")
      .eq("asset_id", asset_id)
      .maybeSingle();

    if (existingBp && !force) {
      return json({ error: "Blueprint already exists. Use force=true to regenerate." }, 409);
    }

    // Delete old blueprint if forcing
    if (existingBp && force) {
      await supabaseAdmin.from("blueprints").delete().eq("id", existingBp.id);
    }

    // Create job record
    const idempotencyKey = `blueprint:${asset_id}:${force ? Date.now() : "initial"}`;
    const { data: job } = await supabaseAdmin
      .from("jobs")
      .insert({
        asset_id,
        type: "blueprint",
        status: "RUNNING",
        idempotency_key: idempotencyKey,
        attempts: 1,
      })
      .select()
      .single();

    // Call Lovable AI (Gemini) via tool calling for structured output
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    }

    const systemPrompt = `Eres un estratega de contenido UGC experto en TikTok Shop. Analizas transcripts de videos virales y extraes su estructura estratégica para poder recrearlos con nuevos actores y escenarios SIN copiar identidades.

Tu trabajo es:
1. Analizar el transcript y extraer hook, ángulo psicológico, emoción dominante, mecanismo de venta
2. Detectar el género del hablante (femenino/masculino) basándote en pistas del lenguaje
3. Crear una descripción MUY DETALLADA de un escenario similar pero diferente para generar una imagen base
4. Dividir el video en beats con timestamps estimados
5. Identificar riesgos de política (marcas, claims médicos, etc.)
6. Crear 3 variaciones del guion:
   - Nivel 1: Clon EXACTO del transcript original (palabra por palabra)
   - Nivel 2: Variación moderada (misma estructura, diferentes palabras)
   - Nivel 3: Nuevo enfoque (mismo producto/tema, ángulo completamente diferente)

IMPORTANTE: El escenario sugerido debe ser un prompt extenso y detallado para generación de imagen, describiendo:
- Tipo de persona (género, rango de edad, etnicidad ambigua)
- Vestimenta y estilo
- Escenario/fondo detallado
- Iluminación y atmósfera
- Expresión facial y pose
- Formato: retrato 9:16, estilo UGC natural, cámara frontal de celular`;

    const userPrompt = `Analiza este transcript de un video viral de TikTok y devuélveme el análisis estratégico completo.

TRANSCRIPT:
"""
${asset.transcript}
"""

Responde usando la función analyze_transcript.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_transcript",
              description: "Return the full strategic analysis of the UGC video transcript",
              parameters: {
                type: "object",
                properties: {
                  analysis: {
                    type: "object",
                    properties: {
                      hook: { type: "string", description: "The opening hook phrase" },
                      hook_type: { type: "string", description: "Type of hook (curiosity, pain, social proof, etc.)" },
                      angulo: { type: "string", description: "Psychological angle" },
                      emocion_dominante: { type: "string", description: "Dominant emotion" },
                      mecanismo: { type: "string", description: "Sales mechanism" },
                      genero_detectado: { type: "string", enum: ["femenino", "masculino"], description: "Detected speaker gender" },
                      escenario_sugerido: { type: "string", description: "Very detailed image generation prompt for a similar but different scenario (at least 100 words)" },
                      intensidad_emocional: { type: "number", description: "Emotional intensity 0-100" },
                      estructura_beats: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            tiempo: { type: "string" },
                            beat: { type: "string" },
                            descripcion: { type: "string" },
                          },
                          required: ["tiempo", "beat", "descripcion"],
                        },
                      },
                      riesgos_politica: { type: "array", items: { type: "string" } },
                      sugerencia_mejora_retencion: { type: "string" },
                    },
                    required: ["hook", "angulo", "emocion_dominante", "mecanismo", "genero_detectado", "escenario_sugerido", "intensidad_emocional", "estructura_beats", "riesgos_politica", "sugerencia_mejora_retencion"],
                  },
                  variations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        nivel: { type: "number" },
                        titulo: { type: "string" },
                        guion: { type: "string", description: "Script text, max 55 words for levels 2 and 3. Level 1 is exact clone." },
                        cambios_clave: { type: "array", items: { type: "string" } },
                      },
                      required: ["nivel", "titulo", "guion", "cambios_clave"],
                    },
                    description: "Exactly 3 variations: nivel 1 (exact clone), nivel 2 (moderate), nivel 3 (new angle)",
                  },
                },
                required: ["analysis", "variations"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_transcript" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);

      if (job) {
        await supabaseAdmin.from("jobs").update({ status: "FAILED", error_message: `AI error: ${aiResponse.status}` }).eq("id", job.id);
      }

      if (aiResponse.status === 429) return json({ error: "Rate limit exceeded. Try again in a moment." }, 429);
      if (aiResponse.status === 402) return json({ error: "AI credits exhausted. Add funds in Settings." }, 402);
      return json({ error: "AI analysis failed" }, 500);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(aiData));
      if (job) {
        await supabaseAdmin.from("jobs").update({ status: "FAILED", error_message: "No structured output from AI" }).eq("id", job.id);
      }
      return json({ error: "AI did not return structured analysis" }, 500);
    }

    let parsed;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse AI output:", toolCall.function.arguments);
      if (job) {
        await supabaseAdmin.from("jobs").update({ status: "FAILED", error_message: "Invalid JSON from AI" }).eq("id", job.id);
      }
      return json({ error: "AI returned invalid JSON" }, 500);
    }

    const analysisJson = parsed.analysis;
    const variationsJson = parsed.variations;

    // Estimate token cost (rough)
    const inputTokens = Math.ceil(asset.transcript.length / 4);
    const outputTokens = Math.ceil(JSON.stringify(parsed).length / 4);
    const tokenCost = ((inputTokens * 0.00001) + (outputTokens * 0.00004));

    // Save blueprint
    const { data: blueprint, error: bpError } = await supabaseAdmin
      .from("blueprints")
      .insert({
        asset_id,
        analysis_json: analysisJson,
        variations_json: variationsJson,
        token_cost: parseFloat(tokenCost.toFixed(4)),
      })
      .select()
      .single();

    if (bpError) {
      console.error("Blueprint insert error:", bpError);
      if (job) {
        await supabaseAdmin.from("jobs").update({ status: "FAILED", error_message: bpError.message }).eq("id", job.id);
      }
      return json({ error: "Failed to save blueprint" }, 500);
    }

    // Update asset status
    await supabaseAdmin
      .from("assets")
      .update({ status: "BLUEPRINT_GENERATED" })
      .eq("id", asset_id);

    // Update job
    if (job) {
      await supabaseAdmin
        .from("jobs")
        .update({
          status: "DONE",
          cost_json: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost: tokenCost },
        })
        .eq("id", job.id);
    }

    return json({ blueprint, asset_id, status: "BLUEPRINT_GENERATED" });
  } catch (err) {
    console.error("generate-blueprint error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
