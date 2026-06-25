
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monitored_networks text[] NOT NULL DEFAULT ARRAY['instagram','twitter','tiktok','facebook']::text[],
  ADD COLUMN IF NOT EXISTS cron_interval_hours integer NOT NULL DEFAULT 6;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_cron_interval_hours_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cron_interval_hours_check CHECK (cron_interval_hours IN (6, 12, 24));
