CREATE TABLE public.asset_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_types TO authenticated;
GRANT ALL ON public.asset_types TO service_role;

ALTER TABLE public.asset_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own asset types"
  ON public.asset_types FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_asset_types_updated_at
  BEFORE UPDATE ON public.asset_types
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed defaults for existing users (idempotent)
INSERT INTO public.asset_types (user_id, name, sort_order)
SELECT p.id, t.name, t.ord
FROM public.profiles p
CROSS JOIN (VALUES
  ('real_estate', 1),
  ('land', 2),
  ('vehicle', 3),
  ('computer', 4),
  ('electronics', 5),
  ('investment', 6),
  ('other', 99)
) AS t(name, ord)
ON CONFLICT (user_id, name) DO NOTHING;
