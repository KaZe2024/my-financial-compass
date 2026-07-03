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
import { Plus, Pencil, Trash2, CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/provisions")({
  head: () => ({ meta: [{ title: "Provisions — Personal CFO" }] }),
  component: ProvisionsPage,
});

function ProvisionsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<"open" | "all">("open");

  const provisions = useQuery({
    queryKey: ["provisions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("provisions").select("*").order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const visible = (provisions.data ?? []).filter((p: any) => statusFilter === "all" || p.status !== "settled");

  const stats = useMemo(() => {
    let inflow = 0, outflow = 0;
    for (const p of visible) {
      if (p.status === "settled") continue;
      const a = Number(p.amount ?? 0);
      if (p.direction === "in") inflow += a; else outflow += a;
    }
    return { inflow, outflow, net: inflow - outflow, count: visible.filter((p: any) => p.status !== "settled").length };
  }, [visible]);

  const settle = useMutation({
    mutationFn: async (p: any) => {
      const { error } = await supabase.from("provisions").update({ status: "settled", settled_at: new Date().toISOString() }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["provisions"] }); toast.success("Provision soldée"); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("provisions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["provisions"] }); toast.success("Supprimé"); },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Trésorerie prévisionnelle</p>
          <h1 className="mt-1 text-2xl font-semibold">Provisions</h1>
          <p className="mt-1 text-xs text-muted-foreground">Constate un flux avant qu'il n'affecte réellement la trésorerie (salaire en attente, facture à recevoir…).</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="open">En cours</option>
            <option value="all">Toutes</option>
          </select>
          <ProvDialog onDone={() => qc.invalidateQueries({ queryKey: ["provisions"] })} />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Ouvertes" value={stats.count} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Entrées provisionnées" value={fmtMoney(stats.inflow)} tone="positive" />
        <StatCard label="Sorties provisionnées" value={fmtMoney(stats.outflow)} tone="negative" />
        <StatCard label="Net attendu" value={fmtMoney(stats.net, "MGA", { sign: true })} tone={stats.net >= 0 ? "positive" : "negative"} />
      </div>

      <Panel title={`${visible.length} provision${visible.length > 1 ? "s" : ""}`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nom</th><th className="px-4 py-2">Catégorie</th>
                <th className="px-4 py-2">Sens</th><th className="px-4 py-2 text-right">Montant</th>
                <th className="px-4 py-2">Échéance</th><th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p: any) => (
                <tr key={p.id} className={`border-t border-border/60 ${p.status === "settled" ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.category ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">{p.direction === "in" ? "↓ Entrée" : "↑ Sortie"}</td>
                  <td className={`num px-4 py-2 text-right font-medium ${p.direction === "in" ? "text-positive" : "text-negative"}`}>{fmtMoney(p.amount, p.currency ?? "MGA")}</td>
                  <td className="px-4 py-2 text-xs">{fmtDate(p.due_date)}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{p.status === "settled" ? "Soldée" : "En cours"}</td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex justify-end gap-0.5 text-muted-foreground">
                      {p.status !== "settled" && (
                        <button title="Solder" onClick={() => settle.mutate(p)} className="rounded-sm p-1 hover:bg-muted hover:text-positive"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                      )}
                      <button title="Modifier" onClick={() => setEditing(p)} className="rounded-sm p-1 hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                      <button title="Supprimer" onClick={() => confirm(`Supprimer « ${p.name} » ?`) && del.mutate(p.id)} className="rounded-sm p-1 hover:bg-muted hover:text-negative"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Aucune provision.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {editing && <ProvDialog editing={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["provisions"] }); }} />}
    </div>
  );
}

function ProvDialog({ editing, onDone, onClose }: { editing?: any; onDone: () => void; onClose?: () => void }) {
  const [open, setOpen] = useState(!!editing);
  const [form, setForm] = useState(editing ? {
    name: editing.name, category: editing.category ?? "", amount: String(editing.amount ?? ""),
    currency: editing.currency ?? "MGA", direction: editing.direction ?? "out", due_date: editing.due_date ?? "",
    notes: editing.notes ?? "",
  } : { name: "", category: "", amount: "", currency: "MGA", direction: "out", due_date: "", notes: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        user_id: u.user!.id,
        name: form.name.trim(),
        category: form.category.trim() || null,
        amount: Number(form.amount) || 0,
        currency: form.currency || "MGA",
        direction: form.direction,
        due_date: form.due_date || null,
        notes: form.notes.trim() || null,
        status: "planned" as const,
      };
      if (editing) {
        const { error } = await supabase.from("provisions").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("provisions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Enregistré"); setOpen(false); onClose?.(); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={editing ? true : open} onOpenChange={(v) => { setOpen(v); if (!v) onClose?.(); }}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouvelle provision</Button></DialogTrigger>}
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Modifier la provision" : "Nouvelle provision"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="space-y-1"><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Sens</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                <option value="in">Entrée attendue</option>
                <option value="out">Sortie à venir</option>
              </select>
            </div>
            <div className="space-y-1"><Label>Montant</Label><Input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
            <div className="space-y-1"><Label>Devise</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Échéance</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            <div className="space-y-1"><Label>Catégorie</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          </div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
