import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { offlineInsert, offlineUpdate, offlineDelete, currentUserId } from "@/lib/offline/mutations";
import {
  fmtDay, qkSermons, sermonsQO, ymdLocal, flattenOutline, pruneOutline,
  SERMON_OUTLINE_MAX_DEPTH, type SermonNote, type SermonOutlineNode,
} from "@/lib/spiritual";
import { Mic, Plus, Pencil, Trash2, Star, Search, ChevronDown, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sermons")({
  head: () => ({
    meta: [
      { title: "Notes de sermon — OPTIS" },
      { name: "description", content: "Prenez des notes de sermon structurées : texte principal, idée maîtresse, plan par points, applications et citations." },
      { property: "og:title", content: "Notes de sermon — OPTIS" },
      { property: "og:description", content: "Un carnet de sermons clair et structuré : plan, versets clés, applications et suivi par série." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Notes de sermon — OPTIS" },
      { name: "twitter:description", content: "Notes de prédication structurées et faciles à relire." },
    ],
  }),
  component: SermonsPage,
});

type Draft = Partial<SermonNote> & { key_versesText?: string; tagsText?: string };

const newNode = (): SermonOutlineNode => ({ heading: "", notes: "", verses: [], children: [] });

/* --- helpers d'édition d'arbre (chemin = suite d'index) --- */
function updateAt(nodes: SermonOutlineNode[], path: number[], fn: (n: SermonOutlineNode) => SermonOutlineNode): SermonOutlineNode[] {
  const [i, ...rest] = path;
  return nodes.map((n, j) => {
    if (j !== i) return n;
    if (!rest.length) return fn(n);
    return { ...n, children: updateAt(n.children ?? [], rest, fn) };
  });
}
function removeAt(nodes: SermonOutlineNode[], path: number[]): SermonOutlineNode[] {
  const [i, ...rest] = path;
  if (!rest.length) return nodes.filter((_, j) => j !== i);
  return nodes.map((n, j) => (j === i ? { ...n, children: removeAt(n.children ?? [], rest) } : n));
}

const emptyDraft = (): Draft => ({
  preached_on: ymdLocal(new Date()),
  title: "",
  preacher: "",
  church: "",
  series: "",
  main_text: "",
  key_versesText: "",
  big_idea: "",
  outline: [newNode()],
  applications: "",
  quotes: "",
  prayer: "",
  tagsText: "",
  favorite: false,
});

function OutlineView({ nodes, depth = 1 }: { nodes: SermonOutlineNode[]; depth?: number }) {
  return (
    <ol className={cn("mt-1 space-y-1 pl-5", depth === 1 ? "list-decimal" : depth === 2 ? "list-[lower-alpha]" : "list-[lower-roman]")}>
      {nodes.map((o, i) => (
        <li key={i}>
          <span className="font-medium">{o.heading}</span>
          {(o.verses ?? []).length > 0 && (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-primary">{(o.verses ?? []).join(" · ")}</span>
          )}
          {o.notes && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{o.notes}</p>}
          {(o.children ?? []).length > 0 && <OutlineView nodes={o.children ?? []} depth={depth + 1} />}
        </li>
      ))}
    </ol>
  );
}

function outlineToLines(nodes: SermonOutlineNode[], prefix: number[]): string[] {
  const out: string[] = [];
  nodes.forEach((n, i) => {
    const num = [...prefix, i + 1];
    const indent = "  ".repeat(num.length - 1);
    out.push(`${indent}${num.join(".")}. ${n.heading}`);
    if (n.notes) out.push(...String(n.notes).split("\n").map((l) => `${indent}   ${l}`));
    if ((n.verses ?? []).length) out.push(`${indent}   [${(n.verses ?? []).join(" · ")}]`);
    out.push(...outlineToLines(n.children ?? [], num));
  });
  return out;
}

function sermonToText(s: SermonNote) {
  const lines = [
    `# ${s.title}`,
    `${fmtDay(s.preached_on)}${s.preacher ? ` — ${s.preacher}` : ""}${s.church ? ` — ${s.church}` : ""}`,
    s.series ? `Série : ${s.series}` : "",
    s.main_text ? `Texte : ${s.main_text}` : "",
    s.big_idea ? `\nIdée maîtresse : ${s.big_idea}` : "",
    (s.key_verses ?? []).length ? `Versets clés : ${s.key_verses.join(" · ")}` : "",
    "",
    ...outlineToLines(s.outline ?? [], []),
    s.applications ? `\nApplications :\n${s.applications}` : "",
    s.quotes ? `\nCitations :\n${s.quotes}` : "",
    s.prayer ? `\nPrière :\n${s.prayer}` : "",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

function SermonsPage() {
  const qc = useQueryClient();
  const { data: sermons = [] } = useQuery(sermonsQO);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<{ open: boolean; draft: Draft }>({ open: false, draft: emptyDraft() });

  const invalidate = () => qc.invalidateQueries({ queryKey: qkSermons });

  const seriesList = useMemo(() => [...new Set(sermons.map((s) => s.series).filter(Boolean) as string[])], [sermons]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sermons.filter((s) => {
      if (seriesFilter !== "all" && (s.series ?? "") !== seriesFilter) return false;
      if (!q) return true;
      const hay = [s.title, s.preacher, s.church, s.series, s.main_text, s.big_idea, s.applications, s.quotes, ...(s.tags ?? []), ...(s.key_verses ?? []),
        ...flattenOutline(s.outline)].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [sermons, search, seriesFilter]);

  const thisYear = sermons.filter((s) => s.preached_on.slice(0, 4) === String(new Date().getFullYear()));

  function openEdit(s: SermonNote) {
    setDialog({
      open: true,
      draft: {
        ...s,
        key_versesText: (s.key_verses ?? []).join(", "),
        tagsText: (s.tags ?? []).join(", "),
        outline: (s.outline ?? []).length ? s.outline : [newNode()],
      },
    });
  }

  async function save() {
    const d = dialog.draft;
    if (!d.title?.trim()) return toast.error("Titre requis");
    const user_id = await currentUserId();
    const outline: SermonOutlineNode[] = pruneOutline(d.outline ?? []);
    const payload = {
      user_id,
      preached_on: d.preached_on ?? ymdLocal(new Date()),
      title: d.title.trim(),
      preacher: d.preacher?.trim() || null,
      church: d.church?.trim() || null,
      series: d.series?.trim() || null,
      main_text: d.main_text?.trim() || null,
      key_verses: (d.key_versesText ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      big_idea: d.big_idea?.trim() || null,
      outline,
      applications: d.applications?.trim() || null,
      quotes: d.quotes?.trim() || null,
      prayer: d.prayer?.trim() || null,
      tags: (d.tagsText ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      favorite: d.favorite ?? false,
    };
    const res = d.id ? await offlineUpdate("sermon_notes", d.id, payload) : await offlineInsert("sermon_notes", payload);
    if (!res.ok) return toast.error(res.error ?? "Échec de l'enregistrement");
    setDialog({ open: false, draft: emptyDraft() });
    invalidate();
    toast.success(res.queued ? "Note enregistrée (hors ligne)" : "Note enregistrée");
  }

  async function remove(s: SermonNote) {
    if (!confirm(`Supprimer la note « ${s.title} » ?`)) return;
    await offlineDelete("sermon_notes", s.id);
    invalidate();
    toast.success("Note supprimée");
  }

  async function toggleFavorite(s: SermonNote) {
    await offlineUpdate("sermon_notes", s.id, { favorite: !s.favorite });
    invalidate();
  }

  function exportOne(s: SermonNote) {
    const blob = new Blob([sermonToText(s)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sermon-${s.preached_on}-${s.title.slice(0, 40)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const setOutline = (fn: (o: SermonOutlineNode[]) => SermonOutlineNode[]) =>
    setDialog((s) => ({ ...s, draft: { ...s.draft, outline: fn(s.draft.outline ?? []) } }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold"><Mic className="h-5 w-5 text-primary" /> Notes de sermon</h1>
          <p className="text-sm text-muted-foreground">Structure fixe : texte, idée maîtresse, plan par points, applications.</p>
        </div>
        <Button onClick={() => setDialog({ open: true, draft: emptyDraft() })}><Plus className="mr-1 h-4 w-4" /> Nouvelle note</Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Notes au total" value={sermons.length} sub={`${thisYear.length} cette année`} />
        <StatCard label="Séries suivies" value={seriesList.length} sub={seriesList.slice(0, 2).join(" · ") || "—"} />
        <StatCard label="Favoris" value={sermons.filter((s) => s.favorite).length} sub="Notes à relire" />
      </div>

      <Panel
        title="Carnet de sermons"
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-7 w-40 pl-7 text-xs" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="h-7 rounded-sm border border-border bg-background px-2 text-xs" value={seriesFilter} onChange={(e) => setSeriesFilter(e.target.value)}>
              <option value="all">Toutes les séries</option>
              {seriesList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        }
      >
        {!filtered.length ? (
          <p className="text-sm text-muted-foreground">Aucune note. Commencez par la prédication du dimanche.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => {
              const open = !!expanded[s.id];
              return (
                <div key={s.id} className="rounded-md border border-border">
                  <div className="flex items-start gap-2 px-3 py-2">
                    <button className="mt-0.5 text-muted-foreground" onClick={() => setExpanded((e) => ({ ...e, [s.id]: !open }))}>
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{s.title}</span>
                        {s.series && <Badge variant="outline">{s.series}</Badge>}
                        {(s.tags ?? []).map((t) => <Badge key={t} className="bg-sky-500/15 text-sky-400">{t}</Badge>)}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {fmtDay(s.preached_on)}{s.preacher ? ` · ${s.preacher}` : ""}{s.church ? ` · ${s.church}` : ""}{s.main_text ? ` · ${s.main_text}` : ""}
                      </div>
                      {!open && s.big_idea && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{s.big_idea}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" onClick={() => toggleFavorite(s)}>
                        <Star className={cn("h-4 w-4", s.favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => exportOne(s)}><Download className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {open && (
                    <div className="space-y-3 border-t border-border px-3 py-3 text-sm">
                      {s.big_idea && (
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Idée maîtresse</div>
                          <p className="mt-1">{s.big_idea}</p>
                        </div>
                      )}
                      {(s.key_verses ?? []).length > 0 && (
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Versets clés</div>
                          <p className="mt-1">{s.key_verses.join(" · ")}</p>
                        </div>
                      )}
                      {(s.outline ?? []).length > 0 && (
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Plan</div>
                          <OutlineView nodes={s.outline} />
                        </div>
                      )}
                      {s.applications && (
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Applications</div>
                          <p className="mt-1 whitespace-pre-wrap">{s.applications}</p>
                        </div>
                      )}
                      {s.quotes && (
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Citations</div>
                          <p className="mt-1 whitespace-pre-wrap">{s.quotes}</p>
                        </div>
                      )}
                      {s.prayer && (
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Prière</div>
                          <p className="mt-1 whitespace-pre-wrap">{s.prayer}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog.draft.id ? "Modifier la note" : "Nouvelle note de sermon"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Date</Label>
                <Input type="date" value={dialog.draft.preached_on ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, preached_on: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Titre</Label>
                <Input value={dialog.draft.title ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, title: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Prédicateur</Label>
                <Input value={dialog.draft.preacher ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, preacher: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Église / lieu</Label>
                <Input value={dialog.draft.church ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, church: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Série</Label>
                <Input value={dialog.draft.series ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, series: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Texte principal</Label>
                <Input placeholder="Ex. Jean 15:1-8" value={dialog.draft.main_text ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, main_text: e.target.value } }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Idée maîtresse</Label>
              <Textarea rows={2} value={dialog.draft.big_idea ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, big_idea: e.target.value } }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Versets clés (séparés par des virgules)</Label>
              <Input value={dialog.draft.key_versesText ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, key_versesText: e.target.value } }))} />
            </div>

            <div className="grid gap-2">
              <Label>Plan du sermon</Label>
              <OutlineEditor nodes={dialog.draft.outline ?? []} path={[]} setOutline={setOutline} />
              <Button size="sm" variant="outline" onClick={() => setOutline((arr) => [...arr, newNode()])}>
                <Plus className="mr-1 h-4 w-4" /> Ajouter un point
              </Button>
            </div>

            <div className="grid gap-1.5">
              <Label>Applications concrètes</Label>
              <Textarea rows={3} value={dialog.draft.applications ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, applications: e.target.value } }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Citations marquantes</Label>
              <Textarea rows={2} value={dialog.draft.quotes ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, quotes: e.target.value } }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Prière / engagement</Label>
              <Textarea rows={2} value={dialog.draft.prayer ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, prayer: e.target.value } }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Tags (séparés par des virgules)</Label>
              <Input value={dialog.draft.tagsText ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, tagsText: e.target.value } }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, draft: emptyDraft() })}>Annuler</Button>
            <Button onClick={save}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Éditeur de plan récursif (jusqu'à 4 niveaux) avec notes et versets par point. */
function OutlineEditor({
  nodes, path, setOutline,
}: {
  nodes: SermonOutlineNode[];
  path: number[];
  setOutline: (fn: (o: SermonOutlineNode[]) => SermonOutlineNode[]) => void;
}) {
  const depth = path.length + 1;
  return (
    <div className="space-y-2">
      {nodes.map((o, i) => {
        const full = [...path, i];
        const label = full.map((n) => n + 1).join(".");
        return (
          <div key={i} className={cn("space-y-2 rounded-sm border border-border p-2", depth > 1 && "bg-surface-2/30")}>
            <div className="flex gap-2">
              <Input placeholder={`Point ${label}`} value={o.heading}
                onChange={(e) => setOutline((arr) => updateAt(arr, full, (n) => ({ ...n, heading: e.target.value })))} />
              <Button size="icon" variant="ghost" onClick={() => setOutline((arr) => removeAt(arr, full))}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <Textarea rows={2} placeholder="Contenu / note de ce point" value={o.notes ?? ""}
              onChange={(e) => setOutline((arr) => updateAt(arr, full, (n) => ({ ...n, notes: e.target.value })))} />
            <Input placeholder="Versets liés (séparés par des virgules)" value={(o.verses ?? []).join(", ")}
              onChange={(e) => setOutline((arr) => updateAt(arr, full, (n) => ({ ...n, verses: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })))} />
            {(o.children ?? []).length > 0 && (
              <div className="pl-3">
                <OutlineEditor nodes={o.children ?? []} path={full} setOutline={setOutline} />
              </div>
            )}
            {depth < SERMON_OUTLINE_MAX_DEPTH && (
              <Button size="sm" variant="ghost"
                onClick={() => setOutline((arr) => updateAt(arr, full, (n) => ({ ...n, children: [...(n.children ?? []), newNode()] })))}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Sous-point (niveau {depth + 1})
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
