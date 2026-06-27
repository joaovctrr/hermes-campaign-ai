create extension if not exists vector;

create table if not exists public.legislative_memory_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('manual', 'camara', 'document')),
  action_id uuid references public.candidate_actions(id) on delete cascade,
  document_id uuid references public.legislative_documents(id) on delete cascade,
  title text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(768),
  content_search tsvector generated always as (to_tsvector('portuguese', title || ' ' || content)) stored,
  created_at timestamp with time zone not null default now()
);

create index if not exists legislative_memory_chunks_user_created_idx
  on public.legislative_memory_chunks(user_id, created_at desc);

create index if not exists legislative_memory_chunks_source_idx
  on public.legislative_memory_chunks(user_id, source_type);

create index if not exists legislative_memory_chunks_search_idx
  on public.legislative_memory_chunks using gin(content_search);

create index if not exists legislative_memory_chunks_embedding_hnsw_idx
  on public.legislative_memory_chunks
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

grant select, insert, update, delete on public.legislative_memory_chunks to authenticated;
grant all on public.legislative_memory_chunks to service_role;

alter table public.legislative_memory_chunks enable row level security;

drop policy if exists "Users can read own legislative memory chunks" on public.legislative_memory_chunks;
create policy "Users can read own legislative memory chunks"
on public.legislative_memory_chunks
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own legislative memory chunks" on public.legislative_memory_chunks;
create policy "Users can insert own legislative memory chunks"
on public.legislative_memory_chunks
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own legislative memory chunks" on public.legislative_memory_chunks;
create policy "Users can update own legislative memory chunks"
on public.legislative_memory_chunks
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own legislative memory chunks" on public.legislative_memory_chunks;
create policy "Users can delete own legislative memory chunks"
on public.legislative_memory_chunks
for delete to authenticated
using (auth.uid() = user_id);

create or replace function public.match_legislative_memory(
  _user_id uuid,
  _query_embedding vector(768),
  _match_count integer default 8,
  _min_similarity double precision default 0.35
)
returns table (
  id uuid,
  source_type text,
  title text,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    lmc.id,
    lmc.source_type,
    lmc.title,
    lmc.content,
    lmc.metadata,
    1 - (lmc.embedding <=> _query_embedding) as similarity
  from public.legislative_memory_chunks lmc
  where lmc.user_id = _user_id
    and lmc.embedding is not null
    and 1 - (lmc.embedding <=> _query_embedding) >= coalesce(_min_similarity, 0.35)
  order by lmc.embedding <=> _query_embedding
  limit coalesce(_match_count, 8);
$function$;

revoke execute on function public.match_legislative_memory(uuid, vector, integer, double precision) from public, anon;
grant execute on function public.match_legislative_memory(uuid, vector, integer, double precision) to authenticated;
