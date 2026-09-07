-- Harden Agent sessions for one-user/one-device-per-session tracking.
-- Run after 001_usage_violations.sql and 002_session_device_identity.sql.
-- This migration is additive and does not delete application data.

ALTER TABLE public.lab_access_logs
    ADD COLUMN IF NOT EXISTS session_status text,
    ADD COLUMN IF NOT EXISTS end_reason text,
    ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

-- Normalize older rows before enforcing the lifecycle default and nullability.
UPDATE public.lab_access_logs
SET session_status = CASE
    WHEN exit_time IS NULL THEN 'active'
    ELSE 'completed'
END
WHERE session_status IS NULL;

ALTER TABLE public.lab_access_logs
    ALTER COLUMN session_status SET DEFAULT 'active',
    ALTER COLUMN session_status SET NOT NULL;

-- A session without a user cannot be included in the lab usage report.
-- Keep the migration safe for older databases that may still contain such rows.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.lab_access_logs
        WHERE user_id IS NULL
    ) THEN
        ALTER TABLE public.lab_access_logs
            ALTER COLUMN user_id SET NOT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'lab_access_logs_session_status_check'
          AND conrelid = 'public.lab_access_logs'::regclass
    ) THEN
        ALTER TABLE public.lab_access_logs
            ADD CONSTRAINT lab_access_logs_session_status_check
            CHECK (session_status IN ('active', 'completed', 'abandoned'))
            NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'lab_access_logs_session_time_check'
          AND conrelid = 'public.lab_access_logs'::regclass
    ) THEN
        ALTER TABLE public.lab_access_logs
            ADD CONSTRAINT lab_access_logs_session_time_check
            CHECK (
                (session_status = 'active' AND exit_time IS NULL)
                OR (session_status IN ('completed', 'abandoned') AND exit_time IS NOT NULL)
            )
            NOT VALID;
    END IF;
END $$;

-- Database-level guardrails for the agreed session model.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_session_per_user
    ON public.lab_access_logs (user_id)
    WHERE session_status = 'active' AND exit_time IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_session_per_mac
    ON public.lab_access_logs (lower(btrim(device_mac)))
    WHERE session_status = 'active'
      AND exit_time IS NULL
      AND device_mac IS NOT NULL
      AND btrim(device_mac) <> '';

-- Foreign-key indexes used by session joins and daily reports.
CREATE INDEX IF NOT EXISTS idx_ban_records_user_id
    ON public.ban_records (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_lab_id
    ON public.bookings (lab_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id
    ON public.bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_lab_id
    ON public.class_schedules (lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_access_logs_lab_id
    ON public.lab_access_logs (lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_access_logs_user_id
    ON public.lab_access_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_user_id
    ON public.point_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_students_user_id
    ON public.students (user_id);
CREATE INDEX IF NOT EXISTS idx_usage_violations_program_usage_log_id
    ON public.usage_violations (program_usage_log_id);
CREATE INDEX IF NOT EXISTS idx_user_passport_user_id
    ON public.user_passport (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id
    ON public.user_roles (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id
    ON public.role_permissions (permission_id);

-- Access patterns for heartbeat cleanup and daily usage reports.
CREATE INDEX IF NOT EXISTS idx_lab_access_logs_active_heartbeat
    ON public.lab_access_logs (last_heartbeat_at)
    WHERE session_status = 'active' AND exit_time IS NULL;
CREATE INDEX IF NOT EXISTS idx_lab_access_logs_daily_report
    ON public.lab_access_logs (lab_id, entry_time, user_id);
CREATE INDEX IF NOT EXISTS idx_program_usage_logs_daily_report
    ON public.program_usage_logs (usage_start_time, lab_access_log_id);

-- Prevent negative durations while allowing existing invalid rows to be reviewed.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'program_usage_logs_duration_nonnegative_check'
          AND conrelid = 'public.program_usage_logs'::regclass
    ) THEN
        ALTER TABLE public.program_usage_logs
            ADD CONSTRAINT program_usage_logs_duration_nonnegative_check
            CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
            NOT VALID;
    END IF;
END $$;
