DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ai_insights', 'analytical_tags', 'asset_events', 'asset_valuations', 'attachments',
    'audit_log', 'budget_categories', 'budget_groups', 'budget_periods', 'chat_messages',
    'currencies', 'exchange_rates', 'income_sources', 'invoices_to_issue', 'loan_amortizations',
    'loans', 'monthly_snapshots', 'product_prices', 'products', 'provisions', 'salary_records',
    'scenarios', 'shopping_list_items', 'shopping_lists', 'subscriptions', 'transaction_tags',
    'utility_readings'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    -- Add updated_at if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'updated_at'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now()', t);
    END IF;

    -- Create trigger if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.triggers
      WHERE trigger_schema = 'public' AND event_object_table = t AND trigger_name = format('%s_touch_updated_at', t)
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
        t || '_touch_updated_at', t
      );
    END IF;
  END LOOP;
END;
$$;
