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

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "Projets — Personal CFO" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await supabase.from("projects").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Planification</p>
          <h1 className="mt-1 text-2xl font-semibold">Projets financiers</h1>
        </div>
        <AddDialog onDone={() => qc.invalidateQueries({ queryKey: ["projects"] })} />
      </header>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(projects.data ?? []).map((p: any) => {
          const pct = Number(p.target_amount) > 0 ? (Number(p.current_amount) / Number(p.target_amount)) * 100 : 0;
          return (
            <div key={p.id} className="rounded-md border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> {p.name}</div>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{p.status}</span>
              </div>
              {p.description && <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>}
              <div className="num mt-3 text-2xl font-semibold">{fmtMoney(Number(p.current_amount), p.currency)}</div>
              <div className="num text-xs text-muted-foreground">sur {fmtMoney(Number(p.target_amount), p.currency)} · {fmtPct(pct)}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              {p.target_date && <div className="mt-2 text-xs text-muted-foreground">Objectif · {fmtDate(p.target_date)}</div>}
            </div>
          );
        })}
        {(projects.data ?? []).length === 0 && (
          <Panel title="Démarrer" className="md:col-span-2 lg:col-span-3">
            <p className="py-8 text-center text-sm text-muted-foreground">Créez un projet (maison, voiture, voyage...).</p>
          </Panel>
        )}
      </div>
    </div>
  );
}

function AddDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", target: "0", current: "0", currency: "MGA", target_date: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("projects").insert({
        user_id: u.user!.id, name: form.name, description: form.description || null,
        target_amount: Number(form.target || 0), current_amount: Number(form.current || 0),
        currency: form.currency, target_date: form.target_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Projet créé"); setOpen(false); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouveau projet</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau projet</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <F label="Nom"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></F>
          <F label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Cible"><Input type="number" step="any" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required /></F>
            <F label="Déjà épargné"><Input type="number" step="any" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></F>
          </div>
          <F label="Date objectif"><Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></F>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Créer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function F({ label, children }: any) { return <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>; }
