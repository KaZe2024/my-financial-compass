import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard, Panel } from "@/components/stat-card";
import { fmtMoney, fmtDate, fmtMonth, monthStart, toISODate } from "@/lib/format";
import { walletsQO, profileQO } from "@/lib/queries";
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Receipt, HandCoins, Landmark, Activity } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Personal CFO" }] }),
  component: Dashboard,
});

const COLORS = ["#10b981", "#f59e0b", "#6366f1", "#a855f7", "#06b6d4", "#ef4444"];

function Dashboard() {
  const profile = useQuery(profileQO);
  const wallets = useQuery(walletsQO);

  const now = new Date();
  const monthStartISO = toISODate(monthStart(now));
  const twelveAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const txMonth = useQuery({
    queryKey: ["tx", "month", monthStartISO],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions")
        .select("type, base_amount, occurred_on, budget_category_id, description, wallet_id")
        .gte("occurred_on", monthStartISO);
      if (error) throw error;
      return data;
    },
  });

  const cashflow = useQuery({
    queryKey: ["cashflow", "12m"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_monthly_cashflow").select("*").gte("month", toISODate(twelveAgo)).order("month");
      if (error) throw error;
      return data;
    },
  });

  const catSpend = useQuery({
    queryKey: ["catspend", "month", monthStartISO],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_category_spend").select("*").eq("month", monthStartISO);
      if (error) throw error;
      return (data ?? []).filter((r: any) => r.spent > 0).sort((a: any, b: any) => b.spent - a.spent).slice(0, 6);
    },
  });

  const debts = useQuery({
    queryKey: ["debts", "sum"],
    queryFn: async () => {
      const { data } = await supabase.from("debts").select("outstanding").neq("status", "settled").neq("status", "cancelled");
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.outstanding), 0);
    },
  });

  const receivables = useQuery({
    queryKey: ["rec", "sum"],
    queryFn: async () => {
      const { data } = await supabase.from("receivables").select("outstanding").neq("status", "settled").neq("status", "cancelled");
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.outstanding), 0);
    },
  });

  const assetsSum = useQuery({
    queryKey: ["assets", "sum"],
    queryFn: async () => {
      const { data } = await supabase.from("assets").select("current_value").eq("status", "owned");
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.current_value), 0);
    },
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

  const upcomingDebts = useQuery({
    queryKey: ["debts", "upcoming"],
    queryFn: async () => {
      const { data } = await supabase.from("debts").select("id, creditor, outstanding, due_date, currency")
        .neq("status", "settled").neq("status", "cancelled").order("due_date").limit(5);
      return data ?? [];
    },
  });

  const upcomingRec = useQuery({
    queryKey: ["rec", "upcoming"],
    queryFn: async () => {
      const { data } = await supabase.from("receivables").select("id, debtor, outstanding, due_date, currency")
        .neq("status", "settled").neq("status", "cancelled").order("due_date").limit(5);
      return data ?? [];
    },
  });

  const cur = profile.data?.base_currency ?? "MGA";
  const cash = (wallets.data ?? []).reduce((s, w) => s + Number(w.current_balance), 0);
  const income = (txMonth.data ?? []).filter(t => t.type === "income").reduce((s, t) => s + Number(t.base_amount), 0);
  const expense = (txMonth.data ?? []).filter(t => t.type === "expense").reduce((s, t) => s + Number(t.base_amount), 0);
  const savings = income - expense;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;
  const netWorth = cash + Number(assetsSum.data ?? 0) + Number(receivables.data ?? 0) - Number(debts.data ?? 0);

  const cfChart = (cashflow.data ?? []).map((r: any) => ({
    month: fmtMonth(r.month), income: Number(r.income), expense: Number(r.expense), net: Number(r.net),
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Vue d'ensemble — {now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</p>
          <h1 className="mt-1 text-2xl font-semibold">Bienvenue, {profile.data?.full_name ?? "propriétaire"}.</h1>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Trésorerie totale" value={fmtMoney(cash, cur)} sub={`${(wallets.data ?? []).length} portefeuilles`} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Valeur nette" value={fmtMoney(netWorth, cur)} sub="Actifs + créances − dettes" tone={netWorth >= 0 ? "positive" : "negative"} icon={<Activity className="h-4 w-4" />} />
        <StatCard label="Revenus du mois" value={fmtMoney(income, cur)} tone="positive" icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Dépenses du mois" value={fmtMoney(expense, cur)} tone="negative" icon={<TrendingDown className="h-4 w-4" />} />
        <StatCard label="Taux d'épargne" value={`${savingsRate.toFixed(1)}%`} sub={fmtMoney(savings, cur, { sign: true })} tone={savings >= 0 ? "positive" : "negative"} icon={<PiggyBank className="h-4 w-4" />} />
        <StatCard label="Dettes en cours" value={fmtMoney(Number(debts.data ?? 0), cur)} tone={Number(debts.data ?? 0) > 0 ? "warning" : "neutral"} icon={<Receipt className="h-4 w-4" />} />
        <StatCard label="Créances en cours" value={fmtMoney(Number(receivables.data ?? 0), cur)} icon={<HandCoins className="h-4 w-4" />} />
        <StatCard label="Valeur des actifs" value={fmtMoney(Number(assetsSum.data ?? 0), cur)} icon={<Landmark className="h-4 w-4" />} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Flux de trésorerie · 12 mois" className="lg:col-span-2">
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={cfChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="month" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v) => new Intl.NumberFormat("fr-FR", { notation: "compact" }).format(v)} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 4 }} formatter={(v: number) => fmtMoney(v, cur)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="income" stroke="#10b981" fill="url(#g1)" name="Revenus" />
                <Area type="monotone" dataKey="expense" stroke="#ef4444" fill="url(#g2)" name="Dépenses" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Répartition des dépenses · mois en cours">
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={(catSpend.data ?? []).map((r: any) => ({ name: r.category_name ?? "Sans catégorie", value: Number(r.spent) }))}
                  dataKey="value" nameKey="name" outerRadius={90} innerRadius={50} paddingAngle={2}>
                  {(catSpend.data ?? []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 4 }} formatter={(v: number) => fmtMoney(v, cur)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
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

        <div className="space-y-4">
          <Panel title="Dettes à venir">
            <ul className="space-y-2 text-sm">
              {(upcomingDebts.data ?? []).map((d: any) => (
                <li key={d.id} className="flex justify-between gap-3"><span className="truncate">{d.creditor}</span>
                  <span className="num shrink-0 text-warning">{fmtMoney(Number(d.outstanding), d.currency)}</span>
                </li>
              ))}
              {(upcomingDebts.data ?? []).length === 0 && <li className="text-muted-foreground">Aucune dette</li>}
            </ul>
          </Panel>
          <Panel title="Créances à venir">
            <ul className="space-y-2 text-sm">
              {(upcomingRec.data ?? []).map((d: any) => (
                <li key={d.id} className="flex justify-between gap-3"><span className="truncate">{d.debtor}</span>
                  <span className="num shrink-0 text-positive">{fmtMoney(Number(d.outstanding), d.currency)}</span>
                </li>
              ))}
              {(upcomingRec.data ?? []).length === 0 && <li className="text-muted-foreground">Aucune créance</li>}
            </ul>
          </Panel>
        </div>
      </section>
    </div>
  );
}
