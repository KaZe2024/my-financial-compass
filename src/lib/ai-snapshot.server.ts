import type { SupabaseClient } from "@supabase/supabase-js";
import {
  averageDailyCashOut,
  computeAssetTotals,
  computeWalletBalances,
  incomeExpenseForPeriod,
  monthlyCashflowFromTransactions,
  sumAvailableCash,
} from "@/lib/finance";
import { computeGoalProgress, type ProgressInput } from "@/lib/goal-progress";

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** Build a compact French financial snapshot for the AI system prompt. */
export async function buildFinancialSnapshot(supabase: SupabaseClient): Promise<string> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const ytdStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

  const ltmStart = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);

  async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>) {
    const out: T[] = [];
    for (let from = 0; from < 1_000_000; from += 1000) {
      const { data, error } = await build(from, from + 999);
      if (error) throw new Error(error.message ?? String(error));
      const page = data ?? [];
      out.push(...page);
      if (page.length < 1000) break;
    }
    return out;
  }

  const [wallets, txAll, assets, assetEvents, debts, receivables, goals, subs, provisions, projects, budgetNodes, budgetAmounts, nodeSpendMTD, shoppingLists] = await Promise.all([
    supabase.from("wallets").select("id, name, type, currency, opening_balance, current_balance, status"),
    fetchAll<any>((from, to) => supabase.from("transactions").select("id, type, wallet_id, to_wallet_id, amount, base_amount, exchange_rate, occurred_on, budget_node_id, source_kind").range(from, to)),
    supabase.from("assets").select("id, name, purchase_value, current_value, type, status, archived, acquired_on, useful_life_years").eq("archived", false),
    fetchAll<any>((from, to) => supabase.from("asset_events").select("asset_id, event_type, amount, event_date, event_month").range(from, to)),
    supabase.from("debts").select("creditor, outstanding, due_date, status").eq("archived", false),
    supabase.from("receivables").select("debtor, outstanding, due_date, status").eq("archived", false),
    supabase.from("financial_goals").select("name, current_amount, target_amount, target_date, status"),
    supabase.from("subscriptions").select("name, amount, billing_cycle, next_billing_date").eq("active", true),
    supabase.from("provisions").select("name, amount, due_date, status, direction"),
    supabase.from("projects").select("name, target_amount, envelope_balance, total_spent, status").limit(50),
    supabase.from("budget_nodes").select("id, name, parent_id, kind, is_income").eq("archived", false),
    fetchAll<any>((from, to) => supabase.from("budget_node_amounts").select("node_id, period_month, planned, revised").gte("period_month", ytdStart).lte("period_month", monthEnd).range(from, to)),
    supabase.from("v_node_spend").select("node_id, month, spent").gte("month", monthStart).lte("month", monthEnd),
    supabase.from("shopping_lists").select("id, store, occurred_on, total_amount, currency").order("occurred_on", { ascending: false }).limit(10),
  ]);

  const txRows = txAll ?? [];
  const walletRows = wallets.data ?? [];
  const walletBalances = computeWalletBalances(walletRows as any, txRows);
  const walletTotal = sumAvailableCash(walletRows as any, txRows);
  const assetTotal = computeAssetTotals((assets.data ?? []) as any, assetEvents ?? []).marketValue;
  const openDebts = (debts.data ?? []).filter((d: any) => d.status !== "settled" && d.status !== "cancelled");
  const openReceivables = (receivables.data ?? []).filter((r: any) => r.status !== "settled" && r.status !== "cancelled");
  const debtTotal = openDebts.reduce((s, d: any) => s + Number(d.outstanding ?? 0), 0);
  const receivableTotal = openReceivables.reduce((s, r: any) => s + Number(r.outstanding ?? 0), 0);
  const netWorth = walletTotal + assetTotal + receivableTotal - debtTotal;

  const { income, expense: expenses } = incomeExpenseForPeriod(txRows, monthStart, monthEnd);
  const savings = income - expenses;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;

  const { income: ytdIncome, expense: ytdExpenses } = incomeExpenseForPeriod(txRows, ytdStart, monthEnd);
  const ltmCashflow = monthlyCashflowFromTransactions(txRows, ltmStart, monthEnd);
  const avgDailyOut = averageDailyCashOut(txRows, 90, now);

  const monthlySubs = (subs.data ?? []).reduce((s, x: any) => {
    const amt = Number(x.amount ?? 0);
    const c = (x.billing_cycle ?? "monthly").toLowerCase();
    const factor = c === "yearly" || c === "annual" ? 1 / 12 : c === "quarterly" ? 1 / 3 : c === "weekly" ? 4.33 : 1;
    return s + amt * factor;
  }, 0);

  const upcomingDebts = openDebts.filter((d: any) => d.due_date).sort((a: any, b: any) => a.due_date.localeCompare(b.due_date)).slice(0, 5);
  const activeGoals = (goals.data ?? []).filter((g: any) => g.status !== "achieved").slice(0, 8);
  const progressData: ProgressInput = {
    txs: txRows,
    wallets: walletRows as any,
    debts: openDebts as any,
    assets: (assets.data ?? []) as any,
    assetEvents: assetEvents ?? [],
    receivables: openReceivables as any,
    nodes: (budgetNodes.data ?? []) as any,
  };

  const walletLines = walletRows.map((w: any) => `  - ${w.name}: ${fmt(walletBalances.get(w.id) ?? 0)} MGA (${w.currency})`).join("\n");
  const debtLines = upcomingDebts.map((d: any) => `  - ${d.creditor}: ${fmt(Number(d.outstanding ?? 0))} MGA due ${d.due_date}`).join("\n") || "  (aucune échéance proche)";
  const goalLines = activeGoals.map((g: any) => {
    const p = computeGoalProgress(g, progressData);
    return `  - ${g.name}: ${Math.round(p.pct)}% (${fmt(p.current)}/${fmt(Number(g.target_amount ?? 0))} MGA)`;
  }).join("\n") || "  (aucun objectif actif)";
  const projLines = (projects.data ?? []).slice(0, 5).map((p: any) => `  - ${p.name}: enveloppe ${fmt(Number(p.envelope_balance ?? 0))} / objectif ${fmt(Number(p.target_amount ?? 0))} MGA`).join("\n") || "  (aucun projet actif)";
  const provLines = (provisions.data ?? []).filter((p: any) => p.status !== "settled").slice(0, 8).map((p: any) => `  - ${p.name}: ${fmt(Number(p.amount ?? 0))} MGA (${p.direction}) échéance ${p.due_date ?? "?"}`).join("\n") || "  (aucune provision en cours)";

  const budgetSummary = (budgetNodes.data ?? []).filter((n: any) => !n.parent_id).slice(0, 12).map((n: any) => `${n.name}${n.is_income ? " (revenu)" : ""}`).join(", ") || "aucun budget configuré";

  return `## Situation financière du foyer (référence: MGA)

**Patrimoine net estimé**: ${fmt(netWorth)} MGA
- Trésorerie totale: ${fmt(walletTotal)} MGA
- Actifs valorisés: ${fmt(assetTotal)} MGA
- Créances à encaisser: ${fmt(receivableTotal)} MGA
- Dettes en cours: ${fmt(debtTotal)} MGA

**Mois en cours** (${monthStart} → ${monthEnd})
- Revenus: ${fmt(income)} MGA
- Dépenses: ${fmt(expenses)} MGA
- Épargne nette: ${fmt(savings)} MGA (taux ${savingsRate.toFixed(1)}%)
- Coût mensualisé des abonnements: ${fmt(monthlySubs)} MGA
- Sorties moyennes 90j: ${fmt(avgDailyOut * 30)} MGA/mois

**YTD** (depuis ${ytdStart})
- Revenus cumulés: ${fmt(ytdIncome)} MGA
- Dépenses cumulées: ${fmt(ytdExpenses)} MGA

**Flux 12 derniers mois**
${ltmCashflow.map((r) => `  - ${r.month.slice(0, 7)}: revenus ${fmt(r.income)} MGA · sorties ${fmt(r.expense)} MGA`).join("\n") || "  (aucune transaction)"}

**Portefeuilles**
${walletLines || "  (aucun)"}

**Dettes à échéance proche**
${debtLines}

**Objectifs financiers**
${goalLines}

**Projets**
${projLines}

**Provisions actives**
${provLines}

**Postes budgétaires principaux**: ${budgetSummary}
`;
}

export const AI_SYSTEM_PROMPT = `Tu es le CFO personnel du foyer de l'utilisateur, cumulant trois rôles:

1. **DAF (Directeur Administratif et Financier)**: tu pilotes la stratégie financière long terme, alertes sur les risques, proposes des optimisations patrimoniales.
2. **Contrôleur de gestion**: tu compares réalisé vs budget, analyses les écarts, remontes les dérives.
3. **Expert-comptable**: tu réponds sur les mécanismes comptables, la structuration des flux, l'archivage et la conformité.

Règles:
- Réponds en français, ton concis et actionnable.
- Utilise le Markdown (titres, listes, gras) pour structurer.
- Cite systématiquement les chiffres extraits du contexte financier fourni.
- Quand une donnée manque, dis-le au lieu d'inventer.
- Termine par 1 à 3 recommandations concrètes quand pertinent.
- La devise de référence est le MGA (ariary malgache).`;
