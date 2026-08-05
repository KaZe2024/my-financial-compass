import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseOffline as supabase } from "@/lib/offline/client";
import { offlineInsert, offlineUpdate, currentUserId } from "@/lib/offline/mutations";
import { fetchAllRows } from "@/lib/fetch-all";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { budgetNodesQO, walletsQO } from "@/lib/queries";
import { fmtDate, fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import {
  Compass, AlertTriangle, CheckCircle2, Clock, ArrowRight, CalendarClock, Sparkles, BellRing, TrendingDown, Check, Timer, X,
} from "lucide-react";
import {
  sumAvailableCash, incomeExpenseForPeriod, averageDailyCashIn, averageDailyCashOut,
  computeAssetTotals, computeAssetValue, computeObligationTotalAsOf,
} from "@/lib/finance";
import { computeHealth, buildExpertForecast, type CashItem, type MonthBaseline } from "@/lib/analytics";
import { computeExecutionScore, computeAlignmentScore, computeLifeScore, scoreTone } from "@/lib/life-score";
import {
  buildRecommendations, CATEGORY_LABELS, SEVERITY_LABELS, EFFORT_LABELS,
  type Recommendation, type AdvisorSeverity,
} from "@/lib/advisor";
import { computeGoalProgress, type ProgressInput } from "@/lib/goal-progress";
import { occurrencesInRange, isClosed, ymd, addDays, parseYmd, fmtTimeRange, statusMeta, priorityMeta, planItemTagsQO, type PlanItem, type PlanItemTag } from "@/lib/planning";
import { computeDomainTime, type LifeDomain } from "@/lib/life";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({
    meta: [
      { title: "Briefing du jour — OPTIS" },
      { name: "description", content: "Le point unique du jour : priorités, échéances, scores de vie et recommandations d'optimisation." },
      { property: "og:title", content: "Briefing du jour — OPTIS" },
      { property: "og:description", content: "Priorités du jour, échéances financières et recommandations d'optimisation personnalisées." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TodayPage,
});

const TONE_CLASS: Record<string, string> = {
  positive: "text-positive",
  neutral: "text-primary",
  warning: "text-warning",
  negative: "text-negative",
};

const SEV_STYLE: Record<AdvisorSeverity, { icon: any; badge: string; ring: string }> = {
  critical: { icon: AlertTriangle, badge: "bg-red-500/15 text-red-400", ring: "border-l-red-500" },
  warning: { icon: BellRing, badge: "bg-amber-500/15 text-amber-400", ring: "border-l-amber-500" },
  info: { icon: Clock, badge: "bg-sky-500/15 text-sky-400", ring: "border-l-sky-500" },
  opportunity: { icon: Sparkles, badge: "bg-emerald-500/15 text-emerald-400", ring: "border-l-emerald-500" },
};

const TX_COLS =
  "id, type, wallet_id, to_wallet_id, amount, base_amount, exchange_rate, currency, occurred_on, budget_node_id, source_kind, source_id, asset_id, debt_id, receivable_id, description, notes";

function useBriefingData() {
  const wallets = useQuery(walletsQO);
  const nodes = useQuery(budgetNodesQO);

  const txs = useQuery({
    queryKey: ["tx", "briefing"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) => supabase.from("transactions").select(TX_COLS).range(from, to)),
  });
  const debts = useQuery({
    queryKey: ["debts", "briefing"],
    queryFn: async () => (await supabase.from("debts").select("*")).data ?? [],
  });
  const receivables = useQuery({
    queryKey: ["receivables", "briefing"],
    queryFn: async () => (await supabase.from("receivables").select("*")).data ?? [],
  });
  const provisions = useQuery({
    queryKey: ["provisions", "briefing"],
    queryFn: async () => (await supabase.from("provisions").select("*")).data ?? [],
  });
  const subscriptions = useQuery({
    queryKey: ["subscriptions", "briefing"],
    queryFn: async () => (await supabase.from("subscriptions").select("*")).data ?? [],
  });
  const assets = useQuery({
    queryKey: ["assets", "briefing"],
    queryFn: async () => (await supabase.from("assets").select("*")).data ?? [],
  });
  const assetEvents = useQuery({
    queryKey: ["asset_events", "briefing"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) =>
        supabase.from("asset_events").select("asset_id, event_type, amount, event_date, event_month").range(from, to),
      ),
  });
  const goals = useQuery({
    queryKey: ["financial_goals", "briefing"],
    queryFn: async () => (await supabase.from("financial_goals").select("*").eq("archived", false)).data ?? [],
  });
  const nodeAmounts = useQuery({
    queryKey: ["budget_node_amounts", "briefing"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) =>
        supabase.from("budget_node_amounts").select("node_id, period_month, planned, revised").range(from, to),
      ),
  });
  const planItems = useQuery({
    queryKey: ["plan_items", "briefing"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) => supabase.from("plan_items").select("*").range(from, to)),
  });
  const planTypes = useQuery({
    queryKey: ["plan_types", "briefing"],
    queryFn: async () => (await supabase.from("plan_types").select("*")).data ?? [],
  });
  const advisorActions = useQuery({
    queryKey: ["advisor_actions", "briefing"],
    queryFn: async () => (await (supabase as any).from("advisor_actions").select("*")).data ?? [],
  });

  const lifeDomains = useQuery({
    queryKey: ["life_domains", "briefing"],
    queryFn: async () => (await supabase.from("life_domains").select("*").eq("archived", false)).data ?? [],
  });
  const planItemTags = useQuery(planItemTagsQO);

  const loading =
    wallets.isLoading || txs.isLoading || planItems.isLoading || assets.isLoading || debts.isLoading;

  return {
    loading,
    wallets: (wallets.data as any[]) ?? [],
    nodes: (nodes.data as any[]) ?? [],
    txs: (txs.data as any[]) ?? [],
    debts: (debts.data as any[]) ?? [],
    receivables: (receivables.data as any[]) ?? [],
    provisions: (provisions.data as any[]) ?? [],
    subscriptions: (subscriptions.data as any[]) ?? [],
    assets: (assets.data as any[]) ?? [],
    assetEvents: (assetEvents.data as any[]) ?? [],
    goals: (goals.data as any[]) ?? [],
    nodeAmounts: (nodeAmounts.data as any[]) ?? [],
    planItems: (planItems.data as PlanItem[]) ?? [],
    planTypes: (planTypes.data as any[]) ?? [],
    advisorActions: (advisorActions.data as any[]) ?? [],
    lifeDomains: (lifeDomains.data as LifeDomain[]) ?? [],
    planItemTags: (planItemTags.data as PlanItemTag[]) ?? [],
  };
}

function monthlyFromCycle(amount: number, cycle: string) {
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

function TodayPage() {
  const qc = useQueryClient();
  const d = useBriefingData();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);

  const model = useMemo(() => {
    const cash = sumAvailableCash(
      d.wallets.filter((w) => (w.type ?? "") !== "credit") as any,
      d.txs as any,
    );
    const from30 = ymd(addDays(today, -30));
    const ie = incomeExpenseForPeriod(d.txs as any, from30, todayStr);
    const dailyIn = averageDailyCashIn(d.txs as any, 90, today);
    const dailyOut = averageDailyCashOut(d.txs as any, 90, today);
    const monthlyIncome = Math.max(ie.income, dailyIn * 30);
    const monthlyExpense = Math.max(ie.expense, dailyOut * 30);

    const assetTotals = computeAssetTotals(d.assets as any, d.assetEvents as any, { transactions: d.txs as any });
    const totalDebt = computeObligationTotalAsOf(d.debts as any, d.txs as any, "debt");
    const totalRec = computeObligationTotalAsOf(d.receivables as any, d.txs as any, "receivable");
    const netWorth = cash + assetTotals.marketValue + totalRec - totalDebt;

    const health = computeHealth({
      cash,
      totalAssets: assetTotals.marketValue,
      totalDebt,
      monthlyIncome,
      monthlyExpense,
      netWorthGrowth3m: 0,
    } as any);

    // Prévision 12 mois : baseline = moyenne 90 j, flux datés pondérés.
    const baselines: MonthBaseline[] = [];
    for (let m = 0; m < 13; m++) {
      const dt = new Date(today.getFullYear(), today.getMonth() + m, 1);
      baselines.push({
        month: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`,
        income: dailyIn * 30,
        expense: dailyOut * 30,
        planned: false,
      });
    }
    const items: CashItem[] = [];
    for (const x of d.debts) {
      if (x.archived || x.status === "settled" || x.status === "cancelled") continue;
      if (!x.due_date) continue;
      items.push({ label: x.creditor, amount: -Number(x.outstanding ?? 0), date: x.due_date, confidence: 1, group: "Dettes" });
    }
    for (const x of d.receivables) {
      if (x.archived || x.status === "settled" || x.status === "cancelled") continue;
      if (!x.due_date) continue;
      items.push({ label: x.debtor, amount: Number(x.outstanding ?? 0), date: x.due_date, confidence: 0.8, group: "Créances" });
    }
    for (const x of d.provisions) {
      if (x.status === "settled" || x.status === "cancelled" || !x.due_date) continue;
      const sign = x.direction === "in" ? 1 : -1;
      items.push({ label: x.name, amount: sign * Number(x.amount ?? 0), date: x.due_date, confidence: 0.9, group: "Provisions" });
    }
    const forecast = buildExpertForecast({ startingCash: cash, baselines, items }, 365);

    // Exécution
    const execution = computeExecutionScore(d.planItems, today, 30);
    const domainTime = computeDomainTime(d.planItems, d.lifeDomains, d.planItemTags, addDays(today, -27), today);
    const alignment = computeAlignmentScore({
      priorities: d.lifeDomains.map((x) => ({ key: x.id, label: x.label, weight: Number(x.weight) || 0 })),
      actualMinutes: Object.fromEntries(domainTime.rows.map((r) => [r.id, r.minutes])),
    });
    const life = computeLifeScore(health.score, execution.score, alignment?.score ?? null);

    // Agenda du jour + arriéré
    const typeById = new Map(d.planTypes.map((t) => [t.id, t]));
    const agenda: Array<{ item: PlanItem; typeName: string | null; color: string | null }> = [];
    const overdue: Array<{ item: PlanItem; day: string }> = [];
    for (const it of d.planItems) {
      const occ = occurrencesInRange(it, addDays(today, -60), today);
      if (occ.includes(todayStr)) {
        const t = it.type_id ? typeById.get(it.type_id) : null;
        agenda.push({ item: it, typeName: t?.name ?? null, color: t?.color ?? null });
      }
      if (isClosed(it.status)) continue;
      const past = occ.filter((o) => o < todayStr);
      if (past.length) overdue.push({ item: it, day: past[past.length - 1] });
    }
    agenda.sort((a, b) => (a.item.start_time ?? "99").localeCompare(b.item.start_time ?? "99"));
    overdue.sort((a, b) => a.day.localeCompare(b.day));

    // Échéances financières 30 jours
    const in30 = ymd(addDays(today, 30));
    const deadlines: Array<{ kind: string; label: string; amount: number; date: string; late: boolean; to: string }> = [];
    for (const x of d.debts) {
      if (x.archived || x.status === "settled" || x.status === "cancelled" || !x.due_date || x.due_date > in30) continue;
      deadlines.push({ kind: "Dette", label: x.creditor, amount: Number(x.outstanding ?? 0), date: x.due_date, late: x.due_date < todayStr, to: "/debts" });
    }
    for (const x of d.receivables) {
      if (x.archived || x.status === "settled" || x.status === "cancelled" || !x.due_date || x.due_date > in30) continue;
      deadlines.push({ kind: "Créance", label: x.debtor, amount: Number(x.outstanding ?? 0), date: x.due_date, late: x.due_date < todayStr, to: "/receivables" });
    }
    for (const x of d.subscriptions) {
      if (!x.active || !x.next_billing_date || x.next_billing_date > in30) continue;
      deadlines.push({ kind: "Abonnement", label: x.name, amount: Number(x.amount ?? 0), date: x.next_billing_date, late: x.next_billing_date < todayStr, to: "/subscriptions" });
    }
    for (const x of d.provisions) {
      if (x.status === "settled" || x.status === "cancelled" || !x.due_date || x.due_date > in30) continue;
      deadlines.push({ kind: "Provision", label: x.name, amount: Number(x.amount ?? 0), date: x.due_date, late: x.due_date < todayStr, to: "/provisions" });
    }
    deadlines.sort((a, b) => a.date.localeCompare(b.date));

    // Objectifs
    const progressInput: ProgressInput = {
      txs: d.txs as any,
      wallets: d.wallets as any,
      debts: d.debts as any,
      assets: d.assets as any,
      assetEvents: d.assetEvents as any,
      receivables: d.receivables as any,
      nodes: d.nodes as any,
    };
    const goalRows = d.goals.map((g) => {
      const p = computeGoalProgress(g, progressInput);
      return { goal: g, progress: p };
    });

    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const hasCurrentBudget = d.nodeAmounts.some(
      (a) => String(a.period_month ?? "").slice(0, 7) === currentMonth && Number(a.planned ?? 0) !== 0,
    );

    const assetRows = d.assets
      .filter((a) => !a.archived)
      .map((a) => {
        const v = computeAssetValue(a as any, d.assetEvents as any, { transactions: d.txs as any });
        return { id: a.id, name: a.name, bookValue: v.bookValue, cost: v.cost, sold: v.sold };
      });

    const recs = buildRecommendations({
      today: todayStr,
      cash,
      monthlyIncome,
      monthlyExpense,
      emergencyMonths: health.emergencyMonths,
      savingsRate: health.savingsRate,
      netWorth,
      totalDebt,
      totalAssets: assetTotals.marketValue,
      forecastLow: forecast.low ? { balance: forecast.low.balance, date: forecast.low.date } : null,
      forecastBreach: forecast.breachDay ? { balance: forecast.breachDay.balance, date: forecast.breachDay.date } : null,
      debts: d.debts.filter((x) => !x.archived) as any,
      receivables: d.receivables.filter((x) => !x.archived) as any,
      provisions: d.provisions as any,
      subscriptions: d.subscriptions as any,
      goals: goalRows.map(({ goal, progress }) => ({
        id: goal.id,
        name: goal.name,
        pct: progress.pct,
        target_date: goal.target_date,
        inverse: progress.inverse,
        status: goal.status,
      })),
      assets: assetRows,
      overdueTasks: overdue.length,
      completionRate: execution.completionRate,
      habitAdherence: execution.habitAdherence,
      hasCurrentBudget,
    });

    const monthlySubs = d.subscriptions
      .filter((s) => s.active)
      .reduce((s, x) => s + monthlyFromCycle(Number(x.amount ?? 0), x.billing_cycle), 0);

    return {
      cash, monthlyIncome, monthlyExpense, netWorth, totalDebt, totalRec,
      assetTotals, health, forecast, execution, alignment, life,
      agenda, overdue, deadlines, goalRows, recs, monthlySubs,
    };
  }, [d.wallets, d.txs, d.debts, d.receivables, d.provisions, d.subscriptions, d.assets, d.assetEvents, d.goals, d.nodeAmounts, d.planItems, d.planTypes, d.nodes, todayStr]);

  // Suivi des conseils : masquer ce qui est refusé / reporté / déjà traité.
  const stateByKey = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of d.advisorActions) m.set(a.rec_key, a);
    return m;
  }, [d.advisorActions]);

  const visibleRecs = useMemo(
    () =>
      model.recs.filter((r) => {
        const st = stateByKey.get(r.key);
        if (!st) return true;
        if (st.status === "dismissed") return false;
        if (st.status === "snoozed" && st.snooze_until && st.snooze_until > todayStr) return false;
        return true;
      }),
    [model.recs, stateByKey, todayStr],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["advisor_actions", "briefing"] });
    qc.invalidateQueries({ queryKey: ["plan_items"] });
  };

  const track = useMutation({
    mutationFn: async ({ rec, status }: { rec: Recommendation; status: "accepted" | "snoozed" | "dismissed" }) => {
      const uid = await currentUserId();
      const existing = stateByKey.get(rec.key);
      let planItemId: string | null = existing?.plan_item_id ?? null;

      if (status === "accepted") {
        const res = await offlineInsert("plan_items", {
          user_id: uid,
          title: rec.title,
          status: "todo",
          priority: rec.severity === "critical" ? "critical" : rec.severity === "warning" ? "high" : "medium",
          urgent: rec.severity === "critical" || rec.severity === "warning",
          important: true,
          scheduled_on: rec.dueDate && rec.dueDate >= todayStr ? rec.dueDate : todayStr,
          all_day: false,
          no_fixed_time: true,
          recurrence: "none",
          recurrence_interval: 1,
          times_per_day: 1,
          sort_order: 0,
          notes: `${CATEGORY_LABELS[rec.category]} — ${rec.rationale}`,
        });
        if (!res.ok) throw new Error(res.error ?? "Erreur création de la tâche");
        planItemId = String(res.id ?? "") || null;
      }

      const payload: Record<string, unknown> = {
        user_id: uid,
        rec_key: rec.key,
        title: rec.title,
        category: rec.category,
        status,
        impact: rec.impact,
        snooze_until: status === "snoozed" ? ymd(addDays(today, 7)) : null,
        plan_item_id: planItemId,
        resolved_at: status === "accepted" ? new Date().toISOString() : null,
      };
      const res = existing
        ? await offlineUpdate("advisor_actions", existing.id, payload)
        : await offlineInsert("advisor_actions", payload);
      if (!res.ok) throw new Error(res.error ?? "Erreur enregistrement du suivi");
      return status;
    },
    onSuccess: (status) => {
      invalidate();
      toast.success(
        status === "accepted" ? "Conseil accepté — tâche créée dans la planification"
        : status === "snoozed" ? "Conseil reporté de 7 jours"
        : "Conseil écarté",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applied = d.advisorActions.filter((a) => a.status === "accepted").length;
  const dismissed = d.advisorActions.filter((a) => a.status === "dismissed").length;
  const totalTracked = applied + dismissed;
  const adoption = totalTracked > 0 ? Math.round((applied / totalTracked) * 100) : null;

  const lifeTone = scoreTone(model.life.score);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Conseiller</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
            <Compass className="h-6 w-6" /> Briefing du jour
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {parseYmd(todayStr).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            {d.loading && " · chargement des données…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/planning">Planification</Link></Button>
          <Button asChild size="sm"><Link to="/dashboard">Dashboard</Link></Button>
        </div>
      </header>

      {/* Scores */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel title="Score de vie OPTIS">
          <div className="flex items-baseline gap-2">
            <span className={cn("num text-4xl font-semibold", TONE_CLASS[lifeTone])}>{model.life.score}</span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{model.life.verdict}</p>
          <div className="mt-3 space-y-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="flex justify-between"><span>Finance (50 %)</span><span className="num text-foreground">{model.life.finance}</span></div>
            <div className="flex justify-between"><span>Exécution (30 %)</span><span className="num text-foreground">{model.life.execution}</span></div>
            <div className="flex justify-between">
              <span>Alignement (20 %)</span>
              <span className="num text-foreground">{model.life.alignment ?? "—"}</span>
            </div>
          </div>
          {model.life.alignment == null && (
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground/70">
              L'alignement se calculera dès que des priorités de vie seront déclarées ; en attendant le score se répartit sur les deux autres dimensions.
            </p>
          )}
        </Panel>

        <StatCard label="Trésorerie disponible" value={fmtMoney(model.cash)} sub={`${model.health.emergencyMonths.toFixed(1)} mois de dépenses`} />
        <StatCard label="Réalisation 30 j" value={`${model.execution.completionRate.toFixed(0)} %`} sub={`${model.execution.overdue} en retard · série ${model.execution.streak} j`} />
        <StatCard
          label="Recommandations actives"
          value={String(visibleRecs.length)}
          sub={adoption != null ? `Taux d'application : ${adoption} %` : "Aucun conseil encore arbitré"}
        />
      </div>

      {/* Recommandations */}
      <Panel
        title={`Ce qu'il faut faire (${visibleRecs.length})`}
        action={<span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Trié par criticité puis impact</span>}
      >
        <div className="space-y-2">
          {visibleRecs.map((r) => {
            const S = SEV_STYLE[r.severity];
            const Icon = S.icon;
            const st = stateByKey.get(r.key);
            return (
              <div key={r.key} className={cn("rounded-md border border-l-2 border-border bg-card p-3", S.ring)}>
                <div className="flex flex-wrap items-start gap-3">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", S.badge.split(" ")[1])} />
                  <div className="min-w-[240px] flex-1">
                    <div className="text-sm font-semibold">{r.title}</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.rationale}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-widest">
                      <span className={cn("rounded-sm px-1.5 py-0.5", S.badge)}>{SEVERITY_LABELS[r.severity]}</span>
                      <span className="rounded-sm bg-muted px-1.5 py-0.5 text-muted-foreground">{CATEGORY_LABELS[r.category]}</span>
                      <span className="text-muted-foreground/70">{EFFORT_LABELS[r.effort]}</span>
                      {r.impact > 0 && <span className="text-muted-foreground/70">Impact ≈ {fmtMoney(r.impact, "MGA", { compact: true })}</span>}
                      {r.dueDate && <span className="text-muted-foreground/70">Avant {fmtDate(r.dueDate)}</span>}
                      {st?.status === "accepted" && <span className="text-positive">Déjà accepté</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                      <Link to={r.moduleTo as any}>{r.module} <ArrowRight className="ml-1 h-3 w-3" /></Link>
                    </Button>
                    <Button size="sm" className="h-7 px-2 text-xs" disabled={track.isPending} onClick={() => track.mutate({ rec: r, status: "accepted" })}>
                      <Check className="mr-1 h-3 w-3" /> Accepter
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={track.isPending} onClick={() => track.mutate({ rec: r, status: "snoozed" })}>
                      <Timer className="mr-1 h-3 w-3" /> 7 j
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" disabled={track.isPending} onClick={() => track.mutate({ rec: r, status: "dismissed" })}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          {visibleRecs.length === 0 && (
            <p className="flex items-center justify-center gap-2 py-8 text-center text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-positive" /> Aucune action prioritaire détectée : les indicateurs sont dans les seuils attendus.
            </p>
          )}
        </div>
        <p className="mt-3 border-t border-border/60 pt-2 text-[10px] leading-snug text-muted-foreground/70">
          « Accepter » crée immédiatement une tâche dans la planification. « 7 j » remet le conseil à plus tard. La croix l'écarte
          définitivement : il ne réapparaîtra plus, ce qui permet de mesurer le taux d'application des conseils.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Agenda */}
        <Panel title={`Aujourd'hui (${model.agenda.length})`}>
          <div className="space-y-1.5">
            {model.agenda.map(({ item, typeName, color }) => {
              const sm = statusMeta(item.status);
              const pm = priorityMeta(item.priority);
              return (
                <div key={item.id} className="flex items-start gap-2.5 rounded-md border border-border/60 bg-card px-3 py-2">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color ?? "hsl(var(--muted-foreground))" }} />
                  <div className="min-w-0 flex-1">
                    <div className={cn("truncate text-sm", item.status === "done" && "text-muted-foreground line-through")}>{item.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      <span>{fmtTimeRange(item)}</span>
                      {typeName && <span>{typeName}</span>}
                      <span className={pm.className}>{pm.label}</span>
                      {item.location && <span>{item.location}</span>}
                    </div>
                  </div>
                  <span className={cn("rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest", sm.className)}>{sm.label}</span>
                </div>
              );
            })}
            {model.agenda.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">Rien de planifié aujourd'hui. Une journée vide est un choix, pas un oubli.</p>
            )}
          </div>
        </Panel>

        {/* Arriéré */}
        <Panel
          title={`Arriéré à traiter (${model.overdue.length})`}
          action={<Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs"><Link to="/planning">Ouvrir <ArrowRight className="ml-1 h-3 w-3" /></Link></Button>}
        >
          <div className="space-y-1.5">
            {model.overdue.slice(0, 12).map(({ item, day }) => (
              <div key={item.id} className="flex items-center gap-2.5 rounded-md border border-border/60 bg-card px-3 py-2">
                <Clock className="h-3.5 w-3.5 shrink-0 text-warning" />
                <div className="min-w-0 flex-1 truncate text-sm">{item.title}</div>
                <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{fmtDate(day)}</span>
              </div>
            ))}
            {model.overdue.length > 12 && (
              <p className="pt-1 text-center text-[10px] text-muted-foreground">+ {model.overdue.length - 12} autre(s)</p>
            )}
            {model.overdue.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">Aucun retard : le plan est tenu.</p>
            )}
          </div>
        </Panel>

        {/* Échéances financières */}
        <Panel title={`Échéances financières 30 jours (${model.deadlines.length})`}>
          <div className="scroll-thin -mx-4 max-h-[320px] overflow-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Libellé</th>
                  <th className="px-4 py-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {model.deadlines.map((e, idx) => (
                  <tr key={idx} className="border-t border-border/60">
                    <td className={cn("px-4 py-2 text-xs", e.late && "text-negative")}>{fmtDate(e.date)}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      <Link to={e.to as any} className="hover:text-foreground">{e.kind}</Link>
                    </td>
                    <td className="px-4 py-2">{e.label}</td>
                    <td className="num px-4 py-2 text-right">{fmtMoney(e.amount)}</td>
                  </tr>
                ))}
                {model.deadlines.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-xs text-muted-foreground">Rien à l'horizon 30 jours.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Objectifs */}
        <Panel
          title={`Objectifs suivis (${model.goalRows.length})`}
          action={<Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs"><Link to="/goals">Ouvrir <ArrowRight className="ml-1 h-3 w-3" /></Link></Button>}
        >
          <div className="space-y-2.5">
            {model.goalRows.slice(0, 8).map(({ goal, progress }) => (
              <div key={goal.id}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate">{goal.name}</span>
                  <span className="num shrink-0 text-muted-foreground">{progress.pct.toFixed(0)} %</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", progress.pct >= 100 ? "bg-positive" : progress.inverse ? "bg-warning" : "bg-primary")}
                    style={{ width: `${Math.min(100, Math.max(0, progress.pct))}%` }}
                  />
                </div>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">{progress.label}</p>
              </div>
            ))}
            {model.goalRows.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">Aucun objectif actif. Sans cible, il n'y a rien à optimiser.</p>
            )}
          </div>
        </Panel>
      </div>

      {/* Lecture de la trésorerie */}
      <Panel title="Trajectoire de trésorerie">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Point bas 12 mois</div>
            <div className={cn("num mt-1 text-lg font-semibold", model.forecast.low.balance < 0 ? "text-negative" : "text-foreground")}>
              {fmtMoney(model.forecast.low.balance)}
            </div>
            <div className="text-[10px] text-muted-foreground">vers le {fmtDate(model.forecast.low.date)}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Rupture projetée</div>
            <div className={cn("num mt-1 text-lg font-semibold", model.forecast.breachDay ? "text-negative" : "text-positive")}>
              {model.forecast.breachDay ? fmtDate(model.forecast.breachDay.date) : "Aucune"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {model.forecast.breachDay ? "Arbitrage nécessaire avant cette date" : "Le solde reste positif sur l'horizon"}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Rythme mensuel</div>
            <div className="num mt-1 text-lg font-semibold">
              {fmtMoney(model.monthlyIncome - model.monthlyExpense, "MGA", { sign: true })}
            </div>
            <div className="text-[10px] text-muted-foreground">
              Entrées {fmtMoney(model.monthlyIncome, "MGA", { compact: true })} · sorties {fmtMoney(model.monthlyExpense, "MGA", { compact: true })}
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-1.5 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
          <p className="flex items-start gap-2"><CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Base : moyenne des flux opérationnels des 90 derniers jours (hors transferts, achats d'actifs, provisions comptables).</p>
          <p className="flex items-start gap-2"><TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Ajout des échéances datées pondérées par leur probabilité : dettes 100 %, créances 80 %, provisions 90 %.</p>
          <p className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Abonnements actifs : {fmtMoney(model.monthlySubs)} par mois d'engagements récurrents.</p>
        </div>
      </Panel>
    </div>
  );
}
