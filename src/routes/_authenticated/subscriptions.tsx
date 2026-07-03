import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Plus, Pencil, Trash2, Repeat, Power, PowerOff, Calendar } from "lucide-react";
import { toast } from "sonner";

const CYCLES = [
  { value: "monthly", label: "Mensuel", factor: 12 },
  { value: "quarterly", label: "Trimestriel", factor: 4 },
  { value: "semiannual", label: "Semestriel", factor: 2 },
  { value: "yearly", label: "Annuel", factor: 1 },
  { value: "weekly", label: "Hebdomadaire", factor: 52 },
];

function cycleFactor(c: string) {
  return CYCLES.find((x) => x.value === (c ?? "monthly").toLowerCase())?.factor ?? 12;
}

export const Route = createFileRoute("/_authenticated/subscriptions")({
  head: () => ({ meta: [{ title: "Abonnements — Personal CFO" }] }),
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [showInactive, setShowInactive] = useState(false);

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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Récurrent</p>
          <h1 className="mt-1 text-2xl font-semibold">Abonnements</h1>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Voir désactivés</label>
          <SubDialog onDone={() => qc.invalidateQueries({ queryKey: ["subscriptions"] })} />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Actifs" value={stats.count} icon={<Repeat className="h-4 w-4" />} />
        <StatCard label="Coût mensualisé" value={fmtMoney(stats.monthly)} tone="warning" />
        <StatCard label="Coût annualisé" value={fmtMoney(stats.yearly)} tone="negative" />
      </div>

      <Panel title={`${visible.length} abonnement${visible.length > 1 ? "s" : ""}`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nom</th><th className="px-4 py-2">Catégorie</th>
                <th className="px-4 py-2">Cycle</th><th className="px-4 py-2 text-right">Montant</th>
                <th className="px-4 py-2 text-right">Mensualisé</th><th className="px-4 py-2">Prochaine échéance</th>
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s: any) => (
                <tr key={s.id} className={`border-t border-border/60 ${!s.active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{s.category ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{CYCLES.find((c) => c.value === s.billing_cycle)?.label ?? s.billing_cycle}</td>
                  <td className="num px-4 py-2 text-right">{fmtMoney(s.amount, s.currency ?? "MGA")}</td>
                  <td className="num px-4 py-2 text-right text-muted-foreground">{fmtMoney((Number(s.amount ?? 0) * cycleFactor(s.billing_cycle)) / 12, s.currency ?? "MGA")}</td>
                  <td className="px-4 py-2 text-xs">{fmtDate(s.next_billing_date)}</td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex justify-end gap-0.5 text-muted-foreground">
                      <button title="Modifier" onClick={() => setEditing(s)} className="rounded-sm p-1 hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                      <button title={s.active ? "Désactiver" : "Activer"} onClick={() => toggle.mutate(s)} className="rounded-sm p-1 hover:bg-muted hover:text-foreground">{s.active ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}</button>
                      <button title="Supprimer" onClick={() => confirm(`Supprimer « ${s.name} » ?`) && del.mutate(s.id)} className="rounded-sm p-1 hover:bg-muted hover:text-negative"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground"><Calendar className="mx-auto mb-2 h-6 w-6 opacity-50" />Aucun abonnement.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {editing && <SubDialog editing={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["subscriptions"] }); }} />}
    </div>
  );
}

function SubDialog({ editing, onDone, onClose }: { editing?: any; onDone: () => void; onClose?: () => void }) {
  const [open, setOpen] = useState(!!editing);
  const [form, setForm] = useState(editing ? {
    name: editing.name, amount: String(editing.amount ?? ""), currency: editing.currency ?? "MGA",
    billing_cycle: editing.billing_cycle ?? "monthly", next_billing_date: editing.next_billing_date ?? "",
    category: editing.category ?? "", notes: editing.notes ?? "",
  } : { name: "", amount: "", currency: "MGA", billing_cycle: "monthly", next_billing_date: "", category: "", notes: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        user_id: u.user!.id,
        name: form.name.trim(),
        amount: Number(form.amount) || 0,
        currency: form.currency || "MGA",
        billing_cycle: form.billing_cycle,
        next_billing_date: form.next_billing_date || null,
        category: form.category.trim() || null,
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
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Modifier l'abonnement" : "Nouvel abonnement"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="space-y-1"><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Montant</Label><Input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
            <div className="space-y-1"><Label>Devise</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-1"><Label>Cycle</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.billing_cycle} onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}>
                {CYCLES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Prochaine échéance</Label><Input type="date" value={form.next_billing_date} onChange={(e) => setForm({ ...form, next_billing_date: e.target.value })} /></div>
            <div className="space-y-1"><Label>Catégorie</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Streaming, télécoms…" /></div>
          </div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
