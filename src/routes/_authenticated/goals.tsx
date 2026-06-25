import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Target } from "lucide-react";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { toast } from "sonner";
import { RowActions } from "./assets";

export const Route = createFileRoute("/_authenticated/goals")({
  head: () => ({ meta: [{ title: "Objectifs — Personal CFO" }] }),
  component: GoalsPage,
});

function GoalsPage() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const goals = useQuery({
    queryKey: ["goals"],
    queryFn: async () => (await supabase.from("financial_goals").select("*").order("target_date", { nullsFirst: false })).data ?? [],
  });
  const visible = (goals.data ?? []).filter((g: any) => showArchived || !g.archived);
  const [editing, setEditing] = useState<any | null>(null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Planification</p>
          <h1 className="mt-1 text-2xl font-semibold">Objectifs financiers</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Masquer" : "Voir"} archivés</Button>
          <GoalDialog onDone={() => qc.invalidateQueries({ queryKey: ["goals"] })} />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((g: any) => {
          const pct = Number(g.target_amount) > 0 ? (Number(g.current_amount) / Number(g.target_amount)) * 100 : 0;
          return (
            <div key={g.id} className={`rounded-md border border-border bg-card p-4 ${g.archived ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" /> {g.name}</div>
                <RowActions table="financial_goals" id={g.id} archived={g.archived} onEdit={() => setEditing(g)} />
              </div>
              <div className="num mt-3 text-2xl font-semibold">{fmtMoney(Number(g.current_amount), g.currency)}</div>
              <div className="num text-xs text-muted-foreground">sur {fmtMoney(Number(g.target_amount), g.currency)} · {fmtPct(pct)}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              {g.target_date && <div className="mt-2 text-xs text-muted-foreground">Échéance · {fmtDate(g.target_date)}</div>}
            </div>
          );
        })}
        {visible.length === 0 && (
          <Panel title="Démarrer" className="md:col-span-2 lg:col-span-3">
            <p className="py-8 text-center text-sm text-muted-foreground">Définissez un objectif : fonds d'urgence, retraite, voyage...</p>
          </Panel>
        )}
      </div>

      {editing && <GoalDialog editing={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["goals"] }); }} />}
    </div>
  );
}

function GoalDialog({ editing, onDone, onClose }: { editing?: any; onDone: () => void; onClose?: () => void }) {
  const [open, setOpen] = useState(!editing ? false : true);
  const [form, setForm] = useState(editing ? {
    name: editing.name,
    target: String(editing.target_amount), current: String(editing.current_amount),
    currency: editing.currency, target_date: editing.target_date ?? "",
  } : { name: "", target: "0", current: "0", currency: "MGA", target_date: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        user_id: u.user!.id, name: form.name,
        target_amount: Number(form.target || 0), current_amount: Number(form.current || 0),
        currency: form.currency, target_date: form.target_date || null,
      };
      if (editing) {
        const { error } = await supabase.from("financial_goals").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("financial_goals").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Mis à jour" : "Créé"); setOpen(false); onClose?.(); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={editing ? true : open} onOpenChange={(v) => { setOpen(v); if (!v) onClose?.(); }}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouvel objectif</Button></DialogTrigger>}
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Modifier l'objectif" : "Nouvel objectif"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="space-y-1"><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Cible</Label><Input type="number" step="any" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required /></div>
            <div className="space-y-1"><Label>Déjà épargné</Label><Input type="number" step="any" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></div>
          </div>
          <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
