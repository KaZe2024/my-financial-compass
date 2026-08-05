CREATE TABLE public.advisor_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rec_key TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'accepted',
  impact NUMERIC NOT NULL DEFAULT 0,
  snooze_until DATE,
  plan_item_id UUID REFERENCES public.plan_items(id) ON DELETE SET NULL,
  notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.advisor_actions TO authenticated;
GRANT ALL ON public.advisor_actions TO service_role;

ALTER TABLE public.advisor_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own advisor actions"
  ON public.advisor_actions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX advisor_actions_user_key_idx ON public.advisor_actions (user_id, rec_key);
CREATE INDEX advisor_actions_user_status_idx ON public.advisor_actions (user_id, status);

CREATE TRIGGER advisor_actions_touch_updated_at
  BEFORE UPDATE ON public.advisor_actions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();