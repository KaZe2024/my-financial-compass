import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatCard, Panel } from "@/components/stat-card";
import { fmtMoney, fmtDate, fmtMonth, fmtPct, toISODate } from "@/lib/format";
import { walletsQO, profileQO, budgetNodesQO } from "@/lib/queries";
import { buildTree, flattenTree, pathLabel } from "@/lib/budget-nodes";
import { PeriodPicker, usePeriodState } from "@/components/period-picker";
import { resolvePeriod, isoDate } from "@/lib/period";
import { NodePicker } from "@/components/node-picker";
import { advanceDate } from "@/lib/recurring";
import { logAudit } from "@/lib/audit";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  averageDailyCashIn,
  averageDailyCashOut,
  computeAssetTotals,
  computeAssetValue,
  computeObligationTotalAsOf,
  directNodeSpendFromTransactions,
  incomeExpenseForPeriod,
  monthlyCashflowFromTransactions,
  sumAvailableCash,
} from "@/lib/finance";
import { computeGoalProgress, type ProgressInput } from "@/lib/goal-progress";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Wallet, TrendingUp, TrendingDown, PiggyBank, Receipt, HandCoins, Landmark, Activity,
  ShieldCheck, Target, LineChart as LineIcon, CalendarClock, Zap,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  buildAllocation, buildExpertForecast, computeHealth,
  forecastAt, growthRate, scoreTone, healthCommentary,
  type CashItem, type MonthBaseline,
} from "@/lib/analytics";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — OPTIS" }] }),
  component: Dashboard,
});

const COLORS = ["#10b981", "#f59e0b", "#6366f1", "#a855f7", "#06b6d4", "#ef4444", "#84cc16", "#ec4899"];

const tooltipStyle = { background: "#111827", border: "1px solid #1f2937", borderRadius: 4 };

function Dashboard() {
  const profile = useQuery(profileQO);
  const wallets = useQuery(walletsQO);

  const period = usePeriodState("month");
  const resolved = resolvePeriod(period.preset, new Date(), period.custom);
  const periodFrom = isoDate(resolved.from);
  const periodTo = isoDate(resolved.to);

  const now = new Date();
  const twelveAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const allTx = useQuery({
    queryKey: ["transactions", "for-dashboard"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) =>
        supabase
          .from("transactions")
          .select("id, type, wallet_id, to_wallet_id, asset_id, debt_id, receivable_id, source_id, source_kind, description, notes, amount, base_amount, exchange_rate, occurred_on, budget_node_id")
          .range(from, to),
      ),
  });

  const nodesQ = useQuery(budgetNodesQO);
  const debtsRows = useQuery({
    queryKey: ["debts", "open"],
    queryFn: async () => (await supabase.from("debts").select("id, creditor, original_amount, outstanding, due_date, currency").neq("status","settled").neq("status","cancelled")).data ?? [],
  });
  const recRows = useQuery({
    queryKey: ["rec", "open"],
    queryFn: async () => (await supabase.from("receivables").select("id, debtor, outstanding, due_date, currency").neq("status","settled").neq("status","cancelled")).data ?? [],
  });
  const provisionsRows = useQuery({
    queryKey: ["provisions", "open"],
    queryFn: async () => (await supabase.from("provisions").select("amount, due_date, status").neq("status","settled").neq("status","cancelled")).data ?? [],
  });
  const incomeSrc = useQuery({
    queryKey: ["income_sources"],
    queryFn: async () => (await supabase.from("income_sources").select("*")).data ?? [],
  });
  const subs = useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => (await supabase.from("subscriptions").select("*")).data ?? [],
  });
  const nodeAmounts = useQuery({
    queryKey: ["budget_node_amounts", "forecast"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) =>
        supabase.from("budget_node_amounts").select("node_id, period_month, planned, revised").range(from, to),
      ),
  });
  const invoicesRows = useQuery({
    queryKey: ["invoices_to_issue", "open"],
    queryFn: async () =>
      (await supabase.from("invoices_to_issue").select("client, amount, paid_amount, due_date, status")
        .not("status", "in", "(paid,cancelled)")).data ?? [],
  });
  const loanSchedule = useQuery({
    queryKey: ["loan_amortizations", "unpaid"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) =>
        supabase.from("loan_amortizations").select("payment_date, principal_amount, interest_amount, paid").eq("paid", false).range(from, to),
      ),
  });

  const assetsRows = useQuery({
    queryKey: ["assets", "owned"],
    queryFn: async () => (await supabase.from("assets").select("id, type, purchase_date, purchase_value, current_value, status, archived")).data ?? [],
  });
  const assetEvents = useQuery({
    queryKey: ["asset_events", "dashboard"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) =>
        supabase.from("asset_events").select("asset_id, event_type, amount, event_date, event_month").in("event_type", ["sale", "revaluation", "impairment"]).range(from, to),
      ),
  });
  const snaps = useQuery({
    queryKey: ["snapshots", "recent"],
    queryFn: async () => (await supabase.from("monthly_snapshots").select("snapshot_month, net_worth, cash_position, total_assets, total_debt, total_receivables").order("snapshot_month", { ascending: true })).data ?? [],
  });
  const goals = useQuery({
    queryKey: ["goals", "active"],
    queryFn: async () => (await supabase.from("financial_goals").select("*").eq("status","active").order("target_date", { ascending: true })).data ?? [],
  });
  const recentTx = useQuery({
    queryKey: ["tx", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions")
        .select("id, occurred_on, description, type, base_amount, currency, wallets:wallet_id(name)")
        .order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data;
    },
  });

  const cur = profile.data?.base_currency ?? "MGA";
  const txRows = allTx.data ?? [];
  const cash = sumAvailableCash(wallets.data ?? [], txRows, { baseCurrency: cur });
  const assetTotals = computeAssetTotals(assetsRows.data ?? [], assetEvents.data ?? [], { transactions: txRows });
  const totalAssets = assetTotals.marketValue; // Valeur (réévaluée ou VNC)
  const totalDebt = computeObligationTotalAsOf(debtsRows.data ?? [], txRows, "debt");
  const totalRec = computeObligationTotalAsOf(recRows.data ?? [], txRows, "receivable");
  const { income, expense } = incomeExpenseForPeriod(txRows, periodFrom, periodTo);
  const savings = income - expense;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;
  const netWorth = cash + totalAssets + totalRec - totalDebt;

  // Growth from snapshots
  const fromMonth = periodFrom.slice(0, 7);
  const toMonth = periodTo.slice(0, 7);
  const snapList = (snaps.data ?? []).filter((s: any) => {
    const m = String(s.snapshot_month).slice(0, 7);
    return m >= fromMonth && m <= toMonth;
  });
  const monthAgoSnap = snapList[snapList.length - 2];
  const threeAgoSnap = snapList[snapList.length - 4];
  const yearAgoSnap = snapList.find(s => {
    const d = new Date(s.snapshot_month);
    return d.getFullYear() === now.getFullYear() - 1 && d.getMonth() === now.getMonth();
  });
  const momGrowth = monthAgoSnap ? growthRate(netWorth, Number(monthAgoSnap.net_worth)) : 0;
  const yoyGrowth = yearAgoSnap ? growthRate(netWorth, Number(yearAgoSnap.net_worth)) : 0;
  const threeMoGrowth = threeAgoSnap ? growthRate(netWorth, Number(threeAgoSnap.net_worth)) : 0;

  // Prévision de trésorerie — logique d'expert financier :
  //  1) Base opérationnelle mensuelle = budget planifié du mois s'il existe, sinon
  //     extrapolation de la moyenne réelle des 90 derniers jours (transactions
  //     opérationnelles seulement : ni actifs, ni provisions, ni transferts).
  //     Les revenus récurrents et abonnements sont déjà dans cette base (ils passent
  //     en transactions / sont planifiés au budget) → jamais comptés deux fois.
  //  2) Flux ponctuels datés : créances (pondérées), dettes, provisions à payer,
  //     factures à encaisser et échéances d'emprunts.
  //  3) Les échéances déjà dépassées sont replacées à J+7 (régularisation).
  const avgIn = averageDailyCashIn(txRows, 90);
  const avgOut = averageDailyCashOut(txRows, 90);
  const activeIncomeSrc = (incomeSrc.data ?? []).filter((r: any) => r.active && r.recurring);
  const activeSubs = (subs.data ?? []).filter((s: any) => s.active);

  const incomeNodeIds = new Set((nodesQ.data ?? []).filter((n: any) => n.is_income).map((n: any) => n.id));
  const plannedByMonth = new Map<string, { income: number; expense: number }>();
  for (const row of nodeAmounts.data ?? []) {
    const key = String(row.period_month).slice(0, 7);
    const amt = Math.abs(Number(row.revised ?? row.planned ?? 0));
    if (!amt) continue;
    const slot = plannedByMonth.get(key) ?? { income: 0, expense: 0 };
    if (incomeNodeIds.has(row.node_id)) slot.income += amt; else slot.expense += amt;
    plannedByMonth.set(key, slot);
  }

  const baselines: MonthBaseline[] = [];
  for (let i = 0; i <= 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const plan = plannedByMonth.get(key);
    const hasPlan = !!plan && (plan.income > 0 || plan.expense > 0);
    baselines.push({
      month: key,
      income: hasPlan && plan!.income > 0 ? plan!.income : avgIn * dim,
      expense: hasPlan && plan!.expense > 0 ? plan!.expense : avgOut * dim,
      planned: hasPlan,
    });
  }

  const items: CashItem[] = [
    // Créances : encaissement probable pondéré (85 %), risque de retard intégré.
    ...(recRows.data ?? []).map((r: any) => ({
      label: r.debtor ?? "Créance", amount: Number(r.outstanding), date: r.due_date,
      confidence: 0.85, group: "Créances à encaisser",
    })),
    ...(invoicesRows.data ?? []).map((r: any) => ({
      label: r.client ?? "Facture", amount: Math.max(0, Number(r.amount) - Number(r.paid_amount ?? 0)),
      date: r.due_date, confidence: r.status === "issued" || r.status === "partially_paid" ? 0.9 : 0.6,
      group: "Factures à émettre / encaisser",
    })),
    ...(debtsRows.data ?? []).map((d: any) => ({
      label: d.creditor ?? "Dette", amount: -Number(d.outstanding), date: d.due_date,
      group: "Dettes à rembourser",
    })),
    ...(provisionsRows.data ?? []).map((p: any) => ({
      label: "Provision", amount: -Number(p.actual_amount ?? p.amount), date: p.due_date,
      group: "Provisions à décaisser",
    })),
    ...(loanSchedule.data ?? []).map((l: any) => ({
      label: "Échéance emprunt", amount: -(Number(l.principal_amount) + Number(l.interest_amount)),
      date: l.payment_date, group: "Échéances d'emprunt",
    })),
  ].filter((i) => i.amount !== 0);

  const expert = buildExpertForecast({ startingCash: cash, baselines, items }, 365);
  const forecast = expert.points;
  const plannedMonths = baselines.filter((b) => b.planned).length;
  const baseline0 = baselines[0];

  const forecastChart = forecast.filter((_, i) => i % 7 === 0).map(p => ({
    day: p.day, label: `J+${p.day}`, balance: p.balance,
  }));
  const horizons = [30, 60, 90, 180, 365];


  // Health
  const health = computeHealth({
    monthlyIncome: income,
    monthlyExpense: expense,
    cash,
    totalDebt,
    totalAssets,
    netWorthGrowth3m: threeMoGrowth,
  });
  const commentary = healthCommentary(health);


  // Allocation — cohérente avec la période sélectionnée et avec le patrimoine :
  // valeur des actifs (VNC/réévaluée) à la date de fin de période + liquidités à cette date.
  const allocCash = sumAvailableCash(wallets.data ?? [], txRows, { baseCurrency: cur, through: periodTo });
  const assetAllocationRows = (assetsRows.data ?? [])
    .filter((a: any) => !a.archived)
    .filter((a: any) => !a.purchase_date || a.purchase_date <= periodTo)
    .map((a: any) => ({
      type: a.type || "autre",
      current_value: computeAssetValue(a, assetEvents.data ?? [], { transactions: txRows, through: periodTo }).marketValue,
    }))
    .filter((r) => r.current_value > 0);
  const allocation = buildAllocation(assetAllocationRows, allocCash);
  const allocTotal = allocation.reduce((s, x) => s + x.value, 0);


  // Wealth evolution (snapshots + current point)
  const wealthChart = [
    ...snapList.map(s => ({ month: fmtMonth(s.snapshot_month), net: Number(s.net_worth) })),
    { month: "Auj.", net: netWorth },
  ];

  // Goal forecast
  const goalForecasts = (goals.data ?? []).slice(0, 4).map((g: any) => {
    const progressData: ProgressInput = {
      txs: txRows,
      wallets: wallets.data ?? [],
      debts: debtsRows.data ?? [],
      assets: assetsRows.data ?? [],
      assetEvents: assetEvents.data ?? [],
      receivables: recRows.data ?? [],
      nodes: nodesQ.data ?? [],
    };
    const computed = computeGoalProgress(g, progressData);
    const currentAmount = computed.current;
    const remaining = Math.max(0, Number(g.target_amount) - currentAmount);
    const monthsToTarget = g.target_date ? Math.max(1, (new Date(g.target_date).getTime() - now.getTime()) / (30 * 86_400_000)) : null;
    const monthlyNeeded = monthsToTarget ? remaining / monthsToTarget : null;
    const periodDays = Math.max(1, Math.ceil((resolved.to.getTime() - resolved.from.getTime()) / 86_400_000) + 1);
    const monthlyCapacity = (savings / periodDays) * 30;
    const monthsAtCurrentPace = monthlyCapacity > 0 ? remaining / monthlyCapacity : null;
    const eta = monthsAtCurrentPace
      ? new Date(now.getFullYear(), now.getMonth() + Math.ceil(monthsAtCurrentPace), 1)
      : null;
    const onTrack = monthlyNeeded != null && monthlyCapacity >= monthlyNeeded;
    const progress = computed.pct;
    return { ...g, current_amount: currentAmount, remaining, monthlyNeeded, monthlyCapacity, eta, onTrack, progress };
  });

  const cfChart = monthlyCashflowFromTransactions(txRows, toISODate(twelveAgo), toISODate(now)).map((r: any) => ({
    month: fmtMonth(r.month), income: Number(r.income), expense: Number(r.expense),
  }));
  const nodeSpend = directNodeSpendFromTransactions(txRows, periodFrom, periodTo);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Vue d'ensemble — {resolved.label}</p>
          <h1 className="mt-1 text-2xl font-semibold">Bienvenue, {profile.data?.full_name ?? "propriétaire"}.</h1>
        </div>
        <PeriodPicker preset={period.preset} onPresetChange={period.setPreset} custom={period.custom} onCustomChange={period.setCustom} />
      </header>


      {/* KPI tiles */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Valeur nette" value={fmtMoney(netWorth, cur)} sub="Actifs + créances − dettes" tone={netWorth >= 0 ? "positive" : "negative"} delta={monthAgoSnap ? momGrowth * 100 : undefined} icon={<Activity className="h-4 w-4" />} />
        <StatCard label="Score santé" value={`${health.score}/100`} sub={`Croissance 3m ${fmtPct(health.growth)}`} tone={scoreTone(health.score)} icon={<ShieldCheck className="h-4 w-4" />} />
        <StatCard label="Trésorerie" value={fmtMoney(cash, cur)} sub={`${(wallets.data ?? []).length} portefeuilles`} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Fonds d'urgence" value={`${health.emergencyMonths.toFixed(1)} mois`} sub="Cible: 6 mois" tone={health.emergencyMonths >= 6 ? "positive" : health.emergencyMonths >= 3 ? "neutral" : "warning"} icon={<PiggyBank className="h-4 w-4" />} />
        <StatCard label={`Revenus · ${resolved.label}`} value={fmtMoney(income, cur)} tone="positive" icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label={`Dépenses · ${resolved.label}`} value={fmtMoney(expense, cur)} tone="negative" icon={<TrendingDown className="h-4 w-4" />} />

        <StatCard label="Dettes en cours" value={fmtMoney(totalDebt, cur)} tone={totalDebt > 0 ? "warning" : "neutral"} icon={<Receipt className="h-4 w-4" />} />
        <StatCard label="Actifs" value={fmtMoney(totalAssets, cur)} sub={`Créances ${fmtMoney(totalRec, cur, { compact: true })}`} icon={<Landmark className="h-4 w-4" />} />
      </section>

      <TodaySection subs={subs.data ?? []} sources={incomeSrc.data ?? []} nodes={nodesQ.data ?? []} wallets={wallets.data ?? []} />



      {/* Wealth evolution */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Évolution du patrimoine" className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-4 text-xs">
            <Metric label="Croissance mensuelle" value={fmtPct(momGrowth * 100)} tone={momGrowth >= 0 ? "positive" : "negative"} />
            <Metric label="Croissance 3 mois" value={fmtPct(threeMoGrowth * 100)} tone={threeMoGrowth >= 0 ? "positive" : "negative"} />
            <Metric label="Croissance annuelle" value={yearAgoSnap ? fmtPct(yoyGrowth * 100) : "—"} tone={yoyGrowth >= 0 ? "positive" : "negative"} />
            <Metric label="Taux d'épargne" value={fmtPct(savingsRate)} tone={savingsRate >= 20 ? "positive" : savingsRate >= 0 ? "neutral" : "negative"} />
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={wealthChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="month" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v) => new Intl.NumberFormat("fr-FR", { notation: "compact" }).format(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v, cur)} />
                <Area type="monotone" dataKey="net" name="Valeur nette" stroke="#6366f1" fill="url(#gw)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {snapList.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Aucun snapshot mensuel. Lancez la clôture mensuelle pour démarrer l'historique.</p>}
        </Panel>

        <Panel title="Allocation d'actifs">
          {allocation.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun actif ni liquidité sur la période sélectionnée.</p>
          ) : (
            <>
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={allocation} dataKey="value" nameKey="name" outerRadius={90} innerRadius={50} paddingAngle={2}>
                      {allocation.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v, cur)} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1 font-mono text-[11px]">
                {allocation.map((a, i) => (
                  <li key={a.name} className="flex justify-between">
                    <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} /> {a.name}</span>
                    <span className="text-muted-foreground">{fmtMoney(a.value, cur)} · {allocTotal > 0 ? ((a.value / allocTotal) * 100).toFixed(1) : "0"}%</span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-border pt-1">
                  <span>Total</span>
                  <span>{fmtMoney(allocTotal, cur)}</span>
                </li>
              </ul>
            </>
          )}
        </Panel>

      </section>

      {/* Forecast + Health */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Prévision de trésorerie · 365 j" className="lg:col-span-2">
          <div className="mb-3 grid grid-cols-5 gap-2">
            {horizons.map(d => {
              const bal = forecastAt(forecast, d);
              return (
                <div key={d} className="rounded-sm border border-border bg-background/40 p-2">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">J+{d}</div>
                  <div className={`num text-sm font-semibold ${bal >= 0 ? "text-foreground" : "text-negative"}`}>{fmtMoney(bal, cur, { compact: true })}</div>
                </div>
              );
            })}
          </div>
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-sm border border-border bg-background/40 p-2">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Point le plus bas</div>
              <div className={`num text-sm font-semibold ${expert.low.balance >= 0 ? "text-foreground" : "text-negative"}`}>
                {fmtMoney(expert.low.balance, cur, { compact: true })}
              </div>
              <div className="font-mono text-[9px] text-muted-foreground">{fmtDate(expert.low.date)}</div>
            </div>
            <div className="rounded-sm border border-border bg-background/40 p-2">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Risque de découvert</div>
              <div className={`num text-sm font-semibold ${expert.breachDay ? "text-negative" : "text-positive"}`}>
                {expert.breachDay ? fmtDate(expert.breachDay.date) : "Aucun"}
              </div>
              <div className="font-mono text-[9px] text-muted-foreground">
                {expert.breachDay ? `J+${expert.breachDay.day}` : "sur 365 jours"}
              </div>
            </div>
            <div className="rounded-sm border border-border bg-background/40 p-2">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Base mensuelle (mois en cours)</div>
              <div className="num text-sm font-semibold">
                {fmtMoney((baseline0?.income ?? 0) - (baseline0?.expense ?? 0), cur, { compact: true })}
              </div>
              <div className="font-mono text-[9px] text-muted-foreground">
                {baseline0?.planned ? "budget planifié" : "moyenne réelle 90 j"}
              </div>
            </div>
          </div>
          <div className="mb-3 h-56">
            <ResponsiveContainer>
              <LineChart data={forecastChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={10} interval={6} />
                <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v) => new Intl.NumberFormat("fr-FR", { notation: "compact" }).format(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v, cur)} />
                <Line type="monotone" dataKey="balance" stroke="#06b6d4" strokeWidth={2} dot={false} name="Solde projeté" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-sm border border-border bg-background/40 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Comment c'est calculé</div>
            <ol className="mt-2 space-y-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
              <li>
                1. Point de départ = trésorerie disponible aujourd'hui : {fmtMoney(cash, cur)} (soldes d'ouverture + impact de toutes les transactions saisies).
              </li>
              <li>
                2. Base opérationnelle mois par mois = budget planifié quand il existe ({plannedMonths}/14 mois planifiés),
                sinon extrapolation de la moyenne réelle des 90 derniers jours
                (entrées {fmtMoney(avgIn * 30, cur, { compact: true })}/mois, sorties {fmtMoney(avgOut * 30, cur, { compact: true })}/mois).
                Achats d'actifs, provisions comptables et transferts entre comptes sont exclus.
                Les revenus récurrents ({activeIncomeSrc.length}) et abonnements actifs ({activeSubs.length}) sont déjà contenus
                dans cette base — ils ne sont pas ajoutés une seconde fois.
              </li>
              <li>
                3. Flux datés ajoutés à leur échéance réelle :
                {expert.groups.length === 0 ? " aucun." : ""}
              </li>
              {expert.groups.map(g => (
                <li key={g.group} className="pl-4">
                  • {g.group} ({g.count}) :
                  {g.inflow > 0 ? ` +${fmtMoney(g.inflow, cur, { compact: true })}` : ""}
                  {g.outflow > 0 ? ` −${fmtMoney(g.outflow, cur, { compact: true })}` : ""}
                </li>
              ))}
              <li>
                4. Prudence : les créances sont pondérées à 85 % et les factures à émettre à 60–90 % selon leur statut ;
                toute échéance déjà dépassée est replacée à J+7 (régularisation) au lieu d'être ignorée.
              </li>
            </ol>
          </div>

        </Panel>

        <Panel title="Santé financière">
          <div className="flex items-baseline gap-2">
            <span className={`num text-4xl font-bold text-${scoreTone(health.score) === "positive" ? "positive" : scoreTone(health.score) === "negative" ? "negative" : scoreTone(health.score) === "warning" ? "warning" : "foreground"}`}>{health.score}</span>
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">/ 100</span>
          </div>
          <ul className="mt-4 space-y-2">
            {health.parts.map(p => (
              <li key={p.label}>
                <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>{p.label}</span><span>{p.value}/{p.max}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-sm bg-border/60">
                  <div className="h-full rounded-sm bg-primary" style={{ width: `${(p.value / p.max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <Stat label="Taux d'épargne" value={fmtPct(health.savingsRate)} />
            <Stat label="Ratio dette" value={fmtPct(health.debtRatio * 100)} />
            <Stat label="Liquidité" value={`${health.liquidityRatio.toFixed(1)}m`} />
            <Stat label="Croissance 3m" value={fmtPct(health.growth)} />
          </dl>
          <div className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs leading-relaxed">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Lecture analyste</span>
              <span className={`font-mono text-[10px] uppercase tracking-wider ${scoreTone(health.score) === "positive" ? "text-positive" : scoreTone(health.score) === "negative" ? "text-negative" : scoreTone(health.score) === "warning" ? "text-warning" : "text-foreground"}`}>{commentary.verdict}</span>
            </div>
            <p className="text-muted-foreground">{commentary.summary}</p>
            {commentary.strengths.length > 0 && (
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-positive">Points forts</div>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {commentary.strengths.map((s) => <li key={s} className="flex gap-1.5"><span className="text-positive">▸</span><span>{s}</span></li>)}
                </ul>
              </div>
            )}
            {commentary.risks.length > 0 && (
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-warning">Risques</div>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {commentary.risks.map((s) => <li key={s} className="flex gap-1.5"><span className="text-warning">▸</span><span>{s}</span></li>)}
                </ul>
              </div>
            )}
            {commentary.actions.length > 0 && (
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-primary">Recommandations</div>
                <ol className="mt-1 space-y-1 text-muted-foreground">
                  {commentary.actions.map((s, i) => <li key={s} className="flex gap-1.5"><span className="num text-primary">{i + 1}.</span><span>{s}</span></li>)}
                </ol>
              </div>
            )}
          </div>
        </Panel>

      </section>

      {/* Cashflow history + categories */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Flux de trésorerie · 12 mois" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={cfChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.4} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="month" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v) => new Intl.NumberFormat("fr-FR", { notation: "compact" }).format(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v, cur)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="income" stroke="#10b981" fill="url(#g1)" name="Revenus" />
                <Area type="monotone" dataKey="expense" stroke="#ef4444" fill="url(#g2)" name="Dépenses" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Dépenses du mois · branches">
          {(() => {
            const tree = buildTree(nodesQ.data ?? []);
            const flat = flattenTree(tree);
            // Sum per root, rolling up all descendants
            const spendByNode = new Map<string, number>();
            for (const r of nodeSpend) if (r.node_id) spendByNode.set(r.node_id, Number(r.spent));
            function sumSubtree(id: string): number {
              const n = flat.find((x) => x.id === id);
              if (!n) return 0;
              let s = spendByNode.get(id) ?? 0;
              for (const c of n.children) s += sumSubtree(c.id);
              return s;
            }
            const rootData = tree
              .map((r) => ({ name: pathLabel(r), value: sumSubtree(r.id) }))
              .filter((x) => x.value > 0)
              .sort((a, b) => b.value - a.value)
              .slice(0, 8);
            // Also: unassigned
            const assignedIds = new Set(flat.map((n) => n.id));
            const unassigned = nodeSpend.filter((r) => !r.node_id || !assignedIds.has(r.node_id))
              .reduce((s, r) => s + Number(r.spent), 0);
            if (unassigned > 0) rootData.push({ name: "Non assigné", value: unassigned });
            return (
              <>
                <div className="h-64">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={rootData} dataKey="value" nameKey="name" outerRadius={90} innerRadius={50} paddingAngle={2}>
                        {rootData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v, cur)} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {rootData.length === 0 && <p className="mt-2 text-center text-xs text-muted-foreground">Aucune dépense liée à un budget ce mois-ci.</p>}
              </>
            );
          })()}
        </Panel>
      </section>

      {/* Goal forecast + recent tx */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Projection des objectifs" className="lg:col-span-1">
          <ul className="space-y-3 text-sm">
            {goalForecasts.length === 0 && <li className="text-muted-foreground">Aucun objectif actif.</li>}
            {goalForecasts.map((g: any) => (
              <li key={g.id} className="space-y-1.5 border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{g.name}</span>
                  <span className={`num text-xs ${g.onTrack ? "text-positive" : "text-warning"}`}>
                    {g.onTrack ? "✓ Sur la trajectoire" : "⚠ À ajuster"}
                  </span>
                </div>
                <div className="h-1.5 rounded-sm bg-border/60">
                  <div className="h-full rounded-sm bg-primary" style={{ width: `${Math.min(100, g.progress)}%` }} />
                </div>
                <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>{g.progress.toFixed(0)}% · {fmtMoney(g.current_amount, g.currency, { compact: true })} / {fmtMoney(g.target_amount, g.currency, { compact: true })}</span>
                  <span>{g.eta ? `ETA ${fmtDate(g.eta)}` : "—"}</span>
                </div>
                {g.monthlyNeeded != null && (
                  <div className="font-mono text-[10px] text-muted-foreground">
                    Besoin: {fmtMoney(g.monthlyNeeded, g.currency, { compact: true })}/mois · Capacité: {fmtMoney(Math.max(0, g.monthlyCapacity), cur, { compact: true })}/mois
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Transactions récentes" className="lg:col-span-2">
          <div className="scroll-thin -mx-4 overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Description</th><th className="px-4 py-2">Portefeuille</th><th className="px-4 py-2 text-right">Montant</th></tr>
              </thead>
              <tbody>
                {(recentTx.data ?? []).map((t: any) => {
                  const sign = t.type === "income" || t.type === "asset_sale" ? 1 : t.type === "transfer" ? 0 : -1;
                  return (
                    <tr key={t.id} className="border-t border-border/60">
                      <td className="num px-4 py-2 text-muted-foreground">{fmtDate(t.occurred_on)}</td>
                      <td className="px-4 py-2">{t.description}</td>
                      <td className="px-4 py-2 text-muted-foreground">{t.wallets?.name ?? "—"}</td>
                      <td className={`num px-4 py-2 text-right ${sign > 0 ? "text-positive" : sign < 0 ? "text-negative" : ""}`}>
                        {fmtMoney(Number(t.base_amount) * sign, t.currency, { sign: true })}
                      </td>
                    </tr>
                  );
                })}
                {(recentTx.data ?? []).length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune transaction</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" | "neutral" }) {
  const cls = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-foreground";
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`num text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border/60 bg-background/40 px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="num text-sm font-semibold">{value}</div>
    </div>
  );
}

function TodaySection({ subs, sources, nodes, wallets }: { subs: any[]; sources: any[]; nodes: any[]; wallets: any[] }) {
  const qc = useQueryClient();
  const today = toISODate(new Date());
  const dueSubs = subs.filter((s: any) => s.active && s.next_billing_date && s.next_billing_date <= today);
  const dueSources = sources.filter((s: any) => s.active && s.recurring && s.next_date && s.next_date <= today);
  const items: Array<{ kind: "sub" | "src"; row: any }> = [
    ...dueSubs.map((row: any) => ({ kind: "sub" as const, row })),
    ...dueSources.map((row: any) => ({ kind: "src" as const, row })),
  ];
  const [picks, setPicks] = useState<Record<string, { wallet_id: string; node_id: string | null }>>({});
  const setPick = (id: string, patch: Partial<{ wallet_id: string; node_id: string | null }>) =>
    setPicks((p) => {
      const cur = p[id] ?? { wallet_id: "", node_id: null };
      return { ...p, [id]: { ...cur, ...patch } };
    });

  const gen = useMutation({
    mutationFn: async ({ kind, row }: { kind: "sub" | "src"; row: any }) => {
      const pick = picks[row.id] ?? { wallet_id: "", node_id: null };
      if (!pick.wallet_id) throw new Error("Portefeuille requis");
      if (!pick.node_id) throw new Error("Feuille budgétaire requise");
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const isSub = kind === "sub";
      const amt = Number(row.amount ?? 0);
      const nextField = isSub ? "next_billing_date" : "next_date";
      const cycle = isSub ? row.billing_cycle : row.cycle;
      const currentNext = row[nextField] ?? today;
      const { data: tx, error } = await supabase.from("transactions").insert({
        user_id: uid,
        type: isSub ? "expense" : "income",
        occurred_on: currentNext,
        description: `${isSub ? "Abonnement" : "Revenu"} · ${row.name}`,
        wallet_id: pick.wallet_id,
        amount: amt, currency: row.currency ?? "MGA", exchange_rate: 1, base_amount: amt,
        budget_node_id: pick.node_id,
        source_kind: isSub ? "subscription" : "income_source",
        source_id: row.id,
      }).select().single();
      if (error) throw error;
      const nextDate = advanceDate(currentNext, cycle);
      await (supabase as any).from(isSub ? "subscriptions" : "income_sources")
        .update({ [nextField]: nextDate }).eq("id", row.id);
      await logAudit("transaction", tx?.id ?? null, "create", { source: kind === "sub" ? "subscription" : "income_source", source_id: row.id });
      await logAudit(kind === "sub" ? "subscription" : "income_source", row.id, "update", { advanced_to: nextDate });
    },
    onSuccess: () => { toast.success("Transaction générée"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (items.length === 0) return null;

  return (
    <Panel title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> À traiter aujourd'hui</span> as any}>
      <div className="space-y-2">
        {items.map(({ kind, row }) => {
          const pick = picks[row.id] ?? { wallet_id: "", node_id: null };
          const amt = Number(row.amount ?? 0);
          const kindLabel = kind === "sub" ? "Abonnement" : "Revenu récurrent";
          const nextDate = kind === "sub" ? row.next_billing_date : row.next_date;
          return (
            <div key={`${kind}-${row.id}`} className="grid grid-cols-1 md:grid-cols-[1fr_180px_220px_auto] items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
              <div>
                <div className="text-sm font-medium">{row.name} <span className="ml-2 font-mono text-[9px] uppercase text-muted-foreground">{kindLabel}</span></div>
                <div className="num text-xs text-muted-foreground">Échéance {fmtDate(nextDate)} · {fmtMoney(amt, row.currency ?? "MGA")}</div>
              </div>
              <select
                value={pick.wallet_id}
                onChange={(e) => setPick(row.id, { wallet_id: e.target.value })}
                className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="">Portefeuille…</option>
                {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <div className="min-w-0">
                <NodePicker nodes={nodes} value={pick.node_id} onChange={(id) => setPick(row.id, { node_id: id })} leafOnly placeholder="Feuille…" />
              </div>
              <Button size="sm" onClick={() => gen.mutate({ kind, row })} disabled={gen.isPending}>
                <Zap className="mr-1 h-3 w-3" /> Générer
              </Button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

