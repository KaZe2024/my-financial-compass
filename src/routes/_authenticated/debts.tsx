import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { walletsQO } from "@/lib/queries";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, History as HistoryIcon } from "lucide-react";
import { fmtDate, fmtMoney, toISODate } from "@/lib/format";
import { toast } from "sonner";
import { RowActions } from "./assets";
import { HistoryDialog } from "@/components/history-dialog";

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
  const [showArchived, setShowArchived] = useState(false);
  const wallets = useQuery(walletsQO);
  const data = useQuery({
    queryKey: [props.table],
    queryFn: async () => (await supabase.from(props.table).select("*").order("due_date", { nullsFirst: false })).data ?? [],
  });
  const visible = (data.data ?? []).filter((r: any) => showArchived || !r.archived);
  const total = visible.filter((r: any) => r.status !== "settled" && r.status !== "cancelled").reduce((s: number, r: any) => s + Number(r.outstanding), 0);

  const [editing, setEditing] = useState<any | null>(null);
  const [historyOf, setHistoryOf] = useState<any | null>(null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{props.subtitle}</p>
          <h1 className="mt-1 text-2xl font-semibold">{props.title}</h1>
          <p className={`num mt-1 text-sm ${props.tone === "negative" ? "text-warning" : "text-positive"}`}>Total en cours · {fmtMoney(total)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Masquer" : "Voir"} archivés</Button>
          <ObligationDialog table={props.table} partyField={props.partyField} partyLabel={props.partyLabel} tone={props.tone} wallets={wallets.data ?? []} onDone={() => qc.invalidateQueries({ queryKey: [props.table] })} />
        </div>
      </header>

      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
        Astuce : saisissez les mouvements depuis <strong>Transactions</strong> avec le type <code>{props.tone === "negative" ? "dette" : "creance"}</code>. Un montant positif augmente l'encours, un montant négatif le diminue. L'encours se met à jour automatiquement.
      </div>

      <Panel title={`${visible.length} entrées`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">{props.partyLabel}</th><th className="px-4 py-2">Échéance</th>
                <th className="px-4 py-2 text-right">Initial</th><th className="px-4 py-2 text-right">Restant</th>
                <th className="px-4 py-2">Statut</th><th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r: any) => {
                const late = r.due_date && new Date(r.due_date) < new Date() && r.status !== "settled" && r.status !== "cancelled";
                return (
                  <tr key={r.id} className={`border-t border-border/60 ${r.archived ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2">{r[props.partyField]}{r.description ? <div className="text-xs text-muted-foreground">{r.description}</div> : null}</td>
                    <td className="num px-4 py-2 text-muted-foreground">{fmtDate(r.due_date)}{late && <span className="ml-2 rounded-sm bg-negative/15 px-1.5 py-0.5 font-mono text-[9px] uppercase text-negative">En retard</span>}</td>
                    <td className="num px-4 py-2 text-right">{fmtMoney(Number(r.original_amount), r.currency)}</td>
                    <td className={`num px-4 py-2 text-right font-semibold ${Number(r.outstanding) > 0 ? (props.tone === "negative" ? "text-warning" : "text-positive") : "text-muted-foreground"}`}>{fmtMoney(Number(r.outstanding), r.currency)}</td>
                    <td className="px-4 py-2"><span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{r.archived ? "archivé" : r.status}</span></td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex justify-end items-center gap-0.5">
                        <button title="Historique" onClick={() => setHistoryOf(r)} className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><HistoryIcon className="h-3.5 w-3.5" /></button>
                        <RowActions table={props.table} id={r.id} archived={r.archived} onEdit={() => setEditing(r)} linkedTxId={r.linked_transaction_id} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Aucune entrée</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {editing && (
        <ObligationDialog editing={editing} table={props.table} partyField={props.partyField} partyLabel={props.partyLabel} tone={props.tone} wallets={wallets.data ?? []} onClose={() => setEditing(null)} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: [props.table] }); }} />
      )}
      {historyOf && (
        <HistoryDialog open onOpenChange={(v) => !v && setHistoryOf(null)} title={`Historique · ${historyOf[props.partyField]}`} column={props.table === "debts" ? "debt_id" : "receivable_id"} sourceKind={props.table === "debts" ? "debt" : "receivable"} entityId={historyOf.id} />
      )}
    </div>
  );
}

function ObligationDialog({ editing, table, partyField, partyLabel, tone, wallets, onDone, onClose }: { editing?: any; table: "debts"|"receivables"; partyField: string; partyLabel: string; tone: "negative"|"positive"; wallets: any[]; onDone: () => void; onClose?: () => void }) {
  const [open, setOpen] = useState(!editing ? false : true);
  const [form, setForm] = useState(editing ? {
    party: editing[partyField], description: editing.description ?? "",
    amount: String(editing.original_amount), outstanding: String(editing.outstanding),
    currency: editing.currency, due: editing.due_date ?? "",
    status: editing.status as string, notes: editing.notes ?? "",
    link_tx: false, wallet_id: "",
  } : {
    party: "", description: "", amount: "0", outstanding: "",
    currency: "MGA", due: toISODate(new Date()),
    status: "outstanding", notes: "",
    link_tx: true, wallet_id: "",
  });

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const amt = Number(form.amount);
      const outstanding = form.outstanding === "" ? amt : Number(form.outstanding);
      const row: any = {
        user_id: u.user!.id,
        [partyField]: form.party,
        description: form.description || null,
        original_amount: amt, outstanding,
        currency: form.currency, due_date: form.due || null, status: form.status, notes: form.notes || null,
      };
      if (editing) {
        const { error } = await supabase.from(table).update(row).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase.from(table).insert(row).select().single();
        if (error) throw error;
        if (form.link_tx && form.wallet_id) {
          // Dette = on a reçu du cash (income). Créance = on a prêté du cash (expense).
          const txType = tone === "negative" ? "income" : "expense";
          const { data: tx, error: txErr } = await supabase.from("transactions").insert({
            user_id: u.user!.id, type: txType, occurred_on: toISODate(new Date()),
            description: `${tone === "negative" ? "Emprunt" : "Prêt accordé"} · ${form.party}`,
            wallet_id: form.wallet_id,
            amount: amt, currency: form.currency, exchange_rate: 1, base_amount: amt,
            source_kind: table === "debts" ? "debt" : "receivable", source_id: ins.id,
          }).select().single();
          if (txErr) throw txErr;
          await supabase.from(table).update({ linked_transaction_id: tx.id }).eq("id", ins.id);
        }
      }
    },
    onSuccess: () => { toast.success("Enregistré"); setOpen(false); onClose?.(); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={editing ? true : open} onOpenChange={(v) => { setOpen(v); if (!v) onClose?.(); }}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouveau</Button></DialogTrigger>}
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Modifier" : partyLabel}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <Lf label={partyLabel}><Input value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} required /></Lf>
          <Lf label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Lf>
          <div className="grid grid-cols-3 gap-3">
            <Lf label="Montant initial"><Input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Lf>
            <Lf label="Restant"><Input type="number" step="any" value={form.outstanding} onChange={(e) => setForm({ ...form, outstanding: e.target.value })} placeholder="= montant" /></Lf>
            <Lf label="Devise">
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["MGA","EUR","USD","GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Lf>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Lf label="Échéance"><DatePicker value={form.due} onChange={(__v) => setForm({ ...form, due: __v })} /></Lf>
            <Lf label="Statut">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["outstanding","partial","settled","late","cancelled"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Lf>
          </div>
          <Lf label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Lf>
          {!editing && (
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.link_tx} onChange={(e) => setForm({ ...form, link_tx: e.target.checked })} />
                Créer la transaction liée ({tone === "negative" ? "entrée cash" : "sortie cash"})
              </label>
              {form.link_tx && (
                <Lf label="Portefeuille">
                  <Select value={form.wallet_id} onValueChange={(v) => setForm({ ...form, wallet_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Lf>
              )}
            </div>
          )}
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Lf({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>;
}
