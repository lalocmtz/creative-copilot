# UGC Scale Engine — Tasks (Source of Truth)

> **Scope**: Phases 1–3 (Foundations → Ingest → Blueprint)
> **Stack adaptation**: Next.js API Routes → Supabase Edge Functions (Deno). BullMQ → DB-based job tracking. S3 → Supabase Storage.
> **References**: [masterplan.md](./masterplan.md) · [implementation-plan.md](./implementation-plan.md) · [design-guidelines.md](./design-guidelines.md) · [app-flow-pages-and-roles.md](./app-flow-pages-and-roles.md)

---

## Phase 1 — Foundations

### 1.1 Enable Lovable Cloud + Database Schema
- [x] Enable Lovable Cloud (Supabase backend)
- [x] Create enum types for asset and render statuses
- [x] Create `assets` table with RLS
- [x] Create `blueprints` table with RLS
- [x] Create `renders` table with RLS
- [x] Create `jobs` table for pipeline traceability
- [x] Create Supabase Storage bucket `ugc-assets` (videos, images, renders)

#### SQL: Enum Types
```sql
-- Asset lifecycle states (see masterplan.md > State Machine)
CREATE TYPE public.asset_status AS ENUM (
  'PENDING',
  'VIDEO_INGESTED',
  'BLUEPRINT_GENERATED',
  'IMAGE_APPROVED',
  'VIDEO_RENDERED',
  'FAILED'
);

-- Render lifecycle states
CREATE TYPE public.render_status AS ENUM (
  'DRAFT',
  'IMAGE_GENERATED',
  'IMAGE_APPROVED',
  'RENDERING',
  'DONE',
  'FAILED'
);

-- Job types for pipeline traceability
CREATE TYPE public.job_type AS ENUM (
  'download_video',
  'transcribe',
  'blueprint',
  'base_image',
  'tts',
  'video',
  'lipsync',
  'merge'
);

CREATE TYPE public.job_status AS ENUM (
  'PENDING',
  'RUNNING',
  'DONE',
  'FAILED'
);
```

#### SQL: `assets` Table
```sql
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_hash TEXT,
  transcript TEXT,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  status public.asset_status NOT NULL DEFAULT 'PENDING',
  rights_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_assets_user_id ON public.assets(user_id);
CREATE INDEX idx_assets_source_url ON public.assets(source_url);
CREATE UNIQUE INDEX idx_assets_user_source_hash ON public.assets(user_id, source_hash)
  WHERE source_hash IS NOT NULL;

-- RLS
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assets"
  ON public.assets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assets"
  ON public.assets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assets"
  ON public.assets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can do anything (edge functions use service_role key)
CREATE POLICY "Service role full access"
  ON public.assets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

#### SQL: `blueprints` Table
```sql
CREATE TABLE public.blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  analysis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  variations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  token_cost NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_blueprints_asset UNIQUE (asset_id)
);

ALTER TABLE public.blueprints ENABLE ROW LEVEL SECURITY;

-- Users can view blueprints for their own assets
CREATE POLICY "Users can view own blueprints"
  ON public.blueprints FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE assets.id = blueprints.asset_id
        AND assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access"
  ON public.blueprints FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

#### SQL: `renders` Table
```sql
CREATE TABLE public.renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  variation_level INT NOT NULL DEFAULT 2 CHECK (variation_level BETWEEN 1 AND 3),
  actor_id TEXT,
  voice_id TEXT,
  emotional_intensity INT DEFAULT 50 CHECK (emotional_intensity BETWEEN 0 AND 100),
  scenario_prompt TEXT,
  product_image_url TEXT,
  base_image_url TEXT,
  final_video_url TEXT,
  render_cost NUMERIC DEFAULT 0,
  cost_breakdown_json JSONB DEFAULT '{}'::jsonb,
  status public.render_status NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.renders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own renders"
  ON public.renders FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE assets.id = renders.asset_id
        AND assets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE assets.id = renders.asset_id
        AND assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access"
  ON public.renders FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

#### SQL: `jobs` Table (Traceability + Dedupe)
```sql
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  render_id UUID REFERENCES public.renders(id) ON DELETE SET NULL,
  type public.job_type NOT NULL,
  status public.job_status NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  provider_job_id TEXT,
  idempotency_key TEXT NOT NULL,
  cost_json JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_jobs_idempotency ON public.jobs(idempotency_key);
CREATE INDEX idx_jobs_asset ON public.jobs(asset_id);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs"
  ON public.jobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE assets.id = jobs.asset_id
        AND assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access"
  ON public.jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

#### Supabase Storage
```sql
-- Create bucket for video/image/render assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('ugc-assets', 'ugc-assets', false);

-- Users can read own files (path starts with user_id/)
CREATE POLICY "Users can read own files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'ugc-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Service role upload
CREATE POLICY "Service role can manage files"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'ugc-assets')
  WITH CHECK (bucket_id = 'ugc-assets');
```

---

### 1.2 Authentication
- [x] Add auth pages (Login / Signup) with Supabase Auth
- [x] Add protected route wrapper (redirect unauthenticated to `/login`)
- [x] Add user context provider
- [x] Update `AppLayout` to show user email + logout button
- [x] Wire routes: `/login`, `/signup`

> **Ref**: [app-flow-pages-and-roles.md](./app-flow-pages-and-roles.md) — `/login` page, Solo Creator role (MVP)

---

### 1.3 Frontend State Management
- [x] Install Zustand
- [x] Create `assetStore` (current asset + blueprint + status cache)
- [x] Create `studioStore` (render draft: level, actor, voice, intensity, scenario, product)
- [x] Persist drafts to localStorage; DB is source of truth on Save

> **Ref**: Custom knowledge > Zustand Stores section

---

### 1.4 Supabase Client Integration
- [x] Generate TypeScript types from DB schema (`src/integrations/supabase/types.ts`)
- [x] Create helper hooks: `useAssets()`, `useAsset(id)`, `useBlueprint(assetId)`, `useJobs(assetId)`
- [x] Use React Query for server state, Zustand for UI drafts

---

## Phase 2 — Ingesta (Video Ingest Pipeline)

### 2.1 Edge Function: `ingest-asset`
- [x] Create `supabase/functions/ingest-asset/index.ts`
- [x] Accept `{ asset_id }`, validate ownership via JWT
- [x] Check cache: if `source_hash` exists with transcript → skip, return cached
- [x] Create job record with `idempotency_key = download_video:{asset_id}:{source_hash}`
- [x] Call RapidAPI to download TikTok video → upload to Supabase Storage (`ugc-assets/{user_id}/{asset_id}/source.mp4`)
- [x] Save `metadata_json.video_url`, `metadata_json.duration`, `metadata_json.resolution`
- [x] Create job for transcription with `idempotency_key = transcribe:{asset_id}:{source_hash}`
- [x] Call Whisper API → save `transcript` on asset
- [x] Update `assets.status = 'VIDEO_INGESTED'`
- [x] Return updated asset + jobs with costs

#### Secrets Needed
- `RAPIDAPI_KEY` — for TikTok video download ✅ Configured
- `OPENAI_API_KEY` — for Whisper transcription ✅ Configured

#### Idempotency Pattern (edge function pseudocode)
```typescript
// Check existing job by idempotency_key
const { data: existingJob } = await supabase
  .from('jobs')
  .select('*')
  .eq('idempotency_key', key)
  .eq('status', 'DONE')
  .single();

if (existingJob) {
  // Cache hit — skip provider call, return existing result
  return existingJob;
}
```

---

### 2.2 Frontend: Ingest Page (wire to real backend)
- [x] Replace mock `handleAnalyze` with real edge function call
- [x] On submit: create asset via edge function, then call `ingest-asset` function
- [x] Show real cost from `jobs.cost_json`
- [x] On complete: enable "Generate Blueprint" button with link to `/asset/{id}/blueprint`
- [x] Handle errors: show friendly message

> **Ref**: [design-guidelines.md](./design-guidelines.md) — Kindness in error messages, cost transparency

---

### 2.3 Edge Function: `create-asset`
- [x] Create `supabase/functions/create-asset/index.ts`
- [x] Accept `{ source_url, rights_confirmed }`
- [x] Compute `source_hash` from URL (or content hash)
- [x] Check dedupe: same user + same `source_hash` → return existing asset
- [x] Insert asset with `status = 'PENDING'`
- [x] Return created asset

---

### 2.4 Dashboard: Real Data
- [x] Fetch user's assets from Supabase (list with status, created_at)
- [x] Show latest renders count + total cost
- [x] Link each asset row to its current step (blueprint/studio based on status)
- [x] Empty state: "No assets yet. Start by analyzing your first winning video."

> **Ref**: [app-flow-pages-and-roles.md](./app-flow-pages-and-roles.md) — Dashboard shows assets, statuses, costs

---

## Phase 3 — Blueprint (LLM Analysis)

### 3.1 Edge Function: `generate-blueprint`
- [x] Create `supabase/functions/generate-blueprint/index.ts`
- [x] Accept `{ asset_id, force?: boolean }`
- [x] Validate `asset.status >= 'VIDEO_INGESTED'`
- [x] If blueprint exists AND `force !== true` → return 409
- [x] If `force === true` → require UI confirmation (handled client-side), delete old blueprint
- [x] Build Gemini prompt with transcript + visual description
- [x] Call Lovable AI (Gemini) → parse strict JSON via tool calling
- [x] Validate response schema (hook, ángulo, emoción, mecanismo, beats, 3 variaciones, riesgos_politica, sugerencia_mejora_retencion)
- [x] Save to `blueprints` table (analysis_json, variations_json, token_cost)
- [x] Update `assets.status = 'BLUEPRINT_GENERATED'`
- [x] Create job record with cost tracking

#### Secrets Needed
- `GEMINI_API_KEY` — for strategic analysis

#### Blueprint JSON Schema (validation reference)
```typescript
// Expected shape of analysis_json
interface BlueprintAnalysis {
  hook: string;
  angulo_psicologico: string;
  emocion_dominante: string;
  mecanismo_venta: string;
  estructura_beats: Array<{
    timestamp: string;
    tipo: string;
    contenido: string;
  }>;
  riesgos_politica: string[];
  sugerencia_mejora_retencion: string;
}

// Expected shape of variations_json
interface BlueprintVariation {
  nivel: 1 | 2 | 3;
  titulo: string;
  guion: string; // ≤ 55 words
  cambios_clave: string[];
}
// Array of exactly 3 variations
```

---

### 3.2 Frontend: Blueprint Page (wire to real backend)
- [x] Load asset + blueprint from Supabase on mount
- [x] Show transcript in read-only viewer
- [x] "Generate Blueprint" button → calls `generate-blueprint` edge function
- [x] Show loading state with cost estimate before execution
- [x] On success: render analysis, variations, risks, beats
- [x] Show `token_cost` in `CostDisplay`
- [x] "Regenerate" button → calls with `force=true`
- [x] Link to Studio: "Abrir Studio →"

> **Ref**: [design-guidelines.md](./design-guidelines.md) — Confirm modal for re-generation, cost display before execution

---

### 3.3 Blueprint Viewer Component
- [x] Create `BlueprintViewer` component with 3 tabs:
  - **Análisis**: hook, ángulo, emoción, mecanismo, beats timeline, intensidad emocional
  - **Variaciones**: 3 cards with nivel, título, guión, cambios clave, word count + estimated duration
  - **Riesgos**: política warnings + mejora retención suggestion
- [x] Highlight `riesgos_politica` with warning styling
- [x] Each variation card shows word count + estimated duration

---

## Checkpoint: Phase 1–3 Verification

After completing all above:
- [x] Can sign up / login / logout
- [x] Can create asset from URL → see real ingest pipeline progress
- [x] Transcript cached — re-submitting same URL skips Whisper
- [x] Can generate blueprint → see analysis + 3 variations
- [x] Regenerate blueprint requires confirmation modal
- [x] All costs visible at every step
- [x] Dashboard shows real asset list with statuses
- [x] rights_confirmed checkbox persists and gates Nivel 1

---

## Phase 4 — Studio + Drafts ✅

- [x] Studio 3-column layout wired to real renders table
- [x] Zustand studioStore ↔ DB persistence
- [x] Word counter + duration estimator
- [x] Nivel 1 gating by `rights_confirmed`
- [x] Actor picker, voice picker, emotional intensity slider
- [x] Scenario input + product image uploader
- [x] Save draft functionality

### Phase 5 — Base Image Generation ✅

- [x] Visual-faithful generation: Gemini analyzes original video frame during blueprint to produce scene-accurate `escenario_sugerido`
- [x] Reference-based image generation: original video sent as reference to replicate exact composition/distance/lighting with different person
- [x] Lovable AI (gemini-3-pro-image-preview) for image generation
- [x] Image approval flow
- [x] Cost tracking per image
- [x] Storage RLS policies for user uploads

### Phase 6 — Final Render Pipeline ✅

- [x] Edge function `generate-final-video` orchestrates TTS → Video pipeline
- [x] TTS via KIE AI (ElevenLabs text-to-speech-turbo-2-5)
- [x] Image-to-Video via KIE AI (Kling v2.1 Master)
- [x] Polling with progress tracking (step-by-step updates to DB)
- [x] Frontend polling every 5s during RENDERING status
- [x] RenderProgressPanel component with step indicators
- [x] Audio + video download on completion
- [x] Full cost breakdown display
- [x] Idempotency + job tracking

---

## Future Phases

### Phase 7 — LipSync + Audio Merge
- [ ] LipSync integration (Kling 2.6 Motion Control or dedicated API)
- [ ] Merge TTS audio with generated video for synchronized output
- [ ] Update cost breakdown with lipsync costs

### Phase 8 — Batch Mode ("Línea de Producción")
- [ ] Preset builder (actor/voice/intensity/scenario templates)
- [ ] Queue view with per-item cost + status
- [ ] Batch processing with parallel renders

### Phase 9 — Audit & Costs Dashboard
- [ ] Costs endpoint aggregating per stage
- [ ] Cost audit panel in UI
- [ ] Per-asset cost history
