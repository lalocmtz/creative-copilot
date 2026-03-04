
CREATE TABLE public.motion_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_url text,
  source_type text NOT NULL DEFAULT 'url',
  video_storage_path text,
  thumbnail_url text,
  transcript text,
  duration_seconds numeric,
  num_variants integer NOT NULL DEFAULT 1,
  blueprint_json jsonb DEFAULT '{}'::jsonb,
  variants_json jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.motion_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own motion projects"
  ON public.motion_projects FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own motion projects"
  ON public.motion_projects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own motion projects"
  ON public.motion_projects FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on motion_projects"
  ON public.motion_projects FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_motion_projects_user_id ON public.motion_projects(user_id);
CREATE INDEX idx_motion_projects_status ON public.motion_projects(status);
