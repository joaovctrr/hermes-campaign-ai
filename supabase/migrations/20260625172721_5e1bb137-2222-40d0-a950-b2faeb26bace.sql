
-- Extensions for cron + http
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Materialized view aggregating news per user
CREATE MATERIALIZED VIEW IF NOT EXISTS public.dashboard_stats AS
SELECT
  user_id,
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS last_24h,
  COUNT(*) FILTER (WHERE urgency = 'alta' AND created_at > now() - interval '24 hours')::int AS critical_24h,
  MAX(created_at) AS last_news_at
FROM public.news_items
GROUP BY user_id;

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_stats_user_id_idx ON public.dashboard_stats(user_id);

-- Security-definer accessor (MVs don't support RLS)
CREATE OR REPLACE FUNCTION public.get_my_dashboard_stats()
RETURNS TABLE(total int, last_24h int, critical_24h int, last_news_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT total, last_24h, critical_24h, last_news_at
  FROM public.dashboard_stats
  WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_dashboard_stats() TO authenticated;

-- Refresh function called by pg_cron
CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.dashboard_stats;
END;
$$;
