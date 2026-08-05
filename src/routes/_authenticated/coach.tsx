import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseOffline as supabase } from "@/lib/offline/client";
import { offlineInsert, offlineUpdate, offlineDelete, currentUserId } from "@/lib/offline/mutations";
import { useServerFn } from "@tanstack/react-start";
import { fetchAllRows } from "@/lib/fetch-all";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";
import { walletsQO, budgetNodesQO } from "@/lib/queries";
import { generateCoachNarrative } from "@/lib/coach.functions";
import {
  sumAvailableCash, incomeExpenseForPeriod, averageDailyCashIn, averageDailyCashOut,
  computeAssetTotals, computeObligationTotalAsOf,
} from "@/lib/finance";
import { computeHealth, buildExpertForecast, type CashItem, type MonthBaseline } from "@/lib/analytics";
import { computeExecutionScore, computeAlignmentScore, computeLifeScore, scoreTone } from "@/lib/life-score";
import { buildRecommendations, CATEGORY_LABELS } from "@/lib/advisor";
import { computeDomainTime, computeHabitTraces, type LifeDomain } from "@/lib/life";
import { computeGoalProgress, type ProgressInput } from "@/lib/goal-progress";
import { occurrencesInRange, isClosed, ymd, addDays, planItemTagsQO, type PlanItem, type PlanItemTag } from "@/lib/planning";
import {
  planDraftsFromRecs, planFocus, planSummary, planProgress, planNudges, monthEnd, monthLabel,
  ITEM_STATUS, ITEM_STATUS_LABEL, type CoachPlan, type CoachPlanItem,
} from "@/lib/coach";
import { buildReport, periodBounds, periodLabel, reportToMarkdown, type ReportKind } from "@/lib/reports";
import {
  deriveNotifications, sortNotifications, unreadCount, KIND_LABELS,
  type NotificationRow,
} from "@/lib/notifications";
import {
  Bot, FileBarChart, BellRing, Sparkles, Plus, Trash2, Check, RefreshCw, Download, ArrowRight,
  AlertTriangle, CheckCircle2, Clock, Save, EyeOff,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/coach")({
  head: () => ({
    meta: [
      { title: "Coach & rapports — OPTIS" },
      { name: "description", content: "Plan d'action mensuel piloté par l'IA, rapports hebdomadaires et mensuels, centre de notifications prioritaires." },
      { property: "og:title", content: "Coach & rapports — OPTIS" },
      { property: "og:description", content: "Le coach d'optimisation : plan du mois, rapports périodiques et rappels prioritaires." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CoachPage,
});

const TX_COLS =
  "id, type, wallet_id, to_wallet_id, amount, base_amount, exchange_rate, currency, occurred_on, budget_node_id, source_kind, source_id, asset_id, debt_id, receivable_id, description, notes";

const TONE_CLASS: Record<string, string> = {
  positive: "text-positive",
  neutral: "text-primary",
  warning: "text-warning",
  negative: "text-negative",
};

const SEV_BADGE: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400",
  warning: "bg-amber-500/15 text-amber-400",
  info: "bg-sky-500/15 text-sky-400",
  success: "bg-emerald-500/15 text-emerald-400",
};

function useCoachData() {
  const wallets = useQuery(walletsQO);
  const nodes = useQuery(budgetNodesQO);
  const txs = useQuery({
    queryKey: ["tx", "coach"],
    queryFn: async () => await fetchAllRows<any>((f, t) => supabase.from("transactions").select(TX_COLS).range(f, t)),
  });
  const debts = useQuery({ queryKey: ["debts", "coach"], queryFn: async () => (await supabase.from("debts").select("*")).data ?? [] });
  const receivables = useQuery({ queryKey: ["receivables", "coach"], queryFn: async () => (await supabase.from("receivables").select("*")).data ?? [] });
  const provisions = useQuery({ queryKey: ["provisions", "coach"], queryFn: async () => (await supabase.from("provisions").select("*")).data ?? [] });
  const subscriptions = useQuery({ queryKey: ["subscriptions", "coach"], queryFn: async () => (await supabase.from("subscriptions").select("*")).data ?? [] });
  const assets = useQuery({ queryKey: ["assets", "coach"], queryFn: async () => (await supabase.from("assets").select("*")).data ?? [] });
  const assetEvents = useQuery({
    queryKey: ["asset_events", "coach"],
    queryFn: async () => await fetchAllRows<any>((f, t) => supabase.from("asset_events").select("asset_id, event_type, amount, event_date, event_month").range(f, t)),
  });
  const goals = useQuery({ queryKey: ["financial_goals", "coach"], queryFn: async () => (await supabase.from("financial_goals").select("*").eq("archived", false)).data ?? [] });
  const nodeAmounts = useQuery({
    queryKey: ["budget_node_amounts", "coach"],
    queryFn: async () => await fetchAllRows<any>((f, t) => supabase.from("budget_node_amounts").select("node_id, period_month, planned, revised").range(f, t)),
  });
  const planItems = useQuery({
    queryKey: ["plan_items", "coach"],
    queryFn: async () => await fetchAllRows<any>((f, t) => supabase.from("plan_items").select("*").range(f, t)),
  });
  const planItemTags = useQuery(planItemTagsQO);
  const lifeDomains = useQuery({ queryKey: ["life_domains", "coach"], queryFn: async () => (await supabase.from("life_domains").select("*").eq("archived", false)).data ?? [] });
  const plans = useQuery({ queryKey: ["coach_plans"], queryFn: async () => (await (supabase as any).from("coach_plans").select("*")).data ?? [] });
  const planLines = useQuery({ queryKey: ["coach_plan_items"], queryFn: async () => (await (supabase as any).from("coach_plan_items").select("*")).data ?? [] });
  const reports = useQuery({ queryKey: ["periodic_reports"], queryFn: async () => (await (supabase as any).from("periodic_reports").select("*")).data ?? [] });
  const notifs = useQuery({ queryKey: ["notifications"], queryFn: async () => (await (supabase as any).from("notifications").select("*")).data ?? [] });

  return {
    loading: wallets.isLoading || txs.isLoading || planItems.isLoading,
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
    planItemTags: (planItemTags.data as PlanItemTag[]) ?? [],
    lifeDomains: (lifeDomains.data as LifeDomain[]) ?? [],
    plans: (plans.data as CoachPlan[]) ?? [],
    planLines: (planLines.data as CoachPlanItem[]) ?? [],
    reports: (reports.data as any[]) ?? [],
    notifs: (notifs.data as NotificationRow[]) ?? [],
  };
}

function CoachPage() {
  const qc = useQueryClient();
  const d = useCoachData();
  const [tab, setTab] = useState<"plan" | "reports" | "notifs">("plan");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);
  const currentMonth = todayStr.slice(0, 7);

  const model = useMemo(() => {
    const cash = sumAvailableCash(d.wallets.filter((w) => (w.type ?? "") !== "credit") as any, d.txs as any);
    const ie30 = incomeExpenseForPeriod(d.txs as any, ymd(addDays(today, -30)), todayStr);
    const dailyIn = averageDailyCashIn(d.txs as any, 90, today);
    const dailyOut = averageDailyCashOut(d.txs as any, 90, today);
    const monthlyIncome = Math.max(ie30.income, dailyIn * 30);
    const monthlyExpense = Math.max(ie30.expense, dailyOut * 30);

    const assetTotals = computeAssetTotals(d.assets as any, d.assetEvents as any, { transactions: d.txs as any });
    const totalDebt = computeObligationTotalAsOf(d.debts as any, d.txs as any, "debt");
    const totalRec = computeObligationTotalAsOf(d.receivables as any, d.txs as any, "receivable");
    const netWorth = cash + assetTotals.marketValue + totalRec - totalDebt;

    const health = computeHealth({
      cash, totalAssets: assetTotals.marketValue, totalDebt,
      monthlyIncome, monthlyExpense, netWorthGrowth3m: 0,
    } as any);

    const baselines: MonthBaseline[] = [];
    for (let m = 0; m < 13; m++) {
      const dt = new Date(today.getFullYear(), today.getMonth() + m, 1);
      baselines.push({
        month: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`,
        income: dailyIn * 30, expense: dailyOut * 30, planned: false,
      });
    }
    const items: CashItem[] = [];
    for (const x of d.debts) {
      if (x.archived || x.status === "settled" || x.status === "cancelled" || !x.due_date) continue;
      items.push({ label: x.creditor, amount: -Number(x.outstanding ?? 0), date: x.due_date, confidence: 1, group: "Dettes" });
    }
    for (const x of d.receivables) {
      if (x.archived || x.status === "settled" || x.status === "cancelled" || !x.due_date) continue;
      items.push({ label: x.debtor, amount: Number(x.outstanding ?? 0), date: x.due_date, confidence: 0.8, group: "Créances" });
    }
    for (const x of d.provisions) {
      if (x.status === "settled" || x.status === "cancelled" || !x.due_date) continue;
      items.push({ label: x.name, amount: (x.direction === "in" ? 1 : -1) * Number(x.amount ?? 0), date: x.due_date, confidence: 0.9, group: "Provisions" });
    }
    const forecast = buildExpertForecast({ startingCash: cash, baselines, items }, 365);

    const execution = computeExecutionScore(d.planItems, today, 30);
    const domainTime = computeDomainTime(d.planItems, d.lifeDomains, d.planItemTags, addDays(today, -27), today);
    const alignment = computeAlignmentScore({
      priorities: d.lifeDomains.map((x) => ({ key: x.id, label: x.label, weight: Number(x.weight) || 0 })),
      actualMinutes: Object.fromEntries(domainTime.rows.map((r) => [r.id, r.minutes])),
    });
    const life = computeLifeScore(health.score, execution.score, alignment?.score ?? null);
    const habitTraces = computeHabitTraces(d.planItems, d.lifeDomains, d.planItemTags, today, 28);

    let overdueTasks = 0;
    for (const it of d.planItems) {
      if (isClosed(it.status)) continue;
      const occ = occurrencesInRange(it, addDays(today, -60), today);
      if (occ.some((o) => o < todayStr)) overdueTasks += 1;
    }

    const progressInput: ProgressInput = {
      txs: d.txs as any, wallets: d.wallets as any, debts: d.debts as any, assets: d.assets as any,
      assetEvents: d.assetEvents as any, receivables: d.receivables as any, nodes: d.nodes as any,
    };
    const goalRows = d.goals.map((g) => ({ goal: g, progress: computeGoalProgress(g, progressInput) }));

    const plannedMonth = d.nodeAmounts
      .filter((a) => String(a.period_month ?? "").slice(0, 7) === currentMonth)
      .reduce((s, a) => s + Math.abs(Number(a.revised ?? a.planned ?? 0)), 0);
    const hasCurrentBudget = plannedMonth > 0;

    const assetRows = d.assets.filter((a) => !a.archived).map((a) => ({
      id: a.id, name: a.name, bookValue: Number(a.book_value ?? 0), cost: Number(a.acquisition_cost ?? 0), sold: a.status === "sold",
    }));

    const recs = buildRecommendations({
      today: todayStr, cash, monthlyIncome, monthlyExpense,
      emergencyMonths: health.emergencyMonths, savingsRate: health.savingsRate, netWorth,
      totalDebt, totalAssets: assetTotals.marketValue,
      forecastLow: forecast.low ? { balance: forecast.low.balance, date: forecast.low.date } : null,
      forecastBreach: forecast.breachDay ? { balance: forecast.breachDay.balance, date: forecast.breachDay.date } : null,
      debts: d.debts.filter((x) => !x.archived) as any,
      receivables: d.receivables.filter((x) => !x.archived) as any,
      provisions: d.provisions as any,
      subscriptions: d.subscriptions as any,
      goals: goalRows.map(({ goal, progress }) => ({
        id: goal.id, name: goal.name, pct: progress.pct, target_date: goal.target_date,
        inverse: progress.inverse, status: goal.status,
      })),
      assets: assetRows,
      overdueTasks,
      completionRate: execution.completionRate,
      habitAdherence: execution.habitAdherence,
      hasCurrentBudget,
    });

    return {
      cash, monthlyIncome, monthlyExpense, netWorth, totalDebt, totalRec, assetTotals,
      health, forecast, execution, alignment, life, domainTime, habitTraces,
      recs, overdueTasks, plannedMonth, hasCurrentBudget, ie30, dailyIn, dailyOut,
    };
  }, [d.wallets, d.txs, d.debts, d.receivables, d.provisions, d.subscriptions, d.assets, d.assetEvents,
      d.goals, d.nodeAmounts, d.planItems, d.planItemTags, d.lifeDomains, d.nodes, todayStr, currentMonth]);

  const currentPlan = useMemo(
    () => d.plans.find((p) => p.period_month === currentMonth && !p.archived) ?? null,
    [d.plans, currentMonth],
  );
  const currentLines = useMemo(
    () => d.planLines.filter((l) => currentPlan && l.plan_id === currentPlan.id).sort((a, b) => a.order_index - b.order_index),
    [d.planLines, currentPlan],
  );
  const progress = useMemo(() => planProgress(currentLines, todayStr), [currentLines, todayStr]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["coach_plans"] });
    qc.invalidateQueries({ queryKey: ["coach_plan_items"] });
    qc.invalidateQueries({ queryKey: ["periodic_reports"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  // ---- Génération / synchronisation des notifications (locale, hors ligne comprise).
  const [notifSyncing, setNotifSyncing] = useState(false);
  const syncNotifications = async (silent = true) => {
    if (notifSyncing) return;
    setNotifSyncing(true);
    try {
      const obligations = [
        ...d.debts.filter((x) => !x.archived && x.status !== "settled" && x.status !== "cancelled")
          .map((x) => ({ id: x.id, label: x.creditor, amount: Number(x.outstanding ?? 0), due_date: x.due_date, kind: "Dette", to: "/debts" })),
        ...d.receivables.filter((x) => !x.archived && x.status !== "settled" && x.status !== "cancelled")
          .map((x) => ({ id: x.id, label: x.debtor, amount: Number(x.outstanding ?? 0), due_date: x.due_date, kind: "Créance", to: "/receivables" })),
        ...d.provisions.filter((x) => x.status !== "settled" && x.status !== "cancelled")
          .map((x) => ({ id: x.id, label: x.name, amount: Number(x.amount ?? 0), due_date: x.due_date, kind: "Provision", to: "/provisions" })),
        ...d.subscriptions.filter((x) => x.active)
          .map((x) => ({ id: x.id, label: x.name, amount: Number(x.amount ?? 0), due_date: x.next_billing_date, kind: "Abonnement", to: "/subscriptions" })),
      ];
      const actualMonth = d.txs
        .filter((t) => String(t.occurred_on ?? "").slice(0, 7) === currentMonth && t.type === "expense")
        .reduce((s, t) => s + Math.abs(Number(t.base_amount ?? t.amount ?? 0)), 0);

      const candidates = deriveNotifications({
        today: todayStr,
        cash: model.cash,
        obligations,
        overdueTasks: model.overdueTasks,
        budgetGap: model.hasCurrentBudget ? { planned: model.plannedMonth, actual: actualMonth } : null,
        habitBreaks: model.habitTraces.filter((h) => h.expected >= 3 && h.adherence < 50).slice(0, 4)
          .map((h) => ({ label: h.item.title, adherence: h.adherence })),
        forecastBreach: model.forecast.breachDay
          ? { date: model.forecast.breachDay.date, balance: model.forecast.breachDay.balance }
          : null,
        recs: model.recs,
        planLate: currentLines
          .filter((l) => l.status !== "done" && l.status !== "dropped" && l.due_date && l.due_date < todayStr)
          .map((l) => ({ title: l.title, due_date: l.due_date })),
      });

      const known = new Set(d.notifs.map((n) => n.dedupe_key));
      const fresh = candidates.filter((c) => !known.has(c.dedupe_key));
      if (!fresh.length) {
        if (!silent) toast.success("Aucune nouvelle notification");
        return;
      }
      const uid = await currentUserId();
      for (const c of fresh) {
        await offlineInsert("notifications" as any, { ...c, user_id: uid });
      }
      qc.invalidateQueries({ queryKey: ["notifications"] });
      if (!silent) toast.success(`${fresh.length} notification(s) ajoutée(s)`);
    } catch (e: any) {
      if (!silent) toast.error(e?.message ?? "Échec de la génération");
    } finally {
      setNotifSyncing(false);
    }
  };

  useEffect(() => {
    if (d.loading) return;
    void syncNotifications(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.loading, todayStr]);

  const notifs = useMemo(() => sortNotifications(d.notifs.filter((n) => !n.dismissed_at)), [d.notifs]);
  const unread = unreadCount(d.notifs);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Bot className="h-5 w-5 text-primary" /> Coach & rapports
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Plan d'action du mois, rapports périodiques et rappels prioritaires — tout est calculé sur vos données, hors ligne compris.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            { id: "plan", label: "Plan du mois", icon: Sparkles },
            { id: "reports", label: "Rapports", icon: FileBarChart },
            { id: "notifs", label: `Notifications${unread ? ` (${unread})` : ""}`, icon: BellRing },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs transition-colors",
                tab === t.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-surface-2",
              )}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Score de vie" value={`${model.life.score}/100`} tone={scoreTone(model.life.score)} sub={model.life.verdict} />
        <StatCard label="Santé financière" value={`${model.health.score.toFixed(0)}/100`} tone={scoreTone(model.health.score)} sub={`Épargne ${model.health.savingsRate.toFixed(0)} %`} />
        <StatCard label="Exécution" value={`${model.execution.score}/100`} tone={scoreTone(model.execution.score)} sub={`${model.execution.overdue} en retard`} />
        <StatCard
          label="Plan du mois"
          value={currentPlan ? `${progress.pct.toFixed(0)} %` : "—"}
          tone={currentPlan ? scoreTone(progress.pct) : "neutral"}
          sub={currentPlan ? `${progress.done}/${progress.total - progress.dropped} action(s)` : "Aucun plan généré"}
        />
      </div>

      {tab === "plan" && (
        <PlanTab
          month={currentMonth}
          plan={currentPlan}
          lines={currentLines}
          progress={progress}
          recs={model.recs}
          scores={{ health: model.health.score, execution: model.execution.score, alignment: model.alignment?.score ?? null }}
          todayStr={todayStr}
          onChanged={invalidate}
        />
      )}

      {tab === "reports" && (
        <ReportsTab d={d} model={model} today={today} onChanged={invalidate} planProgressPct={currentPlan ? progress.pct : null} />
      )}

      {tab === "notifs" && (
        <NotifsTab rows={notifs} busy={notifSyncing} onRefresh={() => syncNotifications(false)} onChanged={invalidate} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Plan */

function PlanTab({
  month, plan, lines, progress, recs, scores, todayStr, onChanged,
}: {
  month: string;
  plan: CoachPlan | null;
  lines: CoachPlanItem[];
  progress: ReturnType<typeof planProgress>;
  recs: ReturnType<typeof buildRecommendations>;
  scores: { health: number; execution: number; alignment: number | null };
  todayStr: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const runNarrative = useServerFn(generateCoachNarrative);

  const drafts = useMemo(() => planDraftsFromRecs(recs, month, 6), [recs, month]);
  const nudges = useMemo(() => planNudges(lines, todayStr), [lines, todayStr]);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uid = await currentUserId();
      let planId = plan?.id;
      if (!planId) {
        const res = await offlineInsert("coach_plans" as any, {
          user_id: uid,
          period_month: month,
          title: `Plan d'action ${monthLabel(month)}`,
          focus: planFocus(drafts),
          summary: planSummary(drafts),
          status: "active",
          source: "local",
          archived: false,
        });
        planId = res.id!;
      } else {
        await offlineUpdate("coach_plans" as any, planId, { focus: planFocus(drafts), summary: planSummary(drafts) });
      }
      const known = new Set(lines.map((l) => l.rec_key).filter(Boolean));
      let order = lines.length;
      let added = 0;
      for (const dr of drafts) {
        if (dr.rec_key && known.has(dr.rec_key)) continue;
        await offlineInsert("coach_plan_items" as any, {
          user_id: uid, plan_id: planId, ...dr, order_index: order++, status: "todo",
        });
        added += 1;
      }
      onChanged();
      toast.success(added ? `${added} action(s) ajoutée(s) au plan` : "Plan déjà à jour");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de la génération");
    } finally {
      setBusy(false);
    }
  };

  const enrich = async () => {
    if (!plan) { toast.error("Générer d'abord le plan du mois"); return; }
    setAiBusy(true);
    try {
      const res = await runNarrative({
        data: {
          month: monthLabel(month),
          focus: plan.focus,
          scores,
          drafts: lines.slice(0, 10).map((l) => ({ title: l.title, detail: l.detail })),
        },
      });
      const uid = await currentUserId();
      await offlineUpdate("coach_plans" as any, plan.id, {
        focus: res.focus ?? plan.focus,
        summary: res.summary ?? plan.summary,
        source: "ai",
      });
      let order = lines.length;
      for (const a of res.actions) {
        if (lines.some((l) => l.title.toLowerCase() === a.toLowerCase())) continue;
        await offlineInsert("coach_plan_items" as any, {
          user_id: uid, plan_id: plan.id, title: a, detail: "Consigne proposée par le coach IA.",
          category: null, module_to: null, impact: 0, effort: "moyen",
          due_date: monthEnd(month), status: "todo", order_index: order++,
        });
      }
      onChanged();
      toast.success("Plan enrichi par le coach IA");
    } catch (e: any) {
      toast.error(e?.message ?? "Le coach IA est indisponible hors ligne");
    } finally {
      setAiBusy(false);
    }
  };

  const addManual = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const uid = await currentUserId();
      let planId = plan?.id;
      if (!planId) {
        const res = await offlineInsert("coach_plans" as any, {
          user_id: uid, period_month: month, title: `Plan d'action ${monthLabel(month)}`,
          focus: null, summary: null, status: "active", source: "manual", archived: false,
        });
        planId = res.id!;
      }
      await offlineInsert("coach_plan_items" as any, {
        user_id: uid, plan_id: planId, title, detail: null, category: null, module_to: null,
        impact: 0, effort: "moyen", due_date: monthEnd(month), status: "todo", order_index: lines.length,
      });
      setNewTitle("");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de l'ajout");
    }
  };

  const setStatus = async (line: CoachPlanItem, status: string) => {
    await offlineUpdate("coach_plan_items" as any, line.id, {
      status,
      done_at: status === "done" ? new Date().toISOString() : null,
    });
    onChanged();
  };

  const remove = async (line: CoachPlanItem) => {
    await offlineDelete("coach_plan_items" as any, line.id);
    onChanged();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel
        className="lg:col-span-2"
        title={`Plan d'action — ${monthLabel(month)}`}
        action={
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={generate} disabled={busy}>
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", busy && "animate-spin")} /> Générer
            </Button>
            <Button size="sm" onClick={enrich} disabled={aiBusy || !plan}>
              <Sparkles className={cn("mr-1.5 h-3.5 w-3.5", aiBusy && "animate-pulse")} /> Coach IA
            </Button>
          </div>
        }
      >
        {plan?.summary && (
          <div className="mb-4 rounded-sm border border-primary/30 bg-primary/5 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Thème · {plan.focus ?? "—"}
            </div>
            <p className="mt-1.5 whitespace-pre-line text-sm text-foreground">{plan.summary}</p>
          </div>
        )}

        {!lines.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun plan pour ce mois. « Générer » construit le plan à partir des recommandations les plus rentables.
          </p>
        )}

        <div className="space-y-2">
          {lines.map((l) => {
            const late = l.status !== "done" && l.status !== "dropped" && l.due_date && l.due_date < todayStr;
            return (
              <div
                key={l.id}
                className={cn(
                  "rounded-sm border border-l-2 border-border bg-surface-1 p-3",
                  l.status === "done" ? "border-l-emerald-500 opacity-70" : late ? "border-l-red-500" : "border-l-primary",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={cn("text-sm font-medium", l.status === "done" && "line-through")}>{l.title}</div>
                    {l.detail && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{l.detail}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {l.category && <span>{CATEGORY_LABELS[l.category as keyof typeof CATEGORY_LABELS] ?? l.category}</span>}
                      {Number(l.impact) > 0 && <span>Enjeu {fmtMoney(Number(l.impact))}</span>}
                      {l.due_date && <span className={cn(late && "text-red-400")}>Échéance {l.due_date}</span>}
                      {l.module_to && (
                        <Link to={l.module_to} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                          Ouvrir <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <select
                      value={l.status}
                      onChange={(e) => setStatus(l, e.target.value)}
                      className="h-7 rounded-sm border border-border bg-background px-2 text-xs"
                    >
                      {ITEM_STATUS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    <button onClick={() => remove(l)} className="grid h-7 w-7 place-items-center rounded-sm border border-border text-muted-foreground hover:text-negative">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addManual(); }}
            placeholder="Ajouter une action au plan…"
            className="h-8 text-sm"
          />
          <Button size="sm" variant="outline" onClick={addManual}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="Avancement">
          <div className="space-y-2 text-sm">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, progress.pct)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.done} fait(s) · {progress.doing} en cours</span>
              <span>{progress.pct.toFixed(0)} %</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Enjeu traité : <span className="num text-foreground">{fmtMoney(progress.impactDone)}</span> sur {fmtMoney(progress.impactTotal)}
            </div>
            {progress.late > 0 && (
              <div className="text-xs text-red-400">{progress.late} action(s) en retard</div>
            )}
          </div>
        </Panel>

        <Panel title="Relances du coach">
          {nudges.length ? (
            <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              {nudges.map((n, i) => (
                <li key={i} className="flex gap-2"><Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{n}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Rien à relancer : le plan avance.</p>
          )}
        </Panel>

        <Panel title="Prochaines actions détectées">
          <ul className="space-y-2 text-xs text-muted-foreground">
            {drafts.slice(0, 5).map((dr) => (
              <li key={dr.rec_key ?? dr.title} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-foreground">{dr.title}</span>
              </li>
            ))}
            {!drafts.length && <li>Aucune recommandation active — situation stable.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Rapports */

function ReportsTab({
  d, model, today, onChanged, planProgressPct,
}: {
  d: ReturnType<typeof useCoachData>;
  model: any;
  today: Date;
  onChanged: () => void;
  planProgressPct: number | null;
}) {
  const [kind, setKind] = useState<ReportKind>("weekly");
  const [saving, setSaving] = useState(false);

  const report = useMemo(() => {
    const { start, end } = periodBounds(kind, today);
    const spanDays = Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000) + 1;
    const prevEnd = ymd(addDays(new Date(`${start}T00:00:00`), -1));
    const prevStart = ymd(addDays(new Date(`${start}T00:00:00`), -spanDays));

    const cur = incomeExpenseForPeriod(d.txs as any, start, end);
    const prev = incomeExpenseForPeriod(d.txs as any, prevStart, prevEnd);

    const expensesByLabel = new Map<string, number>();
    for (const t of d.txs) {
      const day = String(t.occurred_on ?? "");
      if (day < start || day > end || t.type !== "expense") continue;
      const label = t.description || "Sans libellé";
      expensesByLabel.set(label, (expensesByLabel.get(label) ?? 0) + Math.abs(Number(t.base_amount ?? t.amount ?? 0)));
    }
    const topExpenses = [...expensesByLabel.entries()]
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const in30 = ymd(addDays(today, 30));
    const deadlinesNext: Array<{ label: string; amount: number; date: string }> = [];
    for (const x of d.debts) {
      if (x.archived || x.status === "settled" || x.status === "cancelled" || !x.due_date || x.due_date > in30) continue;
      deadlinesNext.push({ label: `Dette ${x.creditor}`, amount: Number(x.outstanding ?? 0), date: x.due_date });
    }
    for (const x of d.provisions) {
      if (x.status === "settled" || x.status === "cancelled" || !x.due_date || x.due_date > in30) continue;
      deadlinesNext.push({ label: `Provision ${x.name}`, amount: Number(x.amount ?? 0), date: x.due_date });
    }
    deadlinesNext.sort((a, b) => a.date.localeCompare(b.date));

    const month = start.slice(0, 7);
    const planned = d.nodeAmounts
      .filter((a) => String(a.period_month ?? "").slice(0, 7) === month)
      .reduce((s, a) => s + Math.abs(Number(a.revised ?? a.planned ?? 0)), 0);

    const savingsRate = cur.income > 0 ? ((cur.income - cur.expense) / cur.income) * 100 : 0;

    return buildReport({
      kind, start, end, currency: "MGA",
      income: cur.income, expense: cur.expense,
      incomePrev: prev.income, expensePrev: prev.expense,
      cash: model.cash, netWorth: model.netWorth,
      totalDebt: model.totalDebt, totalReceivable: model.totalRec,
      savingsRate, healthScore: model.health.score,
      execution: {
        completionRate: model.execution.completionRate,
        overdue: model.execution.overdue,
        habitAdherence: model.execution.habitAdherence,
        streak: model.execution.streak,
      },
      alignmentScore: model.alignment?.score ?? null,
      domains: model.domainTime.rows.map((r: any) => ({ label: r.label, targetPct: r.targetPct, actualPct: r.actualPct })),
      budget: planned > 0 ? { planned, actual: cur.expense } : null,
      topExpenses,
      deadlinesNext,
      planProgressPct,
    });
  }, [kind, d.txs, d.debts, d.provisions, d.nodeAmounts, model, today, planProgressPct]);

  const bounds = periodBounds(kind, today);

  const save = async () => {
    setSaving(true);
    try {
      const uid = await currentUserId();
      const existing = d.reports.find(
        (r: any) => r.kind === kind && r.period_start === bounds.start,
      );
      const payload = {
        user_id: uid, kind, period_start: bounds.start, period_end: bounds.end,
        label: report.label, metrics: report.metrics, commentary: report.commentary,
      };
      if (existing) await offlineUpdate("periodic_reports" as any, existing.id, payload);
      else await offlineInsert("periodic_reports" as any, payload);
      onChanged();
      toast.success("Rapport enregistré");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    const md = reportToMarkdown(report, kind);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-${kind}-${bounds.start}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const history = useMemo(
    () => [...d.reports].sort((a: any, b: any) => String(b.period_start).localeCompare(String(a.period_start))).slice(0, 12),
    [d.reports],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel
        className="lg:col-span-2"
        title={report.label}
        action={
          <div className="flex items-center gap-1.5">
            {(["weekly", "monthly"] as ReportKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-sm border px-2 py-1 text-[11px]",
                  kind === k ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground",
                )}
              >
                {k === "weekly" ? "Hebdo" : "Mensuel"}
              </button>
            ))}
            <Button size="sm" variant="outline" onClick={download}><Download className="mr-1.5 h-3.5 w-3.5" /> Export</Button>
            <Button size="sm" onClick={save} disabled={saving}><Save className="mr-1.5 h-3.5 w-3.5" /> Enregistrer</Button>
          </div>
        }
      >
        <p className="rounded-sm border border-primary/30 bg-primary/5 p-3 text-sm leading-relaxed">{report.commentary}</p>
        <div className="mt-4 space-y-4">
          {report.sections.map((s) => (
            <div key={s.title}>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{s.title}</div>
              <ul className="mt-1.5 space-y-1 text-sm">
                {s.lines.map((l, i) => (
                  <li key={i} className="flex gap-2 text-muted-foreground">
                    <span className="text-primary">·</span><span className="text-foreground">{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Historique des rapports">
        {history.length ? (
          <ul className="space-y-2">
            {history.map((r: any) => (
              <li key={r.id} className="rounded-sm border border-border bg-surface-1 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium">{r.label ?? periodLabel(r.kind, r.period_start, r.period_end)}</div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    {r.kind === "weekly" ? "Hebdo" : "Mensuel"}
                  </span>
                </div>
                <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{r.commentary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Aucun rapport enregistré pour l'instant.</p>
        )}
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------- Notifications */

function NotifsTab({
  rows, busy, onRefresh, onChanged,
}: {
  rows: NotificationRow[];
  busy: boolean;
  onRefresh: () => void;
  onChanged: () => void;
}) {
  const markRead = async (n: NotificationRow) => {
    await offlineUpdate("notifications" as any, n.id, { read_at: new Date().toISOString() });
    onChanged();
  };
  const dismiss = async (n: NotificationRow) => {
    await offlineUpdate("notifications" as any, n.id, { dismissed_at: new Date().toISOString() });
    onChanged();
  };
  const markAllRead = async () => {
    for (const n of rows.filter((x) => !x.read_at)) {
      await offlineUpdate("notifications" as any, n.id, { read_at: new Date().toISOString() });
    }
    onChanged();
  };

  return (
    <Panel
      title="Centre de notifications"
      action={
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={markAllRead}><Check className="mr-1.5 h-3.5 w-3.5" /> Tout lire</Button>
          <Button size="sm" onClick={onRefresh} disabled={busy}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", busy && "animate-spin")} /> Actualiser
          </Button>
        </div>
      }
    >
      {!rows.length && <p className="py-6 text-center text-sm text-muted-foreground">Aucune notification active. Rien ne réclame votre attention.</p>}
      <div className="space-y-2">
        {rows.map((n) => (
          <div
            key={n.id}
            className={cn(
              "rounded-sm border border-l-2 border-border bg-surface-1 p-3",
              n.severity === "critical" ? "border-l-red-500" : n.severity === "warning" ? "border-l-amber-500" : "border-l-sky-500",
              n.read_at && "opacity-60",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider", SEV_BADGE[n.severity] ?? SEV_BADGE.info)}>
                    {KIND_LABELS[n.kind] ?? n.kind}
                  </span>
                  <span className="text-sm font-medium">{n.title}</span>
                </div>
                {n.body && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{n.body}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {n.due_date && <span>Échéance {n.due_date}</span>}
                  {n.link_to && (
                    <Link to={n.link_to} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                      Ouvrir <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!n.read_at && (
                  <button onClick={() => markRead(n)} title="Marquer comme lu" className="grid h-7 w-7 place-items-center rounded-sm border border-border text-muted-foreground hover:text-foreground">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => dismiss(n)} title="Masquer" className="grid h-7 w-7 place-items-center rounded-sm border border-border text-muted-foreground hover:text-negative">
                  <EyeOff className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <AlertTriangle className="h-3 w-3" /> Les notifications sont générées localement à partir de vos données : elles fonctionnent aussi hors ligne.
      </p>
    </Panel>
  );
}
