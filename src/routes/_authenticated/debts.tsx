import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { fmtDate, fmtMoney, toISODate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/debts")({
  head: () => ({ meta: [{ title: "Dettes — Personal CFO" }] }),
  component: () => <ObligationsPage table="debts" partyLabel="Créancier" partyField="creditor" title="Dettes" subtitle="Tiers" tone="negative" />,
});

export function ObligationsPage(props: {
  table: "debts" | "receivables";
  partyField: "creditor" | "debtor";
  partyLabel: string;
  title: string;
  subtitle: string;
  tone: "negative" | "positive";
}) {
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: [props.table],
    queryFn: async () => (await supabase.from(props.table).select("*").order("due_date", { nullsFirst: false })).data ?? [],
  });
  const total = (data.data ?? []).filter((r: any) => r.status !== "settled" && r.status !== "cancelled").reduce((s: number, r: any) => s + Number(r.outstanding), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{props.subtitle}</p>
          <h1 className="mt-1 text-2xl font-semibold">{props.title}</h1>
          <p className={`num mt-1 text-sm ${props.tone === "negative" ? "text-warning" : "text-positive"}`}>Total en cours · {fmtMoney(total)}</p>
        </div>
        <AddDialog table={props.table} partyField={props.partyField} partyLabel={props.partyLabel} onDone={() => qc.invalidateQueries({ queryKey: [props.table] })} />
      </header>

      <Panel title={`${(data.data ?? []).length} entrées`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">{props.partyLabel}</th><th className="px-4 py-2">Échéance</th>
                <th className="px-4 py-2 text-right">Initial</th><th className="px-4 py-2 text-right">Restant</th>
                <th className="px-4 py-2">Statut</th><th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(data.data ?? []).map((r: any) => {
                const late = r.due_date && new Date(r.due_date) < new Date() && r.status !== "settled" && r.status !== "cancelled";
                return (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-4 py-2">{r[props.partyField]}{r.description ? <div className="text-xs text-muted-foreground">{r.description}</div> : null}</td>
                    <td className="num px-4 py-2 text-muted-foreground">{fmtDate(r.due_date)}{late && <span className="ml-2 rounded-sm bg-negative/15 px-1.5 py-0.5 font-mono text-[9px] uppercase text-negative">En retard</span>}</td>
                    <td className="num px-4 py-2 text-right">{fmtMoney(Number(r.original_amount), r.currency)}</td>
                    <td className={`num px-4 py-2 text-right font-semibold ${Number(r.outstanding) > 0 ? (props.tone === "negative" ? "text-warning" : "text-positive") : "text-muted-foreground"}`}>{fmtMoney(Number(r.outstanding), r.currency)}</td>
                    <td className="px-4 py-2"><span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{r.status}</span></td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={async () => { if (!confirm("Supprimer ?")) return; await supabase.from(props.table).delete().eq("id", r.id); qc.invalidateQueries(); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
              {(data.data ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Aucune entrée</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function AddDialog({ table, partyField, partyLabel, onDone }: { table: "debts"|"receivables"; partyField: string; partyLabel: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ party: "", description: "", amount: "0", currency: "MGA", due: toISODate(new Date()), status: "outstanding" as const, notes: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const amt = Number(form.amount);
      const row: any = {
        user_id: u.user!.id,
        [partyField]: form.party,
        description: form.description || null,
        original_amount: amt, outstanding: amt,
        currency: form.currency, due_date: form.due || null, status: form.status, notes: form.notes || null,
      };
      const { error } = await supabase.from(table).insert(row);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Enregistré"); setOpen(false); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouveau</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{partyLabel}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <Lf label={partyLabel}><Input value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} required /></Lf>
          <Lf label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Lf>
          <div className="grid grid-cols-3 gap-3">
            <Lf label="Montant"><Input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Lf>
            <Lf label="Devise">
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["MGA","EUR","USD","GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Lf>
            <Lf label="Échéance"><Input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></Lf>
          </div>
          <Lf label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Lf>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Lf({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>;
}
