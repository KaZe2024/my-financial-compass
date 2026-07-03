import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/format";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Calendrier — Personal CFO" }] }),
  component: CalendarPage,
});

function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const from = monthStart.toISOString().slice(0, 10);
  const to = monthEnd.toISOString().slice(0, 10);

  const debts = useQuery({ queryKey: ["cal_debts", from, to], queryFn: async () => (await supabase.from("debts").select("*").eq("archived", false).gte("due_date", from).lte("due_date", to)).data ?? [] });
  const recv = useQuery({ queryKey: ["cal_recv", from, to], queryFn: async () => (await supabase.from("receivables").select("*").eq("archived", false).gte("due_date", from).lte("due_date", to)).data ?? [] });
  const subs = useQuery({ queryKey: ["cal_subs", from, to], queryFn: async () => (await supabase.from("subscriptions").select("*").eq("active", true).gte("next_billing_date", from).lte("next_billing_date", to)).data ?? [] });
  const provs = useQuery({ queryKey: ["cal_provs", from, to], queryFn: async () => (await supabase.from("provisions").select("*").gte("due_date", from).lte("due_date", to)).data ?? [] });

  const events = useMemo(() => {
    const m = new Map<string, any[]>();
    const add = (date: string, ev: any) => { if (!date) return; if (!m.has(date)) m.set(date, []); m.get(date)!.push(ev); };
    for (const d of debts.data ?? []) add(d.due_date, { color: "bg-negative", label: `Dette ${d.creditor}`, amount: -Number(d.outstanding ?? 0) });
    for (const r of recv.data ?? []) add(r.due_date, { color: "bg-positive", label: `Créance ${r.debtor}`, amount: +Number(r.outstanding ?? 0) });
    for (const s of subs.data ?? []) add(s.next_billing_date, { color: "bg-warning", label: `Abo ${s.name}`, amount: -Number(s.amount ?? 0) });
    for (const p of provs.data ?? []) add(p.due_date, { color: "bg-primary", label: `Prov ${p.name}`, amount: (p.direction === "in" ? 1 : -1) * Number(p.amount ?? 0) });
    return m;
  }, [debts.data, recv.data, subs.data, provs.data]);

  const firstDay = (monthStart.getDay() + 6) % 7; // Monday=0
  const daysInMonth = monthEnd.getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (cells.length % 7) cells.push(null);

  const label = cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Planning</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold"><CalendarDays className="h-6 w-6" /> Calendrier financier</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-[160px] text-center text-sm font-semibold capitalize">{label}</div>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Aujourd'hui</Button>
        </div>
      </header>

      <Panel title="Vue mensuelle">
        <div className="grid grid-cols-7 gap-px text-xs">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
            <div key={d} className="p-2 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{d}</div>
          ))}
          {cells.map((d, i) => {
            const iso = d ? d.toISOString().slice(0, 10) : "";
            const evs = iso ? events.get(iso) ?? [] : [];
            const isToday = iso === today;
            return (
              <div key={i} className={`min-h-[92px] rounded-sm border border-border/60 bg-card p-1.5 ${d ? "" : "opacity-30"} ${isToday ? "ring-1 ring-primary" : ""}`}>
                {d && <div className="mb-1 font-mono text-[10px] text-muted-foreground">{d.getDate()}</div>}
                <div className="space-y-0.5">
                  {evs.slice(0, 3).map((e, k) => (
                    <div key={k} className="flex items-center gap-1 truncate text-[10px]" title={`${e.label} · ${fmtMoney(e.amount)}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.color}`} />
                      <span className="truncate">{e.label}</span>
                    </div>
                  ))}
                  {evs.length > 3 && <div className="text-[10px] text-muted-foreground">+{evs.length - 3}…</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
