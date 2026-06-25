
-- get_my_dashboard_stats: switch to SECURITY INVOKER; grant SELECT on MV to authenticated (filtered by auth.uid() inside fn)
GRANT SELECT ON public.dashboard_stats TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_dashboard_stats()
 RETURNS TABLE(total integer, last_24h integer, critical_24h integer, last_news_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT total, last_24h, critical_24h, last_news_at
  FROM public.dashboard_stats
  WHERE user_id = auth.uid();
$function$;

REVOKE EXECUTE ON FUNCTION public.get_my_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dashboard_stats() TO authenticated;

-- get_my_cron_history: switch to SECURITY INVOKER; ensure cron_run_logs is readable only via join from user's own cron_user_logs
CREATE POLICY "Users can read their referenced cron runs"
ON public.cron_run_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cron_user_logs cul
    WHERE cul.run_id = cron_run_logs.id AND cul.user_id = auth.uid()
  )
);

GRANT SELECT ON public.cron_run_logs TO authenticated;
GRANT SELECT ON public.cron_user_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_cron_history(_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, run_id uuid, hook text, action text, reason text, interval_hours integer, plan text, inserted_count integer, error text, created_at timestamp with time zone, run_started_at timestamp with time zone, run_status text)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT cul.id, cul.run_id, cul.hook, cul.action, cul.reason,
         cul.interval_hours, cul.plan, cul.inserted_count, cul.error,
         cul.created_at, crl.started_at, crl.status
  FROM public.cron_user_logs cul
  LEFT JOIN public.cron_run_logs crl ON crl.id = cul.run_id
  WHERE cul.user_id = auth.uid()
  ORDER BY cul.created_at DESC
  LIMIT COALESCE(_limit, 50);
$function$;

REVOKE EXECUTE ON FUNCTION public.get_my_cron_history(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_cron_history(integer) TO authenticated;
