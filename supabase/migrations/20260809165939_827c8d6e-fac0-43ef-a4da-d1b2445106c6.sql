CREATE TABLE public.bible_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  version TEXT,
  cadence TEXT NOT NULL DEFAULT 'daily',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  target_chapters INTEGER NOT NULL DEFAULT 1189,
  whole_bible BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bible_plans TO authenticated;
GRANT ALL ON public.bible_plans TO service_role;
ALTER TABLE public.bible_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bible_plans" ON public.bible_plans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER bible_plans_touch_updated_at BEFORE UPDATE ON public.bible_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.bible_reading_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan_id UUID REFERENCES public.bible_plans(id) ON DELETE SET NULL,
  read_on DATE NOT NULL DEFAULT CURRENT_DATE,
  book TEXT NOT NULL,
  chapter_start INTEGER NOT NULL DEFAULT 1,
  chapter_end INTEGER NOT NULL DEFAULT 1,
  chapters INTEGER NOT NULL DEFAULT 1,
  minutes INTEGER NOT NULL DEFAULT 0,
  reflection TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bible_reading_logs TO authenticated;
GRANT ALL ON public.bible_reading_logs TO service_role;
ALTER TABLE public.bible_reading_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bible_reading_logs" ON public.bible_reading_logs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX bible_reading_logs_user_date_idx ON public.bible_reading_logs(user_id, read_on DESC);
CREATE TRIGGER bible_reading_logs_touch_updated_at BEFORE UPDATE ON public.bible_reading_logs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.sermon_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  preached_on DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL,
  preacher TEXT,
  church TEXT,
  series TEXT,
  main_text TEXT,
  key_verses TEXT[] NOT NULL DEFAULT '{}',
  big_idea TEXT,
  outline JSONB NOT NULL DEFAULT '[]'::jsonb,
  applications TEXT,
  quotes TEXT,
  prayer TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sermon_notes TO authenticated;
GRANT ALL ON public.sermon_notes TO service_role;
ALTER TABLE public.sermon_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sermon_notes" ON public.sermon_notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER sermon_notes_touch_updated_at BEFORE UPDATE ON public.sermon_notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.bible_studies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL DEFAULT 'theme',
  title TEXT NOT NULL,
  subject TEXT,
  summary TEXT,
  content TEXT,
  refs TEXT[] NOT NULL DEFAULT '{}',
  key_facts TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'en_cours',
  studied_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bible_studies TO authenticated;
GRANT ALL ON public.bible_studies TO service_role;
ALTER TABLE public.bible_studies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bible_studies" ON public.bible_studies FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER bible_studies_touch_updated_at BEFORE UPDATE ON public.bible_studies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.quiz_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  asked_on DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'mixed',
  question TEXT NOT NULL,
  answer TEXT,
  correct BOOLEAN NOT NULL DEFAULT false,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own quiz_attempts" ON public.quiz_attempts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX quiz_attempts_user_date_idx ON public.quiz_attempts(user_id, asked_on DESC);
CREATE TRIGGER quiz_attempts_touch_updated_at BEFORE UPDATE ON public.quiz_attempts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();