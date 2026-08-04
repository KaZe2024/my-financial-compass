// Pure analytical helpers for the OPTIS.
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

// ---------- Prévision de trésorerie "expert" ----------

export interface CashItem {
  label: string;
  amount: number;            // signé : + entrée, - sortie
  date: string | null;       // échéance
  confidence?: number;       // pondération 0..1 (probabilité d'encaissement/décaissement)
  group: string;             // regroupement pour l'explication
}

export interface MonthBaseline {
  /** "YYYY-MM" */
  month: string;
  income: number;
  expense: number;
  /** true si issu du budget planifié, false si extrapolé des 90 derniers jours */
  planned: boolean;
}

export interface ExpertForecastInput {
  startingCash: number;
  baselines: MonthBaseline[];
  items: CashItem[];
  /** Les échéances déjà dépassées sont replacées à J+graceDays. */
  graceDays?: number;
}

export interface ExpertForecast {
  points: ForecastPoint[];
  /** Point le plus bas de l'horizon. */
  low: ForecastPoint;
  /** Premier jour où le solde devient négatif, sinon null. */
  breachDay: ForecastPoint | null;
  /** Détail des flux ponctuels retenus, groupés. */
  groups: { group: string; inflow: number; outflow: number; count: number }[];
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonthOf(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function buildExpertForecast(
  { startingCash, baselines, items, graceDays = 7 }: ExpertForecastInput,
  horizonDays = 365,
): ExpertForecast {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  const byMonth = new Map(baselines.map(b => [b.month, b]));

  // Flux ponctuels bucketisés par jour.
  const bucket = new Map<number, number>();
  const groups = new Map<string, { group: string; inflow: number; outflow: number; count: number }>();
  for (const it of items) {
    const weight = it.confidence ?? 1;
    const amt = it.amount * weight;
    if (!amt) continue;
    let offset = graceDays;
    if (it.date) {
      const d = new Date(it.date); d.setHours(0, 0, 0, 0);
      offset = Math.round((d.getTime() - today.getTime()) / dayMs);
      if (offset < 0) offset = graceDays;          // échéance dépassée → régularisation proche
    }
    if (offset > horizonDays) continue;
    bucket.set(offset, (bucket.get(offset) ?? 0) + amt);
    const g = groups.get(it.group) ?? { group: it.group, inflow: 0, outflow: 0, count: 0 };
    if (amt > 0) g.inflow += amt; else g.outflow += -amt;
    g.count += 1;
    groups.set(it.group, g);
  }

  let balance = startingCash;
  const points: ForecastPoint[] = [{ day: 0, date: today.toISOString().slice(0, 10), balance }];
  let low = points[0];
  let breach: ForecastPoint | null = balance < 0 ? points[0] : null;

  for (let d = 1; d <= horizonDays; d++) {
    const dt = new Date(today.getTime() + d * dayMs);
    const b = byMonth.get(monthKey(dt));
    const dim = daysInMonthOf(dt);
    const dailyNet = b ? (b.income - b.expense) / dim : 0;
    balance += dailyNet + (bucket.get(d) ?? 0);
    const p = { day: d, date: dt.toISOString().slice(0, 10), balance };
    points.push(p);
    if (p.balance < low.balance) low = p;
    if (!breach && p.balance < 0) breach = p;
  }

  return {
    points,
    low,
    breachDay: breach,
    groups: Array.from(groups.values()).sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow)),
  };
}

// ---------- Commentaire qualitatif (analyste financier) ----------

export interface HealthCommentary {
  verdict: string;
  summary: string;
  strengths: string[];
  risks: string[];
  actions: string[];
}

/** Lecture qualitative du score de santé, style note d'analyste. */
export function healthCommentary(h: HealthBreakdown): HealthCommentary {
  const tone = scoreTone(h.score);
  const verdict =
    tone === "positive" ? "Solide — profil investisseur"
    : tone === "neutral" ? "Correct — marge de progression"
    : tone === "warning" ? "Fragile — vigilance requise"
    : "Sous tension — redressement prioritaire";

  const strengths: string[] = [];
  const risks: string[] = [];
  const actions: string[] = [];

  // Capacité d'épargne
  if (h.savingsRate >= 25) strengths.push(`Capacité d'épargne élevée (${h.savingsRate.toFixed(0)} %) : le foyer autofinance sa croissance.`);
  else if (h.savingsRate >= 10) strengths.push(`Épargne positive mais moyenne (${h.savingsRate.toFixed(0)} %), en dessous du standard de 20-30 %.`);
  else if (h.savingsRate >= 0) {
    risks.push(`Taux d'épargne trop faible (${h.savingsRate.toFixed(0)} %) : aucun coussin d'accumulation.`);
    actions.push("Fixer une règle d'épargne automatique de 20 % du revenu net en début de mois.");
  } else {
    risks.push(`Épargne négative (${h.savingsRate.toFixed(0)} %) : les charges dépassent les revenus, ponction sur la trésorerie.`);
    actions.push("Réduire les charges récurrentes non essentielles jusqu'au retour à un solde mensuel positif.");
  }

  // Levier / dette
  if (h.debtRatio <= 0.2) strengths.push(`Endettement maîtrisé (${(h.debtRatio * 100).toFixed(0)} % du patrimoine) : capacité d'emprunt intacte.`);
  else if (h.debtRatio <= 0.45) strengths.push(`Levier raisonnable (${(h.debtRatio * 100).toFixed(0)} %), compatible avec un financement de projet.`);
  else {
    risks.push(`Levier élevé (${(h.debtRatio * 100).toFixed(0)} % du patrimoine) : sensibilité forte à un choc de revenu.`);
    actions.push("Prioriser le remboursement des dettes les plus coûteuses avant tout nouvel engagement.");
  }

  // Liquidité / fonds d'urgence
  if (h.emergencyMonths >= 6) strengths.push(`Fonds d'urgence complet (${h.emergencyMonths.toFixed(1)} mois de charges couvertes).`);
  else if (h.emergencyMonths >= 3) {
    strengths.push(`Coussin de sécurité partiel (${h.emergencyMonths.toFixed(1)} mois), cible 6 mois.`);
    actions.push("Compléter le fonds d'urgence jusqu'à 6 mois de charges avant d'immobiliser du capital.");
  } else {
    risks.push(`Liquidité insuffisante (${h.emergencyMonths.toFixed(1)} mois) : risque de recours à la dette au premier imprévu.`);
    actions.push("Constituer en priorité 3 mois de charges sur un portefeuille liquide dédié.");
  }

  // Croissance patrimoniale
  if (h.growth >= 4) strengths.push(`Patrimoine en progression (${h.growth.toFixed(1)} % sur 3 mois) : dynamique de création de valeur.`);
  else if (h.growth >= 0) risks.push(`Croissance patrimoniale quasi nulle (${h.growth.toFixed(1)} % sur 3 mois) : l'épargne ne se transforme pas en actifs.`);
  else {
    risks.push(`Patrimoine en recul (${h.growth.toFixed(1)} % sur 3 mois) : destruction de valeur à expliquer.`);
    actions.push("Analyser les postes de dépenses et les moins-values d'actifs des 3 derniers mois.");
  }

  const summary =
    tone === "positive"
      ? "Les fondamentaux sont réunis : le foyer dégage un excédent, l'endettement reste sous contrôle et la liquidité couvre les aléas. L'enjeu passe de la protection à l'allocation du capital."
      : tone === "neutral"
        ? "La structure financière est saine mais peu résiliente : les excédents existent sans être encore convertis en réserve et en actifs productifs de façon régulière."
        : tone === "warning"
          ? "Le profil est vulnérable : la marge de manœuvre mensuelle et/ou la liquidité sont trop courtes pour absorber un choc. La priorité est défensive avant tout projet."
          : "La situation exige un plan de redressement : rétablir un solde mensuel positif, sécuriser la trésorerie, puis désendetter avant toute nouvelle acquisition.";

  return { verdict, summary, strengths, risks, actions };
}

// ---------- Commentaire qualitatif — évolution du patrimoine ----------

export interface WealthInputs {
  netWorth: number;
  cash: number;
  assets: number;
  receivables: number;
  debt: number;
  income: number;
  expense: number;
  savingsRate: number;
  /** Croissances en fraction (0.05 = +5 %) — null si pas de référence disponible. */
  momGrowth: number | null;
  threeMoGrowth: number | null;
  yoyGrowth: number | null;
  /** Nombre de snapshots mensuels disponibles sur la période affichée. */
  snapshotCount: number;
  periodLabel: string;
}

export interface WealthCommentary {
  verdict: string;
  summary: string;
  drivers: string[];
  watch: string[];
  actions: string[];
}

/** Lecture qualitative de l'évolution patrimoniale, style note de gestion privée. */
export function wealthCommentary(w: WealthInputs): WealthCommentary {
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} %`;
  const g = w.threeMoGrowth ?? w.momGrowth ?? 0;
  const gross = w.cash + w.assets + w.receivables;
  const share = (x: number) => (gross > 0 ? (x / gross) * 100 : 0);
  const leverage = gross > 0 ? w.debt / gross : (w.debt > 0 ? 1 : 0);
  const netSaving = w.income - w.expense;

  const verdict =
    w.snapshotCount === 0 ? "Historique insuffisant"
    : g >= 0.05 ? "Accumulation soutenue"
    : g >= 0.01 ? "Progression modérée"
    : g >= -0.01 ? "Stagnation"
    : "Contraction du patrimoine";

  const drivers: string[] = [];
  const watch: string[] = [];
  const actions: string[] = [];

  // Trajectoire
  if (w.momGrowth != null) {
    drivers.push(`Variation d'un mois sur l'autre : ${pct(w.momGrowth)} ; sur 3 mois : ${w.threeMoGrowth != null ? pct(w.threeMoGrowth) : "référence indisponible"}.`);
  } else {
    watch.push("Aucun snapshot de clôture antérieur : la croissance ne peut pas encore être mesurée de façon fiable.");
    actions.push("Lancer la clôture mensuelle chaque fin de mois pour bâtir la série patrimoniale.");
  }
  if (w.yoyGrowth != null) drivers.push(`Sur 12 mois glissants, le patrimoine évolue de ${pct(w.yoyGrowth)}.`);

  // Moteur de la croissance : épargne vs valorisation
  if (netSaving > 0 && Math.abs(w.netWorth) > 0) {
    const contrib = (netSaving / Math.abs(w.netWorth)) * 100;
    drivers.push(`L'excédent dégagé sur la période représente ${contrib.toFixed(1)} % du patrimoine net (taux d'épargne ${w.savingsRate.toFixed(0)} %) : la croissance est portée par l'épargne, pas seulement par la valorisation.`);
  } else if (netSaving < 0) {
    watch.push("La période est déficitaire : toute progression du patrimoine provient de la valorisation d'actifs, non d'un flux d'épargne — donc non récurrente.");
    actions.push("Rétablir un flux d'épargne positif pour rendre la croissance patrimoniale structurelle.");
  }

  // Structure
  drivers.push(`Structure brute : liquidités ${share(w.cash).toFixed(0)} %, actifs ${share(w.assets).toFixed(0)} %, créances ${share(w.receivables).toFixed(0)} %.`);
  if (share(w.cash) > 60) {
    watch.push("Poids des liquidités très élevé : capital sous-employé, rendement réel érodé par l'inflation.");
    actions.push("Après constitution du fonds d'urgence, orienter l'excédent de liquidités vers des actifs productifs.");
  }
  if (share(w.assets) > 85) {
    watch.push("Patrimoine fortement immobilisé en actifs : faible flexibilité en cas de besoin de trésorerie.");
    actions.push("Maintenir une poche liquide d'au moins 3 mois de charges en parallèle des actifs.");
  }
  if (share(w.receivables) > 25) {
    watch.push(`Créances significatives (${share(w.receivables).toFixed(0)} % du brut) : le patrimoine dépend du recouvrement effectif.`);
    actions.push("Relancer les créances les plus anciennes et provisionner celles jugées douteuses.");
  }

  // Levier
  if (leverage > 0.5) {
    watch.push(`Endettement à ${(leverage * 100).toFixed(0)} % du patrimoine brut : la valeur nette est très sensible à une baisse de valorisation.`);
    actions.push("Réduire le levier avant tout nouvel investissement financé par la dette.");
  } else if (w.debt > 0) {
    drivers.push(`Levier contenu (${(leverage * 100).toFixed(0)} % du brut) : effet amplificateur maîtrisé sur la valeur nette.`);
  }

  const summary =
    w.snapshotCount === 0
      ? `Sur ${w.periodLabel}, la valeur nette est reconstituée à partir des transactions, mais sans clôtures mensuelles il n'existe pas encore de série comparable pour juger la tendance.`
      : g >= 0.05
        ? `Sur ${w.periodLabel}, le patrimoine s'apprécie nettement. La combinaison d'un flux d'épargne positif et d'une valorisation favorable crée un effet cumulatif : l'enjeu devient l'allocation, pas l'accumulation.`
        : g >= 0.01
          ? `Sur ${w.periodLabel}, la trajectoire est haussière mais lente. À ce rythme, l'atteinte des objectifs dépend davantage de la discipline d'épargne que du rendement des actifs.`
          : g >= -0.01
            ? `Sur ${w.periodLabel}, le patrimoine est stable : les flux entrants compensent tout juste les sorties et l'amortissement des actifs. Aucune création de valeur nette.`
            : `Sur ${w.periodLabel}, le patrimoine se contracte. Il faut distinguer ce qui relève d'un déficit de trésorerie de ce qui relève d'une perte de valeur d'actifs ou d'un désendettement.`;

  return { verdict, summary, drivers, watch, actions };
}
