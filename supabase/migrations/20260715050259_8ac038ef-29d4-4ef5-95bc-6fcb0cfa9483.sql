ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

ALTER TABLE public.shopping_lists
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_user_archived_name
  ON public.products(user_id, archived, name);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_user_archived_date
  ON public.shopping_lists(user_id, archived, occurred_on DESC);