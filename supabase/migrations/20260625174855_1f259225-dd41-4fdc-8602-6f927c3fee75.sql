
-- Profile fields for social handles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
  ADD COLUMN IF NOT EXISTS twitter_handle TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_handle TEXT,
  ADD COLUMN IF NOT EXISTS facebook_handle TEXT,
  ADD COLUMN IF NOT EXISTS mention_keywords TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Social mentions table
CREATE TABLE public.social_mentions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
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
  UNIQUE (user_id, network, external_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_mentions TO authenticated;
GRANT ALL ON public.social_mentions TO service_role;

ALTER TABLE public.social_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own mentions all" ON public.social_mentions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_social_mentions_user_collected ON public.social_mentions (user_id, collected_at DESC);
CREATE INDEX idx_social_mentions_user_network ON public.social_mentions (user_id, network);

-- Snapshots aggregated per refresh
CREATE TABLE public.sentiment_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentiment_snapshots TO authenticated;
GRANT ALL ON public.sentiment_snapshots TO service_role;

ALTER TABLE public.sentiment_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own snapshots all" ON public.sentiment_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_snapshots_user_created ON public.sentiment_snapshots (user_id, created_at DESC);
