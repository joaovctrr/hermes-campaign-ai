alter table public.profiles
  add column if not exists trial_ends_at timestamptz,
  add column if not exists has_payment_method boolean not null default false,
  add column if not exists subscription_status text not null default 'trialing',
  add column if not exists max_users integer not null default 3,
  add column if not exists radar_interval_hours integer not null default 12,
  add column if not exists monthly_post_limit integer,
  add column if not exists upload_file_limit integer,
  add column if not exists intelligence_enabled boolean not null default true,
  add column if not exists sentiment_enabled boolean not null default true,
  add column if not exists manual_refresh_enabled boolean not null default false,
  add column if not exists realtime_alerts_enabled boolean not null default false;

create or replace function public.apply_profile_plan_limits()
returns trigger
language plpgsql
as $function$
begin
  if new.plan is null then
    new.plan := 'trial_avancado';
  end if;

  if new.plan = 'trial_avancado' then
    new.max_users := 3;
    new.radar_interval_hours := 12;
    new.monthly_post_limit := 30;
    new.upload_file_limit := 10;
    new.intelligence_enabled := true;
    new.sentiment_enabled := true;
    new.manual_refresh_enabled := false;
    new.realtime_alerts_enabled := false;
    new.subscription_status := coalesce(nullif(new.subscription_status, ''), 'trialing');
    new.trial_ends_at := coalesce(new.trial_ends_at, now() + interval '3 days');
  elsif new.plan = 'basico' then
    new.max_users := 1;
    new.radar_interval_hours := 24;
    new.monthly_post_limit := 3;
    new.upload_file_limit := 1;
    new.intelligence_enabled := false;
    new.sentiment_enabled := false;
    new.manual_refresh_enabled := false;
    new.realtime_alerts_enabled := false;
    new.subscription_status := coalesce(nullif(new.subscription_status, ''), 'active');
  elsif new.plan = 'avancado' then
    new.max_users := 3;
    new.radar_interval_hours := 12;
    new.monthly_post_limit := 30;
    new.upload_file_limit := 10;
    new.intelligence_enabled := true;
    new.sentiment_enabled := true;
    new.manual_refresh_enabled := false;
    new.realtime_alerts_enabled := false;
    new.subscription_status := coalesce(nullif(new.subscription_status, ''), 'active');
  elsif new.plan = 'enterprise' then
    new.max_users := 15;
    new.radar_interval_hours := 6;
    new.monthly_post_limit := null;
    new.upload_file_limit := null;
    new.intelligence_enabled := true;
    new.sentiment_enabled := true;
    new.manual_refresh_enabled := true;
    new.realtime_alerts_enabled := true;
    new.subscription_status := coalesce(nullif(new.subscription_status, ''), 'active');
  else
    new.plan := 'bloqueado';
    new.max_users := 1;
    new.radar_interval_hours := 24;
    new.monthly_post_limit := 0;
    new.upload_file_limit := 0;
    new.intelligence_enabled := false;
    new.sentiment_enabled := false;
    new.manual_refresh_enabled := false;
    new.realtime_alerts_enabled := false;
    new.subscription_status := 'blocked';
  end if;

  return new;
end;
$function$;

drop trigger if exists profiles_apply_plan_limits on public.profiles;
create trigger profiles_apply_plan_limits
before insert or update of plan, trial_ends_at, has_payment_method, subscription_status
on public.profiles
for each row execute function public.apply_profile_plan_limits();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.profiles (id, full_name, plan, trial_ends_at, subscription_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'trial_avancado',
    now() + interval '3 days',
    'trialing'
  );
  return new;
end;
$function$;

create or replace function public.expire_trials_without_payment(_fallback_plan text default 'bloqueado')
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  affected integer;
begin
  update public.profiles
  set
    plan = case when _fallback_plan in ('basico', 'bloqueado') then _fallback_plan else 'bloqueado' end,
    subscription_status = 'trial_expired',
    updated_at = now()
  where plan = 'trial_avancado'
    and has_payment_method = false
    and trial_ends_at is not null
    and trial_ends_at < now();

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

revoke execute on function public.expire_trials_without_payment(text) from public, anon;
grant execute on function public.expire_trials_without_payment(text) to service_role;

update public.profiles
set plan = coalesce(plan, 'trial_avancado')
where plan is null;

update public.profiles
set plan = plan;
