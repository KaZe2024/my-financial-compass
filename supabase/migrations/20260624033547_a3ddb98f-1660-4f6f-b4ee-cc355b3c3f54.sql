
ALTER TABLE public.shopping_lists
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS budget_node_id uuid REFERENCES public.budget_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tag_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS checked boolean NOT NULL DEFAULT false;
