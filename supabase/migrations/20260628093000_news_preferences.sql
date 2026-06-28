alter table public.profiles
  add column if not exists preferred_news_state text;

create index if not exists news_items_user_source_idx
  on public.news_items(user_id, source);

create index if not exists news_items_user_published_idx
  on public.news_items(user_id, published_at desc);
