
-- Objectifs : type d'objectif + période à surveiller (réutilise budget_node_id existant)
ALTER TABLE public.financial_goals ADD COLUMN IF NOT EXISTS goal_type text;
ALTER TABLE public.financial_goals ADD COLUMN IF NOT EXISTS period_scope text;
ALTER TABLE public.financial_goals ADD COLUMN IF NOT EXISTS period_start date;
ALTER TABLE public.financial_goals ADD COLUMN IF NOT EXISTS period_end date;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_goals_goal_type_check') THEN
    ALTER TABLE public.financial_goals ADD CONSTRAINT financial_goals_goal_type_check
      CHECK (goal_type IS NULL OR goal_type IN ('savings_balance','net_worth','debt_reduction','spending_cap','savings_rate','category_spend'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_goals_period_scope_check') THEN
    ALTER TABLE public.financial_goals ADD CONSTRAINT financial_goals_period_scope_check
      CHECK (period_scope IS NULL OR period_scope IN ('mtd','qtd','ytd','ltm','all_time','custom'));
  END IF;
END $$;

-- Projets : clôture + actif résultant
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS resulted_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL;

-- Dettes : lien projet (pour emprunts sur enveloppe)
ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
