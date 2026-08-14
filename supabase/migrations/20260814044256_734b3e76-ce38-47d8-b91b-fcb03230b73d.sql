CREATE TABLE public.plan_item_occurrences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES public.plan_items(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, occurrence_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_item_occurrences TO authenticated;
GRANT ALL ON public.plan_item_occurrences TO service_role;

ALTER TABLE public.plan_item_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own plan item occurrences"
ON public.plan_item_occurrences FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_plan_item_occurrences_item_date ON public.plan_item_occurrences (item_id, occurrence_date);
CREATE INDEX idx_plan_item_occurrences_user ON public.plan_item_occurrences (user_id);

CREATE TRIGGER plan_item_occurrences_touch_updated_at
BEFORE UPDATE ON public.plan_item_occurrences
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();