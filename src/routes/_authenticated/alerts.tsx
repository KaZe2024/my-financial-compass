import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { fmtMoney, fmtDate } from "@/lib/format";
import { AlertTriangle, Bell, CheckCircle2, Info, Sparkles, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listInsights, dismissInsight, generateInsights } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({ meta: [{ title: "Alertes — Personal CFO" }] }),
  component: AlertsPage,
});

const SEV: Record<string, { icon: any; tone: string; label: string }> = {
  critical: { icon: AlertTriangle, tone: "text-negative", label: "Critique" },
  warning: { icon: AlertTriangle, tone: "text-warning", label: "Attention" },
  info: { icon: Info, tone: "text-primary", label: "Info" },
  success: { icon: CheckCircle2, tone: "text-positive", label: "Positif" },
};

function AlertsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listInsights);
  const dismissFn = useServerFn(dismissInsight);
  const genFn = useServerFn(generateInsights);

  const insights = useQuery({ queryKey: ["insights"], queryFn: () => listFn() });
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const debts = useQuery({ queryKey: ["debts_alert"], queryFn: async () => (await supabase.from("debts").select("*").eq("archived", false).not("due_date", "is", null).lte("due_date", in30).neq("status", "settled")).data ?? [] });
  const subs = useQuery({ queryKey: ["subs_alert"], queryFn: async () => (await supabase.from("subscriptions").select("*").eq("active", true).not("next_billing_date", "is", null).lte("next_billing_date", in30)).data ?? [] });
  const provs = useQuery({ queryKey: ["provs_alert"], queryFn: async () => (await supabase.from("provisions").select("*").not("due_date", "is", null).lte("due_date", in30).neq("status", "settled")).data ?? [] });

  const events = useMemo(() => {
    const rows: any[] = [];
    for (const d of debts.data ?? []) rows.push({ kind: "Dette", name: d.creditor, amount: d.outstanding, date: d.due_date, tone: d.due_date < today ? "critical" : "warning" });
    for (const s of subs.data ?? []) rows.push({ kind: "Abonnement", name: s.name, amount: s.amount, date: s.next_billing_date, tone: "info" });
    for (const p of provs.data ?? []) rows.push({ kind: "Provision", name: p.name, amount: p.amount, date: p.due_date, tone: "info" });
    rows.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    return rows;
  }, [debts.data, subs.data, provs.data, today]);

  const gen = useMutation({
    mutationFn: () => genFn(),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["insights"] }); toast.success(`${r.created} insight(s) générés`); },
    onError: (e: Error) => toast.error(e.message),
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insights"] }),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Cockpit</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold"><Bell className="h-6 w-6" /> Alertes & recommandations</h1>
        </div>
        <Button onClick={() => gen.mutate()} disabled={gen.isPending}>
          {gen.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Générer des insights IA
        </Button>
      </header>

      <Panel title="Insights IA">
        <div className="space-y-2">
          {(insights.data ?? []).map((i: any) => {
            const S = SEV[i.severity] ?? SEV.info;
            const Icon = S.icon;
            return (
              <div key={i.id} className="flex items-start gap-3 rounded-md border border-border bg-card p-3">
                <Icon className={`mt-0.5 h-4 w-4 ${S.tone}`} />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{i.title}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{i.body}</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">{S.label} · {fmtDate(i.created_at)}</p>
                </div>
                <button onClick={() => dismiss.mutate(i.id)} className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
          {(insights.data ?? []).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Aucun insight. Clique sur « Générer des insights IA ».</p>}
        </div>
      </Panel>

      <Panel title={`Échéances 30 jours (${events.length})`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Libellé</th><th className="px-4 py-2 text-right">Montant</th></tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="px-4 py-2 text-xs">{fmtDate(e.date)}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{e.kind}</td>
                  <td className="px-4 py-2">{e.name}</td>
                  <td className="num px-4 py-2 text-right">{fmtMoney(e.amount)}</td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Rien à l'horizon 30 jours. 🎉</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
