-- Strategic intelligence layer: territory, monitored sources, mentions, alerts and WhatsApp knowledge base.

alter table public.profiles
  add column if not exists political_name text,
  add column if not exists party text,
  add column if not exists electoral_number text,
  add column if not exists target_position text,
  add column if not exists avatar_url text,
  add column if not exists priority_audience text,
  add column if not exists positioning_phrase text,
  add column if not exists monitored_states text[] not null default '{}',
  add column if not exists monitored_cities text[] not null default '{}',
  add column if not exists priority_cities text[] not null default '{}';

create table if not exists public.states (
  id uuid primary key default gen_random_uuid(),
  ibge_id integer unique,
  name text not null,
  uf text not null unique,
  region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  ibge_id integer unique,
  name text not null,
  state_id uuid references public.states(id) on delete cascade,
  uf text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cities_uf_name_idx on public.cities(uf, name);

create table if not exists public.candidate_keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  keyword text not null,
  keyword_type text not null default 'tema',
  theme text,
  weight integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists candidate_keywords_user_active_idx
  on public.candidate_keywords(user_id, active);

create table if not exists public.monitored_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  url text not null,
  source_type text not null default 'portal',
  state text,
  city text,
  theme text,
  priority_level text not null default 'media',
  active boolean not null default true,
  notes text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists monitored_sources_user_active_idx
  on public.monitored_sources(user_id, active);
create unique index if not exists monitored_sources_user_url_key
  on public.monitored_sources(user_id, url);

create table if not exists public.mentions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_name text,
  source_url text,
  source_type text not null default 'web',
  title text not null,
  content_snippet text,
  full_content text,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  state text,
  city text,
  theme text,
  mention_type text not null default 'indireta',
  sentiment text not null default 'neutra',
  urgency text not null default 'baixa',
  relevance_score integer not null default 1,
  risk_score integer not null default 0,
  opportunity_score integer not null default 0,
  is_read boolean not null default false,
  is_archived boolean not null default false,
  is_false_positive boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists mentions_user_collected_idx
  on public.mentions(user_id, collected_at desc);
create index if not exists mentions_user_sentiment_idx
  on public.mentions(user_id, sentiment);
create index if not exists mentions_user_urgency_idx
  on public.mentions(user_id, urgency);
create index if not exists mentions_user_geo_idx
  on public.mentions(user_id, state, city);

create table if not exists public.intelligence_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  source text,
  urgency text not null default 'media',
  alert_type text not null default 'oportunidade',
  related_url text,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists intelligence_alerts_user_open_idx
  on public.intelligence_alerts(user_id, is_resolved, created_at desc);

create table if not exists public.whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  public_phone text,
  provider text not null default 'manual',
  connection_status text not null default 'not_connected',
  llm_provider text not null default 'gemini',
  response_tone text,
  agent_persona text not null default 'assessor',
  response_style text not null default 'acolhedor',
  response_depth text not null default 'curta',
  creativity_level text not null default 'equilibrada',
  agent_instructions text,
  escalation_message text,
  auto_reply_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

alter table public.whatsapp_channels
  add column if not exists agent_persona text not null default 'assessor',
  add column if not exists response_style text not null default 'acolhedor',
  add column if not exists response_depth text not null default 'curta',
  add column if not exists creativity_level text not null default 'equilibrada',
  add column if not exists agent_instructions text;

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel_id uuid references public.whatsapp_channels(id) on delete set null,
  contact_name text,
  contact_phone text,
  inbound_text text not null,
  outbound_text text,
  confidence_score integer not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_user_created_idx
  on public.whatsapp_messages(user_id, created_at desc);

create table if not exists public.telegram_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bot_username text,
  chat_id text,
  connection_status text not null default 'not_connected',
  llm_provider text not null default 'gemini',
  response_tone text,
  agent_persona text not null default 'assessor',
  response_style text not null default 'acolhedor',
  response_depth text not null default 'curta',
  creativity_level text not null default 'equilibrada',
  agent_instructions text,
  escalation_message text,
  auto_reply_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

alter table public.telegram_channels
  add column if not exists agent_persona text not null default 'assessor',
  add column if not exists response_style text not null default 'acolhedor',
  add column if not exists response_depth text not null default 'curta',
  add column if not exists creativity_level text not null default 'equilibrada',
  add column if not exists agent_instructions text;

create table if not exists public.telegram_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel_id uuid references public.telegram_channels(id) on delete set null,
  contact_name text,
  inbound_text text not null,
  outbound_text text,
  confidence_score integer not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create index if not exists telegram_messages_user_created_idx
  on public.telegram_messages(user_id, created_at desc);

alter table public.candidate_keywords enable row level security;
alter table public.monitored_sources enable row level security;
alter table public.mentions enable row level security;
alter table public.intelligence_alerts enable row level security;
alter table public.whatsapp_channels enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.telegram_channels enable row level security;
alter table public.telegram_messages enable row level security;

grant select on public.states, public.cities to authenticated;
grant select, insert, update, delete on public.candidate_keywords to authenticated;
grant select, insert, update, delete on public.monitored_sources to authenticated;
grant select, insert, update, delete on public.mentions to authenticated;
grant select, insert, update on public.intelligence_alerts to authenticated;
grant select, insert, update, delete on public.whatsapp_channels to authenticated;
grant select, insert, update, delete on public.whatsapp_messages to authenticated;
grant select, insert, update, delete on public.telegram_channels to authenticated;
grant select, insert, update, delete on public.telegram_messages to authenticated;
grant all on public.states, public.cities, public.candidate_keywords, public.monitored_sources,
  public.mentions, public.intelligence_alerts, public.whatsapp_channels, public.whatsapp_messages,
  public.telegram_channels, public.telegram_messages
  to service_role;

drop policy if exists "Users manage own candidate keywords" on public.candidate_keywords;
create policy "Users manage own candidate keywords"
on public.candidate_keywords
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own monitored sources" on public.monitored_sources;
create policy "Users manage own monitored sources"
on public.monitored_sources
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own mentions" on public.mentions;
create policy "Users manage own mentions"
on public.mentions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own intelligence alerts" on public.intelligence_alerts;
create policy "Users manage own intelligence alerts"
on public.intelligence_alerts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own whatsapp channels" on public.whatsapp_channels;
create policy "Users manage own whatsapp channels"
on public.whatsapp_channels
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own whatsapp messages" on public.whatsapp_messages;
create policy "Users manage own whatsapp messages"
on public.whatsapp_messages
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own telegram channels" on public.telegram_channels;
create policy "Users manage own telegram channels"
on public.telegram_channels
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own telegram messages" on public.telegram_messages;
create policy "Users manage own telegram messages"
on public.telegram_messages
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
