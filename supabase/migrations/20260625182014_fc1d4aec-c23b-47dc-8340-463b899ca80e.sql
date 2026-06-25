
ALTER TABLE public.social_mentions
  ADD COLUMN IF NOT EXISTS parent_post_id text,
  ADD COLUMN IF NOT EXISTS parent_post_url text,
  ADD COLUMN IF NOT EXISTS parent_post_caption text,
  ADD COLUMN IF NOT EXISTS parent_post_thumbnail text;

CREATE TABLE IF NOT EXISTS public.insight_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_text text NOT NULL,
  recommendation_hash text NOT NULL,
  context_window text NOT NULL CHECK (context_window IN ('24h','7d')),
  useful boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recommendation_hash)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_feedback TO authenticated;
GRANT ALL ON public.insight_feedback TO service_role;
ALTER TABLE public.insight_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own feedback all" ON public.insight_feedback FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS insight_feedback_user_created_idx
  ON public.insight_feedback (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.insight_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_kind text NOT NULL CHECK (window_kind IN ('24h','7d')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  sentiment_trend text,
  positivo_pct integer NOT NULL DEFAULT 0,
  neutro_pct integer NOT NULL DEFAULT 0,
  negativo_pct integer NOT NULL DEFAULT 0,
  total_mentions integer NOT NULL DEFAULT 0,
  top_themes jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  refresh_source text NOT NULL DEFAULT 'manual'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_history TO authenticated;
GRANT ALL ON public.insight_history TO service_role;
ALTER TABLE public.insight_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own insight history all" ON public.insight_history FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS insight_history_user_generated_idx
  ON public.insight_history (user_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS public.cron_run_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hook text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  users_total integer NOT NULL DEFAULT 0,
  users_processed integer NOT NULL DEFAULT 0,
  users_skipped integer NOT NULL DEFAULT 0,
  error text
);
GRANT ALL ON public.cron_run_logs TO service_role;
ALTER TABLE public.cron_run_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cron_user_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.cron_run_logs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hook text NOT NULL,
  action text NOT NULL,
  reason text,
  interval_hours integer,
  plan text,
  inserted_count integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cron_user_logs TO authenticated;
GRANT ALL ON public.cron_user_logs TO service_role;
ALTER TABLE public.cron_user_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cron user logs read" ON public.cron_user_logs FOR SELECT
  USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS cron_user_logs_user_created_idx
  ON public.cron_user_logs (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_my_cron_history(_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  run_id uuid,
  hook text,
  action text,
  reason text,
  interval_hours integer,
  plan text,
  inserted_count integer,
  error text,
  created_at timestamptz,
  run_started_at timestamptz,
  run_status text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cul.id, cul.run_id, cul.hook, cul.action, cul.reason,
         cul.interval_hours, cul.plan, cul.inserted_count, cul.error,
         cul.created_at, crl.started_at, crl.status
  FROM public.cron_user_logs cul
  LEFT JOIN public.cron_run_logs crl ON crl.id = cul.run_id
  WHERE cul.user_id = auth.uid()
  ORDER BY cul.created_at DESC
  LIMIT COALESCE(_limit, 50);
$$;
GRANT EXECUTE ON FUNCTION public.get_my_cron_history(integer) TO authenticated;
