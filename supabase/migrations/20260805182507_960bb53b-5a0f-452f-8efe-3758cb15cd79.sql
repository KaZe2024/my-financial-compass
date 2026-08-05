CREATE TABLE public.life_domains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  weight NUMERIC NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#38bdf8',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT false,
  match_type_ids UUID[] NOT NULL DEFAULT '{}',
  match_project_ids UUID[] NOT NULL DEFAULT '{}',
  match_tag_ids UUID[] NOT NULL DEFAULT '{}',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.life_domains TO authenticated;
GRANT ALL ON public.life_domains TO service_role;

ALTER TABLE public.life_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own life domains"
  ON public.life_domains FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX life_domains_user_idx ON public.life_domains (user_id, archived, sort_order);

CREATE TRIGGER life_domains_touch_updated_at
  BEFORE UPDATE ON public.life_domains
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.weekly_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  wins TEXT,
  misses TEXT,
  lessons TEXT,
  next_focus TEXT,
  finance_note TEXT,
  execution_score NUMERIC,
  alignment_score NUMERIC,
  finance_score NUMERIC,
  life_score NUMERIC,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_reviews TO authenticated;
GRANT ALL ON public.weekly_reviews TO service_role;

ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own weekly reviews"
  ON public.weekly_reviews FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX weekly_reviews_user_week_idx ON public.weekly_reviews (user_id, week_start DESC);

CREATE TRIGGER weekly_reviews_touch_updated_at
  BEFORE UPDATE ON public.weekly_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();