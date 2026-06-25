
-- Profile per user (multi-tenant root)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  political_role TEXT,
  region TEXT,
  bio TEXT,
  tone TEXT,
  monitored_themes TEXT[] DEFAULT ARRAY[]::TEXT[],
  onboarded BOOLEAN NOT NULL DEFAULT false,
  plan TEXT NOT NULL DEFAULT 'basico',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- News items collected for a user
CREATE TABLE public.news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source TEXT,
  url TEXT,
  summary TEXT,
  theme TEXT,
  urgency TEXT NOT NULL DEFAULT 'baixa',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX news_items_user_created_idx ON public.news_items(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.news_items TO authenticated;
GRANT ALL ON public.news_items TO service_role;
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own news all" ON public.news_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Generated content for posts
CREATE TABLE public.generated_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  news_item_id UUID REFERENCES public.news_items(id) ON DELETE SET NULL,
  format TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX generated_posts_user_created_idx ON public.generated_posts(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_posts TO authenticated;
GRANT ALL ON public.generated_posts TO service_role;
ALTER TABLE public.generated_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own posts all" ON public.generated_posts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
