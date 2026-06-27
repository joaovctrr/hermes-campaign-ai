-- Legislative memory document RAG
-- Stores uploaded text documents and chunked passages for retrieval.

grant select, insert, update, delete on public.candidate_actions to authenticated;
grant all on public.candidate_actions to service_role;
grant select, insert, update, delete on public.news_briefings to authenticated;
grant all on public.news_briefings to service_role;

create table if not exists public.legislative_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  mime_type text,
  size_bytes integer,
  extracted_text text,
  status text not null default 'processed' check (status in ('processed', 'error')),
  chunk_count integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists legislative_documents_user_created_idx
  on public.legislative_documents(user_id, created_at desc);

grant select, insert, update, delete on public.legislative_documents to authenticated;
grant all on public.legislative_documents to service_role;

alter table public.legislative_documents enable row level security;

drop policy if exists "Users can read own legislative documents" on public.legislative_documents;
create policy "Users can read own legislative documents"
on public.legislative_documents
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own legislative documents" on public.legislative_documents;
create policy "Users can insert own legislative documents"
on public.legislative_documents
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own legislative documents" on public.legislative_documents;
create policy "Users can update own legislative documents"
on public.legislative_documents
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own legislative documents" on public.legislative_documents;
create policy "Users can delete own legislative documents"
on public.legislative_documents
for delete
using (auth.uid() = user_id);

create table if not exists public.legislative_document_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_id uuid not null references public.legislative_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  content_search tsvector generated always as (to_tsvector('portuguese', content)) stored,
  created_at timestamptz not null default now(),
  unique(document_id, chunk_index)
);

create index if not exists legislative_document_chunks_user_idx
  on public.legislative_document_chunks(user_id);

create index if not exists legislative_document_chunks_document_idx
  on public.legislative_document_chunks(document_id, chunk_index);

create index if not exists legislative_document_chunks_search_idx
  on public.legislative_document_chunks using gin(content_search);

grant select, insert, update, delete on public.legislative_document_chunks to authenticated;
grant all on public.legislative_document_chunks to service_role;

alter table public.legislative_document_chunks enable row level security;

drop policy if exists "Users can read own legislative document chunks" on public.legislative_document_chunks;
create policy "Users can read own legislative document chunks"
on public.legislative_document_chunks
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own legislative document chunks" on public.legislative_document_chunks;
create policy "Users can insert own legislative document chunks"
on public.legislative_document_chunks
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own legislative document chunks" on public.legislative_document_chunks;
create policy "Users can update own legislative document chunks"
on public.legislative_document_chunks
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own legislative document chunks" on public.legislative_document_chunks;
create policy "Users can delete own legislative document chunks"
on public.legislative_document_chunks
for delete
using (auth.uid() = user_id);
