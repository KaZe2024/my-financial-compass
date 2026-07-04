import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { PeriodPicker, usePeriodState } from "@/components/period-picker";
import { resolvePeriod, isoDate } from "@/lib/period";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { fmtDate } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetch-all";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/fx")({
  head: () => ({ meta: [{ title: "Taux de change — Personal CFO" }] }),
  component: FxPage,
});

const COMMON = ["EUR","USD","GBP","CHF","CAD","AUD","JPY","CNY"];

function FxPage() {
  const { preset, setPreset, custom, setCustom } = usePeriodState("ltm");
  const period = resolvePeriod(preset, new Date(), custom);
  const [currency, setCurrency] = useState<string>("EUR");

  const txs = useQuery({
    queryKey: ["fx_txs", currency, isoDate(period.from), isoDate(period.to)],
    queryFn: async () => {
      const data = await fetchAllRows<any>((from, to) =>
        supabase
          .from("transactions")
          .select("occurred_on, currency, exchange_rate")
          .eq("currency", currency)
          .gte("occurred_on", isoDate(period.from))
          .lte("occurred_on", isoDate(period.to))
          .order("occurred_on", { ascending: true })
          .range(from, to),
      );
      return data.filter((r: any) => Number(r.exchange_rate) > 0);
    },
  });


  // Aggregate per day (mean)
  const series = useMemo(() => {
    const byDay = new Map<string, { sum: number; n: number }>();
    for (const r of txs.data ?? []) {
      const d = (r as any).occurred_on as string;
      const v = Number((r as any).exchange_rate);
      const cur = byDay.get(d) ?? { sum: 0, n: 0 };
      cur.sum += v; cur.n++;
      byDay.set(d, cur);
    }
    const arr = Array.from(byDay.entries()).map(([d, v]) => ({ date: d, rate: v.sum / v.n }));
    arr.sort((a, b) => a.date.localeCompare(b.date));
    return arr;
  }, [txs.data]);

  const stats = useMemo(() => {
    if (series.length === 0) return null;
    const rates = series.map((s) => s.rate);
    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const avg = rates.reduce((s, x) => s + x, 0) / rates.length;
    const first = rates[0];
    const last = rates[rates.length - 1];
    const variation = first ? ((last - first) / first) * 100 : 0;
    return { min, max, avg, last, first, variation };
  }, [series]);

  // Existing currencies observed across all txs
  const currencies = useQuery({
    queryKey: ["fx_currencies"],
    queryFn: async () => {
      const data = await fetchAllRows<any>((from, to) =>
        supabase.from("transactions").select("currency").not("currency", "is", null).range(from, to),
      );
      const set = new Set<string>();
      for (const r of data) if ((r as any).currency && (r as any).currency !== "MGA") set.add((r as any).currency);
      for (const c of COMMON) set.add(c);
      return Array.from(set).sort();
    },
  });


  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Marchés</p>
          <h1 className="mt-1 text-2xl font-semibold">Suivi des taux de change</h1>
          <p className="text-xs text-muted-foreground">Source : taux saisis dans les transactions · base MGA</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Devise</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{(currencies.data ?? COMMON).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <PeriodPicker preset={preset} onPresetChange={setPreset} custom={custom} onCustomChange={setCustom}
            presets={["month","quarter","semester","year","ytd","ltm","custom"]} />
        </div>
      </header>

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Dernier" value={stats.last} />
          <Stat label="Moyen" value={stats.avg} />
          <Stat label="Min" value={stats.min} />
          <Stat label="Max" value={stats.max} />
          <Stat label="Variation" value={stats.variation} suffix=" %" tone={stats.variation >= 0 ? "pos" : "neg"} sign />
        </div>
      )}

      <Panel title={`1 ${currency} → MGA · ${fmtDate(period.from)} → ${fmtDate(period.to)}`}>
        {series.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Aucune observation. Saisis des transactions en {currency} pour alimenter la courbe.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
                <defs>
                  <linearGradient id="fxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} domain={["dataMin", "dataMax"]} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} formatter={(v: any) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} />
                <Area type="monotone" dataKey="rate" stroke="hsl(var(--primary))" fill="url(#fxGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel title={`${series.length} observations agrégées`}>
        <div className="scroll-thin max-h-80 overflow-y-auto -mx-4">
          <table className="w-full min-w-[400px] text-sm">
            <thead className="sticky top-0 bg-card text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2 text-right">Taux moyen</th></tr>
            </thead>
            <tbody>
              {series.slice().reverse().map((s) => (
                <tr key={s.date} className="border-t border-border/60">
                  <td className="num px-4 py-1.5 text-muted-foreground">{fmtDate(s.date)}</td>
                  <td className="num px-4 py-1.5 text-right">{s.rate.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value, suffix = "", tone, sign }: { label: string; value: number; suffix?: string; tone?: "pos" | "neg"; sign?: boolean }) {
  const cls = tone === "pos" ? "text-positive" : tone === "neg" ? "text-negative" : "";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`num mt-1 text-xl font-semibold ${cls}`}>{sign && value > 0 ? "+" : ""}{value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}{suffix}</div>
    </div>
  );
}
