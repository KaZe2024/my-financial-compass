export const CASH_IN_TYPES = new Set(["income", "asset_sale", "adjustment", "enveloppe_emprunt", "dette"]);

export type TransactionLike = {
  id?: string;
  type: string | null;
  wallet_id?: string | null;
  to_wallet_id?: string | null;
  amount?: number | string | null;
  base_amount?: number | string | null;
  exchange_rate?: number | string | null;
  currency?: string | null;
  occurred_on?: string | null;
  budget_node_id?: string | null;
};

export type WalletLike = {
  id: string;
  type?: string | null;
  currency?: string | null;
  opening_balance?: number | string | null;
  current_balance?: number | string | null;
  status?: string | null;
};

export type AssetLike = {
  id: string;
  type?: string | null;
  purchase_value?: number | string | null;
  current_value?: number | string | null;
  status?: string | null;
  archived?: boolean | null;
};

export type AssetEventLike = {
  asset_id: string | null;
  event_type: string | null;
  amount?: number | string | null;
  event_date?: string | null;
  event_month?: string | null;
};

function num(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function inWindow(date: string | null | undefined, from?: string, to?: string) {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function baseAmount(t: TransactionLike) {
  const stored = num(t.base_amount);
  if (stored !== 0) return stored;
  return num(t.amount) * (num(t.exchange_rate) || 1);
}

export function signedCashImpact(t: TransactionLike, walletId?: string | null) {
  const mga = baseAmount(t);
  if (t.type === "transfer") {
    if (!walletId) return 0;
    let impact = 0;
    if (t.wallet_id === walletId) impact -= mga;
    if (t.to_wallet_id === walletId) impact += mga;
    return impact;
  }
  if (walletId && t.wallet_id !== walletId) return 0;
  return CASH_IN_TYPES.has(String(t.type)) ? mga : -mga;
}

export function computeWalletBalances(
  wallets: WalletLike[],
  transactions: TransactionLike[],
  opts: { through?: string; baseCurrency?: string } = {},
) {
  const txs = opts.through ? transactions.filter((t) => !t.occurred_on || t.occurred_on <= opts.through!) : transactions;
  const latestRate = new Map<string, number>();
  for (const t of txs) {
    const rate = num(t.exchange_rate) || 1;
    if (t.wallet_id) latestRate.set(t.wallet_id, rate);
    if (t.to_wallet_id && !latestRate.has(t.to_wallet_id)) latestRate.set(t.to_wallet_id, rate);
  }

  const nets = new Map<string, number>();
  for (const t of txs) {
    if (t.type === "transfer") {
      const mga = baseAmount(t);
      if (t.wallet_id) nets.set(t.wallet_id, (nets.get(t.wallet_id) ?? 0) - mga);
      if (t.to_wallet_id) nets.set(t.to_wallet_id, (nets.get(t.to_wallet_id) ?? 0) + mga);
    } else if (t.wallet_id) {
      nets.set(t.wallet_id, (nets.get(t.wallet_id) ?? 0) + signedCashImpact(t, t.wallet_id));
    }
  }

  const baseCurrency = opts.baseCurrency ?? "MGA";
  const out = new Map<string, number>();
  for (const w of wallets) {
    const rate = (w.currency ?? baseCurrency) === baseCurrency ? 1 : (latestRate.get(w.id) ?? 1);
    out.set(w.id, num(w.opening_balance) * rate + (nets.get(w.id) ?? 0));
  }
  return out;
}

export function sumAvailableCash(wallets: WalletLike[], transactions: TransactionLike[], opts: { through?: string; baseCurrency?: string } = {}) {
  const balances = computeWalletBalances(wallets, transactions, opts);
  return wallets
    .filter((w) => (w.status ?? "active") === "active")
    .reduce((s, w) => s + (balances.get(w.id) ?? 0), 0);
}

export function transactionsInPeriod<T extends TransactionLike>(txs: T[], from: string, to: string) {
  return txs.filter((t) => inWindow(t.occurred_on, from, to));
}

export function incomeExpenseForPeriod(txs: TransactionLike[], from: string, to: string) {
  const period = transactionsInPeriod(txs, from, to);
  return {
    income: period.filter((t) => t.type === "income").reduce((s, t) => s + baseAmount(t), 0),
    expense: period.filter((t) => t.type === "expense").reduce((s, t) => s + baseAmount(t), 0),
  };
}

export function averageDailyCashOut(txs: TransactionLike[], daysWindow = 90, ref = new Date()) {
  const cutoff = new Date(ref);
  cutoff.setDate(cutoff.getDate() - daysWindow);
  const from = cutoff.toISOString().slice(0, 10);
  const to = ref.toISOString().slice(0, 10);
  const total = txs
    .filter((t) => inWindow(t.occurred_on, from, to))
    .reduce((s, t) => {
      const impact = signedCashImpact(t, null);
      return impact < 0 ? s + Math.abs(impact) : s;
    }, 0);
  return total / daysWindow;
}

export function monthlyCashflowFromTransactions(txs: TransactionLike[], from: string, to: string) {
  const months = new Map<string, { month: string; income: number; expense: number }>();
  for (const t of transactionsInPeriod(txs, from, to)) {
    const month = String(t.occurred_on).slice(0, 7) + "-01";
    const row = months.get(month) ?? { month, income: 0, expense: 0 };
    const impact = signedCashImpact(t, null);
    if (impact > 0) row.income += impact;
    if (impact < 0) row.expense += Math.abs(impact);
    months.set(month, row);
  }
  return Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function directNodeSpendFromTransactions(txs: TransactionLike[], from: string, to: string) {
  const rows = new Map<string, { node_id: string | null; spent: number }>();
  let unassigned = 0;
  for (const t of transactionsInPeriod(txs, from, to)) {
    if (t.type !== "expense") continue;
    const nodeId = t.budget_node_id ?? null;
    if (!nodeId) {
      unassigned += baseAmount(t);
      continue;
    }
    const row = rows.get(nodeId) ?? { node_id: nodeId, spent: 0 };
    row.spent += baseAmount(t);
    rows.set(nodeId, row);
  }
  const out = Array.from(rows.values());
  if (unassigned > 0) out.push({ node_id: null, spent: unassigned });
  return out;
}

export function computeAssetValue(asset: AssetLike, events: AssetEventLike[], opts: { through?: string } = {}) {
  const relevant = events.filter((e) => e.asset_id === asset.id && (!opts.through || (e.event_date ?? e.event_month ?? "9999-99-99") <= opts.through));
  const depreciation = relevant
    .filter((e) => e.event_type === "depreciation")
    .reduce((s, e) => s + Math.abs(num(e.amount)), 0);
  const adjustments = relevant
    .filter((e) => e.event_type === "revaluation" || e.event_type === "impairment")
    .reduce((s, e) => s + num(e.amount), 0);
  const sold = (asset.status ?? "owned") === "sold" || relevant.some((e) => e.event_type === "sale");
  const cost = num(asset.purchase_value);
  const stored = num(asset.current_value);
  const hasBookEvents = depreciation !== 0 || adjustments !== 0;
  const bookValue = sold ? 0 : Math.max(0, hasBookEvents ? cost - depreciation + adjustments : (stored || cost));
  return { cost, depreciation, adjustments, bookValue, sold };
}

export function computeAssetTotals(assets: AssetLike[], events: AssetEventLike[], opts: { through?: string } = {}) {
  return assets
    .filter((a) => !a.archived && (a.status ?? "owned") === "owned")
    .reduce(
      (acc, a) => {
        const v = computeAssetValue(a, events, opts);
        acc.cost += v.cost;
        acc.depreciation += v.depreciation;
        acc.bookValue += v.bookValue;
        return acc;
      },
      { cost: 0, depreciation: 0, bookValue: 0 },
    );
}