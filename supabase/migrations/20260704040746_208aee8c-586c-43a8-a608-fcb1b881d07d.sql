
ALTER TABLE public.provisions
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS counterparty_id uuid REFERENCES public.counterparties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_tx_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_tx_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_tx_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS period_month date;

UPDATE public.provisions SET direction='out' WHERE direction IN ('expense');
UPDATE public.provisions SET direction='in' WHERE direction IN ('income');

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS budget_node_id uuid REFERENCES public.budget_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS counterparty_id uuid REFERENCES public.counterparties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'out',
  ADD COLUMN IF NOT EXISTS last_provisioned_month date;

CREATE INDEX IF NOT EXISTS idx_tx_asset ON public.transactions (asset_id);
CREATE INDEX IF NOT EXISTS idx_tx_debt ON public.transactions (debt_id);
CREATE INDEX IF NOT EXISTS idx_tx_receivable ON public.transactions (receivable_id);
CREATE INDEX IF NOT EXISTS idx_tx_cp ON public.transactions (counterparty_id);
