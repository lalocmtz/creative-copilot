
-- Add new asset_status enum values
ALTER TYPE asset_status ADD VALUE IF NOT EXISTS 'DOWNLOADING';
ALTER TYPE asset_status ADD VALUE IF NOT EXISTS 'DOWNLOADED';
ALTER TYPE asset_status ADD VALUE IF NOT EXISTS 'TRANSCRIBING';
ALTER TYPE asset_status ADD VALUE IF NOT EXISTS 'UNDERSTANDING';
ALTER TYPE asset_status ADD VALUE IF NOT EXISTS 'VARIANTS_READY';
ALTER TYPE asset_status ADD VALUE IF NOT EXISTS 'IMAGE_READY';
ALTER TYPE asset_status ADD VALUE IF NOT EXISTS 'RENDERING';
ALTER TYPE asset_status ADD VALUE IF NOT EXISTS 'DONE';

-- Add new job_type enum values
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'understand';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'build_variants';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'generate_base_image';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'animate_sora';

-- Add columns to assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS understanding_json jsonb DEFAULT '{}';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS variants_json jsonb DEFAULT '[]';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS credits_estimate_json jsonb DEFAULT '{}';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS error_json jsonb DEFAULT '{}';

-- Add variant_id to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS variant_id text;
