-- TYPES
CREATE TABLE public.plan_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#38bdf8',
  icon text,
  in_eisenhower boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_types TO authenticated;
GRANT ALL ON public.plan_types TO service_role;
ALTER TABLE public.plan_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plan_types" ON public.plan_types FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_plan_types_touch BEFORE UPDATE ON public.plan_types FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- TAGS
CREATE TABLE public.plan_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#a78bfa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_tags TO authenticated;
GRANT ALL ON public.plan_tags TO service_role;
ALTER TABLE public.plan_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plan_tags" ON public.plan_tags FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_plan_tags_touch BEFORE UPDATE ON public.plan_tags FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- PROJECTS (planning)
CREATE TABLE public.plan_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'in_progress',
  priority text NOT NULL DEFAULT 'medium',
  color text NOT NULL DEFAULT '#22c55e',
  start_date date,
  due_date date,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_projects TO authenticated;
GRANT ALL ON public.plan_projects TO service_role;
ALTER TABLE public.plan_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plan_projects" ON public.plan_projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_plan_projects_touch BEFORE UPDATE ON public.plan_projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ITEMS
CREATE TABLE public.plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  type_id uuid REFERENCES public.plan_types(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.plan_projects(id) ON DELETE SET NULL,
  counterparty_id uuid REFERENCES public.counterparties(id) ON DELETE SET NULL,
  person_label text,
  status text NOT NULL DEFAULT 'todo',
  priority text NOT NULL DEFAULT 'medium',
  urgent boolean NOT NULL DEFAULT false,
  important boolean NOT NULL DEFAULT false,
  scheduled_on date NOT NULL DEFAULT CURRENT_DATE,
  end_on date,
  all_day boolean NOT NULL DEFAULT false,
  no_fixed_time boolean NOT NULL DEFAULT false,
  start_time time,
  end_time time,
  duration_minutes integer,
  location text,
  notes text,
  recurrence text NOT NULL DEFAULT 'none',
  recurrence_until date,
  reminder_minutes integer,
  completed_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_items TO authenticated;
GRANT ALL ON public.plan_items TO service_role;
ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plan_items" ON public.plan_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_plan_items_touch BEFORE UPDATE ON public.plan_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_plan_items_user_date ON public.plan_items (user_id, scheduled_on);
CREATE INDEX idx_plan_items_project ON public.plan_items (project_id);

-- ITEM TAGS
CREATE TABLE public.plan_item_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.plan_items(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.plan_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_item_tags TO authenticated;
GRANT ALL ON public.plan_item_tags TO service_role;
ALTER TABLE public.plan_item_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plan_item_tags" ON public.plan_item_tags FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_plan_item_tags_touch BEFORE UPDATE ON public.plan_item_tags FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();