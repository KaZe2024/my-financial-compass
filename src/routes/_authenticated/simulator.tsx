import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseOffline as supabase } from "@/lib/offline/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { budgetNodesQO, walletsQO } from "@/lib/queries";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  sumAvailableCash, incomeExpenseForPeriod, averageDailyCashIn, averageDailyCashOut,
  computeAssetTotals, computeObligationTotalAsOf,
} from "@/lib/finance";
import {
  computeLifestyleCost, detectDrifts, simulate, suggestLevers, DEFAULT_LEVERS, type SimLevers,
} from "@/lib/simulator";
import {
  FlaskConical, TrendingDown, TrendingUp, RotateCcw, ArrowRight, Wand2, Gauge,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Line,
} from "recharts";

export const Route = createFileRoute("/_authenticated/simulator")({
  head: () => ({
    meta: [
      { title: "Simulateur & coût de vie — OPTIS" },
      { name: "description", content: "Analyse du train de vie, dérives de postes et simulation what-if sur la trésorerie, la dette et le patrimoine." },
      { property: "og:title", content: "Simulateur & coût de vie — OPTIS" },
      { property: "og:description", content: "Testez vos décisions avant de les prendre : effet réel sur l'épargne, la dette et le patrimoine." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SimulatorPage,
});

const TX_COLS =
  "id, type, wallet_id, to_wallet_id, amount, base_amount, exchange_rate, currency, occurred_on, budget_node_id, source_kind, source_id, asset_id, debt_id, receivable_id, description, notes";

function useSimData() {
  const wallets = useQuery(walletsQO);
  const nodes = useQuery(budgetNodesQO);
  const txs = useQuery({
    queryKey: ["tx", "simulator"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) => supabase.from("transactions").select(TX_COLS).range(from, to)),
  });
  const subscriptions = useQuery({
    queryKey: ["subscriptions", "simulator"],
    queryFn: async () => (await supabase.from("subscriptions").select("*")).data ?? [],
  });
  const debts = useQuery({
    queryKey: ["debts", "simulator"],
    queryFn: async () => (await supabase.from("debts").select("*")).data ?? [],
  });
  const receivables = useQuery({
    queryKey: ["receivables", "simulator"],
    queryFn: async () => (await supabase.from("receivables").select("*")).data ?? [],
  });
  const assets = useQuery({
    queryKey: ["assets", "simulator"],
    queryFn: async () => (await supabase.from("assets").select("*")).data ?? [],
  });
  const assetEvents = useQuery({
    queryKey: ["asset_events", "simulator"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) =>
        supabase.from("asset_events").select("asset_id, event_type, amount, event_date, event_month").range(from, to),
      ),
  });

  return {
    loading: wallets.isLoading || txs.isLoading || assets.isLoading,
    wallets: (wallets.data as any[]) ?? [],
    nodes: (nodes.data as any[]) ?? [],
    txs: (txs.data as any[]) ?? [],
    subscriptions: (subscriptions.data as any[]) ?? [],
    debts: (debts.data as any[]) ?? [],
    receivables: (receivables.data as any[]) ?? [],
    assets: (assets.data as any[]) ?? [],
    assetEvents: (assetEvents.data as any[]) ?? [],
  };
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtMonths(m: number | null) {
  if (m == null) return "—";
  if (!Number.isFinite(m)) return "jamais au rythme actuel";
  if (m < 12) return `${m} mois`;
  const y = Math.floor(m / 12);
  const rest = m % 12;
  return rest ? `${y} an${y > 1 ? "s" : ""} ${rest} mois` : `${y} an${y > 1 ? "s" : ""}`;
}

function Delta({ value, invert = false, money = true }: { value: number; invert?: boolean; money?: boolean }) {
  const good = invert ? value < 0 : value > 0;
  if (Math.abs(value) < 0.5) return <span className="font-mono text-xs text-muted-foreground">stable</span>;
  return (
    <span className={cn("font-mono text-xs", good ? "text-positive" : "text-negative")}>
      {value > 0 ? "+" : "−"}
      {money ? fmtMoney(Math.abs(value)) : `${Math.abs(value).toFixed(1)} pt`}
    </span>
  );
}

function SimulatorPage() {
  const d = useSimData();
  const [levers, setLevers] = useState<SimLevers>(DEFAULT_LEVERS);
  const [months, setMonths] = useState(6);

  const model = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cash = sumAvailableCash(d.wallets.filter((w) => (w.type ?? "") !== "credit") as any, d.txs as any);

    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    const ie = incomeExpenseForPeriod(d.txs as any, ymd(from), ymd(today));
    const dailyIn = averageDailyCashIn(d.txs as any, 90, today);
    const dailyOut = averageDailyCashOut(d.txs as any, 90, today);

    const nodeLabels: Record<string, string> = {};
    for (const n of d.nodes) nodeLabels[n.id] = n.name ?? n.label ?? "Ligne";

    const cost = computeLifestyleCost({
      transactions: d.txs as any,
      nodeLabels,
      subscriptions: d.subscriptions as any,
      cash,
      months,
      today,
    });

    const monthlyIncome = cost.monthlyIncome > 0 ? cost.monthlyIncome : Math.max(ie.income, dailyIn * 30);
    const monthlyExpense = cost.monthlyExpense > 0 ? cost.monthlyExpense : Math.max(ie.expense, dailyOut * 30);

    const assetTotals = computeAssetTotals(d.assets as any, d.assetEvents as any, { transactions: d.txs as any });
    const totalDebt = computeObligationTotalAsOf(d.debts as any, d.txs as any, "debt");
    const totalRec = computeObligationTotalAsOf(d.receivables as any, d.txs as any, "receivable");
    const netWorth = cash + assetTotals.marketValue + totalRec - totalDebt;

    const base = { cash, monthlyIncome, monthlyExpense, totalDebt, netWorth };
    const current = simulate(base, { ...DEFAULT_LEVERS, horizonMonths: levers.horizonMonths });
    const scenario = simulate(base, levers);
    const drifts = detectDrifts(cost);
    const suggestions = suggestLevers(base, cost);

    const chart = current.path.map((p, i) => ({
      month: p.month,
      actuel: Math.round(p.cash),
      scenario: Math.round(scenario.path[i]?.cash ?? p.cash),
    }));

    return { base, cost, current, scenario, drifts, suggestions, chart };
  }, [d.wallets, d.txs, d.nodes, d.subscriptions, d.debts, d.receivables, d.assets, d.assetEvents, levers, months]);

  const { base, cost, current, scenario, drifts, suggestions, chart } = model;
  const dirty =
    levers.expenseCutPct !== 0 || levers.incomeUpPct !== 0 || levers.extraMonthlyCost !== 0 || levers.extraDebtPayment !== 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <FlaskConical className="h-3.5 w-3.5" /> Analyse actionnable
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Simulateur & coût de vie</h1>
          <p className="text-sm text-muted-foreground">
            Le train de vie réel issu de vos écritures, les postes qui dérivent, et l'effet chiffré de chaque décision avant de la prendre.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[3, 6, 12].map((m) => (
            <Button key={m} size="sm" variant={months === m ? "default" : "outline"} onClick={() => setMonths(m)}>
              {m} mois
            </Button>
          ))}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Train de vie mensuel" value={fmtMoney(cost.monthlyExpense)} sub={`${fmtMoney(cost.dailyBurn)} / jour`} />
        <StatCard label="Engagements récurrents" value={fmtMoney(cost.committedMonthly)} sub={`${cost.committedShare.toFixed(0)} % des dépenses`} />
        <StatCard label="Excédent mensuel" value={fmtMoney(current.monthlyNet)} sub={`Taux d'épargne ${current.savingsRate.toFixed(0)} %`} />
        <StatCard label="Autonomie trésorerie" value={`${cost.runwayMonths.toFixed(1)} mois`} sub={`Réserve ${fmtMoney(base.cash)}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Panel
          title={<span className="flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" /> Leviers</span>}
          action={
            dirty ? (
              <Button size="sm" variant="ghost" onClick={() => setLevers({ ...DEFAULT_LEVERS, horizonMonths: levers.horizonMonths })}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Réinitialiser
              </Button>
            ) : undefined
          }
        >
          <div className="space-y-5">
            <LeverSlider
              label="Réduction des dépenses"
              value={levers.expenseCutPct}
              max={50}
              suffix="%"
              detail={`${fmtMoney((base.monthlyExpense * levers.expenseCutPct) / 100)} / mois`}
              onChange={(v) => setLevers((l) => ({ ...l, expenseCutPct: v }))}
            />
            <LeverSlider
              label="Hausse des revenus"
              value={levers.incomeUpPct}
              max={50}
              suffix="%"
              detail={`${fmtMoney((base.monthlyIncome * levers.incomeUpPct) / 100)} / mois`}
              onChange={(v) => setLevers((l) => ({ ...l, incomeUpPct: v }))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <NumField
                label="Charge mensuelle en plus"
                value={levers.extraMonthlyCost}
                onChange={(v) => setLevers((l) => ({ ...l, extraMonthlyCost: v }))}
              />
              <NumField
                label="Remboursement dette / mois"
                value={levers.extraDebtPayment}
                onChange={(v) => setLevers((l) => ({ ...l, extraDebtPayment: v }))}
              />
            </div>
            <LeverSlider
              label="Horizon de projection"
              value={levers.horizonMonths}
              min={6}
              max={60}
              step={6}
              suffix=" mois"
              detail=""
              onChange={(v) => setLevers((l) => ({ ...l, horizonMonths: v }))}
            />
          </div>

          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Scénarios prêts à tester</div>
            {suggestions.length === 0 && (
              <p className="text-sm text-muted-foreground">Pas assez d'historique pour proposer des leviers chiffrés.</p>
            )}
            {suggestions.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setLevers((l) => ({ ...l, ...s.levers }))}
                className="flex w-full items-start gap-3 rounded-sm border border-border bg-card/40 p-3 text-left transition-colors hover:border-primary/60"
              >
                <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{s.label}</span>
                    {s.monthlyGain > 0 && (
                      <span className="rounded-sm bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                        +{fmtMoney(s.monthlyGain)} / mois
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.detail}</p>
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Résultat du scénario">
            <div className="grid gap-3 sm:grid-cols-2">
              <Compare
                label="Excédent mensuel"
                before={current.monthlyNet}
                after={scenario.monthlyNet}
              />
              <Compare
                label={`Trésorerie à ${levers.horizonMonths} mois`}
                before={current.cashAtHorizon}
                after={scenario.cashAtHorizon}
              />
              <Compare
                label={`Patrimoine net à ${levers.horizonMonths} mois`}
                before={current.netWorthAtHorizon}
                after={scenario.netWorthAtHorizon}
              />
              <div className="rounded-sm border border-border bg-card/40 p-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Taux d'épargne</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-semibold">{scenario.savingsRate.toFixed(0)} %</span>
                  <Delta value={scenario.savingsRate - current.savingsRate} money={false} />
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                  Actuel {current.savingsRate.toFixed(0)} % · cible 20 %
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-sm border border-border bg-card/40 p-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Réserve 3 mois atteinte dans</div>
                <div className="mt-1 text-sm font-medium">{fmtMonths(scenario.monthsToEmergency)}</div>
                <div className="font-mono text-[10px] text-muted-foreground">Actuel : {fmtMonths(current.monthsToEmergency)}</div>
              </div>
              <div className="rounded-sm border border-border bg-card/40 p-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Sortie de dette</div>
                <div className="mt-1 text-sm font-medium">{fmtMonths(scenario.debtFreeMonths)}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  Encours {fmtMoney(base.totalDebt)}
                </div>
              </div>
            </div>

            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="simScenario" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(v) => `M${v}`} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tickFormatter={(v) => fmtMoney(v, "MGA", { compact: true })} tick={{ fontSize: 10 }} width={64} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    formatter={(v: any, n: any) => [fmtMoney(Number(v)), n === "scenario" ? "Scénario" : "Tendance actuelle"]}
                    labelFormatter={(l) => `Mois ${l}`}
                  />
                  <Area type="monotone" dataKey="scenario" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#simScenario)" />
                  <Line type="monotone" dataKey="actuel" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Trait pointillé : prolongation du rythme observé sur les {months} derniers mois. Zone pleine : votre scénario. Le
              remboursement supplémentaire est prélevé sur la trésorerie jusqu'à extinction de l'encours.
            </p>
          </Panel>

          <Panel
            title={<span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-warning" /> Dérives détectées</span>}
          >
            {drifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun poste ne dérive significativement sur les 3 derniers mois. Le train de vie est stable.
              </p>
            ) : (
              <div className="space-y-2">
                {drifts.slice(0, 6).map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-3 rounded-sm border border-border bg-card/40 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{c.label}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {fmtMoney(c.monthly)} / mois · {c.share.toFixed(0)} % du train de vie
                      </div>
                    </div>
                    <div className={cn("flex items-center gap-1.5 font-mono text-xs", c.driftAmount > 0 ? "text-negative" : "text-positive")}>
                      {c.driftAmount > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {c.drift! > 0 ? "+" : "−"}{Math.abs(c.drift!).toFixed(0)} %
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        title="Structure du train de vie"
        action={
          <Link to="/budgets" className="flex items-center gap-1 text-xs text-primary hover:underline">
            Budgets <ArrowRight className="h-3 w-3" />
          </Link>
        }
      >
        {cost.categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune dépense opérationnelle sur la fenêtre analysée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="py-2 text-left">Poste</th>
                  <th className="py-2 text-right">Moyenne / mois</th>
                  <th className="py-2 text-right">Part</th>
                  <th className="py-2 text-right">Tendance 3 mois</th>
                  <th className="py-2 text-right">−10 % rapporte</th>
                </tr>
              </thead>
              <tbody>
                {cost.categories.slice(0, 15).map((c) => (
                  <tr key={c.key} className="border-b border-border/60">
                    <td className="py-2 pr-3">{c.label}</td>
                    <td className="py-2 text-right font-mono">{fmtMoney(c.monthly)}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">{c.share.toFixed(0)} %</td>
                    <td className="py-2 text-right font-mono">
                      {c.drift == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={c.driftAmount > 0 ? "text-negative" : "text-positive"}>
                          {c.drift > 0 ? "+" : "−"}{Math.abs(c.drift).toFixed(0)} %
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono text-positive">{fmtMoney(c.monthly * 0.1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function LeverSlider({
  label, value, onChange, min = 0, max = 100, step = 1, suffix = "", detail,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string; detail?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm">{label}</span>
        <span className="font-mono text-sm">{value}{suffix}</span>
      </div>
      <Slider className="mt-2" min={min} max={max} step={step} value={[value]} onValueChange={(v) => onChange(v[0] ?? 0)} />
      {detail ? <div className="mt-1 font-mono text-[10px] text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        className="mt-1 font-mono"
        type="number"
        min={0}
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </label>
  );
}

function Compare({ label, before, after }: { label: string; before: number; after: number }) {
  return (
    <div className="rounded-sm border border-border bg-card/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold">{fmtMoney(after)}</span>
        <Delta value={after - before} />
      </div>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground">Actuel {fmtMoney(before)}</div>
    </div>
  );
}
