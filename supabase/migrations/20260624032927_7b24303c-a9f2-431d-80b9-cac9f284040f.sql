
ALTER TABLE public.budget_nodes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'normal'
  CHECK (kind IN ('normal','subtotal'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shopping_default_wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shopping_default_node_id uuid REFERENCES public.budget_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shopping_default_tag_ids uuid[] NOT NULL DEFAULT '{}';
