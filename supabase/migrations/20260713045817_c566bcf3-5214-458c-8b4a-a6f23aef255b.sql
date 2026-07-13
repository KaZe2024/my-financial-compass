ALTER TABLE public.provisions ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS fx_exclude boolean NOT NULL DEFAULT false;