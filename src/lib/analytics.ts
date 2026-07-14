// Pure analytical helpers for the Personal CFO.
// Net Worth, Cash-Flow Forecast, Financial Health Score, Growth.

export type RecurringCycle = "weekly" | "monthly" | "yearly" | "one_off" | string;

/** Convert any recurring amount into a per-day equivalent. */
export function perDayAmount(amount: number, cycle: RecurringCycle): number {
  switch (cycle) {
    case "weekly": return amount / 7;
    case "yearly": return amount / 365;
    case "one_off": return 0;
    case "monthly":
    default: return amount / 30;
  }
}

/** Sum of recurring income per day (from income_sources, active + recurring only). */
export function dailyRecurringIncome(rows: Array<{ amount: number; cycle: string; recurring: boolean; active: boolean }>) {
  return rows
    .filter(r => r.recurring && r.active)
    .reduce((s, r) => s + perDayAmount(Number(r.amount), r.cycle), 0);
}

/** Sum of subscriptions per day (active only). */
export function dailySubscriptions(rows: Array<{ amount: number; billing_cycle: string; active: boolean }>) {
  return rows
    .filter(r => r.active)
    .reduce((s, r) => s + perDayAmount(Number(r.amount), r.billing_cycle), 0);
}

/** Estimate average daily discretionary expense from recent transactions. */
export function dailyAverageExpense(tx: Array<{ type: string; base_amount: number; occurred_on: string }>, daysWindow = 90) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - daysWindow);
  const exp = tx
    .filter(t => t.type === "expense" && new Date(t.occurred_on) >= cutoff)
    .reduce((s, t) => s + Number(t.base_amount), 0);
  return exp / daysWindow;
}

export interface RecurringSchedule {
  amount: number;
  cycle: string;
  /** Next occurrence — anchor date. If in the past, we roll forward to first future date. */
  nextDate: string | null;
}

export interface ForecastInputs {
  startingCash: number;
  /** Residual (non-recurring) daily income baseline — small ambient flow. */
  dailyIncome: number;
  /** Residual (non-recurring) daily expense baseline — discretionary spend. */
  dailyExpense: number;
  /** Recurring inflows scheduled on their real cadence (salary, rent income, ...). */
  recurringInflows?: RecurringSchedule[];
  /** Recurring outflows scheduled on their real cadence (subscriptions, rent, ...). */
  recurringOutflows?: RecurringSchedule[];
  /** One-off scheduled inflows: receivables expected by due_date */
  inflows: Array<{ amount: number; due_date: string | null }>;
  /** One-off scheduled outflows: debts + provisions due by date */
  outflows: Array<{ amount: number; due_date: string | null }>;
}

export interface ForecastPoint { day: number; date: string; balance: number; }

function cycleDays(cycle: string): number {
  switch ((cycle || "monthly").toLowerCase()) {
    case "daily": return 1;
    case "weekly": return 7;
    case "biweekly": case "bi-weekly": return 14;
    case "monthly": return 30;
    case "bimonthly": return 60;
    case "quarterly": return 91;
    case "semiannual": case "semiannually": return 182;
    case "yearly": case "annual": case "annually": return 365;
    case "one_off": return 0;
    default: return 30;
  }
}

export function buildForecast(
  { startingCash, dailyIncome, dailyExpense, recurringInflows = [], recurringOutflows = [], inflows, outflows }: ForecastInputs,
  horizonDays = 365,
): ForecastPoint[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;

  // Bucket scheduled cash by day offset.
  const bucket = new Map<number, number>();
  const addBucket = (date: string | null, amt: number) => {
    if (!date) return;
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const offset = Math.round((d.getTime() - today.getTime()) / dayMs);
    if (offset < 0 || offset > horizonDays) return;
    bucket.set(offset, (bucket.get(offset) ?? 0) + amt);
  };

  const scheduleRecurring = (r: RecurringSchedule, sign: 1 | -1) => {
    const step = cycleDays(r.cycle);
    if (step <= 0 || !r.amount) return;
    // Anchor: nextDate if provided, else today.
    const anchor = r.nextDate ? new Date(r.nextDate) : new Date(today);
    anchor.setHours(0, 0, 0, 0);
    let offset = Math.round((anchor.getTime() - today.getTime()) / dayMs);
    // Roll forward past dates to first future occurrence.
    while (offset < 0) offset += step;
    while (offset <= horizonDays) {
      bucket.set(offset, (bucket.get(offset) ?? 0) + sign * Number(r.amount));
      offset += step;
    }
  };

  for (const r of recurringInflows) scheduleRecurring(r, 1);
  for (const r of recurringOutflows) scheduleRecurring(r, -1);
  for (const i of inflows) addBucket(i.due_date, Number(i.amount));
  for (const o of outflows) addBucket(o.due_date, -Number(o.amount));

  const daily = dailyIncome - dailyExpense;
  let balance = startingCash;
  const out: ForecastPoint[] = [{ day: 0, date: today.toISOString().slice(0, 10), balance }];
  for (let d = 1; d <= horizonDays; d++) {
    balance += daily + (bucket.get(d) ?? 0);
    const dt = new Date(today.getTime() + d * dayMs);
    out.push({ day: d, date: dt.toISOString().slice(0, 10), balance });
  }
  return out;
}

export function forecastAt(points: ForecastPoint[], day: number): number {
  const p = points.find(x => x.day === day) ?? points[points.length - 1];
  return p.balance;
}

// ---------- Financial Health Score (0-100) ----------

export interface HealthInputs {
  monthlyIncome: number;
  monthlyExpense: number;
  cash: number;
  totalDebt: number;
  totalAssets: number;
  /** Net worth growth over the last 3 months as a fraction (e.g. 0.05 = 5%). */
  netWorthGrowth3m: number;
}

export interface HealthBreakdown {
  score: number;
  savingsRate: number;       // %
  debtRatio: number;         // debt / (assets + cash)
  liquidityRatio: number;    // cash / monthly expense
  emergencyMonths: number;   // cash / monthly expense
  growth: number;            // %, 3-month
  parts: { label: string; value: number; max: number }[];
}

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

export function computeHealth(i: HealthInputs): HealthBreakdown {
  const savingsRate = i.monthlyIncome > 0 ? (i.monthlyIncome - i.monthlyExpense) / i.monthlyIncome : 0;
  const totalAssetsWithCash = i.totalAssets + i.cash;
  const debtRatio = totalAssetsWithCash > 0 ? i.totalDebt / totalAssetsWithCash : (i.totalDebt > 0 ? 1 : 0);
  const emergencyMonths = i.monthlyExpense > 0 ? i.cash / i.monthlyExpense : (i.cash > 0 ? 12 : 0);
  const liquidityRatio = emergencyMonths; // synonym in single-user context

  // Sub-scores
  const sSavings = clamp01(savingsRate / 0.3) * 25;                // 30%+ savings → full marks (25 pts)
  const sDebt = (1 - clamp01(debtRatio / 0.6)) * 25;               // ≤60% debt ratio for safety
  const sLiquidity = clamp01(emergencyMonths / 3) * 15;            // 3 months → full (15)
  const sEmergency = clamp01(emergencyMonths / 6) * 20;            // 6 months → full (20)
  const sGrowth = clamp01((i.netWorthGrowth3m + 0.02) / 0.08) * 15;// from -2% to +6% over 3m

  const score = Math.round(sSavings + sDebt + sLiquidity + sEmergency + sGrowth);
  return {
    score: Math.max(0, Math.min(100, score)),
    savingsRate: savingsRate * 100,
    debtRatio,
    liquidityRatio,
    emergencyMonths,
    growth: i.netWorthGrowth3m * 100,
    parts: [
      { label: "Taux d'épargne", value: Math.round(sSavings), max: 25 },
      { label: "Ratio de dette", value: Math.round(sDebt), max: 25 },
      { label: "Liquidité", value: Math.round(sLiquidity), max: 15 },
      { label: "Fonds d'urgence", value: Math.round(sEmergency), max: 20 },
      { label: "Croissance 3 mois", value: Math.round(sGrowth), max: 15 },
    ],
  };
}

export function scoreTone(score: number): "positive" | "neutral" | "warning" | "negative" {
  if (score >= 75) return "positive";
  if (score >= 55) return "neutral";
  if (score >= 35) return "warning";
  return "negative";
}

// ---------- Growth ----------

export function growthRate(current: number, previous: number): number {
  if (!previous) return 0;
  return (current - previous) / Math.abs(previous);
}

/** Asset allocation buckets from raw assets + cash + investments. */
export function buildAllocation(assets: Array<{ type: string; current_value: number }>, cash: number) {
  const m = new Map<string, number>();
  for (const a of assets) {
    const k = a.type || "autre";
    m.set(k, (m.get(k) ?? 0) + Number(a.current_value));
  }
  const out = Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  if (cash > 0) out.unshift({ name: "liquidités", value: cash });
  return out.sort((a, b) => b.value - a.value);
}
