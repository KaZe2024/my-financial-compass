import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { PeriodPicker, usePeriodState } from "@/components/period-picker";
import { resolvePeriod, isoDate } from "@/lib/period";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { fmtDate } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetch-all";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/fx")({
  head: () => ({ meta: [{ title: "Taux de change — Personal CFO" }] }),
  component: FxPage,
});

const COMMON = ["EUR","USD","GBP","CHF","CAD","AUD","JPY","CNY"];
const BUY_TYPES = new Set(["expense"]);
const SELL_TYPES = new Set(["income"]);

function FxPage() {
  const qc = useQueryClient();
  const { preset, setPreset, custom, setCustom } = usePeriodState("ltm");
  const period = resolvePeriod(preset, new Date(), custom);
  const [currency, setCurrency] = useState<string>("EUR");

  const txs = useQuery({
    queryKey: ["fx_txs", currency, isoDate(period.from), isoDate(period.to)],
    queryFn: async () => {
      const data = await fetchAllRows<any>((from, to) =>
        supabase
          .from("transactions")
          .select("id, occurred_on, type, currency, exchange_rate, amount, fx_exclude")
          .eq("currency", currency)
          .gte("occurred_on", isoDate(period.from))
          .lte("occurred_on", isoDate(period.to))
          .order("occurred_on", { ascending: true })
          .range(from, to),
      );
      return data.filter((r: any) => Number(r.exchange_rate) > 0 && !r.fx_exclude);
    },
  });

  // Aggregate per day per side
  const series = useMemo(() => {
    const byDay = new Map<string, { buySum: number; buyN: number; sellSum: number; sellN: number }>();
    for (const r of txs.data ?? []) {
      const d = (r as any).occurred_on as string;
      const v = Number((r as any).exchange_rate);
      const t = (r as any).type;
      const cur = byDay.get(d) ?? { buySum: 0, buyN: 0, sellSum: 0, sellN: 0 };
      if (BUY_TYPES.has(t)) { cur.buySum += v; cur.buyN++; }
      else if (SELL_TYPES.has(t)) { cur.sellSum += v; cur.sellN++; }
      byDay.set(d, cur);
    }
    const arr = Array.from(byDay.entries()).map(([d, v]) => ({
      date: d,
      buy: v.buyN ? v.buySum / v.buyN : null,
      sell: v.sellN ? v.sellSum / v.sellN : null,
    }));
    arr.sort((a, b) => a.date.localeCompare(b.date));
    return arr;
  }, [txs.data]);

  const stats = useMemo(() => {
    const buys = series.map((s) => s.buy).filter((v): v is number => v != null);
    const sells = series.map((s) => s.sell).filter((v): v is number => v != null);
    const agg = (arr: number[]) => {
      if (!arr.length) return null;
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
      const last = arr[arr.length - 1];
      return { min, max, avg, last };
    };
    return { buy: agg(buys), sell: agg(sells) };
  }, [series]);

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

  const excludeDay = useMutation({
    mutationFn: async ({ day, side }: { day: string; side: "buy" | "sell" }) => {
      const types = (side === "buy" ? Array.from(BUY_TYPES) : Array.from(SELL_TYPES)) as Array<"expense" | "income">;
      const { error } = await supabase
        .from("transactions")
        .update({ fx_exclude: true } as any)
        .eq("currency", currency)
        .eq("occurred_on", day)
        .in("type", types);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Observation retirée du suivi FX"); qc.invalidateQueries({ queryKey: ["fx_txs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Marchés</p>
          <h1 className="mt-1 text-2xl font-semibold">Suivi des taux de change</h1>
          <p className="text-xs text-muted-foreground">Achat = moyenne dépenses · Vente = moyenne revenus · base MGA</p>
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Achat · dernier" value={stats.buy?.last ?? null} tone="neg" />
        <Stat label="Achat · moyen" value={stats.buy?.avg ?? null} tone="neg" />
        <Stat label="Vente · dernier" value={stats.sell?.last ?? null} tone="pos" />
        <Stat label="Vente · moyen" value={stats.sell?.avg ?? null} tone="pos" />
      </div>

      <Panel title={`1 ${currency} → MGA · ${fmtDate(period.from)} → ${fmtDate(period.to)}`}>
        {series.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Aucune observation. Saisis des transactions en {currency} pour alimenter les courbes.</p>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tickFormatter={(v: string) => new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  minTickGap={32}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  domain={[(min: number) => Math.floor(min * 0.995), (max: number) => Math.ceil(max * 1.005)]}
                  tickFormatter={(v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, boxShadow: "0 8px 24px -12px rgba(0,0,0,0.25)" }}
                  labelFormatter={(l: string) => fmtDate(l)}
                  formatter={(v: any, name: string) => [v == null ? "—" : `${Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} MGA`, name]}
                />
                <Legend verticalAlign="top" height={32} iconType="circle" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
                <Line
                  type="monotone"
                  dataKey="buy"
                  name="Achat (dépenses)"
                  stroke="hsl(var(--negative, 0 84% 60%))"
                  strokeWidth={2.25}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="sell"
                  name="Vente (revenus)"
                  stroke="hsl(var(--positive, 142 71% 45%))"
                  strokeWidth={2.25}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel title={`${series.length} jours d'observations`}>
        <div className="scroll-thin max-h-96 overflow-y-auto -mx-4">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="sticky top-0 bg-card text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2 text-right">Achat</th>
                <th className="px-4 py-2 text-right">Vente</th>
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {series.slice().reverse().map((s) => (
                <tr key={s.date} className="border-t border-border/60">
                  <td className="num px-4 py-1.5 text-muted-foreground">{fmtDate(s.date)}</td>
                  <td className="num px-4 py-1.5 text-right text-negative">{s.buy != null ? s.buy.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "—"}</td>
                  <td className="num px-4 py-1.5 text-right text-positive">{s.sell != null ? s.sell.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "—"}</td>
                  <td className="px-2 py-1 text-right">
                    <div className="flex justify-end gap-1 text-muted-foreground">
                      {s.buy != null && (
                        <button title="Retirer l'observation d'achat" onClick={() => confirm(`Exclure l'observation d'achat du ${fmtDate(s.date)} ?`) && excludeDay.mutate({ day: s.date, side: "buy" })} className="rounded-sm p-1 hover:bg-muted hover:text-negative"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                      {s.sell != null && (
                        <button title="Retirer l'observation de vente" onClick={() => confirm(`Exclure l'observation de vente du ${fmtDate(s.date)} ?`) && excludeDay.mutate({ day: s.date, side: "sell" })} className="rounded-sm p-1 hover:bg-muted hover:text-negative"><Trash2 className="h-3.5 w-3.5 opacity-70" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">Supprimer ici retire l'observation du suivi FX (les transactions restent inchangées).</p>
      </Panel>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | null; tone?: "pos" | "neg" }) {
  const cls = tone === "pos" ? "text-positive" : tone === "neg" ? "text-negative" : "";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`num mt-1 text-xl font-semibold ${cls}`}>{value == null ? "—" : value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</div>
    </div>
  );
}
