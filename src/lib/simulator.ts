/**
 * Vague 2 — analyse actionnable : structure du coût de vie, dérives de postes,
 * et simulateur « what-if ». Fonctions pures, aucun accès réseau.
 */

import { baseAmount, isOperationalIE, type TransactionLike } from "@/lib/finance";

/* ------------------------------------------------------------------ */
/* Coût de vie                                                         */
/* ------------------------------------------------------------------ */

export type CategoryCost = {
  key: string;
  label: string;
  /** Moyenne mensuelle sur la fenêtre analysée. */
  monthly: number;
  /** Part dans les dépenses opérationnelles (%). */
  share: number;
  /** Variation entre les 3 derniers mois et les 3 précédents (%), null si non calculable. */
  drift: number | null;
  /** Montant mensuel de la dérive (positif = alourdissement). */
  driftAmount: number;
  /** Médiane mensuelle du poste — référence robuste aux mois exceptionnels. */
  median: number;
  /** Écart absolu médian (MAD) → dispersion robuste. */
  mad: number;
  /** Dernier mois observé. */
  lastMonth: number;
  /** Écart du dernier mois vs médiane, en nombre de MAD (score d'anomalie robuste). */
  zScore: number | null;
  /** Pente de tendance (montant/mois) par régression linéaire sur la fenêtre. */
  trendSlope: number;
  /** Coefficient de variation robuste (MAD / médiane), 0..n. */
  volatility: number;
  /** Nombre de mois où le poste a été mouvementé (régularité). */
  activeMonths: number;
  /** true si le poste dépasse durablement sa médiane (dérive structurelle, pas un pic isolé). */
  structural: boolean;
};


export type LifestyleCost = {
  monthlyExpense: number;
  monthlyIncome: number;
  /** Engagements récurrents mensualisés (abonnements actifs). */
  committedMonthly: number;
  /** Part récurrente du train de vie (%). */
  committedShare: number;
  /** Dépense variable restante. */
  variableMonthly: number;
  dailyBurn: number;
  /** Nombre de mois de train de vie couverts par la trésorerie. */
  runwayMonths: number;
  categories: CategoryCost[];
  monthsAnalyzed: number;
};

function monthKey(d: string | null | undefined) {
  return String(d ?? "").slice(0, 7);
}

export function monthlyFromCycle(amount: number, cycle: string | null | undefined) {
  const c = (cycle || "monthly").toLowerCase();
  if (c === "daily") return amount * 30;
  if (c === "weekly") return amount * 4.345;
  if (c === "biweekly" || c === "bi-weekly") return amount * 2.17;
  if (c === "bimonthly") return amount / 2;
  if (c === "quarterly") return amount / 3;
  if (c === "semiannual" || c === "semiannually") return amount / 6;
  if (c === "yearly" || c === "annual" || c === "annually") return amount / 12;
  return amount;
}

function addMonths(ref: Date, delta: number) {
  return new Date(ref.getFullYear(), ref.getMonth() + delta, 1);
}

function monthList(ref: Date, count: number) {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = addMonths(ref, -i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export type LifestyleInput = {
  transactions: TransactionLike[];
  /** node_id -> libellé lisible. */
  nodeLabels: Record<string, string>;
  subscriptions: Array<{ amount: number; billing_cycle: string; active: boolean }>;
  cash: number;
  months?: number;
  today?: Date;
};

/** Décompose le train de vie réel observé dans les transactions. */
export function computeLifestyleCost(input: LifestyleInput): LifestyleCost {
  const today = input.today ?? new Date();
  const months = Math.max(3, input.months ?? 6);
  const keys = monthList(today, months);
  const window = new Set(keys);

  const rows = input.transactions.filter(isOperationalIE).filter((t) => window.has(monthKey(t.occurred_on)));

  let expense = 0;
  let income = 0;
  const perCategory = new Map<string, { label: string; total: number; byMonth: Map<string, number> }>();

  for (const t of rows) {
    const amt = baseAmount(t);
    if (t.type === "income") {
      income += amt;
      continue;
    }
    expense += amt;
    const key = (t as any).budget_node_id ?? "__none__";
    const label = key === "__none__" ? "Non catégorisé" : (input.nodeLabels[key] ?? "Ligne budgétaire supprimée");
    const row = perCategory.get(key) ?? { label, total: 0, byMonth: new Map<string, number>() };
    row.total += amt;
    const mk = monthKey(t.occurred_on);
    row.byMonth.set(mk, (row.byMonth.get(mk) ?? 0) + amt);
    perCategory.set(key, row);
  }

  const monthlyExpense = expense / months;
  const monthlyIncome = income / months;

  const recent = keys.slice(-3);
  const previous = keys.slice(-6, -3);

  const categories: CategoryCost[] = [...perCategory.entries()]
    .map(([key, row]) => {
      const monthly = row.total / months;
      const avg = (list: string[]) =>
        list.length ? list.reduce((s, m) => s + (row.byMonth.get(m) ?? 0), 0) / list.length : 0;
      const r = avg(recent);
      const p = previous.length === 3 ? avg(previous) : null;
      const driftAmount = p == null ? 0 : r - p;
      const drift = p == null || p <= 0 ? null : (driftAmount / p) * 100;
      return {
        key,
        label: row.label,
        monthly,
        share: monthlyExpense > 0 ? (monthly / monthlyExpense) * 100 : 0,
        drift,
        driftAmount,
      };
    })
    .sort((a, b) => b.monthly - a.monthly);

  const committedMonthly = input.subscriptions
    .filter((s) => s.active)
    .reduce((s, x) => s + monthlyFromCycle(Number(x.amount ?? 0), x.billing_cycle), 0);

  return {
    monthlyExpense,
    monthlyIncome,
    committedMonthly,
    committedShare: monthlyExpense > 0 ? (committedMonthly / monthlyExpense) * 100 : 0,
    variableMonthly: Math.max(0, monthlyExpense - committedMonthly),
    dailyBurn: monthlyExpense / 30,
    runwayMonths: monthlyExpense > 0 ? input.cash / monthlyExpense : 0,
    categories,
    monthsAnalyzed: months,
  };
}

/** Postes dont la dérive récente est significative — base des alertes prédictives. */
export function detectDrifts(cost: LifestyleCost, opts: { minAmount?: number; minPct?: number } = {}) {
  const minAmount = opts.minAmount ?? Math.max(1, cost.monthlyExpense * 0.03);
  const minPct = opts.minPct ?? 15;
  return cost.categories
    .filter((c) => c.drift != null && Math.abs(c.drift) >= minPct && Math.abs(c.driftAmount) >= minAmount)
    .sort((a, b) => Math.abs(b.driftAmount) - Math.abs(a.driftAmount));
}

/* ------------------------------------------------------------------ */
/* Simulateur what-if                                                  */
/* ------------------------------------------------------------------ */

export type SimBase = {
  cash: number;
  monthlyIncome: number;
  monthlyExpense: number;
  totalDebt: number;
  netWorth: number;
};

export type SimLevers = {
  /** Réduction des dépenses (%). */
  expenseCutPct: number;
  /** Hausse des revenus (%). */
  incomeUpPct: number;
  /** Charge mensuelle supplémentaire (montant en devise de base). */
  extraMonthlyCost: number;
  /** Remboursement mensuel supplémentaire affecté à la dette. */
  extraDebtPayment: number;
  /** Horizon de projection en mois. */
  horizonMonths: number;
};

export const DEFAULT_LEVERS: SimLevers = {
  expenseCutPct: 0,
  incomeUpPct: 0,
  extraMonthlyCost: 0,
  extraDebtPayment: 0,
  horizonMonths: 24,
};

export type SimOutcome = {
  monthlyIncome: number;
  monthlyExpense: number;
  monthlyNet: number;
  savingsRate: number;
  emergencyMonths: number;
  /** Trésorerie projetée à l'horizon. */
  cashAtHorizon: number;
  /** Patrimoine net projeté à l'horizon. */
  netWorthAtHorizon: number;
  /** Mois nécessaires pour être libéré de la dette (null si pas de dette, Infinity si jamais). */
  debtFreeMonths: number | null;
  /** Mois nécessaires pour atteindre 3 mois de réserve (null si déjà atteint). */
  monthsToEmergency: number | null;
  path: Array<{ month: number; cash: number; debt: number }>;
};

function monthsToRepay(debt: number, payment: number) {
  if (debt <= 0) return null;
  if (payment <= 0) return Infinity;
  return Math.ceil(debt / payment);
}

/** Applique les leviers et projette trésorerie / dette / patrimoine. */
export function simulate(base: SimBase, levers: SimLevers): SimOutcome {
  const income = base.monthlyIncome * (1 + levers.incomeUpPct / 100);
  const expense = Math.max(0, base.monthlyExpense * (1 - levers.expenseCutPct / 100) + levers.extraMonthlyCost);
  const net = income - expense;
  const debtPayment = Math.max(0, levers.extraDebtPayment);
  const freeCash = net - debtPayment;

  const horizon = Math.max(1, Math.round(levers.horizonMonths));
  const path: Array<{ month: number; cash: number; debt: number }> = [];
  let cash = base.cash;
  let debt = base.totalDebt;
  for (let m = 1; m <= horizon; m++) {
    const applied = Math.min(debt, debtPayment);
    debt = Math.max(0, debt - applied);
    cash = cash + net - applied;
    path.push({ month: m, cash, debt });
  }

  const emergencyMonths = expense > 0 ? base.cash / expense : 0;
  const targetGap = expense * 3 - base.cash;

  return {
    monthlyIncome: income,
    monthlyExpense: expense,
    monthlyNet: net,
    savingsRate: income > 0 ? (net / income) * 100 : 0,
    emergencyMonths,
    cashAtHorizon: cash,
    netWorthAtHorizon: base.netWorth + (cash - base.cash) + (base.totalDebt - debt),
    debtFreeMonths: monthsToRepay(base.totalDebt, debtPayment),
    monthsToEmergency: targetGap <= 0 ? null : freeCash > 0 ? Math.ceil(targetGap / freeCash) : Infinity,
    path,
  };
}

export type LeverSuggestion = {
  key: string;
  label: string;
  detail: string;
  /** Gain mensuel estimé si le levier est activé. */
  monthlyGain: number;
  levers: Partial<SimLevers>;
};

/** Leviers pré-calculés à partir des données réelles, prêts à être testés. */
export function suggestLevers(base: SimBase, cost: LifestyleCost): LeverSuggestion[] {
  const out: LeverSuggestion[] = [];
  const top = cost.categories[0];

  if (top && top.monthly > 0) {
    out.push({
      key: "top_category",
      label: `Réduire « ${top.label} » de 15 %`,
      detail: `Ce poste pèse ${top.share.toFixed(0)} % du train de vie (${Math.round(top.monthly).toLocaleString("fr-FR")}/mois).`,
      monthlyGain: top.monthly * 0.15,
      levers: {
        expenseCutPct: cost.monthlyExpense > 0 ? (top.monthly * 0.15 / cost.monthlyExpense) * 100 : 0,
      },
    });
  }

  if (cost.committedMonthly > 0) {
    out.push({
      key: "subs_review",
      label: "Nettoyer 20 % des abonnements",
      detail: `Engagements récurrents : ${Math.round(cost.committedMonthly).toLocaleString("fr-FR")}/mois, soit ${cost.committedShare.toFixed(0)} % des dépenses.`,
      monthlyGain: cost.committedMonthly * 0.2,
      levers: {
        expenseCutPct: cost.monthlyExpense > 0 ? (cost.committedMonthly * 0.2 / cost.monthlyExpense) * 100 : 0,
      },
    });
  }

  const drifts = detectDrifts(cost).filter((d) => d.driftAmount > 0);
  if (drifts.length) {
    const total = drifts.reduce((s, d) => s + d.driftAmount, 0);
    out.push({
      key: "reverse_drift",
      label: "Annuler les dérives récentes",
      detail: `${drifts.length} poste(s) en hausse sur 3 mois (${drifts.slice(0, 2).map((d) => d.label).join(", ")}).`,
      monthlyGain: total,
      levers: {
        expenseCutPct: cost.monthlyExpense > 0 ? (total / cost.monthlyExpense) * 100 : 0,
      },
    });
  }

  if (base.totalDebt > 0 && base.monthlyIncome > base.monthlyExpense) {
    const spare = (base.monthlyIncome - base.monthlyExpense) * 0.5;
    out.push({
      key: "debt_sprint",
      label: "Affecter 50 % de l'excédent à la dette",
      detail: `Encours actuel : ${Math.round(base.totalDebt).toLocaleString("fr-FR")}. Un remboursement de ${Math.round(spare).toLocaleString("fr-FR")}/mois raccourcit fortement la sortie.`,
      monthlyGain: 0,
      levers: { extraDebtPayment: spare },
    });
  }

  if (base.monthlyIncome > 0) {
    out.push({
      key: "income_up",
      label: "Augmenter les revenus de 10 %",
      detail: "Mission complémentaire, revalorisation ou revenu locatif : l'effet est structurel, pas ponctuel.",
      monthlyGain: base.monthlyIncome * 0.1,
      levers: { incomeUpPct: 10 },
    });
  }

  return out.sort((a, b) => b.monthlyGain - a.monthlyGain);
}
