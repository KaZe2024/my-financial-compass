
BEGIN;

ALTER TABLE public.transactions DISABLE TRIGGER USER;

UPDATE public.transactions
   SET amount = -amount,
       base_amount = -COALESCE(base_amount, amount)
 WHERE type IN ('debt_repay','receivable_collect');

UPDATE public.transactions SET type = 'debt_repay'::public.txn_type WHERE type = 'debt_incur';
UPDATE public.transactions SET type = 'receivable_grant'::public.txn_type WHERE type = 'receivable_collect';

ALTER TABLE public.transactions ENABLE TRIGGER USER;

ALTER TYPE public.txn_type RENAME VALUE 'debt_repay' TO 'dette';
ALTER TYPE public.txn_type RENAME VALUE 'receivable_grant' TO 'creance';

CREATE OR REPLACE FUNCTION public.apply_tx_to_debts()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.debt_id IS NOT NULL AND OLD.type = 'dette' THEN
    UPDATE public.debts SET outstanding = outstanding - OLD.amount WHERE id = OLD.debt_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.debt_id IS NOT NULL AND NEW.type = 'dette' THEN
    UPDATE public.debts SET outstanding = outstanding + NEW.amount WHERE id = NEW.debt_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

CREATE OR REPLACE FUNCTION public.apply_tx_to_receivables()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.receivable_id IS NOT NULL AND OLD.type = 'creance' THEN
    UPDATE public.receivables SET outstanding = outstanding - OLD.amount WHERE id = OLD.receivable_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.receivable_id IS NOT NULL AND NEW.type = 'creance' THEN
    UPDATE public.receivables SET outstanding = outstanding + NEW.amount WHERE id = NEW.receivable_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

CREATE OR REPLACE FUNCTION public.apply_tx_to_wallets()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF OLD.type = 'transfer' THEN
      IF OLD.wallet_id    IS NOT NULL THEN UPDATE public.wallets SET current_balance = current_balance + OLD.amount WHERE id = OLD.wallet_id; END IF;
      IF OLD.to_wallet_id IS NOT NULL THEN UPDATE public.wallets SET current_balance = current_balance - OLD.amount WHERE id = OLD.to_wallet_id; END IF;
    ELSE
      IF OLD.wallet_id IS NOT NULL THEN
        UPDATE public.wallets SET current_balance = current_balance +
          CASE WHEN OLD.type IN ('income','asset_sale','adjustment','enveloppe_emprunt','dette') THEN -OLD.amount ELSE OLD.amount END
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
          CASE WHEN NEW.type IN ('income','asset_sale','adjustment','enveloppe_emprunt','dette') THEN NEW.amount ELSE -NEW.amount END
        WHERE id = NEW.wallet_id;
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

COMMIT;
