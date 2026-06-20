import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { fmtMoney, fmtMonth, monthStart, toISODate } from "@/lib/format";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/snapshots")({
  head: () => ({ meta: [{ title: "Snapshots — Personal CFO" }] }),
  component: SnapshotsPage,
});

function SnapshotsPage() {
  const qc = useQueryClient();
  const snaps = useQuery({
    queryKey: ["snapshots"],
    queryFn: async () => (await supabase.from("monthly_snapshots").select("*").order("snapshot_month")).data ?? [],
  });

  const capture = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const month = toISODate(monthStart());

      const [wallets, debts, rec, assets, txMonth] = await Promise.all([
        supabase.from("wallets").select("current_balance"),
        supabase.from("debts").select("outstanding").neq("status","settled").neq("status","cancelled"),
        supabase.from("receivables").select("outstanding").neq("status","settled").neq("status","cancelled"),
        supabase.from("assets").select("current_value").eq("status","owned"),
        supabase.from("transactions").select("type, base_amount").gte("occurred_on", month),
      ]);

      const cash = (wallets.data ?? []).reduce((s, w) => s + Number(w.current_balance), 0);
      const totalDebt = (debts.data ?? []).reduce((s, w) => s + Number(w.outstanding), 0);
      const totalRec = (rec.data ?? []).reduce((s, w) => s + Number(w.outstanding), 0);
      const totalAssets = (assets.data ?? []).reduce((s, w) => s + Number(w.current_value), 0);
      const net = cash + totalAssets + totalRec - totalDebt;
      const income = (txMonth.data ?? []).filter(t => t.type === "income").reduce((s, t) => s + Number(t.base_amount), 0);
      const expense = (txMonth.data ?? []).filter(t => t.type === "expense").reduce((s, t) => s + Number(t.base_amount), 0);

      const { error } = await supabase.from("monthly_snapshots").upsert({
        user_id: uid, snapshot_month: month,
        cash_position: cash, total_debt: totalDebt, total_receivables: totalRec,
        total_assets: totalAssets, total_investments: 0, net_worth: net,
        monthly_income: income, monthly_expense: expense,
      }, { onConflict: "user_id,snapshot_month" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Snapshot du mois enregistré"); qc.invalidateQueries({ queryKey: ["snapshots"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const chart = (snaps.data ?? []).map((s: any) => ({
    month: fmtMonth(s.snapshot_month),
    net: Number(s.net_worth),
    cash: Number(s.cash_position),
    assets: Number(s.total_assets),
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Patrimoine</p>
          <h1 className="mt-1 text-2xl font-semibold">Snapshots mensuels</h1>
          <p className="mt-1 text-sm text-muted-foreground">Photographie de votre situation financière chaque mois.</p>
        </div>
        <Button onClick={() => capture.mutate()} disabled={capture.isPending}><Camera className="mr-2 h-4 w-4" />Capturer ce mois</Button>
      </header>

      <Panel title="Évolution de la valeur nette">
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
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 4 }} formatter={(v: number) => fmtMoney(v)} />
              <Area type="monotone" dataKey="net" stroke="#10b981" fill="url(#ga)" name="Valeur nette" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title={`${(snaps.data ?? []).length} snapshots`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2">Mois</th><th className="px-4 py-2 text-right">Trésorerie</th><th className="px-4 py-2 text-right">Actifs</th><th className="px-4 py-2 text-right">Dettes</th><th className="px-4 py-2 text-right">Créances</th><th className="px-4 py-2 text-right">Valeur nette</th></tr>
            </thead>
            <tbody>
              {(snaps.data ?? []).slice().reverse().map((s: any) => (
                <tr key={s.id} className="border-t border-border/60">
                  <td className="num px-4 py-2">{fmtMonth(s.snapshot_month)}</td>
                  <td className="num px-4 py-2 text-right">{fmtMoney(Number(s.cash_position))}</td>
                  <td className="num px-4 py-2 text-right">{fmtMoney(Number(s.total_assets))}</td>
                  <td className="num px-4 py-2 text-right text-warning">{fmtMoney(Number(s.total_debt))}</td>
                  <td className="num px-4 py-2 text-right text-positive">{fmtMoney(Number(s.total_receivables))}</td>
                  <td className="num px-4 py-2 text-right font-semibold">{fmtMoney(Number(s.net_worth))}</td>
                </tr>
              ))}
              {(snaps.data ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Aucun snapshot. Cliquez sur "Capturer ce mois".</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
