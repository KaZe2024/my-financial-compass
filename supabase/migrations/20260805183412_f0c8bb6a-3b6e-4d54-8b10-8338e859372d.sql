CREATE TABLE public.coach_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  period_month text NOT NULL,
  title text NOT NULL DEFAULT 'Plan d''action',
  focus text,
  summary text,
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL DEFAULT 'local',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_plans TO authenticated;
GRANT ALL ON public.coach_plans TO service_role;
ALTER TABLE public.coach_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_plans_own" ON public.coach_plans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER coach_plans_touch_updated_at BEFORE UPDATE ON public.coach_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_coach_plans_user_month ON public.coach_plans (user_id, period_month);

CREATE TABLE public.coach_plan_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.coach_plans(id) ON DELETE CASCADE,
  rec_key text,
  title text NOT NULL,
  detail text,
  category text,
  module_to text,
  impact numeric NOT NULL DEFAULT 0,
  effort text,
  due_date date,
  status text NOT NULL DEFAULT 'todo',
  order_index integer NOT NULL DEFAULT 0,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_plan_items TO authenticated;
GRANT ALL ON public.coach_plan_items TO service_role;
ALTER TABLE public.coach_plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_plan_items_own" ON public.coach_plan_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER coach_plan_items_touch_updated_at BEFORE UPDATE ON public.coach_plan_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_coach_plan_items_plan ON public.coach_plan_items (plan_id);

CREATE TABLE public.periodic_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'weekly',
  period_start date NOT NULL,
  period_end date NOT NULL,
  label text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  commentary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.periodic_reports TO authenticated;
GRANT ALL ON public.periodic_reports TO service_role;
ALTER TABLE public.periodic_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "periodic_reports_own" ON public.periodic_reports FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER periodic_reports_touch_updated_at BEFORE UPDATE ON public.periodic_reports FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_periodic_reports_user ON public.periodic_reports (user_id, kind, period_start DESC);

CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  kind text NOT NULL DEFAULT 'info',
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  link_to text,
  due_date date,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER notifications_touch_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE UNIQUE INDEX idx_notifications_dedupe ON public.notifications (user_id, dedupe_key);