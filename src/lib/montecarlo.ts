/**
 * Simulation Monte Carlo de trésorerie.
 *
 * Principe (standard en gestion de trésorerie) :
 *  - Le scénario central provient du budget / des récurrences (baselines mensuelles).
 *  - L'incertitude réelle vient de la volatilité observée des flux nets mensuels
 *    et du décalage de timing des flux ponctuels (échéances jamais payées à la date exacte).
 *  - On tire N trajectoires, puis on lit les percentiles jour par jour (P10 / P50 / P90)
 *    et la probabilité de tomber sous zéro (risque de rupture).
 */

export interface McBaseline { month: string; income: number; expense: number }
export interface McItem {
  amount: number;            // > 0 encaissement, < 0 décaissement
  date?: string | null;      // échéance attendue
  confidence?: number;       // 0..1 probabilité de réalisation
  timingSigmaDays?: number;  // dispersion de la date (défaut 5 j)
}

export interface McInput {
  startingCash: number;
  baselines: McBaseline[];
  items: McItem[];
  /** Historique des nets mensuels réalisés (revenus − dépenses) pour calibrer la volatilité. */
  historicalMonthlyNet?: number[];
  graceDays?: number;
  iterations?: number;
  seed?: number;
}

export interface McBand { day: number; date: string; p10: number; p50: number; p90: number }

export interface McResult {
  bands: McBand[];
  /** Probabilité d'au moins un jour de trésorerie négative sur l'horizon. */
  probBreach: number;
  /** Probabilité de rupture cumulée par mois (clé YYYY-MM). */
  probBreachByMonth: { month: string; prob: number }[];
  /** Percentiles du solde final. */
  endP10: number; endP50: number; endP90: number;
  /** Pire point médian (plus bas P50) et pire point P10. */
  lowP50: McBand | null;
  lowP10: McBand | null;
  /** Volatilité mensuelle utilisée (écart-type du net mensuel). */
  monthlySigma: number;
  iterations: number;
}

const DAY = 86_400_000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normale centrée réduite (Box-Muller). */
function gauss(rnd: () => number) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function daysInMonthOf(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function simulateCashflow(input: McInput, horizonDays = 365): McResult {
  const {
    startingCash, baselines, items,
    historicalMonthlyNet = [], graceDays = 7,
    iterations = 400, seed = 20260101,
  } = input;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const byMonth = new Map(baselines.map(b => [b.month, b]));
  const rnd = mulberry32(seed);

  // Volatilité : écart-type historique, plancher à 12 % du flux mensuel moyen
  // pour ne jamais simuler un futur artificiellement certain.
  const histSigma = stdev(historicalMonthlyNet);
  const avgGross = baselines.length
    ? baselines.reduce((s, b) => s + Math.abs(b.income) + Math.abs(b.expense), 0) / baselines.length
    : 0;
  const monthlySigma = Math.max(histSigma, avgGross * 0.12);

  // Pré-calcul du calendrier (mois, jours du mois, net journalier central).
  const dailyBase: number[] = new Array(horizonDays + 1).fill(0);
  const monthOfDay: string[] = new Array(horizonDays + 1).fill("");
  const dateOfDay: string[] = new Array(horizonDays + 1).fill("");
  dateOfDay[0] = today.toISOString().slice(0, 10);
  monthOfDay[0] = monthKey(today);
  for (let d = 1; d <= horizonDays; d++) {
    const dt = new Date(today.getTime() + d * DAY);
    const mk = monthKey(dt);
    monthOfDay[d] = mk;
    dateOfDay[d] = dt.toISOString().slice(0, 10);
    const b = byMonth.get(mk);
    dailyBase[d] = b ? (b.income - b.expense) / daysInMonthOf(dt) : 0;
  }

  // Offset central de chaque flux ponctuel.
  const prepared = items
    .map(it => {
      let offset = graceDays;
      if (it.date) {
        const d = new Date(it.date); d.setHours(0, 0, 0, 0);
        offset = Math.round((d.getTime() - today.getTime()) / DAY);
        if (offset < 0) offset = graceDays;
      }
      return {
        amount: it.amount,
        offset,
        p: Math.min(1, Math.max(0, it.confidence ?? 1)),
        sigma: it.timingSigmaDays ?? 5,
      };
    })
    .filter(it => it.amount !== 0 && it.offset <= horizonDays);

  // Trajectoires : on stocke le solde de chaque jour pour chaque itération.
  const perDay: number[][] = Array.from({ length: horizonDays + 1 }, () => [] as number[]);
  let breaches = 0;
  const monthsSeen = Array.from(new Set(monthOfDay));
  const breachByMonth = new Map<string, number>(monthsSeen.map(m => [m, 0]));

  for (let i = 0; i < iterations; i++) {
    // Choc multiplicatif par mois sur le net central (persistant dans le mois).
    const shock = new Map<string, number>();
    for (const m of monthsSeen) {
      const b = byMonth.get(m);
      const dim = b ? 30 : 30;
      const sigmaDaily = monthlySigma / dim;
      shock.set(m, gauss(rnd) * sigmaDaily);
    }

    // Flux ponctuels : réalisation (Bernoulli) + décalage de date (normal).
    const bucket = new Map<number, number>();
    for (const it of prepared) {
      if (rnd() > it.p) continue;
      let day = Math.round(it.offset + gauss(rnd) * it.sigma);
      if (day < 1) day = 1;
      if (day > horizonDays) continue;
      bucket.set(day, (bucket.get(day) ?? 0) + it.amount);
    }

    let balance = startingCash;
    perDay[0].push(balance);
    let breached = balance < 0;
    const monthBreached = new Set<string>();
    if (breached) monthBreached.add(monthOfDay[0]);

    for (let d = 1; d <= horizonDays; d++) {
      balance += dailyBase[d] + (shock.get(monthOfDay[d]) ?? 0) + (bucket.get(d) ?? 0);
      perDay[d].push(balance);
      if (balance < 0) {
        breached = true;
        monthBreached.add(monthOfDay[d]);
      }
    }
    if (breached) breaches += 1;
    for (const m of monthBreached) breachByMonth.set(m, (breachByMonth.get(m) ?? 0) + 1);
  }

  const bands: McBand[] = [];
  for (let d = 0; d <= horizonDays; d++) {
    const sorted = perDay[d].slice().sort((a, b) => a - b);
    bands.push({
      day: d,
      date: dateOfDay[d],
      p10: percentile(sorted, 0.1),
      p50: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
    });
  }

  let lowP50: McBand | null = null;
  let lowP10: McBand | null = null;
  for (const b of bands) {
    if (!lowP50 || b.p50 < lowP50.p50) lowP50 = b;
    if (!lowP10 || b.p10 < lowP10.p10) lowP10 = b;
  }
  const last = bands[bands.length - 1];

  return {
    bands,
    probBreach: iterations ? breaches / iterations : 0,
    probBreachByMonth: monthsSeen
      .filter(m => m)
      .map(m => ({ month: m, prob: iterations ? (breachByMonth.get(m) ?? 0) / iterations : 0 })),
    endP10: last?.p10 ?? startingCash,
    endP50: last?.p50 ?? startingCash,
    endP90: last?.p90 ?? startingCash,
    lowP50, lowP10,
    monthlySigma,
    iterations,
  };
}

/** Lecture qualitative du risque de rupture, style note d'analyste. */
export function breachVerdict(prob: number): { label: string; tone: "positive" | "warning" | "negative" } {
  if (prob < 0.05) return { label: "Risque de rupture négligeable", tone: "positive" };
  if (prob < 0.2) return { label: "Risque de rupture modéré", tone: "warning" };
  return { label: "Risque de rupture élevé", tone: "negative" };
}
