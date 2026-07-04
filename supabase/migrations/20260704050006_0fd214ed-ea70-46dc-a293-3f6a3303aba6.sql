ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_transactions_archived ON public.transactions(user_id, archived);