
-- Drop duplicate triggers on transactions (wallets + projects fired twice, doubling balances)
DROP TRIGGER IF EXISTS trg_tx_wallet ON public.transactions;
DROP TRIGGER IF EXISTS apply_tx_to_projects_trg ON public.transactions;

-- Recompute wallet balances from scratch, preserving each wallet's initial_balance.
-- Current state: current_balance = initial_balance + 2 * net_delta  (triggers ran twice historically).
-- Target:        current_balance = initial_balance + 1 * net_delta.
-- So subtract one net_delta per wallet.
WITH deltas AS (
  SELECT w.id,
    COALESCE((
      SELECT SUM(
        CASE
          WHEN t.type = 'transfer' THEN -t.amount
          WHEN t.type IN ('income','asset_sale','adjustment','enveloppe_emprunt','dette') THEN t.amount
          ELSE -t.amount
        END)
      FROM public.transactions t WHERE t.wallet_id = w.id
    ), 0)
    + COALESCE((
      SELECT SUM(t.amount) FROM public.transactions t
      WHERE t.to_wallet_id = w.id AND t.type = 'transfer'
    ), 0) AS d
  FROM public.wallets w
)
UPDATE public.wallets w
SET current_balance = w.current_balance - d.d
FROM deltas d
WHERE d.id = w.id;

-- Recompute project envelope_balance & total_spent similarly (same doubling).
WITH pd AS (
  SELECT p.id,
    COALESCE((SELECT SUM(CASE WHEN t.type='enveloppe_projet' THEN t.amount
                              WHEN t.type='enveloppe_emprunt' THEN -t.amount ELSE 0 END)
              FROM public.transactions t WHERE t.project_id = p.id), 0) AS env,
    COALESCE((SELECT SUM(t.amount) FROM public.transactions t
              WHERE t.project_id = p.id AND t.type='investment'), 0) AS spent
  FROM public.projects p
)
UPDATE public.projects p
SET envelope_balance = p.envelope_balance - pd.env,
    total_spent      = p.total_spent      - pd.spent
FROM pd
WHERE pd.id = p.id;
