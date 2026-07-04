import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NodePicker } from "@/components/node-picker";
import { CounterpartyPicker, ensureCounterparty, type Counterparty } from "@/components/counterparty-picker";
import { walletsQO, budgetNodesQO, counterpartiesQO } from "@/lib/queries";
import { fmtMoney, fmtDate, toISODate } from "@/lib/format";
import { Plus, Pencil, Trash2, Repeat, Power, PowerOff, Calendar, FileText } from "lucide-react";
import { toast } from "sonner";
import { bookProvisionTx } from "./provisions";

const CYCLES = [
  { value: "monthly", label: "Mensuel", factor: 12, months: 1 },
  { value: "quarterly", label: "Trimestriel", factor: 4, months: 3 },
  { value: "semiannual", label: "Semestriel", factor: 2, months: 6 },
  { value: "yearly", label: "Annuel", factor: 1, months: 12 },
  { value: "weekly", label: "Hebdomadaire", factor: 52, months: 0 },
];

function cycleMeta(c: string) {
  return CYCLES.find((x) => x.value === (c ?? "monthly").toLowerCase()) ?? CYCLES[0];
}
function cycleFactor(c: string) { return cycleMeta(c).factor; }

function nextBilling(current: string | null, cycle: string): string {
  const base = current ? new Date(current) : new Date();
  const meta = cycleMeta(cycle);
  if (meta.months > 0) base.setMonth(base.getMonth() + meta.months);
  else base.setDate(base.getDate() + 7);
  return toISODate(base);
}

export const Route = createFileRoute("/_authenticated/subscriptions")({
  head: () => ({ meta: [{ title: "Abonnements — Personal CFO" }] }),
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const wallets = useQuery(walletsQO);
  const nodesQ = useQuery(budgetNodesQO);
  const cps = useQuery(counterpartiesQO);

  const subs = useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscriptions").select("*").order("next_billing_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const visible = (subs.data ?? []).filter((s: any) => showInactive || s.active);

  const stats = useMemo(() => {
    let monthly = 0, yearly = 0;
    for (const s of visible) {
      if (!s.active) continue;
      const amt = Number(s.amount ?? 0);
      const f = cycleFactor(s.billing_cycle);
      yearly += amt * f;
      monthly += (amt * f) / 12;
    }
    return { monthly, yearly, count: visible.filter((s: any) => s.active).length };
  }, [visible]);

  const toggle = useMutation({
    mutationFn: async (s: any) => {
      const { error } = await supabase.from("subscriptions").update({ active: !s.active }).eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subscriptions"] }); toast.success("Supprimé"); },
  });

  const provision = useMutation({
    mutationFn: async (s: any) => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const dueDate = s.next_billing_date ?? toISODate(new Date());
      const { data: prov, error } = await supabase.from("provisions").insert({
        user_id: uid,
        name: s.name,
        description: s.description ?? `Abonnement · ${s.name}`,
        counterparty_id: s.counterparty_id ?? null,
        subscription_id: s.id,
        wallet_id: s.wallet_id ?? null,
        budget_node_id: s.budget_node_id ?? null,
        amount: Number(s.amount) || 0,
        currency: s.currency ?? "MGA",
        direction: s.direction === "in" ? "in" : "out",
        due_date: dueDate,
        period_month: dueDate ? `${dueDate.slice(0, 7)}-01` : null,
        status: "planned",
      } as any).select().single();
      if (error) throw error;
      await bookProvisionTx(prov, uid);
      // Avance la prochaine échéance
      await supabase.from("subscriptions").update({
        next_billing_date: nextBilling(s.next_billing_date, s.billing_cycle),
        last_provisioned_month: dueDate.slice(0, 7) + "-01",
      }).eq("id", s.id);
    },
    onSuccess: () => { toast.success("Provision passée · voir Provisions"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Récurrent</p>
          <h1 className="mt-1 text-2xl font-semibold">Abonnements</h1>
          <p className="mt-1 text-xs text-muted-foreground">Bouton <strong>Passer une provision</strong> → constate la charge dans le budget sans mouvement de trésorerie. Réglage effectif depuis <Link to="/provisions" className="text-primary underline">Provisions</Link>.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Voir désactivés</label>
          <SubDialog wallets={wallets.data ?? []} nodes={nodesQ.data ?? []} cps={cps.data ?? []} onDone={() => qc.invalidateQueries({ queryKey: ["subscriptions"] })} />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Actifs" value={stats.count} icon={<Repeat className="h-4 w-4" />} />
        <StatCard label="Coût mensualisé" value={fmtMoney(stats.monthly)} tone="warning" />
        <StatCard label="Coût annualisé" value={fmtMoney(stats.yearly)} tone="negative" />
      </div>

      <Panel title={`${visible.length} abonnement${visible.length > 1 ? "s" : ""}`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Tiers</th>
                <th className="px-4 py-2">Cycle</th>
                <th className="px-4 py-2 text-right">Montant</th>
                <th className="px-4 py-2 text-right">Mensualisé</th>
                <th className="px-4 py-2">Prochaine échéance</th>
                <th className="px-4 py-2 w-56 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s: any) => {
                const cp = (cps.data ?? []).find((c) => c.id === s.counterparty_id);
                return (
                  <tr key={s.id} className={`border-t border-border/60 ${!s.active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{cp?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{cycleMeta(s.billing_cycle).label}</td>
                    <td className="num px-4 py-2 text-right">{fmtMoney(s.amount, s.currency ?? "MGA")}</td>
                    <td className="num px-4 py-2 text-right text-muted-foreground">{fmtMoney((Number(s.amount ?? 0) * cycleFactor(s.billing_cycle)) / 12, s.currency ?? "MGA")}</td>
                    <td className="px-4 py-2 text-xs">{fmtDate(s.next_billing_date)}</td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex justify-end items-center gap-1 text-muted-foreground">
                        {s.active && (
                          <Button size="sm" variant="outline" disabled={provision.isPending} onClick={() => provision.mutate(s)}>
                            <FileText className="mr-1 h-3.5 w-3.5" /> Passer une provision
                          </Button>
                        )}
                        <button title="Modifier" onClick={() => setEditing(s)} className="rounded-sm p-1 hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                        <button title={s.active ? "Désactiver" : "Activer"} onClick={() => toggle.mutate(s)} className="rounded-sm p-1 hover:bg-muted hover:text-foreground">{s.active ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}</button>
                        <button title="Supprimer" onClick={() => confirm(`Supprimer « ${s.name} » ?`) && del.mutate(s.id)} className="rounded-sm p-1 hover:bg-muted hover:text-negative"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground"><Calendar className="mx-auto mb-2 h-6 w-6 opacity-50" />Aucun abonnement.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {editing && <SubDialog editing={editing} wallets={wallets.data ?? []} nodes={nodesQ.data ?? []} cps={cps.data ?? []} onClose={() => setEditing(null)} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["subscriptions"] }); }} />}
    </div>
  );
}

function SubDialog({ editing, wallets, nodes, cps, onDone, onClose }: { editing?: any; wallets: any[]; nodes: any[]; cps: Counterparty[]; onDone: () => void; onClose?: () => void }) {
  const [open, setOpen] = useState(!!editing);
  const initialCp = editing?.counterparty_id ? cps.find((c) => c.id === editing.counterparty_id)?.name ?? "" : "";
  const [form, setForm] = useState({
    name: editing?.name ?? "",
    description: editing?.description ?? "",
    counterparty: initialCp,
    budget_node_id: (editing?.budget_node_id ?? null) as string | null,
    wallet_id: editing?.wallet_id ?? "",
    amount: String(editing?.amount ?? ""),
    currency: editing?.currency ?? "MGA",
    billing_cycle: editing?.billing_cycle ?? "monthly",
    direction: editing?.direction === "in" ? "in" : "out",
    next_billing_date: editing?.next_billing_date ?? toISODate(new Date()),
    notes: editing?.notes ?? "",
  });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const cpId = form.counterparty.trim() ? await ensureCounterparty(form.counterparty, cps) : null;
      const payload: any = {
        user_id: u.user!.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        counterparty_id: cpId,
        budget_node_id: form.budget_node_id,
        wallet_id: form.wallet_id || null,
        amount: Number(form.amount) || 0,
        currency: form.currency || "MGA",
        billing_cycle: form.billing_cycle,
        direction: form.direction,
        next_billing_date: form.next_billing_date || null,
        notes: form.notes.trim() || null,
        active: true,
      };
      if (editing) {
        const { error } = await supabase.from("subscriptions").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subscriptions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Enregistré"); setOpen(false); onClose?.(); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={editing ? true : open} onOpenChange={(v) => { setOpen(v); if (!v) onClose?.(); }}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouvel abonnement</Button></DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Modifier l'abonnement" : "Nouvel abonnement"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="Nom"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></F>
            <F label="Sens">
              <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="out">Charge</SelectItem>
                  <SelectItem value="in">Produit</SelectItem>
                </SelectContent>
              </Select>
            </F>
          </div>
          <F label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></F>
          <F label="Tiers"><CounterpartyPicker list={cps} value={form.counterparty} onChange={(v) => setForm({ ...form, counterparty: v })} /></F>
          <F label="Catégorie budgétaire">
            <NodePicker nodes={nodes} value={form.budget_node_id} onChange={(id) => setForm({ ...form, budget_node_id: id })} placeholder="Sélectionner…" />
          </F>
          <div className="grid grid-cols-3 gap-3">
            <F label="Montant"><Input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></F>
            <F label="Devise"><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></F>
            <F label="Cycle">
              <Select value={form.billing_cycle} onValueChange={(v) => setForm({ ...form, billing_cycle: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CYCLES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Prochaine échéance"><Input type="date" value={form.next_billing_date} onChange={(e) => setForm({ ...form, next_billing_date: e.target.value })} /></F>
            <F label="Portefeuille de paiement">
              <Select value={form.wallet_id || "none"} onValueChange={(v) => setForm({ ...form, wallet_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— à définir</SelectItem>
                  {wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
          </div>
          <F label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></F>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>;
}
