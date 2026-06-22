
-- ============ TABLE: budget_nodes (hierarchical, unlimited depth) ============
CREATE TABLE public.budget_nodes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES public.budget_nodes(id) ON DELETE CASCADE,
  name        text NOT NULL,
  icon        text,
  color       text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_income   boolean NOT NULL DEFAULT false,
  archived    boolean NOT NULL DEFAULT false,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bnodes_user   ON public.budget_nodes(user_id);
CREATE INDEX idx_bnodes_parent ON public.budget_nodes(parent_id);
CREATE INDEX idx_bnodes_user_parent ON public.budget_nodes(user_id, parent_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_nodes TO authenticated;
GRANT ALL ON public.budget_nodes TO service_role;

ALTER TABLE public.budget_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bnode" ON public.budget_nodes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_bnode_updated BEFORE UPDATE ON public.budget_nodes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Prevent cycles
CREATE OR REPLACE FUNCTION public.bnode_prevent_cycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cur uuid;
  depth int := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'A budget node cannot be its own parent';
  END IF;
  cur := NEW.parent_id;
  WHILE cur IS NOT NULL LOOP
    depth := depth + 1;
    IF depth > 50 THEN RAISE EXCEPTION 'Tree too deep or cycle detected'; END IF;
    IF cur = NEW.id THEN RAISE EXCEPTION 'Cycle detected in budget tree'; END IF;
    SELECT parent_id INTO cur FROM public.budget_nodes WHERE id = cur;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_bnode_cycle BEFORE INSERT OR UPDATE OF parent_id ON public.budget_nodes
  FOR EACH ROW EXECUTE FUNCTION public.bnode_prevent_cycle();

-- ============ TABLE: budget_node_amounts (monthly plan per node) ============
CREATE TABLE public.budget_node_amounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id       uuid NOT NULL REFERENCES public.budget_nodes(id) ON DELETE CASCADE,
  period_month  date NOT NULL,
  planned       numeric(20,2) NOT NULL DEFAULT 0,
  revised       numeric(20,2),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_id, period_month)
);
CREATE INDEX idx_bna_user_period ON public.budget_node_amounts(user_id, period_month);
CREATE INDEX idx_bna_node ON public.budget_node_amounts(node_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_node_amounts TO authenticated;
GRANT ALL ON public.budget_node_amounts TO service_role;

ALTER TABLE public.budget_node_amounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bna" ON public.budget_node_amounts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_bna_updated BEFORE UPDATE ON public.budget_node_amounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Add budget_node_id columns to related tables ============
ALTER TABLE public.transactions
  ADD COLUMN budget_node_id uuid REFERENCES public.budget_nodes(id) ON DELETE SET NULL;
CREATE INDEX idx_tx_node ON public.transactions(budget_node_id);

ALTER TABLE public.projects
  ADD COLUMN budget_node_id uuid REFERENCES public.budget_nodes(id) ON DELETE SET NULL;

ALTER TABLE public.financial_goals
  ADD COLUMN budget_node_id uuid REFERENCES public.budget_nodes(id) ON DELETE SET NULL;

ALTER TABLE public.provisions
  ADD COLUMN budget_node_id uuid REFERENCES public.budget_nodes(id) ON DELETE SET NULL;

-- ============ DATA MIGRATION (preserve UUIDs) ============
-- Groups → root nodes
INSERT INTO public.budget_nodes (id, user_id, parent_id, name, icon, color, sort_order, is_income, archived)
SELECT id, user_id, NULL, name, icon, color, sort_order, false, false
FROM public.budget_groups
ON CONFLICT (id) DO NOTHING;

-- Categories → child nodes
INSERT INTO public.budget_nodes (id, user_id, parent_id, name, icon, color, sort_order, is_income, archived)
SELECT c.id, c.user_id, c.group_id, c.name, c.icon, c.color, 0, c.is_income, c.archived
FROM public.budget_categories c
ON CONFLICT (id) DO NOTHING;

-- Budget periods → node amounts
INSERT INTO public.budget_node_amounts (user_id, node_id, period_month, planned, revised, notes)
SELECT user_id, category_id, period_month, planned, revised, notes
FROM public.budget_periods
ON CONFLICT (node_id, period_month) DO NOTHING;

-- Seed current-month planned from categories.planned_monthly if no period exists yet
INSERT INTO public.budget_node_amounts (user_id, node_id, period_month, planned)
SELECT c.user_id, c.id, date_trunc('month', CURRENT_DATE)::date, c.planned_monthly
FROM public.budget_categories c
WHERE c.planned_monthly > 0
ON CONFLICT (node_id, period_month) DO NOTHING;

-- Transactions: copy budget_category_id → budget_node_id
UPDATE public.transactions SET budget_node_id = budget_category_id
WHERE budget_category_id IS NOT NULL AND budget_node_id IS NULL;

-- ============ VIEWS ============
-- Full tree with depth + path
CREATE OR REPLACE VIEW public.v_budget_node_tree AS
WITH RECURSIVE t AS (
  SELECT n.*, 0 AS depth, ARRAY[n.sort_order, 0]::int[] AS sort_path, n.name AS path_text
  FROM public.budget_nodes n
  WHERE n.parent_id IS NULL
  UNION ALL
  SELECT n.*, t.depth + 1, t.sort_path || n.sort_order, t.path_text || ' › ' || n.name
  FROM public.budget_nodes n
  JOIN t ON n.parent_id = t.id
)
SELECT * FROM t;

-- Monthly direct spend per node (leaf spend; not rolled up)
CREATE OR REPLACE VIEW public.v_node_spend AS
SELECT
  t.user_id,
  t.budget_node_id AS node_id,
  date_trunc('month', t.occurred_on)::date AS month,
  SUM(CASE WHEN t.type = 'income' THEN -t.base_amount
           WHEN t.type IN ('expense','investment','asset_purchase') THEN t.base_amount
           ELSE 0 END) AS spent
FROM public.transactions t
WHERE t.budget_node_id IS NOT NULL
GROUP BY t.user_id, t.budget_node_id, date_trunc('month', t.occurred_on);

-- Recursive rollup: spend including descendants
CREATE OR REPLACE VIEW public.v_node_spend_rollup AS
WITH RECURSIVE descendants AS (
  SELECT id AS root_id, id AS node_id, user_id FROM public.budget_nodes
  UNION ALL
  SELECT d.root_id, n.id, n.user_id
  FROM public.budget_nodes n
  JOIN descendants d ON n.parent_id = d.node_id
)
SELECT d.user_id, d.root_id AS node_id, s.month, SUM(s.spent) AS spent_rollup
FROM descendants d
JOIN public.v_node_spend s ON s.node_id = d.node_id AND s.user_id = d.user_id
GROUP BY d.user_id, d.root_id, s.month;
