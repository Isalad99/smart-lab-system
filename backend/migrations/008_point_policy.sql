-- Admin-managed point rules used by the API and booking restrictions.
-- Run after 007_point_requests.sql.
-- This migration is additive and does not rewrite point history.

CREATE TABLE IF NOT EXISTS public.point_policies (
    id integer PRIMARY KEY DEFAULT 1,
    daily_bonus integer NOT NULL DEFAULT 1,
    complete_session integer NOT NULL DEFAULT 2,
    no_show integer NOT NULL DEFAULT -5,
    forbidden_app integer NOT NULL DEFAULT -10,
    late_cancel integer NOT NULL DEFAULT -3,
    point_request_amount integer NOT NULL DEFAULT 10,
    booking_min_points integer NOT NULL DEFAULT 80,
    warning_threshold integer NOT NULL DEFAULT 20,
    ban_level_1_below integer NOT NULL DEFAULT 20,
    ban_level_1_days integer NOT NULL DEFAULT 30,
    ban_level_2_below integer NOT NULL DEFAULT 40,
    ban_level_2_days integer NOT NULL DEFAULT 7,
    ban_level_3_below integer NOT NULL DEFAULT 60,
    ban_level_3_days integer NOT NULL DEFAULT 5,
    ban_level_4_below integer NOT NULL DEFAULT 80,
    ban_level_4_days integer NOT NULL DEFAULT 2,
    updated_by integer REFERENCES public.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.point_policies
    ADD COLUMN IF NOT EXISTS daily_bonus integer,
    ADD COLUMN IF NOT EXISTS complete_session integer,
    ADD COLUMN IF NOT EXISTS no_show integer,
    ADD COLUMN IF NOT EXISTS forbidden_app integer,
    ADD COLUMN IF NOT EXISTS late_cancel integer,
    ADD COLUMN IF NOT EXISTS point_request_amount integer,
    ADD COLUMN IF NOT EXISTS booking_min_points integer,
    ADD COLUMN IF NOT EXISTS warning_threshold integer,
    ADD COLUMN IF NOT EXISTS ban_level_1_below integer,
    ADD COLUMN IF NOT EXISTS ban_level_1_days integer,
    ADD COLUMN IF NOT EXISTS ban_level_2_below integer,
    ADD COLUMN IF NOT EXISTS ban_level_2_days integer,
    ADD COLUMN IF NOT EXISTS ban_level_3_below integer,
    ADD COLUMN IF NOT EXISTS ban_level_3_days integer,
    ADD COLUMN IF NOT EXISTS ban_level_4_below integer,
    ADD COLUMN IF NOT EXISTS ban_level_4_days integer,
    ADD COLUMN IF NOT EXISTS updated_by integer,
    ADD COLUMN IF NOT EXISTS created_at timestamptz,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.point_policies
SET daily_bonus = CASE WHEN daily_bonus BETWEEN 0 AND 10 THEN daily_bonus ELSE 1 END,
    complete_session = CASE WHEN complete_session BETWEEN 0 AND 20 THEN complete_session ELSE 2 END,
    no_show = CASE WHEN no_show BETWEEN -100 AND 0 THEN no_show ELSE -5 END,
    forbidden_app = CASE WHEN forbidden_app BETWEEN -100 AND 0 THEN forbidden_app ELSE -10 END,
    late_cancel = CASE WHEN late_cancel BETWEEN -100 AND 0 THEN late_cancel ELSE -3 END,
    point_request_amount = CASE WHEN point_request_amount BETWEEN 1 AND 100 THEN point_request_amount ELSE 10 END,
    booking_min_points = CASE WHEN booking_min_points BETWEEN 1 AND 100 THEN booking_min_points ELSE 80 END,
    warning_threshold = CASE WHEN warning_threshold BETWEEN 0 AND 100 THEN warning_threshold ELSE 20 END,
    ban_level_1_below = CASE WHEN ban_level_1_below BETWEEN 1 AND 100 THEN ban_level_1_below ELSE 20 END,
    ban_level_1_days = CASE WHEN ban_level_1_days BETWEEN 0 AND 365 THEN ban_level_1_days ELSE 30 END,
    ban_level_2_below = CASE WHEN ban_level_2_below BETWEEN 1 AND 100 THEN ban_level_2_below ELSE 40 END,
    ban_level_2_days = CASE WHEN ban_level_2_days BETWEEN 0 AND 365 THEN ban_level_2_days ELSE 7 END,
    ban_level_3_below = CASE WHEN ban_level_3_below BETWEEN 1 AND 100 THEN ban_level_3_below ELSE 60 END,
    ban_level_3_days = CASE WHEN ban_level_3_days BETWEEN 0 AND 365 THEN ban_level_3_days ELSE 5 END,
    ban_level_4_below = CASE WHEN ban_level_4_below BETWEEN 1 AND 100 THEN ban_level_4_below ELSE 80 END,
    ban_level_4_days = CASE WHEN ban_level_4_days BETWEEN 0 AND 365 THEN ban_level_4_days ELSE 2 END,
    created_at = COALESCE(created_at, now()),
    updated_at = COALESCE(updated_at, now());

ALTER TABLE public.point_policies
    ALTER COLUMN id SET DEFAULT 1,
    ALTER COLUMN daily_bonus SET DEFAULT 1,
    ALTER COLUMN complete_session SET DEFAULT 2,
    ALTER COLUMN no_show SET DEFAULT -5,
    ALTER COLUMN forbidden_app SET DEFAULT -10,
    ALTER COLUMN late_cancel SET DEFAULT -3,
    ALTER COLUMN point_request_amount SET DEFAULT 10,
    ALTER COLUMN booking_min_points SET DEFAULT 80,
    ALTER COLUMN warning_threshold SET DEFAULT 20,
    ALTER COLUMN ban_level_1_below SET DEFAULT 20,
    ALTER COLUMN ban_level_1_days SET DEFAULT 30,
    ALTER COLUMN ban_level_2_below SET DEFAULT 40,
    ALTER COLUMN ban_level_2_days SET DEFAULT 7,
    ALTER COLUMN ban_level_3_below SET DEFAULT 60,
    ALTER COLUMN ban_level_3_days SET DEFAULT 5,
    ALTER COLUMN ban_level_4_below SET DEFAULT 80,
    ALTER COLUMN ban_level_4_days SET DEFAULT 2,
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.point_policies
    ALTER COLUMN daily_bonus SET NOT NULL,
    ALTER COLUMN complete_session SET NOT NULL,
    ALTER COLUMN no_show SET NOT NULL,
    ALTER COLUMN forbidden_app SET NOT NULL,
    ALTER COLUMN late_cancel SET NOT NULL,
    ALTER COLUMN point_request_amount SET NOT NULL,
    ALTER COLUMN booking_min_points SET NOT NULL,
    ALTER COLUMN warning_threshold SET NOT NULL,
    ALTER COLUMN ban_level_1_below SET NOT NULL,
    ALTER COLUMN ban_level_1_days SET NOT NULL,
    ALTER COLUMN ban_level_2_below SET NOT NULL,
    ALTER COLUMN ban_level_2_days SET NOT NULL,
    ALTER COLUMN ban_level_3_below SET NOT NULL,
    ALTER COLUMN ban_level_3_days SET NOT NULL,
    ALTER COLUMN ban_level_4_below SET NOT NULL,
    ALTER COLUMN ban_level_4_days SET NOT NULL,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;

INSERT INTO public.point_policies (
    id,
    daily_bonus,
    complete_session,
    no_show,
    forbidden_app,
    late_cancel,
    point_request_amount,
    booking_min_points,
    warning_threshold,
    ban_level_1_below,
    ban_level_1_days,
    ban_level_2_below,
    ban_level_2_days,
    ban_level_3_below,
    ban_level_3_days,
    ban_level_4_below,
    ban_level_4_days
)
VALUES (1, 1, 2, -5, -10, -3, 10, 80, 20, 20, 30, 40, 7, 60, 5, 80, 2)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'point_policies_singleton_check'
          AND conrelid = 'public.point_policies'::regclass
    ) THEN
        ALTER TABLE public.point_policies
            ADD CONSTRAINT point_policies_singleton_check
            CHECK (id = 1)
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'point_policies_value_ranges_check'
          AND conrelid = 'public.point_policies'::regclass
    ) THEN
        ALTER TABLE public.point_policies
            ADD CONSTRAINT point_policies_value_ranges_check
            CHECK (
                daily_bonus BETWEEN 0 AND 10
                AND complete_session BETWEEN 0 AND 20
                AND no_show BETWEEN -100 AND 0
                AND forbidden_app BETWEEN -100 AND 0
                AND late_cancel BETWEEN -100 AND 0
                AND point_request_amount BETWEEN 1 AND 100
                AND booking_min_points BETWEEN 1 AND 100
                AND warning_threshold BETWEEN 0 AND 100
                AND ban_level_1_below BETWEEN 1 AND 100
                AND ban_level_1_days BETWEEN 0 AND 365
                AND ban_level_2_below BETWEEN 1 AND 100
                AND ban_level_2_days BETWEEN 0 AND 365
                AND ban_level_3_below BETWEEN 1 AND 100
                AND ban_level_3_days BETWEEN 0 AND 365
                AND ban_level_4_below BETWEEN 1 AND 100
                AND ban_level_4_days BETWEEN 0 AND 365
            )
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'point_policies_threshold_order_check'
          AND conrelid = 'public.point_policies'::regclass
    ) THEN
        ALTER TABLE public.point_policies
            ADD CONSTRAINT point_policies_threshold_order_check
            CHECK (
                ban_level_1_below < ban_level_2_below
                AND ban_level_2_below < ban_level_3_below
                AND ban_level_3_below < ban_level_4_below
                AND warning_threshold < booking_min_points
                AND ban_level_4_below <= booking_min_points
            )
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'point_policies_updated_by_fkey'
          AND conrelid = 'public.point_policies'::regclass
    ) THEN
        ALTER TABLE public.point_policies
            ADD CONSTRAINT point_policies_updated_by_fkey
            FOREIGN KEY (updated_by) REFERENCES public.users(id);
    END IF;
END $$;
