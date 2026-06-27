-- Legislative memory + strategic briefings
-- Adds structured candidate history and generated briefing records.

create table if not exists public.candidate_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null,
  title text not null,
  description text,
  theme text,
  source text,
  source_url text,
  action_date date,
  legislature text,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists candidate_actions_user_id_idx
  on public.candidate_actions(user_id);

create index if not exists candidate_actions_theme_idx
  on public.candidate_actions(user_id, theme);

create index if not exists candidate_actions_keywords_idx
  on public.candidate_actions using gin(keywords);

alter table public.candidate_actions enable row level security;

drop policy if exists "Users can read own candidate actions" on public.candidate_actions;
create policy "Users can read own candidate actions"
on public.candidate_actions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own candidate actions" on public.candidate_actions;
create policy "Users can insert own candidate actions"
on public.candidate_actions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own candidate actions" on public.candidate_actions;
create policy "Users can update own candidate actions"
on public.candidate_actions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own candidate actions" on public.candidate_actions;
create policy "Users can delete own candidate actions"
on public.candidate_actions
for delete
using (auth.uid() = user_id);

create table if not exists public.news_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  news_item_id uuid not null references public.news_items(id) on delete cascade,
  relevance_score int not null default 0 check (relevance_score between 0 and 100),
  connection_level text check (connection_level in ('nenhuma', 'fraca', 'media', 'forte')),
  candidate_connection text,
  suggested_angles text[] not null default '{}',
  cautions text[] not null default '{}',
  next_step text,
  telegram_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, news_item_id)
);

create index if not exists news_briefings_user_id_idx
  on public.news_briefings(user_id);

create index if not exists news_briefings_news_item_id_idx
  on public.news_briefings(news_item_id);

alter table public.news_briefings enable row level security;

drop policy if exists "Users can read own news briefings" on public.news_briefings;
create policy "Users can read own news briefings"
on public.news_briefings
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own news briefings" on public.news_briefings;
create policy "Users can insert own news briefings"
on public.news_briefings
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own news briefings" on public.news_briefings;
create policy "Users can update own news briefings"
on public.news_briefings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own news briefings" on public.news_briefings;
create policy "Users can delete own news briefings"
on public.news_briefings
for delete
using (auth.uid() = user_id);
