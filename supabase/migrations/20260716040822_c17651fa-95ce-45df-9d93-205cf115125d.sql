
CREATE TABLE public.fridge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric,
  unit text,
  notes text,
  added_on date NOT NULL DEFAULT CURRENT_DATE,
  expires_on date,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fridge_items TO authenticated;
GRANT ALL ON public.fridge_items TO service_role;
ALTER TABLE public.fridge_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own fridge_items" ON public.fridge_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_fridge_items_updated_at BEFORE UPDATE ON public.fridge_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_fridge_items_user_archived ON public.fridge_items(user_id, archived, added_on DESC);

CREATE TABLE public.meal_plan_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  slot text NOT NULL DEFAULT 'lunch',
  label text NOT NULL DEFAULT '',
  fridge_item_id uuid REFERENCES public.fridge_items(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_plan_entries TO authenticated;
GRANT ALL ON public.meal_plan_entries TO service_role;
ALTER TABLE public.meal_plan_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own meal_plan_entries" ON public.meal_plan_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_meal_plan_entries_updated_at BEFORE UPDATE ON public.meal_plan_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_meal_plan_user_week ON public.meal_plan_entries(user_id, week_start, day_of_week, sort_order);
