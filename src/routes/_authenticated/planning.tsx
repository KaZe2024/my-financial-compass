import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { offlineUpdate } from "@/lib/offline/mutations";
import { PlanItemDialog } from "@/components/planning/plan-item-dialog";
import { PlanTypeManager } from "@/components/planning/plan-type-manager";
import {
  addDays, endOfMonth, fmtDayLabel, fmtTimeRange, isClosed, monthGrid, occurrencesInRange,
  planItemTagsQO, planItemsQO, planProjectsQO, planTagsQO, planTypesQO, priorityMeta, qkPlanItems,
  startOfMonth, startOfWeek, statusMeta, STATUSES, ymd, parseYmd, type PlanItem,
} from "@/lib/planning";
import {
  CalendarDays, CalendarRange, CalendarClock, ListChecks, Clock, ChevronLeft, ChevronRight,
  Plus, Settings2, MapPin, User, Grid2X2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/planning")({
  head: () => ({
    meta: [
      { title: "Planification journalière — OPTIS" },
      { name: "description", content: "Planifiez vos tâches, appels, réunions et habitudes en vue mensuelle, hebdomadaire ou journalière, en checklist ou timeline." },
      { property: "og:title", content: "Planification journalière — OPTIS" },
      { property: "og:description", content: "Calendrier mensuel, hebdomadaire et journalier, checklist ou timeline, matrice d'Eisenhower et suivi de projets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Planification journalière — OPTIS" },
      { name: "twitter:description", content: "Organisez vos journées : tâches, appels, réunions, habitudes et projets." },
    ],
  }),
  component: PlanningPage,
});

type Mode = "month" | "week" | "day";
type Style = "checklist" | "timeline";

function PlanningPage() {
  const qc = useQueryClient();
  const items = useQuery(planItemsQO);
  const types = useQuery(planTypesQO);
  const tags = useQuery(planTagsQO);
  const itemTags = useQuery(planItemTagsQO);
  const projects = useQuery(planProjectsQO);

  const [mode, setMode] = useState<Mode>("week");
  const [style, setStyle] = useState<Style>("checklist");
  const [anchor, setAnchor] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>(ymd(new Date()));
  const [managerOpen, setManagerOpen] = useState(false);
  const [showEisenhower, setShowEisenhower] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const typeById = useMemo(() => new Map((types.data ?? []).map((t) => [t.id, t])), [types.data]);
  const tagById = useMemo(() => new Map((tags.data ?? []).map((t) => [t.id, t])), [tags.data]);
  const projectById = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p])), [projects.data]);
  const tagsOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of itemTags.data ?? []) {
      const arr = m.get(l.item_id) ?? [];
      arr.push(l.tag_id);
      m.set(l.item_id, arr);
    }
    return m;
  }, [itemTags.data]);

  const range = useMemo(() => {
    if (mode === "month") {
      const grid = monthGrid(anchor);
      return { from: grid[0], to: grid[grid.length - 1], days: grid };
    }
    if (mode === "week") {
      const s = startOfWeek(anchor);
      const days = Array.from({ length: 7 }, (_, i) => addDays(s, i));
      return { from: days[0], to: days[6], days };
    }
    const d = new Date(anchor);
    d.setHours(0, 0, 0, 0);
    return { from: d, to: d, days: [d] };
  }, [mode, anchor]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items.data ?? []).filter((i) => {
      if (q && !`${i.title} ${i.notes ?? ""} ${i.location ?? ""}`.toLowerCase().includes(q)) return false;
      if (typeFilter !== "all" && i.type_id !== typeFilter) return false;
      if (projectFilter !== "all" && i.project_id !== projectFilter) return false;
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      return true;
    });
  }, [items.data, search, typeFilter, projectFilter, statusFilter]);

  const byDay = useMemo(() => {
    const m = new Map<string, PlanItem[]>();
    for (const it of filtered) {
      for (const d of occurrencesInRange(it, range.from, range.to)) {
        const arr = m.get(d) ?? [];
        arr.push(it);
        m.set(d, arr);
      }
    }
    for (const [, arr] of m) {
      arr.sort((a, b) => {
        const at = a.all_day ? "00:00" : a.start_time ?? "99:99";
        const bt = b.all_day ? "00:00" : b.start_time ?? "99:99";
        return at.localeCompare(bt);
      });
    }
    return m;
  }, [filtered, range]);

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await offlineUpdate("plan_items", id, {
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
      });
      if (!res.ok) throw new Error(res.error ?? "Erreur");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qkPlanItems }),
    onError: (e: Error) => toast.error(e.message),
  });

  const shift = (dir: number) => {
    if (mode === "month") setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
    else if (mode === "week") setAnchor(addDays(anchor, dir * 7));
    else setAnchor(addDays(anchor, dir));
  };

  const openNew = (date: string) => { setEditing(null); setDefaultDate(date); setDialogOpen(true); };
  const openEdit = (it: PlanItem) => { setEditing(it); setDialogOpen(true); };

  const periodLabel = mode === "month"
    ? anchor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : mode === "week"
      ? `${range.from.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} – ${range.to.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`
      : fmtDayLabel(range.from);

  const stats = useMemo(() => {
    const all = Array.from(byDay.values()).flat();
    const uniq = new Map(all.map((i) => [i.id, i]));
    const list = Array.from(uniq.values());
    return {
      total: list.length,
      done: list.filter((i) => i.status === "done").length,
      open: list.filter((i) => !isClosed(i.status)).length,
    };
  }, [byDay]);

  const itemCard = (it: PlanItem, dateKey: string, compact = false) => {
    const t = it.type_id ? typeById.get(it.type_id) : null;
    const p = it.project_id ? projectById.get(it.project_id) : null;
    const closed = isClosed(it.status);
    const sm = statusMeta(it.status);
    return (
      <button
        key={`${it.id}-${dateKey}`}
        onClick={() => openEdit(it)}
        className={cn(
          "w-full rounded-sm border border-border bg-surface-2/40 px-2 py-1.5 text-left transition-colors hover:bg-surface-2",
          closed && "opacity-60",
        )}
        style={t ? { borderLeft: `3px solid ${t.color}` } : undefined}
      >
        <div className="flex items-start gap-2">
          <span className={cn("truncate text-xs font-medium", it.status === "done" && "line-through")}>{it.title}</span>
          <span className={cn("ml-auto shrink-0 rounded-sm px-1 py-0.5 text-[9px]", sm.className)}>{sm.label}</span>
        </div>
        {!compact && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTimeRange(it)}</span>
            {t && <span style={{ color: t.color }}>{t.name}</span>}
            {p && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />{p.name}</span>}
            {it.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{it.location}</span>}
            {it.person_label && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{it.person_label}</span>}
            <span className={priorityMeta(it.priority).className}>{priorityMeta(it.priority).label}</span>
            {(tagsOf.get(it.id) ?? []).map((tid) => {
              const tg = tagById.get(tid);
              if (!tg) return null;
              return <span key={tid} className="rounded-full px-1.5" style={{ backgroundColor: `${tg.color}22`, color: tg.color }}>{tg.name}</span>;
            })}
          </div>
        )}
      </button>
    );
  };

  const checklistRow = (it: PlanItem, dateKey: string) => {
    const t = it.type_id ? typeById.get(it.type_id) : null;
    const p = it.project_id ? projectById.get(it.project_id) : null;
    return (
      <div key={`${it.id}-${dateKey}`} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0">
        <input
          type="checkbox"
          checked={it.status === "done"}
          onChange={(e) => setStatus.mutate({ id: it.id, status: e.target.checked ? "done" : "todo" })}
          className="h-4 w-4 accent-primary"
        />
        <button onClick={() => openEdit(it)} className="min-w-0 flex-1 text-left">
          <div className={cn("truncate text-sm", it.status === "done" && "text-muted-foreground line-through")}>{it.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTimeRange(it)}</span>
            {t && <span style={{ color: t.color }}>{t.name}</span>}
            {p && <span>{p.name}</span>}
            {it.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{it.location}</span>}
            {(tagsOf.get(it.id) ?? []).map((tid) => {
              const tg = tagById.get(tid);
              if (!tg) return null;
              return <span key={tid} className="rounded-full px-1.5" style={{ backgroundColor: `${tg.color}22`, color: tg.color }}>{tg.name}</span>;
            })}
          </div>
        </button>
        <Select value={it.status} onValueChange={(v) => setStatus.mutate({ id: it.id, status: v })}>
          <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const timelineDay = (d: Date) => {
    const key = ymd(d);
    const list = byDay.get(key) ?? [];
    const timed = list.filter((i) => !i.all_day && !i.no_fixed_time && i.start_time);
    const untimed = list.filter((i) => i.all_day || i.no_fixed_time || !i.start_time);
    return (
      <div key={key} className="min-w-0">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })}
          </div>
          <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => openNew(key)}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
        {untimed.length > 0 && (
          <div className="mb-2 space-y-1">{untimed.map((it) => itemCard(it, key, true))}</div>
        )}
        <div className="relative border-l border-border pl-3">
          {timed.length === 0 && <div className="py-3 text-[11px] text-muted-foreground">Rien à l'heure fixe</div>}
          {timed.map((it) => (
            <div key={`${it.id}-${key}`} className="relative mb-2">
              <span className="absolute -left-[17px] top-2 h-2 w-2 rounded-full bg-primary" />
              <div className="mb-0.5 font-mono text-[10px] text-muted-foreground">{it.start_time?.slice(0, 5)}</div>
              {itemCard(it, key)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const eisenhowerItems = useMemo(() => {
    const all = Array.from(byDay.values()).flat();
    const uniq = new Map(all.map((i) => [i.id, i]));
    return Array.from(uniq.values()).filter((i) => {
      const t = i.type_id ? typeById.get(i.type_id) : null;
      return t ? t.in_eisenhower : false;
    });
  }, [byDay, typeById]);

  const quadrant = (u: boolean, imp: boolean) => eisenhowerItems.filter((i) => i.urgent === u && i.important === imp);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Planification journalière</h1>
          <p className="text-xs text-muted-foreground">{stats.total} élément(s) sur la période · {stats.open} en attente · {stats.done} terminé(s)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setManagerOpen(true)}><Settings2 className="mr-1.5 h-4 w-4" /> Types & tags</Button>
          <Button size="sm" onClick={() => openNew(ymd(mode === "day" ? anchor : new Date()))}><Plus className="mr-1.5 h-4 w-4" /> Planifier</Button>
        </div>
      </div>

      <Panel title="Vue" className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-sm border border-border p-0.5">
            {([["month", "Mensuel", CalendarDays], ["week", "Hebdo", CalendarRange], ["day", "Journalier", CalendarClock]] as const).map(([m, l, Icon]) => (
              <button key={m} onClick={() => setMode(m)}
                className={cn("inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs", mode === m ? "bg-primary/15 text-foreground" : "text-muted-foreground")}>
                <Icon className="h-3.5 w-3.5" /> {l}
              </button>
            ))}
          </div>
          <div className="flex rounded-sm border border-border p-0.5">
            {([["checklist", "Checklist", ListChecks], ["timeline", "Timeline", Clock]] as const).map(([s, l, Icon]) => (
              <button key={s} onClick={() => setStyle(s)}
                className={cn("inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs", style === s ? "bg-primary/15 text-foreground" : "text-muted-foreground")}>
                <Icon className="h-3.5 w-3.5" /> {l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>Aujourd'hui</Button>
            <Button variant="outline" size="sm" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{periodLabel}</div>
          <Button variant={showEisenhower ? "default" : "outline"} size="sm" onClick={() => setShowEisenhower((v) => !v)}>
            <Grid2X2 className="mr-1.5 h-4 w-4" /> Matrice Eisenhower
          </Button>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <Input placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              {(types.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Projet" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les projets</SelectItem>
              {(projects.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Situation" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les situations</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Panel>

      {showEisenhower && (
        <Panel title="Matrice d'Eisenhower" subtitle="Basée sur les types marqués « Eisenhower »">
          <div className="grid gap-3 p-3 md:grid-cols-2">
            {([
              [true, true, "Urgent & Important — Faire maintenant", "border-red-500/40"],
              [false, true, "Important, non urgent — Planifier", "border-emerald-500/40"],
              [true, false, "Urgent, non important — Déléguer", "border-amber-500/40"],
              [false, false, "Ni urgent ni important — Éliminer", "border-border"],
            ] as [boolean, boolean, string, string][]).map(([u, imp, label, cls]) => (
              <div key={label} className={cn("rounded-sm border bg-surface-2/30 p-2", cls)}>
                <div className="mb-2 text-xs font-semibold">{label} <span className="text-muted-foreground">({quadrant(u, imp).length})</span></div>
                <div className="space-y-1">
                  {quadrant(u, imp).map((it) => itemCard(it, "eis"))}
                  {quadrant(u, imp).length === 0 && <div className="py-2 text-[11px] text-muted-foreground">Vide</div>}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {mode === "month" && (
        <Panel title="Vue mensuelle">
          {style === "checklist" ? (
            <div>
              <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center font-mono text-[10px] uppercase text-muted-foreground">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => <div key={d} className="py-1.5">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {range.days.map((d) => {
                  const key = ymd(d);
                  const list = byDay.get(key) ?? [];
                  const outside = d.getMonth() !== anchor.getMonth();
                  const today = key === ymd(new Date());
                  return (
                    <div key={key} className={cn("min-h-[104px] border-b border-r border-border p-1.5", outside && "bg-muted/20 opacity-60")}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className={cn("text-[11px]", today && "rounded-full bg-primary px-1.5 text-primary-foreground")}>{d.getDate()}</span>
                        <button className="text-muted-foreground hover:text-foreground" onClick={() => openNew(key)}><Plus className="h-3 w-3" /></button>
                      </div>
                      <div className="space-y-1">
                        {list.slice(0, 4).map((it) => itemCard(it, key, true))}
                        {list.length > 4 && <button onClick={() => { setMode("day"); setAnchor(parseYmd(key)); }} className="text-[10px] text-primary">+{list.length - 4} autre(s)</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 p-3 md:grid-cols-2 xl:grid-cols-3">
              {range.days.filter((d) => (byDay.get(ymd(d)) ?? []).length > 0).map(timelineDay)}
              {range.days.every((d) => (byDay.get(ymd(d)) ?? []).length === 0) && (
                <div className="py-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">Aucun élément planifié ce mois-ci.</div>
              )}
            </div>
          )}
        </Panel>
      )}

      {mode === "week" && (
        <Panel title="Vue hebdomadaire">
          {style === "checklist" ? (
            <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
              {range.days.map((d) => {
                const key = ymd(d);
                const list = byDay.get(key) ?? [];
                const today = key === ymd(new Date());
                return (
                  <div key={key} className={cn("rounded-sm border border-border", today && "border-primary/60")}>
                    <div className="flex items-center justify-between border-b border-border bg-muted/40 px-2 py-1.5">
                      <span className="text-xs font-semibold">{d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })}</span>
                      <button className="text-muted-foreground hover:text-foreground" onClick={() => openNew(key)}><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                    {list.length === 0
                      ? <div className="px-2 py-4 text-center text-[11px] text-muted-foreground">Rien de planifié</div>
                      : list.map((it) => checklistRow(it, key))}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-4 p-3 md:grid-cols-2 xl:grid-cols-4">{range.days.map(timelineDay)}</div>
          )}
        </Panel>
      )}

      {mode === "day" && (
        <Panel title={fmtDayLabel(range.from)}>
          {style === "checklist" ? (
            <div>
              {(byDay.get(ymd(range.from)) ?? []).length === 0
                ? <div className="px-3 py-8 text-center text-sm text-muted-foreground">Rien de planifié ce jour.</div>
                : (byDay.get(ymd(range.from)) ?? []).map((it) => checklistRow(it, ymd(range.from)))}
            </div>
          ) : (
            <div className="p-3">{timelineDay(range.from)}</div>
          )}
        </Panel>
      )}

      <PlanItemDialog open={dialogOpen} onOpenChange={setDialogOpen} item={editing} defaultDate={defaultDate} />
      <PlanTypeManager open={managerOpen} onOpenChange={setManagerOpen} />
    </div>
  );
}
