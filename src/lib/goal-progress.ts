import { buildTree, descendantIds, type BudgetNode } from "@/lib/budget-nodes";
import { resolvePeriod, isoDate, type PeriodPreset } from "@/lib/period";

export type GoalType =
  | "savings_balance"    // Solde d'épargne (trésorerie cumulée)
  | "net_worth"          // Valeur nette (actifs + créances − dettes + cash)
  | "debt_reduction"     // Réduction de dette (dette restante ↓ vers 0 = cible)
  | "spending_cap"       // Plafond de dépense (dépense sur période, cible = plafond)
  | "savings_rate"       // Taux d'épargne (% du revenu épargné sur période)
  | "category_spend";    // Dépense sur une feuille budgétaire précise

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  savings_balance: "Solde trésorerie disponible",
  net_worth: "Valeur nette (patrimoine)",
  debt_reduction: "Réduction de dette",
  spending_cap: "Plafond de dépense (catégorie)",
  savings_rate: "Taux d'épargne (%)",
  category_spend: "Dépense sur une feuille budgétaire",
};

export const GOAL_TYPES_NEED_NODE: GoalType[] = ["spending_cap", "category_spend"];
export const GOAL_TYPES_NEED_PERIOD: GoalType[] = ["spending_cap", "category_spend", "savings_rate"];

// Wallet types considered "savings buckets" for the savings_rate goal.
const SAVINGS_WALLET_TYPES = new Set(["savings", "hidden_cash"]);

type Tx = { type: string; base_amount: number | string; occurred_on: string; budget_node_id: string | null };
type Wallet = { current_balance: number | string; type?: string };
type Debt = { outstanding: number | string; status?: string };
type Asset = { current_value: number | string; status?: string };
type Receivable = { outstanding: number | string; status?: string };

export type ProgressInput = {
  txs: Tx[];
  wallets: Wallet[];
  debts: Debt[];
  assets: Asset[];
  receivables: Receivable[];
  nodes: BudgetNode[];
};

export type ProgressResult = {
  current: number;
  target: number;
  pct: number;          // 0..100
  label: string;        // description of computation
  inverse: boolean;     // true when lower is better (debt/spending)
};

function num(v: any) { return Number(v ?? 0); }

function periodWindow(scope: string | null | undefined, ps?: string | null, pe?: string | null) {
  const preset = (scope ?? "ytd") as PeriodPreset;
  const custom = preset === "custom" ? { from: ps ?? undefined, to: pe ?? undefined } : undefined;
  const r = resolvePeriod(preset, new Date(), custom);
  return { from: isoDate(r.from), to: isoDate(r.to), label: r.label };
}

export function computeGoalProgress(goal: any, data: ProgressInput): ProgressResult {
  const type = (goal.goal_type ?? "savings_balance") as GoalType;
  const target = num(goal.target_amount);

  if (type === "savings_balance") {
    // Solde de trésorerie disponible: tous les portefeuilles sauf crédit
    const current = data.wallets
      .filter(w => (w.type ?? "") !== "credit")
      .reduce((s, w) => s + num(w.current_balance), 0);
    return {
      current, target,
      pct: target > 0 ? Math.min(100, (current / target) * 100) : 0,
      label: "Trésorerie disponible (hors crédit)",
      inverse: false,
    };
  }

  if (type === "net_worth") {
    const cash = data.wallets.reduce((s, w) => s + num(w.current_balance), 0);
    const assets = data.assets.filter(a => (a.status ?? "owned") === "owned").reduce((s, a) => s + num(a.current_value), 0);
    const debts = data.debts.filter(d => d.status !== "settled" && d.status !== "cancelled").reduce((s, d) => s + num(d.outstanding), 0);
    const rec = data.receivables.filter(r => r.status !== "settled" && r.status !== "cancelled").reduce((s, r) => s + num(r.outstanding), 0);
    const current = cash + assets + rec - debts;
    return {
      current, target,
      pct: target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0,
      label: "Cash + actifs + créances − dettes",
      inverse: false,
    };
  }

  if (type === "debt_reduction") {
    const outstanding = data.debts.filter(d => d.status !== "settled" && d.status !== "cancelled").reduce((s, d) => s + num(d.outstanding), 0);
    // target = niveau de dette visé (ex 0). progression = (start - current) / (start - target)
    // Simplification : si target=0, pct = 100 * (1 - current / initialCap), avec initialCap = max(outstanding, 1)
    // On affiche la dette restante comme "current", cible atteinte quand outstanding <= target.
    const pct = outstanding <= target ? 100 : (target > 0 ? Math.max(0, 100 * (1 - (outstanding - target) / outstanding)) : Math.max(0, 100 - outstanding / Math.max(outstanding, 1) * 100));
    return {
      current: outstanding, target,
      pct: Math.min(100, pct),
      label: "Dette restante",
      inverse: true,
    };
  }

  // Period-based types
  const { from, to, label: pLabel } = periodWindow(goal.period_scope, goal.period_start, goal.period_end);
  const inRange = (t: Tx) => t.occurred_on >= from && t.occurred_on <= to;
  const tree = buildTree(data.nodes);
  const nodeIds = goal.budget_node_id
    ? new Set<string>([goal.budget_node_id, ...descendantIds(tree, goal.budget_node_id)])
    : null;

  if (type === "spending_cap" || type === "category_spend") {
    const spent = data.txs
      .filter(t => t.type === "expense" && inRange(t))
      .filter(t => !nodeIds || (t.budget_node_id && nodeIds.has(t.budget_node_id)))
      .reduce((s, t) => s + num(t.base_amount), 0);
    return {
      current: spent, target,
      pct: target > 0 ? Math.min(100, (spent / target) * 100) : 0,
      label: `Dépenses · ${pLabel}${goal.budget_node_id ? " (feuille + descendants)" : ""}`,
      inverse: type === "spending_cap",
    };
  }

  if (type === "savings_rate") {
    const inPeriod = data.txs.filter(inRange);
    const income = inPeriod.filter(t => t.type === "income").reduce((s, t) => s + num(t.base_amount), 0);
    const expense = inPeriod.filter(t => t.type === "expense").reduce((s, t) => s + num(t.base_amount), 0);
    const rate = income > 0 ? ((income - expense) / income) * 100 : 0;
    return {
      current: rate, target,
      pct: target > 0 ? Math.min(100, Math.max(0, (rate / target) * 100)) : 0,
      label: `Taux d'épargne · ${pLabel}`,
      inverse: false,
    };
  }

  return { current: 0, target, pct: 0, label: "—", inverse: false };
}
