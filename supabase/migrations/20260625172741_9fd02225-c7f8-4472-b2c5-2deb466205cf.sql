
-- Hide MV from the Data API
REVOKE ALL ON public.dashboard_stats FROM anon, authenticated, PUBLIC;

-- Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.get_my_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dashboard_stats() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_stats() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
