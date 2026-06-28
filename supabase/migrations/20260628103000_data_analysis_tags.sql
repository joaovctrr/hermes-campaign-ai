alter table public.news_items
  add column if not exists sentiment text,
  add column if not exists geography text,
  add column if not exists relevance_score integer not null default 1,
  add column if not exists author text;

alter table public.social_mentions
  add column if not exists theme text,
  add column if not exists geography text,
  add column if not exists relevance_score integer not null default 1,
  add column if not exists crisis_alert boolean not null default false;

create index if not exists news_items_user_theme_idx
  on public.news_items(user_id, theme);

create index if not exists news_items_user_sentiment_idx
  on public.news_items(user_id, sentiment);

create index if not exists news_items_user_geography_idx
  on public.news_items(user_id, geography);

create index if not exists social_mentions_user_theme_idx
  on public.social_mentions(user_id, theme);

create index if not exists social_mentions_user_geography_idx
  on public.social_mentions(user_id, geography);

create index if not exists social_mentions_user_crisis_idx
  on public.social_mentions(user_id, crisis_alert)
  where crisis_alert = true;
