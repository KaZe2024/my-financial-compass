import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { offlineInsert, offlineUpdate, offlineDelete } from "@/lib/offline/mutations";
import { PlanItemDialog } from "@/components/planning/plan-item-dialog";
import {
  PRIORITIES, STATUSES, isClosed, planItemsQO, planProjectsQO, projectProgress, qkPlanItems,
  qkPlanProjects, statusMeta, type PlanItem, type PlanProject,
} from "@/lib/planning";
import { Plus, Pencil, Trash2, Archive, ArchiveRestore } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/plan-projects")({
  head: () => ({
    meta: [
      { title: "Projets planifiés — OPTIS" },
      { name: "description", content: "Suivez l'avancement de vos projets en pourcentage d'éléments planifiés traités : terminés, échecs ou annulés." },
      { property: "og:title", content: "Projets planifiés — OPTIS" },
      { property: "og:description", content: "Avancement des projets, priorités et situation des tâches planifiées." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Projets planifiés — OPTIS" },
      { name: "twitter:description", content: "Avancement des projets et de leurs tâches planifiées." },
    ],
  }),
  component: PlanProjectsPage,
});

function PlanProjectsPage() {
  const qc = useQueryClient();
  const projects = useQuery(planProjectsQO);
  const items = useQuery(planItemsQO);

  const [editing, setEditing] = useState<PlanProject | null>(null);
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item: PlanItem | null; projectId: string | null }>({ open: false, item: null, projectId: null });

  const itemsByProject = useMemo(() => {
    const m = new Map<string, PlanItem[]>();
    for (const i of items.data ?? []) {
      if (!i.project_id) continue;
      const arr = m.get(i.project_id) ?? [];
      arr.push(i);
      m.set(i.project_id, arr);
    }
    return m;
  }, [items.data]);

  const list = (projects.data ?? []).filter((p) => showArchived || !p.archived);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await offlineDelete("plan_projects", id);
      if (!res.ok) throw new Error(res.error ?? "Erreur");
    },
    onSuccess: () => { toast.success("Projet supprimé"); qc.invalidateQueries({ queryKey: qkPlanProjects }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleArchive = useMutation({
    mutationFn: async (p: PlanProject) => {
      const res = await offlineUpdate("plan_projects", p.id, { archived: !p.archived });
      if (!res.ok) throw new Error(res.error ?? "Erreur");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qkPlanProjects }),
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = useMemo(() => {
    const all = (items.data ?? []).filter((i) => i.project_id);
    return { total: all.length, closed: all.filter((i) => isClosed(i.status)).length };
  }, [items.data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Projets planifiés</h1>
          <p className="text-xs text-muted-foreground">{list.length} projet(s) · {totals.closed}/{totals.total} élément(s) traité(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Masquer archivés" : "Voir archivés"}
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1.5 h-4 w-4" /> Nouveau projet</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => {
          const pi = itemsByProject.get(p.id) ?? [];
          const prog = projectProgress(pi);
          const sm = statusMeta(p.status);
          return (
            <div key={p.id} className={cn("rounded-sm border border-border bg-surface-2/30 p-3", p.archived && "opacity-60")} style={{ borderTop: `3px solid ${p.color}` }}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{p.name}</div>
                  {p.description && <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{p.description}</div>}
                </div>
                <span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 text-[10px]", sm.className)}>{sm.label}</span>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Avancement</span><span>{prog.pct}% ({prog.closed}/{prog.total})</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${prog.pct}%` }} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span className="text-emerald-400">Terminé {prog.done}</span>
                  <span className="text-red-400">Échec {prog.failed}</span>
                  <span className="text-amber-400">Annulé {prog.cancelled}</span>
                  <span>Restant {prog.open}</span>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <span>Priorité : {PRIORITIES.find((x) => x.value === p.priority)?.label}</span>
                {p.start_date && <span>Début {p.start_date}</span>}
                {p.due_date && <span>Échéance {p.due_date}</span>}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                  {expanded === p.id ? "Masquer" : `Éléments (${prog.total})`}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setItemDialog({ open: true, item: null, projectId: p.id })}>
                  <Plus className="mr-1 h-3 w-3" /> Élément
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => toggleArchive.mutate(p)}>
                  {p.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => remove.mutate(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>

              {expanded === p.id && (
                <div className="mt-2 divide-y divide-border rounded-sm border border-border">
                  {pi.length === 0 && <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">Aucun élément.</div>}
                  {pi.map((it) => (
                    <button key={it.id} onClick={() => setItemDialog({ open: true, item: it, projectId: p.id })} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-surface-2">
                      <span className={cn("truncate text-xs", it.status === "done" && "text-muted-foreground line-through")}>{it.title}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{it.scheduled_on}</span>
                      <span className={cn("shrink-0 rounded-sm px-1 py-0.5 text-[9px]", statusMeta(it.status).className)}>{statusMeta(it.status).label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <Panel title="Projets"><div className="px-3 py-8 text-center text-sm text-muted-foreground">Aucun projet planifié pour l'instant.</div></Panel>
        )}
      </div>

      <ProjectDialog open={open} onOpenChange={setOpen} project={editing} />
      <PlanItemDialog
        open={itemDialog.open}
        onOpenChange={(v) => setItemDialog((s) => ({ ...s, open: v }))}
        item={itemDialog.item}
        defaultProjectId={itemDialog.projectId}
      />
    </div>
  );
}

function ProjectDialog({ open, onOpenChange, project }: { open: boolean; onOpenChange: (v: boolean) => void; project: PlanProject | null }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("in_progress");
  const [priority, setPriority] = useState("medium");
  const [color, setColor] = useState("#22c55e");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setStatus(project?.status ?? "in_progress");
    setPriority(project?.priority ?? "medium");
    setColor(project?.color ?? "#22c55e");
    setStartDate(project?.start_date ?? "");
    setDueDate(project?.due_date ?? "");
  }, [open, project?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nom obligatoire");
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        status, priority, color,
        start_date: startDate || null,
        due_date: dueDate || null,
      };
      const res = project ? await offlineUpdate("plan_projects", project.id, payload) : await offlineInsert("plan_projects", payload);
      if (!res.ok) throw new Error(res.error ?? "Erreur");
    },
    onSuccess: () => {
      toast.success(project ? "Projet mis à jour" : "Projet créé");
      qc.invalidateQueries({ queryKey: qkPlanProjects });
      qc.invalidateQueries({ queryKey: qkPlanItems });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{project ? "Modifier le projet" : "Nouveau projet"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Situation</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Priorité</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Début</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>Échéance</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label>Couleur</Label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-20 p-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
