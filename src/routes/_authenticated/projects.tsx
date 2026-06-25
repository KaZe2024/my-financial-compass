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
import { Plus, Sparkles } from "lucide-react";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { toast } from "sonner";
import { RowActions } from "./assets";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "Projets — Personal CFO" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await supabase.from("projects").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const visible = (projects.data ?? []).filter((p: any) => showArchived || !p.archived);
  const [editing, setEditing] = useState<any | null>(null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Planification</p>
          <h1 className="mt-1 text-2xl font-semibold">Projets financiers</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Masquer" : "Voir"} archivés</Button>
          <ProjectDialog onDone={() => qc.invalidateQueries({ queryKey: ["projects"] })} />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((p: any) => {
          const envelope = Number(p.envelope_balance ?? 0);
          const spent = Number(p.total_spent ?? 0);
          const pct = Number(p.target_amount) > 0 ? (spent / Number(p.target_amount)) * 100 : 0;
          return (
            <div key={p.id} className={`rounded-md border border-border bg-card p-4 ${p.archived ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> {p.name}</div>
                <div className="flex items-center gap-1">
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{p.archived ? "archivé" : p.status}</span>
                  <RowActions table="projects" id={p.id} archived={p.archived} onEdit={() => setEditing(p)} linkedTxId={p.linked_transaction_id} />
                </div>
              </div>
              {p.description && <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>}
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="font-mono uppercase tracking-widest text-muted-foreground">Enveloppe</div>
                  <div className={`num text-lg font-semibold ${envelope < 0 ? "text-negative" : ""}`}>{fmtMoney(envelope, p.currency)}</div>
                </div>
                <div>
                  <div className="font-mono uppercase tracking-widest text-muted-foreground">Dépensé</div>
                  <div className="num text-lg font-semibold">{fmtMoney(spent, p.currency)}</div>
                </div>
              </div>
              <div className="num mt-3 text-xs text-muted-foreground">Cible · {fmtMoney(Number(p.target_amount), p.currency)} · {fmtPct(pct)}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              {envelope < 0 && <div className="mt-2 text-xs text-warning">⚠ Emprunt à l'enveloppe en cours · {fmtMoney(Math.abs(envelope), p.currency)}</div>}
              {p.target_date && <div className="mt-2 text-xs text-muted-foreground">Objectif · {fmtDate(p.target_date)}</div>}
            </div>
          );
        })}
        {visible.length === 0 && (
          <Panel title="Démarrer" className="md:col-span-2 lg:col-span-3">
            <p className="py-8 text-center text-sm text-muted-foreground">Créez un projet (maison, voiture, voyage...).</p>
          </Panel>
        )}
      </div>

      {editing && <ProjectDialog editing={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["projects"] }); }} />}
    </div>
  );
}

function ProjectDialog({ editing, onDone, onClose }: { editing?: any; onDone: () => void; onClose?: () => void }) {
  const [open, setOpen] = useState(!editing ? false : true);
  const [form, setForm] = useState(editing ? {
    name: editing.name, description: editing.description ?? "",
    target: String(editing.target_amount), current: String(editing.current_amount),
    currency: editing.currency, target_date: editing.target_date ?? "",
  } : { name: "", description: "", target: "0", current: "0", currency: "MGA", target_date: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        user_id: u.user!.id, name: form.name, description: form.description || null,
        target_amount: Number(form.target || 0), current_amount: Number(form.current || 0),
        currency: form.currency, target_date: form.target_date || null,
      };
      if (editing) {
        const { error } = await supabase.from("projects").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("projects").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Mis à jour" : "Créé"); setOpen(false); onClose?.(); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={editing ? true : open} onOpenChange={(v) => { setOpen(v); if (!v) onClose?.(); }}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouveau projet</Button></DialogTrigger>}
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Modifier le projet" : "Nouveau projet"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <F label="Nom"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></F>
          <F label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Cible"><Input type="number" step="any" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required /></F>
            <F label="Déjà épargné"><Input type="number" step="any" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></F>
          </div>
          <F label="Date objectif"><Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></F>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function F({ label, children }: any) { return <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>; }
