ALTER TABLE public.plan_items
  ADD COLUMN IF NOT EXISTS recurrence_interval integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recurrence_weekdays smallint[],
  ADD COLUMN IF NOT EXISTS recurrence_month_days smallint[],
  ADD COLUMN IF NOT EXISTS times_per_day integer NOT NULL DEFAULT 1;