
-- ============================================
-- Phase 1: UGC Scale Engine — Full Schema
-- ============================================

-- 1. Enum Types
CREATE TYPE public.asset_status AS ENUM (
  'PENDING',
  'VIDEO_INGESTED',
  'BLUEPRINT_GENERATED',
  'IMAGE_APPROVED',
  'VIDEO_RENDERED',
  'FAILED'
);

CREATE TYPE public.render_status AS ENUM (
  'DRAFT',
  'IMAGE_GENERATED',
  'IMAGE_APPROVED',
  'RENDERING',
  'DONE',
  'FAILED'
);

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

-- 2. Assets table
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

CREATE INDEX idx_assets_user_id ON public.assets(user_id);
CREATE INDEX idx_assets_source_url ON public.assets(source_url);
CREATE UNIQUE INDEX idx_assets_user_source_hash ON public.assets(user_id, source_hash)
  WHERE source_hash IS NOT NULL;

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assets"
  ON public.assets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assets"
  ON public.assets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assets"
  ON public.assets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on assets"
  ON public.assets FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. Blueprints table
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

CREATE POLICY "Users can view own blueprints"
  ON public.blueprints FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE assets.id = blueprints.asset_id
        AND assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on blueprints"
  ON public.blueprints FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4. Renders table
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
  ON public.renders FOR ALL TO authenticated
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

CREATE POLICY "Service role full access on renders"
  ON public.renders FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5. Jobs table (traceability + dedupe)
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
  ON public.jobs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE assets.id = jobs.asset_id
        AND assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on jobs"
  ON public.jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 6. Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('ugc-assets', 'ugc-assets', false);

CREATE POLICY "Users can read own files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ugc-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Service role can manage files"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'ugc-assets')
  WITH CHECK (bucket_id = 'ugc-assets');
