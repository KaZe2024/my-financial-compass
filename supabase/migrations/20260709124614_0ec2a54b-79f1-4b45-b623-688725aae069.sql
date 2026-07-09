CREATE INDEX IF NOT EXISTS idx_transactions_asset_date
  ON public.transactions (user_id, asset_id, occurred_on DESC)
  WHERE asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_source_asset_date
  ON public.transactions (user_id, source_id, occurred_on DESC)
  WHERE source_kind = 'asset' AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_debt_date
  ON public.transactions (user_id, debt_id, occurred_on DESC)
  WHERE debt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_receivable_date
  ON public.transactions (user_id, receivable_id, occurred_on DESC)
  WHERE receivable_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_source_obligation_date
  ON public.transactions (user_id, source_kind, source_id, occurred_on DESC)
  WHERE source_kind IN ('debt', 'receivable') AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asset_events_user_type_date
  ON public.asset_events (user_id, event_type, event_date DESC, event_month DESC);

CREATE INDEX IF NOT EXISTS idx_assets_user_status_purchase
  ON public.assets (user_id, status, purchase_date);