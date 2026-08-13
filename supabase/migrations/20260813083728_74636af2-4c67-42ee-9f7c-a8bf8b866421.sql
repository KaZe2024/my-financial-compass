ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS manual_cost numeric,
  ADD COLUMN IF NOT EXISTS manual_depreciation numeric,
  ADD COLUMN IF NOT EXISTS manual_book_value numeric,
  ADD COLUMN IF NOT EXISTS manual_market_value numeric,
  ADD COLUMN IF NOT EXISTS manual_resale_gain numeric;