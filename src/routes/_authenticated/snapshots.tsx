import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtMoney, fmtMonth, fmtPct, monthStart, toISODate } from "@/lib/format";
import { Camera, TrendingUp, Activity, PiggyBank, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildAllocation, growthRate } from "@/lib/analytics";
import { PeriodPicker, usePeriodState } from "@/components/period-picker";
import { resolvePeriod, isoDate } from "@/lib/period";
import { logAudit } from "@/lib/audit";
import { fetchAllRows } from "@/lib/fetch-all";
import { computeAssetTotals, computeAssetValue, incomeExpenseForPeriod, sumAvailableCash } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/snapshots")({
  head: () => ({ meta: [{ title: "Clôture mensuelle — Personal CFO" }] }),
  component: SnapshotsPage,
});

const COLORS = ["#10b981", "#f59e0b", "#6366f1", "#a855f7", "#06b6d4", "#ef4444", "#84cc16", "#ec4899"];
const tooltipStyle = { background: "#111827", border: "1px solid #1f2937", borderRadius: 4 };

function SnapshotsPage() {
  const qc = useQueryClient();
  const period = usePeriodState("ltm");
  const resolved = resolvePeriod(period.preset, new Date(), period.custom);
  const pFrom = isoDate(resolved.from);
  const pTo = isoDate(resolved.to);
  const snaps = useQuery({
    queryKey: ["snapshots"],
    queryFn: async () => (await supabase.from("monthly_snapshots").select("*").order("snapshot_month")).data ?? [],
  });
  const assetsRows = useQuery({
    queryKey: ["assets", "owned"],
    queryFn: async () => (await supabase.from("assets").select("id, type, purchase_value, current_value, status, archived").eq("status", "owned")).data ?? [],
  });
  const assetEvents = useQuery({
    queryKey: ["asset_events", "snapshots"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) =>
        supabase.from("asset_events").select("asset_id, event_type, amount, event_date, event_month").range(from, to),
      ),
  });
  const wallets = useQuery({
    queryKey: ["wallets"],
    queryFn: async () => (await supabase.from("wallets").select("id, type, currency, opening_balance, current_balance, status")).data ?? [],
  });
  const allTx = useQuery({
    queryKey: ["transactions", "snapshots"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) =>
        supabase
          .from("transactions")
          .select("id, type, wallet_id, to_wallet_id, amount, base_amount, exchange_rate, occurred_on, budget_node_id")
          .range(from, to),
      ),
  });

  const [captureFor, setCaptureFor] = useState<string | null>(null);
  const capture = useMutation({
    mutationFn: async (targetMonth: string) => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const monthDate = new Date(targetMonth + "-01");
      const month = toISODate(monthStart(monthDate));
      // Period = target month
      const from = month;
      const to = toISODate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));

      const [wRes, dRes, rRes, aRes, aeRows, txRows] = await Promise.all([
        supabase.from("wallets").select("id, type, currency, opening_balance, current_balance, status"),
        supabase.from("debts").select("outstanding").neq("status", "settled").neq("status", "cancelled"),
        supabase.from("receivables").select("outstanding").neq("status", "settled").neq("status", "cancelled"),
        supabase.from("assets").select("id, purchase_value, current_value, status, archived").eq("status", "owned"),
        fetchAllRows<any>((fromRange, toRange) =>
          supabase.from("asset_events").select("asset_id, event_type, amount, event_date, event_month").range(fromRange, toRange),
        ),
        fetchAllRows<any>((fromRange, toRange) =>
          supabase
            .from("transactions")
            .select("id, type, wallet_id, to_wallet_id, amount, base_amount, exchange_rate, occurred_on, budget_node_id")
            .range(fromRange, toRange),
        ),
      ]);

      const cash = sumAvailableCash(wRes.data ?? [], txRows, { through: to });
      const totalDebt = (dRes.data ?? []).reduce((s, w) => s + Number(w.outstanding), 0);
      const totalRec = (rRes.data ?? []).reduce((s, w) => s + Number(w.outstanding), 0);
      const totalAssets = computeAssetTotals(aRes.data ?? [], aeRows, { through: to }).bookValue;
      const net = cash + totalAssets + totalRec - totalDebt;
      const { income, expense } = incomeExpenseForPeriod(txRows, from, to);

      const { error } = await supabase.from("monthly_snapshots").upsert({
        user_id: uid, snapshot_month: month,
        cash_position: cash, total_debt: totalDebt, total_receivables: totalRec,
        total_assets: totalAssets, total_investments: 0, net_worth: net,
        monthly_income: income, monthly_expense: expense,
      }, { onConflict: "user_id,snapshot_month" });
      if (error) throw error;
      await logAudit("transaction" as any, null, "create", { snapshot_month: month });
    },
    onSuccess: () => {
      toast.success("Clôture enregistrée");
      qc.invalidateQueries({ queryKey: ["snapshots"] });
      setCaptureFor(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("monthly_snapshots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["snapshots"] }); toast.success("Clôture supprimée"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const fullList = snaps.data ?? [];
  const fromMonth = pFrom.slice(0, 7);
  const toMonth = pTo.slice(0, 7);
  const list = useMemo(
    () => fullList.filter((s: any) => {
      const m = String(s.snapshot_month).slice(0, 7);
      return m >= fromMonth && m <= toMonth;
    }),
    [fullList, fromMonth, toMonth],
  );
  const last = list[list.length - 1];
  const prev = list[list.length - 2];
  const yearAgo = list.find(s => {
    const now = new Date();
    const d = new Date(s.snapshot_month);
    return d.getFullYear() === now.getFullYear() - 1 && d.getMonth() === now.getMonth();
  });

  const mom = last && prev ? growthRate(Number(last.net_worth), Number(prev.net_worth)) : 0;
  const yoy = last && yearAgo ? growthRate(Number(last.net_worth), Number(yearAgo.net_worth)) : 0;
  // Annualised growth from first to last snapshot
  const first = list[0];
  let annualized = 0;
  if (first && last && first !== last) {
    const months = Math.max(1, (new Date(last.snapshot_month).getTime() - new Date(first.snapshot_month).getTime()) / (30 * 86_400_000));
    const ratio = Number(last.net_worth) / Math.max(1, Number(first.net_worth));
    annualized = Math.pow(Math.max(ratio, 0.0001), 12 / months) - 1;
  }

  const chart = list.map((s: any) => ({
    month: fmtMonth(s.snapshot_month),
    net: Number(s.net_worth),
    cash: Number(s.cash_position),
    assets: Number(s.total_assets),
    debt: -Number(s.total_debt),
  }));

  const cash = sumAvailableCash(Array.isArray(wallets.data) ? wallets.data : [], allTx.data ?? []);
  const allocationRows = (assetsRows.data ?? []).map((a: any) => ({
    type: a.type,
    current_value: computeAssetValue(a, assetEvents.data ?? []).bookValue,
  }));
  const allocation = buildAllocation(allocationRows, cash);
  const allocTotal = allocation.reduce((s, x) => s + x.value, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Patrimoine</p>
          <h1 className="mt-1 text-2xl font-semibold">Clôture mensuelle</h1>
          <p className="mt-1 text-sm text-muted-foreground">Une photographie figée chaque mois : trésorerie, actifs, dettes, créances, revenus, dépenses.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker preset={period.preset} onPresetChange={period.setPreset} custom={period.custom} onCustomChange={period.setCustom} />
          <Button onClick={() => setCaptureFor(toISODate(monthStart()).slice(0, 7))} disabled={capture.isPending}>
            <Camera className="mr-2 h-4 w-4" />Clôturer une période
          </Button>
        </div>
      </header>

      {captureFor != null && (
        <Dialog open onOpenChange={(v) => !v && setCaptureFor(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Choisir le mois à clôturer</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">La photographie sera figée pour le mois choisi. Utile pour une saisie en retard.</p>
            <Input type="month" value={captureFor} onChange={(e) => setCaptureFor(e.target.value)} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCaptureFor(null)}>Annuler</Button>
              <Button disabled={capture.isPending || !captureFor} onClick={() => capture.mutate(captureFor!)}>Clôturer {captureFor}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Valeur nette" value={last ? fmtMoney(Number(last.net_worth)) : "—"} tone={last && Number(last.net_worth) >= 0 ? "positive" : "neutral"} icon={<Activity className="h-4 w-4" />} />
        <StatCard label="Croissance mensuelle" value={fmtPct(mom * 100)} tone={mom >= 0 ? "positive" : "negative"} delta={mom * 100} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Croissance annuelle" value={yearAgo ? fmtPct(yoy * 100) : "—"} tone={yoy >= 0 ? "positive" : "negative"} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Annualisé (depuis début)" value={annualized ? fmtPct(annualized * 100) : "—"} tone={annualized >= 0 ? "positive" : "negative"} icon={<PiggyBank className="h-4 w-4" />} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Évolution de la valeur nette" className="lg:col-span-2">
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="month" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v) => new Intl.NumberFormat("fr-FR", { notation: "compact" }).format(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="net" stroke="#10b981" fill="url(#ga)" name="Valeur nette" strokeWidth={2} />
                <Area type="monotone" dataKey="cash" stroke="#06b6d4" fill="transparent" name="Trésorerie" />
                <Area type="monotone" dataKey="assets" stroke="#6366f1" fill="transparent" name="Actifs" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Allocation d'actifs">
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={allocation} dataKey="value" nameKey="name" outerRadius={90} innerRadius={50} paddingAngle={2}>
                  {allocation.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1 font-mono text-[11px]">
            {allocation.slice(0, 6).map((a, i) => (
              <li key={a.name} className="flex justify-between">
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} /> {a.name}</span>
                <span className="text-muted-foreground">{allocTotal > 0 ? ((a.value / allocTotal) * 100).toFixed(1) : "0"}%</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <Panel title={`${list.length} clôtures enregistrées`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Mois</th>
                <th className="px-4 py-2 text-right">Trésorerie</th>
                <th className="px-4 py-2 text-right">Actifs</th>
                <th className="px-4 py-2 text-right">Dettes</th>
                <th className="px-4 py-2 text-right">Créances</th>
                <th className="px-4 py-2 text-right">Valeur nette</th>
                <th className="px-4 py-2 text-right">Δ Mois</th>
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {list.slice().reverse().map((s: any, idx, arr) => {
                const next = arr[idx + 1]; // previous chronologically
                const delta = next ? growthRate(Number(s.net_worth), Number(next.net_worth)) * 100 : null;
                return (
                  <tr key={s.id} className="border-t border-border/60">
                    <td className="num px-4 py-2">{fmtMonth(s.snapshot_month)}</td>
                    <td className="num px-4 py-2 text-right">{fmtMoney(Number(s.cash_position))}</td>
                    <td className="num px-4 py-2 text-right">{fmtMoney(Number(s.total_assets))}</td>
                    <td className="num px-4 py-2 text-right text-warning">{fmtMoney(Number(s.total_debt))}</td>
                    <td className="num px-4 py-2 text-right text-positive">{fmtMoney(Number(s.total_receivables))}</td>
                    <td className="num px-4 py-2 text-right font-semibold">{fmtMoney(Number(s.net_worth))}</td>
                    <td className={`num px-4 py-2 text-right ${delta == null ? "text-muted-foreground" : delta >= 0 ? "text-positive" : "text-negative"}`}>
                      {delta == null ? "—" : fmtPct(delta)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex justify-end gap-0.5 text-muted-foreground">
                        <button title="Recalculer cette clôture" onClick={() => capture.mutate(s.snapshot_month.slice(0,7))} className="rounded-sm p-1 hover:bg-muted hover:text-foreground">
                          <Camera className="h-3.5 w-3.5" />
                        </button>
                        <button title="Supprimer" onClick={() => confirm("Supprimer cette clôture ?") && del.mutate(s.id)} className="rounded-sm p-1 hover:bg-muted hover:text-negative">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">Aucune clôture sur cette période.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
