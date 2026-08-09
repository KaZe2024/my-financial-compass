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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { offlineInsert, offlineUpdate, offlineDelete, currentUserId } from "@/lib/offline/mutations";
import {
  STUDY_KINDS, STUDY_STATUSES, fmtDay, qkStudies, studiesQO, studyKindLabel, studyStatusMeta, ymdLocal,
  type BibleStudy, type StudyKind,
} from "@/lib/spiritual";
import { NotebookPen, Plus, Pencil, Trash2, Search, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bible-study")({
  head: () => ({
    meta: [
      { title: "Étude biblique — OPTIS" },
      { name: "description", content: "Un cahier d'étude biblique par thématique, personnage historique, livre, mot ou événement, avec références et faits clés." },
      { property: "og:title", content: "Étude biblique — OPTIS" },
      { property: "og:description", content: "Cahier de notes d'étude : thèmes, personnages, livres, faits clés et références bibliques." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Étude biblique — OPTIS" },
      { name: "twitter:description", content: "Organisez vos études par thématique et par personnage." },
    ],
  }),
  component: StudyPage,
});

type Draft = Partial<BibleStudy> & { refsText?: string; factsText?: string; tagsText?: string };

const emptyDraft = (): Draft => ({
  kind: "theme",
  title: "",
  subject: "",
  summary: "",
  content: "",
  refsText: "",
  factsText: "",
  tagsText: "",
  status: "en_cours",
  studied_on: ymdLocal(new Date()),
});

function StudyPage() {
  const qc = useQueryClient();
  const { data: studies = [] } = useQuery(studiesQO);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | StudyKind>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<{ open: boolean; draft: Draft }>({ open: false, draft: emptyDraft() });

  const invalidate = () => qc.invalidateQueries({ queryKey: qkStudies });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return studies.filter((s) => {
      if (kindFilter !== "all" && s.kind !== kindFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [s.title, s.subject, s.summary, s.content, ...(s.refs ?? []), ...(s.key_facts ?? []), ...(s.tags ?? [])].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [studies, search, kindFilter, statusFilter]);

  const countBy = (k: StudyKind) => studies.filter((s) => s.kind === k).length;

  function openEdit(s: BibleStudy) {
    setDialog({
      open: true,
      draft: { ...s, refsText: (s.refs ?? []).join(", "), factsText: (s.key_facts ?? []).join("\n"), tagsText: (s.tags ?? []).join(", ") },
    });
  }

  async function save() {
    const d = dialog.draft;
    if (!d.title?.trim()) return toast.error("Titre requis");
    const user_id = await currentUserId();
    const payload = {
      user_id,
      kind: (d.kind ?? "theme") as StudyKind,
      title: d.title.trim(),
      subject: d.subject?.trim() || null,
      summary: d.summary?.trim() || null,
      content: d.content?.trim() || null,
      refs: (d.refsText ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      key_facts: (d.factsText ?? "").split("\n").map((x) => x.trim()).filter(Boolean),
      tags: (d.tagsText ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      status: d.status ?? "en_cours",
      studied_on: d.studied_on ?? ymdLocal(new Date()),
    };
    const res = d.id ? await offlineUpdate("bible_studies", d.id, payload) : await offlineInsert("bible_studies", payload);
    if (!res.ok) return toast.error(res.error ?? "Échec de l'enregistrement");
    setDialog({ open: false, draft: emptyDraft() });
    invalidate();
    toast.success(res.queued ? "Étude enregistrée (hors ligne)" : "Étude enregistrée");
  }

  async function remove(s: BibleStudy) {
    if (!confirm(`Supprimer l'étude « ${s.title} » ?`)) return;
    await offlineDelete("bible_studies", s.id);
    invalidate();
    toast.success("Étude supprimée");
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold"><NotebookPen className="h-5 w-5 text-primary" /> Étude biblique</h1>
          <p className="text-sm text-muted-foreground">Cahier de notes : thématiques, personnages historiques, livres, mots et événements.</p>
        </div>
        <Button onClick={() => setDialog({ open: true, draft: emptyDraft() })}><Plus className="mr-1 h-4 w-4" /> Nouvelle étude</Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Études" value={studies.length} sub={`${studies.filter((s) => s.status === "maitrise").length} maîtrisées`} />
        <StatCard label="Thématiques" value={countBy("theme")} sub="Sujets travaillés" />
        <StatCard label="Personnages" value={countBy("person")} sub="Figures historiques" />
        <StatCard label="Faits clés" value={studies.reduce((s, x) => s + (x.key_facts?.length ?? 0), 0)} sub="Alimentent le quiz" />
      </div>

      <Panel
        title="Cahier d'étude"
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-7 w-36 pl-7 text-xs" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="h-7 rounded-sm border border-border bg-background px-2 text-xs" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as any)}>
              <option value="all">Tous les types</option>
              {STUDY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <select className="h-7 rounded-sm border border-border bg-background px-2 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Tous les statuts</option>
              {STUDY_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        }
      >
        {!filtered.length ? (
          <p className="text-sm text-muted-foreground">Aucune étude. Commencez par un thème (ex. « La grâce ») ou un personnage (ex. « Josias »).</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => {
              const open = !!expanded[s.id];
              const meta = studyStatusMeta(s.status);
              return (
                <div key={s.id} className="rounded-md border border-border">
                  <div className="flex items-start gap-2 px-3 py-2">
                    <button className="mt-0.5 text-muted-foreground" onClick={() => setExpanded((e) => ({ ...e, [s.id]: !open }))}>
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{s.title}</span>
                        <Badge variant="outline">{studyKindLabel(s.kind)}</Badge>
                        <Badge className={meta.className}>{meta.label}</Badge>
                        {(s.tags ?? []).map((t) => <Badge key={t} className="bg-sky-500/15 text-sky-400">{t}</Badge>)}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {fmtDay(s.studied_on)}{s.subject ? ` · ${s.subject}` : ""}{(s.refs ?? []).length ? ` · ${s.refs.join(" ; ")}` : ""}
                      </div>
                      {!open && s.summary && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{s.summary}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {open && (
                    <div className="space-y-3 border-t border-border px-3 py-3 text-sm">
                      {s.summary && (
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Résumé</div>
                          <p className="mt-1 whitespace-pre-wrap">{s.summary}</p>
                        </div>
                      )}
                      {(s.key_facts ?? []).length > 0 && (
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Faits clés</div>
                          <ul className="mt-1 list-disc space-y-0.5 pl-5">{s.key_facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
                        </div>
                      )}
                      {s.content && (
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Notes</div>
                          <p className="mt-1 whitespace-pre-wrap">{s.content}</p>
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
          <DialogHeader><DialogTitle>{dialog.draft.id ? "Modifier l'étude" : "Nouvelle étude"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Type</Label>
                <Select value={dialog.draft.kind ?? "theme"} onValueChange={(v) => setDialog((s) => ({ ...s, draft: { ...s.draft, kind: v as StudyKind } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STUDY_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Date</Label>
                <Input type="date" value={dialog.draft.studied_on ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, studied_on: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Titre</Label>
                <Input value={dialog.draft.title ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, title: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Sujet central</Label>
                <Input value={dialog.draft.subject ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, subject: e.target.value } }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Résumé</Label>
              <Textarea rows={2} value={dialog.draft.summary ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, summary: e.target.value } }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Faits clés (un par ligne — utilisés par le quiz et les « le saviez-vous »)</Label>
              <Textarea rows={4} value={dialog.draft.factsText ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, factsText: e.target.value } }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Notes détaillées</Label>
              <Textarea rows={6} value={dialog.draft.content ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, content: e.target.value } }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Références (virgules)</Label>
                <Input placeholder="Ex. Romains 5:1, Éph. 2:8" value={dialog.draft.refsText ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, refsText: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Tags (virgules)</Label>
                <Input value={dialog.draft.tagsText ?? ""} onChange={(e) => setDialog((s) => ({ ...s, draft: { ...s.draft, tagsText: e.target.value } }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Statut</Label>
              <div className="flex gap-2">
                {STUDY_STATUSES.map((st) => (
                  <button key={st.value} onClick={() => setDialog((s) => ({ ...s, draft: { ...s.draft, status: st.value } }))}
                    className={cn("rounded-sm border border-border px-3 py-1.5 text-xs", dialog.draft.status === st.value && st.className)}>
                    {st.label}
                  </button>
                ))}
              </div>
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
