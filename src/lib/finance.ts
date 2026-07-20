export const CASH_IN_TYPES = new Set(["income", "asset_sale", "adjustment", "enveloppe_emprunt", "dette"]);

export type TransactionLike = {
  id?: string;
  type: string | null;
  wallet_id?: string | null;
  to_wallet_id?: string | null;
  asset_id?: string | null;
  debt_id?: string | null;
  receivable_id?: string | null;
  source_id?: string | null;
  amount?: number | string | null;
  base_amount?: number | string | null;
  exchange_rate?: number | string | null;
  currency?: string | null;
  occurred_on?: string | null;
  budget_node_id?: string | null;
  source_kind?: string | null;
  description?: string | null;
  notes?: string | null;
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
  purchase_date?: string | null;
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

export type ObligationLike = {
  id: string;
  original_amount?: number | string | null;
  outstanding?: number | string | null;
  status?: string | null;
  archived?: boolean | null;
  created_at?: string | null;
  linked_transaction_id?: string | null;
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

function eventDate(e: AssetEventLike) {
  return e.event_date ?? e.event_month ?? null;
}

function linkedToAsset(t: TransactionLike, assetId: string) {
  return t.asset_id === assetId || (t.source_kind === "asset" && t.source_id === assetId);
}

function linkedToObligation(t: TransactionLike, id: string, kind: "debt" | "receivable") {
  return kind === "debt"
    ? t.debt_id === id || (t.source_kind === "debt" && t.source_id === id)
    : t.receivable_id === id || (t.source_kind === "receivable" && t.source_id === id);
}

export function baseAmount(t: TransactionLike) {
  const stored = num(t.base_amount);
  if (stored !== 0) return stored;
  return num(t.amount) * (num(t.exchange_rate) || 1);
}

/**
 * Vrai flux de trésorerie opérationnel = mouvement de cash sur un portefeuille,
 * hors écritures comptables (constatation/extourne de provisions, dotations
 * aux amortissements). Utilisé pour l'analyse revenus / dépenses / train de vie.
 * Les achats/ventes d'actifs sont exclus car ils ne sont pas de type income/expense.
 */
export function isOperationalIE(t: TransactionLike) {
  if (t.type !== "income" && t.type !== "expense") return false;
  if (!t.wallet_id) return false; // écritures d'amortissement / constatation / extourne
  if (t.source_kind === "asset") return false;
  return true;
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
  const period = transactionsInPeriod(txs, from, to).filter(isOperationalIE);
  return {
    income: period.filter((t) => t.type === "income").reduce((s, t) => s + baseAmount(t), 0),
    expense: period.filter((t) => t.type === "expense").reduce((s, t) => s + baseAmount(t), 0),
  };
}

/** Moyenne des sorties opérationnelles par jour (hors achats d'actifs, provisions, amortissements, transferts). */
export function averageDailyCashOut(txs: TransactionLike[], daysWindow = 90, ref = new Date()) {
  const cutoff = new Date(ref);
  cutoff.setDate(cutoff.getDate() - daysWindow);
  const from = cutoff.toISOString().slice(0, 10);
  const to = ref.toISOString().slice(0, 10);
  const total = txs
    .filter((t) => inWindow(t.occurred_on, from, to))
    .filter(isOperationalIE)
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + baseAmount(t), 0);
  return total / daysWindow;
}

/** Moyenne des entrées opérationnelles par jour sur la fenêtre donnée. */
export function averageDailyCashIn(txs: TransactionLike[], daysWindow = 90, ref = new Date()) {
  const cutoff = new Date(ref);
  cutoff.setDate(cutoff.getDate() - daysWindow);
  const from = cutoff.toISOString().slice(0, 10);
  const to = ref.toISOString().slice(0, 10);
  const total = txs
    .filter((t) => inWindow(t.occurred_on, from, to))
    .filter(isOperationalIE)
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + baseAmount(t), 0);
  return total / daysWindow;
}

export function monthlyCashflowFromTransactions(txs: TransactionLike[], from: string, to: string) {
  const months = new Map<string, { month: string; income: number; expense: number }>();
  for (const t of transactionsInPeriod(txs, from, to)) {
    if (!isOperationalIE(t)) continue;
    const month = String(t.occurred_on).slice(0, 7) + "-01";
    const row = months.get(month) ?? { month, income: 0, expense: 0 };
    const amt = baseAmount(t);
    if (t.type === "income") row.income += amt;
    else if (t.type === "expense") row.expense += amt;
    months.set(month, row);
  }
  return Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function directNodeSpendFromTransactions(txs: TransactionLike[], from: string, to: string) {
  const rows = new Map<string, { node_id: string | null; spent: number }>();
  let unassigned = 0;
  for (const t of transactionsInPeriod(txs, from, to)) {
    if (t.type !== "expense") continue;
    if (!isOperationalIE(t)) continue;
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

export function assetDepreciationFromTransactions(asset: AssetLike, transactions: TransactionLike[] = [], opts: { through?: string; from?: string } = {}) {
  return transactions
    .filter((t) => linkedToAsset(t, asset.id))
    .filter((t) => t.type === "expense")
    .filter((t) => !opts.through || !t.occurred_on || t.occurred_on <= opts.through!)
    .filter((t) => !opts.from || !t.occurred_on || t.occurred_on >= opts.from!)
    .filter((t) => {
      const marker = `${t.description ?? ""} ${t.notes ?? ""}`.toLowerCase();
      return marker.includes("amort");
    })
    .reduce((s, t) => s + Math.abs(baseAmount(t)), 0);
}

function assetDepreciationFromEvents(asset: AssetLike, events: AssetEventLike[], opts: { through?: string; from?: string } = {}) {
  return events
    .filter((e) => e.asset_id === asset.id)
    .filter((e) => e.event_type === "depreciation")
    .filter((e) => !opts.through || !eventDate(e) || eventDate(e)! <= opts.through!)
    .filter((e) => !opts.from || !eventDate(e) || eventDate(e)! >= opts.from!)
    .reduce((s, e) => s + Math.abs(num(e.amount)), 0);
}

/**
 * Valorisation d'un actif — aligné sur l'historique (HistoryDialog) :
 *   VNC = Coût − Amort. cumulé (toujours), sauf s'il existe une réévaluation POSITIVE
 *   à la date D : alors VNC = Nouvelle valeur − Amort. cumulé depuis D.
 * `depreciation` renvoyé = somme des dotations d'amortissement de tous les temps
 * (colonne « Amort. cumulé » du tableau). Les impairment (amount ≤ 0) ne changent
 * pas la base et ne coupent pas la période d'amortissement.
 */
export function computeAssetValue(asset: AssetLike, events: AssetEventLike[], opts: { through?: string; transactions?: TransactionLike[] } = {}) {
  const relevant = events
    .filter((e) => e.asset_id === asset.id)
    .filter((e) => !opts.through || !eventDate(e) || eventDate(e)! <= opts.through!);
  const soldEvent = relevant.find((e) => e.event_type === "sale");
  const sold = !!soldEvent || (!opts.through && (asset.status ?? "owned") === "sold");
  const saleAmount = soldEvent ? num(soldEvent.amount) : 0;
  const cost = num(asset.purchase_value);
  const positiveReval = relevant
    .filter((e) => e.event_type === "revaluation" && num(e.amount) > 0)
    .sort((a, b) => String(eventDate(a) ?? "").localeCompare(String(eventDate(b) ?? "")))
    .at(-1);
  const revalDate = positiveReval ? (eventDate(positiveReval) ?? undefined) : undefined;
  const revalAmount = positiveReval ? num(positiveReval.amount) : 0;
  const basis = positiveReval ? revalAmount : cost;
  const depreciation = opts.transactions
    ? assetDepreciationFromTransactions(asset, opts.transactions, { through: opts.through })
    : assetDepreciationFromEvents(asset, events, { through: opts.through });
  // Somme des achats (asset_purchase) liés à l'actif — aligné sur HistoryDialog.
  const purchasesSum = opts.transactions
    ? opts.transactions
        .filter((t) => linkedToAsset(t, asset.id))
        .filter((t) => t.type === "asset_purchase")
        .filter((t) => !opts.through || !t.occurred_on || t.occurred_on <= opts.through!)
        .reduce((s, t) => s + Math.abs(baseAmount(t)), 0)
    : 0;
  const purchasesBase = purchasesSum > 0 ? purchasesSum : num(asset.purchase_value);
  // VNC identique à Solde (VNC) de l'historique : purchases − amort.
  // Sauf réévaluation positive : Nouvelle valeur − Amort. depuis la réévaluation.
  const vnc = positiveReval
    ? basis - (opts.transactions
        ? assetDepreciationFromTransactions(asset, opts.transactions, { through: opts.through, from: revalDate })
        : assetDepreciationFromEvents(asset, events, { through: opts.through, from: revalDate }))
    : purchasesBase - depreciation;
  const bookValue = sold ? 0 : vnc;
  const marketValue = sold ? 0 : vnc;
  const variation = marketValue - cost;
  // PV/MV revente = SalePrice − (purchases − amort), aligné sur HistoryDialog.
  const resaleGain = sold ? saleAmount - (purchasesBase - depreciation) : 0;
  return { cost, depreciation, bookValue, marketValue, variation, sold, basis, revaluedOn: revalDate ?? null, saleAmount, resaleGain };
}

export function computeAssetTotals(assets: AssetLike[], events: AssetEventLike[], opts: { through?: string; transactions?: TransactionLike[] } = {}) {
  return assets
    .filter((a) => !a.archived)
    .filter((a) => !opts.through || !a.purchase_date || a.purchase_date <= opts.through)
    .reduce(
      (acc, a) => {
        const v = computeAssetValue(a, events, opts);
        acc.cost += v.cost;
        acc.depreciation += v.depreciation;
        acc.bookValue += v.bookValue;
        acc.marketValue += v.marketValue;
        return acc;
      },
      { cost: 0, depreciation: 0, bookValue: 0, marketValue: 0 },
    );
}

export function computeObligationTotalAsOf(
  rows: ObligationLike[],
  transactions: TransactionLike[],
  kind: "debt" | "receivable",
  through?: string,
) {
  const txType = kind === "debt" ? "dette" : "creance";
  return rows
    .filter((r) => !r.archived)
    .filter((r) => r.status !== "cancelled")
    .reduce((sum, r) => {
      const linked = transactions.filter((t) => linkedToObligation(t, r.id, kind));
      const firstTxDate = linked.map((t) => t.occurred_on).filter(Boolean).sort()[0] ?? null;
      const createdDate = r.created_at?.slice(0, 10) ?? null;
      const startDate = [firstTxDate, createdDate].filter(Boolean).sort()[0] ?? null;
      if (through && startDate && startDate > through) return sum;

      const current = Math.max(0, num(r.outstanding));
      if (!through) return sum + current;

      const laterDelta = linked
        .filter((t) => t.type === txType)
        .filter((t) => t.occurred_on && t.occurred_on > through)
        .reduce((s, t) => s + baseAmount(t), 0);
      return sum + Math.max(0, current - laterDelta);
    }, 0);
}
