/**
 * TRI / IRR (taux de rentabilité interne) sur flux datés — méthode XIRR.
 *
 * Convention de signe : décaissements négatifs (achat, travaux, frais),
 * encaissements positifs (revente, loyers, dividendes). La valeur résiduelle
 * (VNC ou valeur de marché) est injectée comme flux terminal à la date de valorisation
 * pour un actif encore détenu.
 */

export interface CashFlow { date: string; amount: number }

const DAY = 86_400_000;

function years(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / (365 * DAY);
}

function npv(flows: { t: number; amount: number }[], rate: number) {
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, f.t), 0);
}

/**
 * XIRR annualisé. Retourne null si non calculable
 * (moins de 2 flux, ou pas de changement de signe).
 */
export function xirr(cashflows: CashFlow[]): number | null {
  const valid = cashflows
    .filter(f => f.date && Number.isFinite(Number(f.amount)) && Number(f.amount) !== 0)
    .map(f => ({ d: new Date(f.date), amount: Number(f.amount) }))
    .filter(f => !Number.isNaN(f.d.getTime()))
    .sort((a, b) => a.d.getTime() - b.d.getTime());

  if (valid.length < 2) return null;
  const hasPos = valid.some(f => f.amount > 0);
  const hasNeg = valid.some(f => f.amount < 0);
  if (!hasPos || !hasNeg) return null;

  const t0 = valid[0].d;
  const flows = valid.map(f => ({ t: years(t0, f.d), amount: f.amount }));
  if (flows[flows.length - 1].t <= 0) return null;

  // Newton-Raphson depuis plusieurs points de départ.
  for (const start of [0.1, 0.5, -0.3, 1.5]) {
    let rate = start;
    let ok = true;
    for (let i = 0; i < 60; i++) {
      const f = npv(flows, rate);
      const df = flows.reduce((s, x) => s - (x.t * x.amount) / Math.pow(1 + rate, x.t + 1), 0);
      if (!Number.isFinite(f) || !Number.isFinite(df) || df === 0) { ok = false; break; }
      const next = rate - f / df;
      if (!Number.isFinite(next) || next <= -0.999999) { ok = false; break; }
      if (Math.abs(next - rate) < 1e-8) return next;
      rate = next;
    }
    if (ok && Math.abs(npv(flows, rate)) < 1e-4) return rate;
  }

  // Repli : bissection sur un large intervalle.
  let lo = -0.9999, hi = 10;
  let fLo = npv(flows, lo), fHi = npv(flows, hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(flows, mid);
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

/** Multiple sur capital investi : total encaissé / total décaissé. */
export function moic(cashflows: CashFlow[]): number | null {
  const out = cashflows.filter(f => Number(f.amount) < 0).reduce((s, f) => s + Math.abs(Number(f.amount)), 0);
  const inn = cashflows.filter(f => Number(f.amount) > 0).reduce((s, f) => s + Number(f.amount), 0);
  if (out <= 0) return null;
  return inn / out;
}

/** Rendement simple annualisé (utile quand le TRI n'est pas calculable). */
export function annualizedSimpleReturn(invested: number, exitValue: number, holdingYears: number): number | null {
  if (invested <= 0 || holdingYears <= 0) return null;
  return Math.pow(exitValue / invested, 1 / holdingYears) - 1;
}

export interface AssetTxLike {
  type: string;
  occurred_on: string;
  base_amount?: number | string | null;
  amount?: number | string | null;
  exchange_rate?: number | string | null;
}

function amt(t: AssetTxLike) {
  const b = Number(t.base_amount ?? 0);
  if (b) return Math.abs(b);
  return Math.abs(Number(t.amount ?? 0) * Number(t.exchange_rate ?? 1));
}

export interface AssetPerformance {
  irr: number | null;          // TRI annualisé (décimal, 0.12 = 12 %)
  moic: number | null;         // multiple sur investi
  invested: number;            // capital décaissé
  realized: number;            // encaissements réalisés (reventes)
  residual: number;            // valeur résiduelle prise en compte
  holdingYears: number;
  sold: boolean;
  flows: CashFlow[];
}

/**
 * Performance d'un actif à partir de ses écritures.
 *  - asset_purchase → décaissement
 *  - expense liée (travaux, frais, mais PAS l'amortissement comptable) → décaissement
 *  - asset_sale / income liée → encaissement
 *  - actif non vendu → valeur résiduelle (VNC ou valeur de marché) en flux terminal
 * L'amortissement est une écriture comptable sans flux de trésorerie : il est exclu.
 */
export function assetPerformance(
  txs: AssetTxLike[],
  opts: { residualValue: number; sold: boolean; asOf?: string },
): AssetPerformance {
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
  const flows: CashFlow[] = [];
  let invested = 0, realized = 0;

  for (const t of txs) {
    const a = amt(t);
    if (!a) continue;
    switch (t.type) {
      case "asset_purchase":
      case "investment":
        flows.push({ date: t.occurred_on, amount: -a });
        invested += a;
        break;
      case "expense":
        // Amortissements exclus : pas de sortie de cash.
        break;
      case "asset_sale":
      case "income":
        flows.push({ date: t.occurred_on, amount: a });
        realized += a;
        break;
      default:
        break;
    }
  }

  const residual = opts.sold ? 0 : Math.max(0, Number(opts.residualValue ?? 0));
  if (residual > 0) flows.push({ date: asOf, amount: residual });

  const sorted = flows.slice().sort((a, b) => a.date.localeCompare(b.date));
  const holdingYears = sorted.length >= 2
    ? Math.max(0, (new Date(sorted[sorted.length - 1].date).getTime() - new Date(sorted[0].date).getTime()) / (365 * DAY))
    : 0;

  let rate = xirr(flows);
  if (rate == null) {
    rate = annualizedSimpleReturn(invested, realized + residual, holdingYears);
  }

  return {
    irr: rate,
    moic: moic(flows),
    invested,
    realized,
    residual,
    holdingYears,
    sold: opts.sold,
    flows: sorted,
  };
}

/** Lecture qualitative d'un TRI (référence : inflation + coût du capital). */
export function irrVerdict(irr: number | null, hurdle = 0.08): { label: string; tone: "positive" | "warning" | "negative" | "neutral" } {
  if (irr == null) return { label: "Non calculable", tone: "neutral" };
  if (irr >= hurdle * 1.5) return { label: "Surperformance", tone: "positive" };
  if (irr >= hurdle) return { label: "Objectif atteint", tone: "positive" };
  if (irr >= 0) return { label: "Sous le coût du capital", tone: "warning" };
  return { label: "Destruction de valeur", tone: "negative" };
}
