
-- Extend txn_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'txn_type' AND e.enumlabel = 'debt_incur') THEN
    ALTER TYPE public.txn_type ADD VALUE 'debt_incur';
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'txn_type' AND e.enumlabel = 'debt_repay') THEN
    ALTER TYPE public.txn_type ADD VALUE 'debt_repay';
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'txn_type' AND e.enumlabel = 'receivable_grant') THEN
    ALTER TYPE public.txn_type ADD VALUE 'receivable_grant';
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'txn_type' AND e.enumlabel = 'receivable_collect') THEN
    ALTER TYPE public.txn_type ADD VALUE 'receivable_collect';
  END IF;
END$$;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS debt_id uuid REFERENCES public.debts(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS receivable_id uuid REFERENCES public.receivables(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.apply_tx_to_wallets()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF OLD.type = 'transfer' THEN
      IF OLD.wallet_id    IS NOT NULL THEN UPDATE public.wallets SET current_balance = current_balance + OLD.amount WHERE id = OLD.wallet_id; END IF;
      IF OLD.to_wallet_id IS NOT NULL THEN UPDATE public.wallets SET current_balance = current_balance - OLD.amount WHERE id = OLD.to_wallet_id; END IF;
    ELSE
      IF OLD.wallet_id IS NOT NULL THEN
        UPDATE public.wallets SET current_balance = current_balance +
          CASE WHEN OLD.type IN ('income','asset_sale','adjustment','enveloppe_emprunt','debt_incur','receivable_collect') THEN -OLD.amount ELSE OLD.amount END
        WHERE id = OLD.wallet_id;
      END IF;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.type = 'transfer' THEN
      IF NEW.wallet_id    IS NOT NULL THEN UPDATE public.wallets SET current_balance = current_balance - NEW.amount WHERE id = NEW.wallet_id; END IF;
      IF NEW.to_wallet_id IS NOT NULL THEN UPDATE public.wallets SET current_balance = current_balance + NEW.amount WHERE id = NEW.to_wallet_id; END IF;
    ELSE
      IF NEW.wallet_id IS NOT NULL THEN
        UPDATE public.wallets SET current_balance = current_balance +
          CASE WHEN NEW.type IN ('income','asset_sale','adjustment','enveloppe_emprunt','debt_incur','receivable_collect') THEN NEW.amount ELSE -NEW.amount END
        WHERE id = NEW.wallet_id;
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $function$;

CREATE OR REPLACE FUNCTION public.apply_tx_to_debts()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.debt_id IS NOT NULL THEN
    IF OLD.type = 'debt_incur' THEN
      UPDATE public.debts SET outstanding = GREATEST(0, outstanding - OLD.amount) WHERE id = OLD.debt_id;
    ELSIF OLD.type = 'debt_repay' THEN
      UPDATE public.debts SET outstanding = outstanding + OLD.amount WHERE id = OLD.debt_id;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.debt_id IS NOT NULL THEN
    IF NEW.type = 'debt_incur' THEN
      UPDATE public.debts SET outstanding = outstanding + NEW.amount WHERE id = NEW.debt_id;
    ELSIF NEW.type = 'debt_repay' THEN
      UPDATE public.debts SET outstanding = GREATEST(0, outstanding - NEW.amount) WHERE id = NEW.debt_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $function$;

DROP TRIGGER IF EXISTS trg_apply_tx_to_debts ON public.transactions;
CREATE TRIGGER trg_apply_tx_to_debts AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_tx_to_debts();

CREATE OR REPLACE FUNCTION public.apply_tx_to_receivables()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.receivable_id IS NOT NULL THEN
    IF OLD.type = 'receivable_grant' THEN
      UPDATE public.receivables SET outstanding = GREATEST(0, outstanding - OLD.amount) WHERE id = OLD.receivable_id;
    ELSIF OLD.type = 'receivable_collect' THEN
      UPDATE public.receivables SET outstanding = outstanding + OLD.amount WHERE id = OLD.receivable_id;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.receivable_id IS NOT NULL THEN
    IF NEW.type = 'receivable_grant' THEN
      UPDATE public.receivables SET outstanding = outstanding + NEW.amount WHERE id = NEW.receivable_id;
    ELSIF NEW.type = 'receivable_collect' THEN
      UPDATE public.receivables SET outstanding = GREATEST(0, outstanding - NEW.amount) WHERE id = NEW.receivable_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $function$;

DROP TRIGGER IF EXISTS trg_apply_tx_to_receivables ON public.transactions;
CREATE TRIGGER trg_apply_tx_to_receivables AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_tx_to_receivables();

DROP TRIGGER IF EXISTS trg_apply_tx_to_wallets ON public.transactions;
CREATE TRIGGER trg_apply_tx_to_wallets AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_tx_to_wallets();

DROP TRIGGER IF EXISTS trg_apply_tx_to_projects ON public.transactions;
CREATE TRIGGER trg_apply_tx_to_projects AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_tx_to_projects();

-- Budget canonical monthly amount
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='budget_node_amounts_unique_month') THEN
    DELETE FROM public.budget_node_amounts a USING public.budget_node_amounts b
    WHERE a.ctid < b.ctid AND a.node_id = b.node_id AND a.period_month = b.period_month
      AND COALESCE(a.user_id, '00000000-0000-0000-0000-000000000000') = COALESCE(b.user_id, '00000000-0000-0000-0000-000000000000');
    CREATE UNIQUE INDEX budget_node_amounts_unique_month ON public.budget_node_amounts(user_id, node_id, period_month);
  END IF;
END$$;

ALTER TABLE public.financial_goals ADD COLUMN IF NOT EXISTS watch_node_ids uuid[];

ALTER TABLE public.asset_events ADD COLUMN IF NOT EXISTS event_month date;
CREATE UNIQUE INDEX IF NOT EXISTS asset_events_unique_dep
  ON public.asset_events(asset_id, event_type, event_month)
  WHERE event_type = 'depreciation' AND event_month IS NOT NULL;
ALTER TABLE public.asset_events ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='provisions' AND column_name='direction') THEN
    ALTER TABLE public.provisions ADD COLUMN direction text NOT NULL DEFAULT 'expense';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='provisions' AND column_name='settled_at') THEN
    ALTER TABLE public.provisions ADD COLUMN settled_at timestamptz;
  END IF;
END$$;
