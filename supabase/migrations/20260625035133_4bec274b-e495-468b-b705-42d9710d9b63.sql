
-- ============================================================
-- Chantier 0 : refonte multi-modules
-- ============================================================

-- 1) Nouveaux types de transaction
ALTER TYPE public.txn_type ADD VALUE IF NOT EXISTS 'enveloppe_projet';
ALTER TYPE public.txn_type ADD VALUE IF NOT EXISTS 'enveloppe_emprunt';

-- 2) Transactions : provenance + tiers/projet libellé
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS source_id   uuid,
  ADD COLUMN IF NOT EXISTS counterparty_label text;

CREATE INDEX IF NOT EXISTS transactions_source_idx       ON public.transactions(source_kind, source_id);
CREATE INDEX IF NOT EXISTS transactions_project_idx      ON public.transactions(project_id);
CREATE INDEX IF NOT EXISTS transactions_counterparty_idx ON public.transactions(counterparty_id);

-- 3) Counterparties : groupe / prestation / notes / archived
ALTER TABLE public.counterparties
  ADD COLUMN IF NOT EXISTS group_name   text,
  ADD COLUMN IF NOT EXISTS service_name text,
  ADD COLUMN IF NOT EXISTS archived     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS touch_counterparties ON public.counterparties;
CREATE TRIGGER touch_counterparties BEFORE UPDATE ON public.counterparties
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS counterparties_user_name_key
  ON public.counterparties(user_id, lower(name));

-- 4) Modules : archived + linked_transaction_id
ALTER TABLE public.assets          ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.assets          ADD COLUMN IF NOT EXISTS linked_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

ALTER TABLE public.debts           ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.debts           ADD COLUMN IF NOT EXISTS linked_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

ALTER TABLE public.receivables     ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.receivables     ADD COLUMN IF NOT EXISTS linked_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

ALTER TABLE public.projects        ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.projects        ADD COLUMN IF NOT EXISTS linked_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;
ALTER TABLE public.projects        ADD COLUMN IF NOT EXISTS envelope_balance numeric NOT NULL DEFAULT 0;
ALTER TABLE public.projects        ADD COLUMN IF NOT EXISTS total_spent     numeric NOT NULL DEFAULT 0;

ALTER TABLE public.financial_goals ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.financial_goals ADD COLUMN IF NOT EXISTS linked_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

-- 5) Wallets trigger : enveloppe_projet = sortie wallet, enveloppe_emprunt = entrée wallet
CREATE OR REPLACE FUNCTION public.apply_tx_to_wallets()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF OLD.type = 'transfer' THEN
      IF OLD.wallet_id    IS NOT NULL THEN UPDATE public.wallets SET current_balance = current_balance + OLD.amount WHERE id = OLD.wallet_id; END IF;
      IF OLD.to_wallet_id IS NOT NULL THEN UPDATE public.wallets SET current_balance = current_balance - OLD.amount WHERE id = OLD.to_wallet_id; END IF;
    ELSE
      IF OLD.wallet_id IS NOT NULL THEN
        UPDATE public.wallets SET current_balance = current_balance +
          CASE WHEN OLD.type IN ('income','asset_sale','adjustment','enveloppe_emprunt') THEN -OLD.amount ELSE OLD.amount END
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
          CASE WHEN NEW.type IN ('income','asset_sale','adjustment','enveloppe_emprunt') THEN NEW.amount ELSE -NEW.amount END
        WHERE id = NEW.wallet_id;
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $function$;

-- 6) Projets : trigger pour envelope_balance et total_spent
CREATE OR REPLACE FUNCTION public.apply_tx_to_projects()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  delta_env numeric := 0;
  delta_spent numeric := 0;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.project_id IS NOT NULL THEN
    IF OLD.type = 'enveloppe_projet'  THEN UPDATE public.projects SET envelope_balance = envelope_balance - OLD.amount WHERE id = OLD.project_id; END IF;
    IF OLD.type = 'enveloppe_emprunt' THEN UPDATE public.projects SET envelope_balance = envelope_balance + OLD.amount WHERE id = OLD.project_id; END IF;
    IF OLD.type = 'investment'        THEN UPDATE public.projects SET total_spent     = total_spent     - OLD.amount WHERE id = OLD.project_id; END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.project_id IS NOT NULL THEN
    IF NEW.type = 'enveloppe_projet'  THEN UPDATE public.projects SET envelope_balance = envelope_balance + NEW.amount WHERE id = NEW.project_id; END IF;
    IF NEW.type = 'enveloppe_emprunt' THEN UPDATE public.projects SET envelope_balance = envelope_balance - NEW.amount WHERE id = NEW.project_id; END IF;
    IF NEW.type = 'investment'        THEN UPDATE public.projects SET total_spent     = total_spent     + NEW.amount WHERE id = NEW.project_id; END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $function$;

DROP TRIGGER IF EXISTS apply_tx_to_projects_trg ON public.transactions;
CREATE TRIGGER apply_tx_to_projects_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_tx_to_projects();

-- 7) Backfill counterparties depuis description quand counterparty_label vide
--   (rien à faire ici : on remplit côté app au fil de l'eau)

-- 8) Grants (idempotents)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.counterparties TO authenticated;
GRANT ALL ON public.counterparties TO service_role;
