-- Add versioned Agent policy matching and evidence fields.
-- Run after 005_point_system.sql and before deploying the
-- matching changes in the Backend or Windows Agent.
-- This migration is additive and does not delete existing data.

ALTER TABLE public.blacklisted_apps
    ADD COLUMN IF NOT EXISTS match_type text NOT NULL DEFAULT 'process_name_or_title',
    ADD COLUMN IF NOT EXISTS match_value text,
    ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Existing rows used app_name as both their display name and detection value.
UPDATE public.blacklisted_apps
SET match_value = app_name
WHERE match_value IS NULL OR btrim(match_value) = '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'blacklisted_apps_match_type_check'
          AND conrelid = 'public.blacklisted_apps'::regclass
    ) THEN
        ALTER TABLE public.blacklisted_apps
            ADD CONSTRAINT blacklisted_apps_match_type_check
            CHECK (match_type IN (
                'process_name',
                'process_name_or_title',
                'exe_path',
                'window_title'
            ))
            NOT VALID;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_blacklisted_apps_enabled
    ON public.blacklisted_apps (enabled, id);

ALTER TABLE public.usage_violations
    ADD COLUMN IF NOT EXISTS process_name text,
    ADD COLUMN IF NOT EXISTS exe_path text,
    ADD COLUMN IF NOT EXISTS window_title text,
    ADD COLUMN IF NOT EXISTS detection_source text,
    ADD COLUMN IF NOT EXISTS policy_version text,
    ADD COLUMN IF NOT EXISTS matched_rule_id bigint;

CREATE INDEX IF NOT EXISTS idx_usage_violations_detection_source
    ON public.usage_violations (detection_source, detected_at);
