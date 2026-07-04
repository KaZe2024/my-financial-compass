CREATE OR REPLACE VIEW public.v_node_spend AS
SELECT
  user_id,
  budget_node_id AS node_id,
  (date_trunc('month'::text, (occurred_on)::timestamp with time zone))::date AS month,
  sum(
    CASE
      WHEN type = ANY (ARRAY['income'::txn_type, 'expense'::txn_type, 'investment'::txn_type, 'asset_purchase'::txn_type, 'asset_sale'::txn_type, 'adjustment'::txn_type]) THEN base_amount
      ELSE 0::numeric
    END
  ) AS spent
FROM transactions t
WHERE budget_node_id IS NOT NULL
GROUP BY user_id, budget_node_id, (date_trunc('month'::text, (occurred_on)::timestamp with time zone));