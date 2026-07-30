CREATE TABLE public.brainstorm_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.brainstorm_folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  icon text,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brainstorm_folders TO authenticated;
GRANT ALL ON public.brainstorm_folders TO service_role;
ALTER TABLE public.brainstorm_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own brainstorm folders" ON public.brainstorm_folders FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER touch_brainstorm_folders BEFORE UPDATE ON public.brainstorm_folders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.brainstorm_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.brainstorm_folders(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'brouillon',
  tags text[] NOT NULL DEFAULT '{}',
  color text,
  icon text,
  view_mode text NOT NULL DEFAULT 'list',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brainstorm_sessions TO authenticated;
GRANT ALL ON public.brainstorm_sessions TO service_role;
ALTER TABLE public.brainstorm_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own brainstorm sessions" ON public.brainstorm_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER touch_brainstorm_sessions BEFORE UPDATE ON public.brainstorm_sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX brainstorm_sessions_folder_idx ON public.brainstorm_sessions(user_id, folder_id);

CREATE TABLE public.brainstorm_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.brainstorm_sessions(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.brainstorm_blocks(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'idea',
  content text NOT NULL DEFAULT '',
  items text[] NOT NULL DEFAULT '{}',
  is_action boolean NOT NULL DEFAULT false,
  action_done boolean NOT NULL DEFAULT false,
  plan_item_id uuid,
  pos_x numeric NOT NULL DEFAULT 0,
  pos_y numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brainstorm_blocks TO authenticated;
GRANT ALL ON public.brainstorm_blocks TO service_role;
ALTER TABLE public.brainstorm_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own brainstorm blocks" ON public.brainstorm_blocks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER touch_brainstorm_blocks BEFORE UPDATE ON public.brainstorm_blocks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX brainstorm_blocks_session_idx ON public.brainstorm_blocks(user_id, session_id, sort_order);

INSERT INTO public.brainstorm_folders (user_id, name, is_system, sort_order)
SELECT p.id, f.name, true, f.ord
FROM public.profiles p
CROSS JOIN (VALUES ('Perso', 0), ('Pro', 1), ('Autre', 2)) AS f(name, ord);