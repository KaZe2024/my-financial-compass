import type { SupabaseClient } from "@supabase/supabase-js";

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** Build a compact French financial snapshot for the AI system prompt. */
export async function buildFinancialSnapshot(supabase: SupabaseClient): Promise<string> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const ytdStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

  const [wallets, txMonth, txYtd, assets, debts, receivables, goals, subs, provisions, projects, budgetNodes] = await Promise.all([
    supabase.from("wallets").select("name, balance, currency, base_balance"),
    supabase.from("transactions").select("type, base_amount, occurred_on").gte("occurred_on", monthStart).lte("occurred_on", monthEnd),
    supabase.from("transactions").select("type, base_amount").gte("occurred_on", ytdStart),
    supabase.from("assets").select("name, current_value, type, status").eq("archived", false),
    supabase.from("debts").select("creditor, outstanding, due_date, status").eq("archived", false),
    supabase.from("receivables").select("debtor, outstanding, due_date, status").eq("archived", false),
    supabase.from("financial_goals").select("name, current_amount, target_amount, target_date, status"),
    supabase.from("subscriptions").select("name, amount, billing_cycle, next_billing_date").eq("active", true),
    supabase.from("provisions").select("name, amount, due_date, status, direction"),
    supabase.from("projects").select("name, target_amount, envelope_balance, status").limit(20),
    supabase.from("budget_nodes").select("id, name, parent_id, kind, is_income").eq("archived", false),
  ]);

  const walletTotal = (wallets.data ?? []).reduce((s, w: any) => s + Number(w.base_balance ?? 0), 0);
  const assetTotal = (assets.data ?? []).reduce((s, a: any) => s + Number(a.current_value ?? 0), 0);
  const debtTotal = (debts.data ?? []).filter((d: any) => d.status !== "settled").reduce((s, d: any) => s + Number(d.outstanding ?? 0), 0);
  const receivableTotal = (receivables.data ?? []).filter((r: any) => r.status !== "collected").reduce((s, r: any) => s + Number(r.outstanding ?? 0), 0);
  const netWorth = walletTotal + assetTotal + receivableTotal - debtTotal;

  const income = (txMonth.data ?? []).filter((t: any) => t.type === "income").reduce((s, t: any) => s + Number(t.base_amount ?? 0), 0);
  const expenses = (txMonth.data ?? []).filter((t: any) => t.type === "expense").reduce((s, t: any) => s + Number(t.base_amount ?? 0), 0);
  const savings = income - expenses;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;

  const ytdIncome = (txYtd.data ?? []).filter((t: any) => t.type === "income").reduce((s, t: any) => s + Number(t.base_amount ?? 0), 0);
  const ytdExpenses = (txYtd.data ?? []).filter((t: any) => t.type === "expense").reduce((s, t: any) => s + Number(t.base_amount ?? 0), 0);

  const monthlySubs = (subs.data ?? []).reduce((s, x: any) => {
    const amt = Number(x.amount ?? 0);
    const c = (x.billing_cycle ?? "monthly").toLowerCase();
    const factor = c === "yearly" || c === "annual" ? 1 / 12 : c === "quarterly" ? 1 / 3 : c === "weekly" ? 4.33 : 1;
    return s + amt * factor;
  }, 0);

  const upcomingDebts = (debts.data ?? []).filter((d: any) => d.due_date && d.status !== "settled").sort((a: any, b: any) => a.due_date.localeCompare(b.due_date)).slice(0, 5);
  const activeGoals = (goals.data ?? []).filter((g: any) => g.status !== "achieved").slice(0, 8);

  const walletLines = (wallets.data ?? []).map((w: any) => `  - ${w.name}: ${fmt(Number(w.base_balance ?? 0))} MGA (${w.currency})`).join("\n");
  const debtLines = upcomingDebts.map((d: any) => `  - ${d.creditor}: ${fmt(Number(d.outstanding ?? 0))} MGA due ${d.due_date}`).join("\n") || "  (aucune échéance proche)";
  const goalLines = activeGoals.map((g: any) => {
    const pct = g.target_amount ? Math.round((Number(g.current_amount ?? 0) / Number(g.target_amount)) * 100) : 0;
    return `  - ${g.name}: ${pct}% (${fmt(Number(g.current_amount ?? 0))}/${fmt(Number(g.target_amount ?? 0))} MGA)`;
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

**YTD** (depuis ${ytdStart})
- Revenus cumulés: ${fmt(ytdIncome)} MGA
- Dépenses cumulées: ${fmt(ytdExpenses)} MGA

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
