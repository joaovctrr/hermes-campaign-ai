-- ============================================================================
-- Informa Ágora — schema de aplicação no db_agora (Postgres próprio)
-- Substitui o schema Supabase. SEM RLS (autorização é feita na aplicação,
-- filtrando por user_id explicitamente). SEM auth.users — a identidade passa
-- a ser a tabela "user" gerada pelo better-auth (schema public).
--
-- ORDEM DE APLICAÇÃO:
--   1) Rodar o better-auth primeiro para criar public."user"/"session"/
--      "account"/"verification"  (npx @better-auth/cli migrate).
--   2) Aplicar este arquivo:  psql "$DATABASE_URL" -f db/migrations/0001_app_schema.sql
--
-- Ids de usuário são TEXT (default do better-auth). Os uuids antigos do
-- Supabase continuam válidos como texto na migração de dados.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS app;

-- updated_at trigger (puro, sem dependência de auth)
CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ---------------------------------------------------------------------------
-- profiles (raiz multi-tenant; 1:1 com o usuário)
-- ---------------------------------------------------------------------------
CREATE TABLE app.profiles (
  id TEXT PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  full_name TEXT,
  political_role TEXT,
  region TEXT,
  bio TEXT,
  tone TEXT,
  monitored_themes TEXT[] DEFAULT ARRAY[]::TEXT[],
  onboarded BOOLEAN NOT NULL DEFAULT false,
  plan TEXT NOT NULL DEFAULT 'basico',
  instagram_handle TEXT,
  twitter_handle TEXT,
  tiktok_handle TEXT,
  facebook_handle TEXT,
  mention_keywords TEXT[] DEFAULT ARRAY[]::TEXT[],
  monitored_networks TEXT[] NOT NULL DEFAULT ARRAY['instagram','twitter','tiktok','facebook']::TEXT[],
  cron_interval_hours INTEGER NOT NULL DEFAULT 6 CHECK (cron_interval_hours IN (6, 12, 24)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER profiles_touch BEFORE UPDATE ON app.profiles
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- news_items
-- ---------------------------------------------------------------------------
CREATE TABLE app.news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source TEXT,
  url TEXT,
  summary TEXT,
  theme TEXT,
  urgency TEXT NOT NULL DEFAULT 'baixa',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX news_items_user_created_idx ON app.news_items(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- generated_posts
-- ---------------------------------------------------------------------------
CREATE TABLE app.generated_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  news_item_id UUID REFERENCES app.news_items(id) ON DELETE SET NULL,
  format TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX generated_posts_user_created_idx ON app.generated_posts(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- social_mentions
-- ---------------------------------------------------------------------------
CREATE TABLE app.social_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  network TEXT NOT NULL CHECK (network IN ('instagram','twitter','tiktok','facebook')),
  source_type TEXT NOT NULL DEFAULT 'comment',
  external_id TEXT,
  author TEXT,
  content TEXT NOT NULL,
  url TEXT,
  sentiment TEXT NOT NULL DEFAULT 'neutro' CHECK (sentiment IN ('positivo','neutro','negativo')),
  score NUMERIC(4,3) DEFAULT 0,
  posted_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  parent_post_id TEXT,
  parent_post_url TEXT,
  parent_post_caption TEXT,
  parent_post_thumbnail TEXT,
  UNIQUE (user_id, network, external_id)
);
CREATE INDEX idx_social_mentions_user_collected ON app.social_mentions (user_id, collected_at DESC);
CREATE INDEX idx_social_mentions_user_network ON app.social_mentions (user_id, network);

-- ---------------------------------------------------------------------------
-- sentiment_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE app.sentiment_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL DEFAULT now(),
  total INT NOT NULL DEFAULT 0,
  positivo INT NOT NULL DEFAULT 0,
  neutro INT NOT NULL DEFAULT 0,
  negativo INT NOT NULL DEFAULT 0,
  networks JSONB NOT NULL DEFAULT '{}'::jsonb,
  top_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_snapshots_user_created ON app.sentiment_snapshots (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- insight_feedback
-- ---------------------------------------------------------------------------
CREATE TABLE app.insight_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  recommendation_text TEXT NOT NULL,
  recommendation_hash TEXT NOT NULL,
  context_window TEXT NOT NULL CHECK (context_window IN ('24h','7d')),
  useful BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, recommendation_hash)
);
CREATE INDEX insight_feedback_user_created_idx ON app.insight_feedback (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- insight_history
-- ---------------------------------------------------------------------------
CREATE TABLE app.insight_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  window_kind TEXT NOT NULL CHECK (window_kind IN ('24h','7d')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sentiment_trend TEXT,
  positivo_pct INTEGER NOT NULL DEFAULT 0,
  neutro_pct INTEGER NOT NULL DEFAULT 0,
  negativo_pct INTEGER NOT NULL DEFAULT 0,
  total_mentions INTEGER NOT NULL DEFAULT 0,
  top_themes JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  refresh_source TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX insight_history_user_generated_idx ON app.insight_history (user_id, generated_at DESC);

-- ---------------------------------------------------------------------------
-- cron logs
-- ---------------------------------------------------------------------------
CREATE TABLE app.cron_run_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hook TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  users_total INTEGER NOT NULL DEFAULT 0,
  users_processed INTEGER NOT NULL DEFAULT 0,
  users_skipped INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE app.cron_user_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES app.cron_run_logs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  hook TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  interval_hours INTEGER,
  plan TEXT,
  inserted_count INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cron_user_logs_user_created_idx ON app.cron_user_logs (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- user_roles (RBAC — has_role passa a ser query na aplicação)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE app.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE app.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  role app.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- ---------------------------------------------------------------------------
-- dashboard_stats — materialized view agregando news por usuário.
-- Sem RLS; a aplicação filtra por user_id na leitura. Refresh disparado
-- pela aplicação (scheduler externo -> rota de hook), não mais por pg_cron.
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW app.dashboard_stats AS
SELECT
  user_id,
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS last_24h,
  COUNT(*) FILTER (WHERE urgency = 'alta' AND created_at > now() - interval '24 hours')::int AS critical_24h,
  MAX(created_at) AS last_news_at
FROM app.news_items
GROUP BY user_id;
CREATE UNIQUE INDEX dashboard_stats_user_id_idx ON app.dashboard_stats(user_id);

-- ---------------------------------------------------------------------------
-- billing (ASAAS) — clientes e operações espelhadas da bridge
-- ---------------------------------------------------------------------------
CREATE TABLE app.billing_customers (
  user_id TEXT PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  asaas_customer_id TEXT NOT NULL,
  cpf_cnpj TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app.billing_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('payment','subscription','installment')),
  asaas_id TEXT NOT NULL,                 -- id do recurso no ASAAS (pay_/sub_/...)
  external_reference TEXT,                -- "erp:user:<id>"
  billing_type TEXT,                      -- PIX | BOLETO | CREDIT_CARD
  status TEXT NOT NULL DEFAULT 'PENDING', -- espelha ASAAS/bridge
  value NUMERIC(12,2),
  cycle TEXT,                             -- p/ subscription
  due_date DATE,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb, -- último payload conhecido
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, asaas_id)
);
CREATE INDEX billing_operations_user_idx ON app.billing_operations (user_id, created_at DESC);
CREATE TRIGGER billing_operations_touch BEFORE UPDATE ON app.billing_operations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
