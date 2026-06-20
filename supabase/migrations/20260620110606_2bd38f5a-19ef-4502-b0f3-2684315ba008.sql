
-- =====================================================================
-- PERSONAL CFO ERP - COMPLETE SCHEMA
-- =====================================================================

-- Enums
CREATE TYPE public.wallet_type AS ENUM ('cash','hidden_cash','bank','mobile_money','savings','investment','project_fund','other');
CREATE TYPE public.wallet_status AS ENUM ('active','archived','closed');
CREATE TYPE public.txn_type AS ENUM ('expense','income','transfer','investment','asset_purchase','asset_sale','adjustment');
CREATE TYPE public.invoice_status AS ENUM ('planned','issued','partially_paid','paid','cancelled');
CREATE TYPE public.provision_status AS ENUM ('planned','partial','settled','cancelled');
CREATE TYPE public.debt_status AS ENUM ('outstanding','partial','settled','late','cancelled');
CREATE TYPE public.project_status AS ENUM ('planning','active','on_hold','completed','cancelled');
CREATE TYPE public.asset_status AS ENUM ('owned','sold','impaired','retired');
CREATE TYPE public.asset_event_type AS ENUM ('acquisition','depreciation','revaluation','impairment','sale');
CREATE TYPE public.utility_type AS ENUM ('water','electricity','gas','other');
CREATE TYPE public.goal_status AS ENUM ('active','achieved','paused','cancelled');
CREATE TYPE public.scenario_type AS ENUM ('optimistic','realistic','pessimistic');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =====================================================================
-- PROFILES (single-user lock)
-- =====================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  base_currency TEXT NOT NULL DEFAULT 'MGA',
  locale TEXT NOT NULL DEFAULT 'fr-FR',
  date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Single-user enforcement: max 1 profile row
CREATE OR REPLACE FUNCTION public.enforce_single_owner()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.profiles) >= 1 THEN
    RAISE EXCEPTION 'Sign-up disabled: this Personal CFO instance already has its owner.';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_single_owner BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_owner();

-- Public check function used by the auth page
CREATE OR REPLACE FUNCTION public.is_signup_open()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles);
$$;
GRANT EXECUTE ON FUNCTION public.is_signup_open() TO anon, authenticated;

-- =====================================================================
-- CURRENCIES + EXCHANGE RATES
-- =====================================================================
CREATE TABLE public.currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT
);
GRANT SELECT ON public.currencies TO authenticated, anon;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "currencies readable" ON public.currencies FOR SELECT TO authenticated, anon USING (true);
INSERT INTO public.currencies(code,name,symbol) VALUES
  ('MGA','Malagasy Ariary','Ar'),('EUR','Euro','€'),('USD','US Dollar','$'),
  ('GBP','Pound Sterling','£'),('CHF','Swiss Franc','CHF'),('CAD','Canadian Dollar','C$'),
  ('AUD','Australian Dollar','A$'),('JPY','Japanese Yen','¥'),('CNY','Chinese Yuan','¥');

CREATE TABLE public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_code TEXT NOT NULL REFERENCES public.currencies(code),
  to_code TEXT NOT NULL REFERENCES public.currencies(code),
  rate NUMERIC(20,8) NOT NULL CHECK (rate > 0),
  rate_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_xr_user_date ON public.exchange_rates(user_id, rate_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_rates TO authenticated;
GRANT ALL ON public.exchange_rates TO service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own xr" ON public.exchange_rates FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- WALLETS
-- =====================================================================
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.wallet_type NOT NULL DEFAULT 'cash',
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  opening_balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  status public.wallet_status NOT NULL DEFAULT 'active',
  icon TEXT,
  color TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallets_user ON public.wallets(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wallets" ON public.wallets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- BUDGET HIERARCHY
-- =====================================================================
CREATE TABLE public.budget_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT, color TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bgrp_user ON public.budget_groups(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_groups TO authenticated;
GRANT ALL ON public.budget_groups TO service_role;
ALTER TABLE public.budget_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bgrp" ON public.budget_groups FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.budget_groups(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  planned_monthly NUMERIC(20,2) NOT NULL DEFAULT 0,
  icon TEXT, color TEXT,
  is_income BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bcat_user ON public.budget_categories(user_id);
CREATE INDEX idx_bcat_group ON public.budget_categories(group_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_categories TO authenticated;
GRANT ALL ON public.budget_categories TO service_role;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bcat" ON public.budget_categories FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.budget_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,                  -- first day of month
  planned NUMERIC(20,2) NOT NULL DEFAULT 0,
  revised NUMERIC(20,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, period_month)
);
CREATE INDEX idx_bper_user ON public.budget_periods(user_id, period_month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_periods TO authenticated;
GRANT ALL ON public.budget_periods TO service_role;
ALTER TABLE public.budget_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bper" ON public.budget_periods FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- ANALYTICAL TAGS
-- =====================================================================
CREATE TABLE public.analytical_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytical_tags TO authenticated;
GRANT ALL ON public.analytical_tags TO service_role;
ALTER TABLE public.analytical_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tags" ON public.analytical_tags FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- COUNTERPARTIES
-- =====================================================================
CREATE TABLE public.counterparties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cp_user ON public.counterparties(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.counterparties TO authenticated;
GRANT ALL ON public.counterparties TO service_role;
ALTER TABLE public.counterparties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cp" ON public.counterparties FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- PROJECTS  (referenced by transactions)
-- =====================================================================
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  target_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  current_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  target_date DATE,
  status public.project_status NOT NULL DEFAULT 'planning',
  funding_wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_proj_user ON public.projects(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own proj" ON public.projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_proj_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- ASSETS
-- =====================================================================
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                       -- real_estate, land, vehicle, electronics, etc
  purchase_date DATE,
  purchase_value NUMERIC(20,2) NOT NULL DEFAULT 0,
  current_value NUMERIC(20,2) NOT NULL DEFAULT 0,
  residual_value NUMERIC(20,2) NOT NULL DEFAULT 0,
  useful_life_months INT,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  status public.asset_status NOT NULL DEFAULT 'owned',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assets_user ON public.assets(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own assets" ON public.assets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_assets_updated BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.asset_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  event_type public.asset_event_type NOT NULL,
  event_date DATE NOT NULL,
  amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ae_user ON public.asset_events(user_id);
CREATE INDEX idx_ae_asset ON public.asset_events(asset_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_events TO authenticated;
GRANT ALL ON public.asset_events TO service_role;
ALTER TABLE public.asset_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ae" ON public.asset_events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- TRANSACTIONS (central table)
-- =====================================================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  type public.txn_type NOT NULL,
  description TEXT NOT NULL,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE RESTRICT,
  to_wallet_id UUID REFERENCES public.wallets(id) ON DELETE RESTRICT, -- for transfers
  amount NUMERIC(20,2) NOT NULL,                                       -- positive amount
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  exchange_rate NUMERIC(20,8) NOT NULL DEFAULT 1,
  base_amount NUMERIC(20,2) NOT NULL,                                  -- in base currency, signed by type
  budget_category_id UUID REFERENCES public.budget_categories(id) ON DELETE SET NULL,
  counterparty_id UUID REFERENCES public.counterparties(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  notes TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tx_user_date ON public.transactions(user_id, occurred_on DESC);
CREATE INDEX idx_tx_wallet ON public.transactions(wallet_id);
CREATE INDEX idx_tx_cat ON public.transactions(budget_category_id);
CREATE INDEX idx_tx_type ON public.transactions(user_id, type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tx" ON public.transactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_tx_updated BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Tag link
CREATE TABLE public.transaction_tags (
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.analytical_tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_tags TO authenticated;
GRANT ALL ON public.transaction_tags TO service_role;
ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own txt" ON public.transaction_tags FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Wallet balance maintenance trigger
CREATE OR REPLACE FUNCTION public.apply_tx_to_wallets()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  signed NUMERIC;
BEGIN
  -- Undo OLD on update/delete
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF OLD.type = 'transfer' THEN
      IF OLD.wallet_id IS NOT NULL THEN UPDATE public.wallets SET current_balance = current_balance + OLD.amount WHERE id = OLD.wallet_id; END IF;
      IF OLD.to_wallet_id IS NOT NULL THEN UPDATE public.wallets SET current_balance = current_balance - OLD.amount WHERE id = OLD.to_wallet_id; END IF;
    ELSE
      signed := CASE WHEN OLD.type IN ('income','asset_sale','adjustment') THEN -OLD.amount ELSE OLD.amount END;
      -- reverse: income had +amount on wallet, expense had -amount
      IF OLD.wallet_id IS NOT NULL THEN
        UPDATE public.wallets SET current_balance = current_balance +
          CASE WHEN OLD.type IN ('income','asset_sale','adjustment') THEN -OLD.amount ELSE OLD.amount END
        WHERE id = OLD.wallet_id;
      END IF;
    END IF;
  END IF;
  -- Apply NEW on insert/update
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.type = 'transfer' THEN
      IF NEW.wallet_id IS NOT NULL THEN UPDATE public.wallets SET current_balance = current_balance - NEW.amount WHERE id = NEW.wallet_id; END IF;
      IF NEW.to_wallet_id IS NOT NULL THEN UPDATE public.wallets SET current_balance = current_balance + NEW.amount WHERE id = NEW.to_wallet_id; END IF;
    ELSE
      IF NEW.wallet_id IS NOT NULL THEN
        UPDATE public.wallets SET current_balance = current_balance +
          CASE WHEN NEW.type IN ('income','asset_sale','adjustment') THEN NEW.amount ELSE -NEW.amount END
        WHERE id = NEW.wallet_id;
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_tx_wallet AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_tx_to_wallets();

-- Auto-fill base_amount if absent
CREATE OR REPLACE FUNCTION public.fill_base_amount()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.base_amount IS NULL OR NEW.base_amount = 0 THEN
    NEW.base_amount := NEW.amount * COALESCE(NEW.exchange_rate, 1);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_tx_base BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.fill_base_amount();

-- =====================================================================
-- SHOPPING + PRODUCTS + PRICE HISTORY
-- =====================================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT,
  category TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
CREATE INDEX idx_prod_user ON public.products(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prod" ON public.products FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  store TEXT,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  total NUMERIC(20,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sl_user ON public.shopping_lists(user_id, occurred_on DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_lists TO authenticated;
GRANT ALL ON public.shopping_lists TO service_role;
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sl" ON public.shopping_lists FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.shopping_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit TEXT,
  quantity NUMERIC(20,4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(20,2) NOT NULL DEFAULT 0,
  total NUMERIC(20,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sli_list ON public.shopping_list_items(list_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_list_items TO authenticated;
GRANT ALL ON public.shopping_list_items TO service_role;
ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sli" ON public.shopping_list_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier TEXT,
  unit_price NUMERIC(20,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  observed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  source_item_id UUID REFERENCES public.shopping_list_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_user ON public.product_prices(user_id, observed_on DESC);
CREATE INDEX idx_pp_product ON public.product_prices(product_id, observed_on DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_prices TO authenticated;
GRANT ALL ON public.product_prices TO service_role;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pp" ON public.product_prices FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Auto-record price history from shopping items
CREATE OR REPLACE FUNCTION public.record_price_from_item()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  list_row public.shopping_lists%ROWTYPE;
BEGIN
  IF NEW.product_id IS NULL OR NEW.unit_price IS NULL OR NEW.unit_price = 0 THEN RETURN NEW; END IF;
  SELECT * INTO list_row FROM public.shopping_lists WHERE id = NEW.list_id;
  INSERT INTO public.product_prices(user_id, product_id, supplier, unit_price, currency, observed_on, source_item_id)
  VALUES (NEW.user_id, NEW.product_id, list_row.store, NEW.unit_price, list_row.currency, list_row.occurred_on, NEW.id);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_price_history AFTER INSERT ON public.shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION public.record_price_from_item();

-- =====================================================================
-- INCOME SOURCES + INVOICES TO ISSUE + PROVISIONS
-- =====================================================================
CREATE TABLE public.income_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'salary',           -- salary,business,freelance,investment,rental,other
  amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  recurring BOOLEAN NOT NULL DEFAULT true,
  cycle TEXT NOT NULL DEFAULT 'monthly',         -- monthly, weekly, yearly, one_off
  next_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_sources TO authenticated;
GRANT ALL ON public.income_sources TO service_role;
ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own is" ON public.income_sources FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.invoices_to_issue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(20,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  due_date DATE,
  issued_on DATE,
  paid_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  paid_on DATE,
  status public.invoice_status NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_user ON public.invoices_to_issue(user_id, due_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices_to_issue TO authenticated;
GRANT ALL ON public.invoices_to_issue TO service_role;
ALTER TABLE public.invoices_to_issue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own inv" ON public.invoices_to_issue FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.provisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,                                  -- insurance, tax, maintenance, travel, repair
  amount NUMERIC(20,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  due_date DATE,
  actual_amount NUMERIC(20,2),
  status public.provision_status NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prov_user ON public.provisions(user_id, due_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provisions TO authenticated;
GRANT ALL ON public.provisions TO service_role;
ALTER TABLE public.provisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prov" ON public.provisions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- DEBTS + RECEIVABLES + LOANS
-- =====================================================================
CREATE TABLE public.debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creditor TEXT NOT NULL,
  description TEXT,
  original_amount NUMERIC(20,2) NOT NULL,
  outstanding NUMERIC(20,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  due_date DATE,
  status public.debt_status NOT NULL DEFAULT 'outstanding',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_debt_user ON public.debts(user_id, due_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debts TO authenticated;
GRANT ALL ON public.debts TO service_role;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own debt" ON public.debts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_debt_updated BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  debtor TEXT NOT NULL,
  description TEXT,
  original_amount NUMERIC(20,2) NOT NULL,
  outstanding NUMERIC(20,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  due_date DATE,
  status public.debt_status NOT NULL DEFAULT 'outstanding',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rec_user ON public.receivables(user_id, due_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receivables TO authenticated;
GRANT ALL ON public.receivables TO service_role;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rec" ON public.receivables FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_rec_updated BEFORE UPDATE ON public.receivables FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lender TEXT NOT NULL,
  principal NUMERIC(20,2) NOT NULL,
  interest_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  duration_months INT NOT NULL,
  monthly_payment NUMERIC(20,2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  outstanding NUMERIC(20,2) NOT NULL,
  interest_paid NUMERIC(20,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
GRANT ALL ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own loans" ON public.loans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.loan_amortizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  period_no INT NOT NULL,
  payment_date DATE NOT NULL,
  principal_amount NUMERIC(20,2) NOT NULL,
  interest_amount NUMERIC(20,2) NOT NULL,
  balance_after NUMERIC(20,2) NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_la_loan ON public.loan_amortizations(loan_id, period_no);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_amortizations TO authenticated;
GRANT ALL ON public.loan_amortizations TO service_role;
ALTER TABLE public.loan_amortizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own la" ON public.loan_amortizations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- UTILITIES / SALARY / SUBSCRIPTIONS / GOALS / SNAPSHOTS / SCENARIOS / AUDIT
-- =====================================================================
CREATE TABLE public.utility_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.utility_type NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  previous_reading NUMERIC(20,3) NOT NULL DEFAULT 0,
  current_reading NUMERIC(20,3) NOT NULL DEFAULT 0,
  consumption NUMERIC(20,3) GENERATED ALWAYS AS (current_reading - previous_reading) STORED,
  invoice_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_util_user ON public.utility_readings(user_id, type, period_start DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.utility_readings TO authenticated;
GRANT ALL ON public.utility_readings TO service_role;
ALTER TABLE public.utility_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own util" ON public.utility_readings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.salary_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,            -- first day of month
  employer TEXT,
  gross_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  bonus NUMERIC(20,2) NOT NULL DEFAULT 0,
  benefits NUMERIC(20,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sal_user ON public.salary_records(user_id, period_month DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_records TO authenticated;
GRANT ALL ON public.salary_records TO service_role;
ALTER TABLE public.salary_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sal" ON public.salary_records FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(20,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',  -- monthly, yearly, weekly
  next_billing_date DATE,
  category TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sub" ON public.subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.financial_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  target_amount NUMERIC(20,2) NOT NULL,
  current_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MGA' REFERENCES public.currencies(code),
  target_date DATE,
  status public.goal_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_goals TO authenticated;
GRANT ALL ON public.financial_goals TO service_role;
ALTER TABLE public.financial_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goal" ON public.financial_goals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_goal_updated BEFORE UPDATE ON public.financial_goals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_att_entity ON public.attachments(entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments TO authenticated;
GRANT ALL ON public.attachments TO service_role;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own att" ON public.attachments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.monthly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_month DATE NOT NULL,                -- first day of month
  cash_position NUMERIC(20,2) NOT NULL DEFAULT 0,
  net_worth NUMERIC(20,2) NOT NULL DEFAULT 0,
  total_debt NUMERIC(20,2) NOT NULL DEFAULT 0,
  total_receivables NUMERIC(20,2) NOT NULL DEFAULT 0,
  total_investments NUMERIC(20,2) NOT NULL DEFAULT 0,
  total_assets NUMERIC(20,2) NOT NULL DEFAULT 0,
  monthly_income NUMERIC(20,2) NOT NULL DEFAULT 0,
  monthly_expense NUMERIC(20,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_month)
);
CREATE INDEX idx_snap_user ON public.monthly_snapshots(user_id, snapshot_month DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_snapshots TO authenticated;
GRANT ALL ON public.monthly_snapshots TO service_role;
ALTER TABLE public.monthly_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own snap" ON public.monthly_snapshots FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.scenario_type NOT NULL DEFAULT 'realistic',
  assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenarios TO authenticated;
GRANT ALL ON public.scenarios TO service_role;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sc" ON public.scenarios FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_user ON public.audit_log(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own audit r" ON public.audit_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own audit i" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- DASHBOARD VIEWS
-- =====================================================================
CREATE OR REPLACE VIEW public.v_monthly_cashflow
WITH (security_invoker = true) AS
SELECT
  user_id,
  date_trunc('month', occurred_on)::date AS month,
  SUM(CASE WHEN type='income' THEN base_amount ELSE 0 END) AS income,
  SUM(CASE WHEN type='expense' THEN base_amount ELSE 0 END) AS expense,
  SUM(CASE WHEN type='income' THEN base_amount WHEN type='expense' THEN -base_amount ELSE 0 END) AS net
FROM public.transactions
GROUP BY user_id, date_trunc('month', occurred_on);
GRANT SELECT ON public.v_monthly_cashflow TO authenticated;

CREATE OR REPLACE VIEW public.v_category_spend
WITH (security_invoker = true) AS
SELECT
  t.user_id,
  date_trunc('month', t.occurred_on)::date AS month,
  t.budget_category_id,
  bc.name AS category_name,
  SUM(CASE WHEN t.type='expense' THEN t.base_amount ELSE 0 END) AS spent
FROM public.transactions t
LEFT JOIN public.budget_categories bc ON bc.id = t.budget_category_id
GROUP BY t.user_id, date_trunc('month', t.occurred_on), t.budget_category_id, bc.name;
GRANT SELECT ON public.v_category_spend TO authenticated;
