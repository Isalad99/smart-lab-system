-- Make Agent retries safe and recoverable after a connection drop.
-- Run after 003_agent_session_hardening.sql.
-- This migration is additive and does not delete application data.

ALTER TABLE public.lab_access_logs
    ADD COLUMN IF NOT EXISTS client_session_id text;

ALTER TABLE public.program_usage_logs
    ADD COLUMN IF NOT EXISTS event_id text;

ALTER TABLE public.usage_violations
    ADD COLUMN IF NOT EXISTS event_id text;

-- A client_session_id is reused when the start-session response is lost, so
-- the Backend can return the already-created session instead of inserting a
-- second one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_access_logs_client_session_id
    ON public.lab_access_logs (client_session_id)
    WHERE client_session_id IS NOT NULL
      AND btrim(client_session_id) <> '';

-- Usage and violation requests may be retried after a timeout. The event id
-- makes those retries idempotent and prevents duplicate audit rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_program_usage_logs_event_id
    ON public.program_usage_logs (event_id)
    WHERE event_id IS NOT NULL
      AND btrim(event_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_usage_violations_event_id
    ON public.usage_violations (event_id)
    WHERE event_id IS NOT NULL
      AND btrim(event_id) <> '';
