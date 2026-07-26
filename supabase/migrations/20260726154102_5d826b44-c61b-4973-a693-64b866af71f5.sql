ALTER TABLE public.plan_types ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.plan_tags ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.plan_projects ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.plan_items ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.plan_item_tags ALTER COLUMN user_id SET DEFAULT auth.uid();