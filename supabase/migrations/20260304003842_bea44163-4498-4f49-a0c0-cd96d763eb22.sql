
-- New job_status enum values for retry/queue system
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'RETRY_SCHEDULED';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'DELAYED_PROVIDER_DEGRADED';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'FAILED_FATAL';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'FAILED_PROVIDER';

-- Circuit breaker: provider status table
CREATE TABLE IF NOT EXISTS public.provider_status (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'OK',
  degraded_until TIMESTAMPTZ,
  failure_count INT NOT NULL DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on provider_status" ON public.provider_status FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Credit reservations table
CREATE TABLE IF NOT EXISTS public.credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credits INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'RESERVED',
  job_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on credit_reservations" ON public.credit_reservations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view own reservations" ON public.credit_reservations FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Seed default provider
INSERT INTO public.provider_status (provider, status) VALUES ('kie', 'OK') ON CONFLICT DO NOTHING;
