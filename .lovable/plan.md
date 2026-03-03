
# Auto-Populate Studio from Blueprint Data

## Current Problem
When you open the Studio, everything is empty because:
1. The `generate-blueprint` edge function doesn't exist yet (Phase 3 was not implemented)
2. Without a blueprint, the Studio has no data to pre-fill the script, actor, scenario, etc.
3. The asset is stuck at `VIDEO_INGESTED` status -- it needs blueprint generation first

## What Needs to Happen

### 1. Create `generate-blueprint` Edge Function
Use Lovable AI (Gemini) to analyze the transcript and auto-generate:
- The exact script (cloned from the original transcript)
- Actor gender detection (from transcript/context clues)
- A similar-but-different scenario description
- An extensive, detailed prompt for base image generation
- 3 variation levels with adjusted scripts
- Risk/policy warnings

No external API key needed -- uses Lovable AI's built-in Gemini model.

### 2. Auto-populate Studio from Blueprint
When Studio loads and a blueprint exists:
- **Script**: Pre-fill with the Nivel 1 variation (exact clone of the original script)
- **Actor**: Auto-select based on detected gender from the blueprint analysis
- **Scenario**: Pre-fill with the AI-generated scenario description
- **Voice**: Auto-select matching voice based on detected gender
- **Emotional intensity**: Set from the blueprint's detected emotional level

### 3. Improve the Flow
- Blueprint page gets a "Generate Blueprint" button that calls the new edge function
- Once generated, "Abrir Studio" navigates to Studio with everything pre-filled
- User only needs to optionally upload product image, tweak settings, and hit "Generar Imagen Base"

## Technical Steps

### Step 1: Edge Function `supabase/functions/generate-blueprint/index.ts`
- Accepts `{ asset_id, force?: boolean }`
- Validates asset status is at least `VIDEO_INGESTED`
- Calls Lovable AI (Gemini 2.5 Flash) with the transcript
- Prompt instructs the LLM to:
  - Clone the exact script as Nivel 1
  - Detect speaker gender and appearance hints
  - Generate a detailed scenario prompt for image generation
  - Create 3 variation levels
  - Flag policy risks
- Saves `analysis_json` and `variations_json` to the `blueprints` table
- Updates asset status to `BLUEPRINT_GENERATED`
- Creates a job record for cost tracking

### Step 2: Blueprint Page -- Add "Generate Blueprint" button
- Show "Generar Blueprint" button when no blueprint exists
- Cost estimate displayed before execution (~$0.02)
- Loading state during generation
- On success, show the full analysis

### Step 3: Studio Auto-Population
- Fetch the blueprint when Studio loads
- Extract the Nivel 1 script and pre-fill the script textarea
- Map detected gender to actor/voice selection
- Pre-fill scenario from blueprint's `escenario_sugerido` field
- Set emotional intensity from blueprint's detected level
- Save all this to the render draft automatically

### Blueprint JSON Schema (what the LLM returns)
```text
analysis_json: {
  hook, angulo, emocion_dominante, mecanismo,
  genero_detectado: "femenino" | "masculino",
  escenario_sugerido: "detailed scenario description...",
  intensidad_emocional: 70,
  estructura_beats: [...],
  riesgos_politica: [...],
  sugerencia_mejora_retencion: "..."
}

variations_json: [
  { nivel: 1, titulo: "Clon exacto", guion: "exact transcript...", cambios_clave: [] },
  { nivel: 2, titulo: "Variacion moderada", guion: "...", cambios_clave: [...] },
  { nivel: 3, titulo: "Nuevo enfoque", guion: "...", cambios_clave: [...] }
]
```

### Files to Create/Edit
- **New**: `supabase/functions/generate-blueprint/index.ts`
- **Edit**: `src/pages/Blueprint.tsx` -- add generate button
- **Edit**: `src/pages/Studio.tsx` -- auto-populate from blueprint data
- **Edit**: `src/hooks/useSupabaseQueries.ts` -- add generate blueprint mutation
- **Edit**: `docs/tasks.md` -- mark Phase 3 tasks
