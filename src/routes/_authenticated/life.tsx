import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseOffline as supabase } from "@/lib/offline/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { offlineInsert, offlineUpdate, offlineDelete, currentUserId } from "@/lib/offline/mutations";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  planItemsQO, planItemTagsQO, planTypesQO, planTagsQO, planProjectsQO,
  ymd, addDays, parseYmd, type PlanItem, type PlanItemTag,
} from "@/lib/planning";
import {
  computeDomainTime, computeHabitTraces, alignmentCommentary, weekStart, weekLabel,
  fmtHours, DOMAIN_PALETTE, DOMAIN_PRESETS, REVIEW_STEPS,
  type LifeDomain, type WeeklyReview,
} from "@/lib/life";
import { computeExecutionScore, computeAlignmentScore, computeLifeScore, scoreTone } from "@/lib/life-score";
import {
  Compass, Plus, Trash2, Pencil, Wand2, Target, Flame, ChevronLeft, ChevronRight, Check, Save, ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/life")({
  head: () => ({
    meta: [
      { title: "Priorités de vie & revue — OPTIS" },
      { name: "description", content: "Déclarez vos domaines de vie, mesurez le temps réellement投 consacré, suivez vos habitudes et conduisez votre revue hebdomadaire." },
      { property: "og:title", content: "Priorités de vie & revue hebdomadaire — OPTIS" },
      { property: "og:description", content: "Alignement entre priorités déclarées et emploi du temps réel, traces d'habitudes et revue guidée en 5 étapes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LifePage,
});

const qkDomains = ["life_domains"] as const;
const qkReviews = ["weekly_reviews"] as const;

function useLifeData() {
  const domains = useQuery({
    queryKey: qkDomains,
    queryFn: async () =>
      (await fetchAllRows<any>((from, to) =>
        supabase.from("life_domains").select("*").order("sort_order", { ascending: true }).range(from, to),
      )) as LifeDomain[],
  });
  const reviews = useQuery({
    queryKey: qkReviews,
    queryFn: async () =>
      (await fetchAllRows<any>((from, to) =>
        supabase.from("weekly_reviews").select("*").order("week_start", { ascending: false }).range(from, to),
      )) as WeeklyReview[],
  });
  const items = useQuery(planItemsQO);
  const itemTags = useQuery(planItemTagsQO);
  const types = useQuery(planTypesQO);
  const tags = useQuery(planTagsQO);
  const projects = useQuery(planProjectsQO);

  return {
    loading: domains.isLoading || items.isLoading,
    domains: (domains.data ?? []) as LifeDomain[],
    reviews: (reviews.data ?? []) as WeeklyReview[],
    items: (items.data ?? []) as PlanItem[],
    itemTags: (itemTags.data ?? []) as PlanItemTag[],
    types: (types.data ?? []) as any[],
    tags: (tags.data ?? []) as any[],
    projects: (projects.data ?? []) as any[],
  };
}

const TONE_CLASS: Record<string, string> = {
  positive: "text-positive",
  neutral: "text-primary",
  warning: "text-warning",
  negative: "text-negative",
};

/* ------------------------------- domaine : édition ------------------------------- */

type DomainDraft = {
  id?: string;
  label: string;
  weight: number;
  color: string;
  match_type_ids: string[];
  match_project_ids: string[];
  match_tag_ids: string[];
  keywords: string;
  notes: string;
};

function emptyDraft(index: number): DomainDraft {
  return {
    label: "",
    weight: 10,
    color: DOMAIN_PALETTE[index % DOMAIN_PALETTE.length],
    match_type_ids: [],
    match_project_ids: [],
    match_tag_ids: [],
    keywords: "",
    notes: "",
  };
}

function Chips({
  options, selected, onToggle,
}: {
  options: Array<{ id: string; label: string; color?: string | null }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (!options.length) return <div className="text-xs text-muted-foreground">Aucun élément disponible.</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            className={cn(
              "rounded border px-2 py-0.5 text-xs transition",
              on ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {o.color && <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: o.color }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function DomainDialog({
  open, onOpenChange, draft, setDraft, onSave, types, tags, projects,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: DomainDraft;
  setDraft: (d: DomainDraft) => void;
  onSave: () => void;
  types: any[];
  tags: any[];
  projects: any[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Modifier le domaine" : "Nouveau domaine de vie"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Libellé</label>
              <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Santé & énergie" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Couleur</label>
              <div className="flex flex-wrap gap-1.5">
                {DOMAIN_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft({ ...draft, color: c })}
                    className={cn("h-6 w-6 rounded-full border-2", draft.color === c ? "border-foreground" : "border-transparent")}
                    style={{ background: c }}
                    aria-label={`Couleur ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Poids cible</label>
              <span className="num text-xs">{draft.weight}</span>
            </div>
            <Slider value={[draft.weight]} min={0} max={50} step={1} onValueChange={([v]) => setDraft({ ...draft, weight: v })} />
            <p className="text-[11px] text-muted-foreground">
              Les poids sont relatifs : la cible en % est calculée sur la somme de tous les domaines.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Types de planification rattachés</label>
            <Chips
              options={types.filter((t) => !t.archived).map((t) => ({ id: t.id, label: t.name, color: t.color }))}
              selected={draft.match_type_ids}
              onToggle={(id) => setDraft({
                ...draft,
                match_type_ids: draft.match_type_ids.includes(id)
                  ? draft.match_type_ids.filter((x) => x !== id)
                  : [...draft.match_type_ids, id],
              })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Projets planifiés rattachés</label>
            <Chips
              options={projects.filter((p) => !p.archived).map((p) => ({ id: p.id, label: p.name, color: p.color }))}
              selected={draft.match_project_ids}
              onToggle={(id) => setDraft({
                ...draft,
                match_project_ids: draft.match_project_ids.includes(id)
                  ? draft.match_project_ids.filter((x) => x !== id)
                  : [...draft.match_project_ids, id],
              })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Tags rattachés</label>
            <Chips
              options={tags.map((t) => ({ id: t.id, label: t.name, color: t.color }))}
              selected={draft.match_tag_ids}
              onToggle={(id) => setDraft({
                ...draft,
                match_tag_ids: draft.match_tag_ids.includes(id)
                  ? draft.match_tag_ids.filter((x) => x !== id)
                  : [...draft.match_tag_ids, id],
              })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Mots-clés (séparés par des virgules)</label>
            <Input
              value={draft.keywords}
              onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
              placeholder="sport, sommeil, marche"
            />
            <p className="text-[11px] text-muted-foreground">
              Utilisés en second recours, sur le titre et la note d'un élément non rattaché.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Note</label>
            <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={onSave} disabled={!draft.label.trim()}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- page ---------------------------------- */

const WINDOWS = [
  { days: 7, label: "7 j" },
  { days: 28, label: "28 j" },
  { days: 90, label: "90 j" },
];

function LifePage() {
  const qc = useQueryClient();
  const d = useLifeData();
  const [windowDays, setWindowDays] = useState(28);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DomainDraft>(emptyDraft(0));

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [reviewWeek, setReviewWeek] = useState(() => ymd(weekStart(new Date())));

  const model = useMemo(() => {
    const from = addDays(today, -(windowDays - 1));
    const time = computeDomainTime(d.items, d.domains, d.itemTags, from, today);
    const execution = computeExecutionScore(d.items, today, Math.max(30, windowDays));
    const alignment = computeAlignmentScore({
      priorities: d.domains.filter((x) => !x.archived).map((x) => ({ key: x.id, label: x.label, weight: Number(x.weight) || 0 })),
      actualMinutes: Object.fromEntries(time.rows.map((r) => [r.id, r.minutes])),
    });
    const habits = computeHabitTraces(d.items, d.domains, d.itemTags, today, Math.min(56, Math.max(14, windowDays)));
    const commentary = alignmentCommentary(time);
    const life = computeLifeScore(execution.score, execution.score, alignment?.score ?? null);
    return { time, execution, alignment, habits, commentary, life };
  }, [d.items, d.domains, d.itemTags, windowDays, today]);

  // revue de la semaine sélectionnée
  const review = d.reviews.find((r) => r.week_start === reviewWeek) ?? null;
  const [form, setForm] = useState({ wins: "", misses: "", lessons: "", next_focus: "", finance_note: "" });
  useEffect(() => {
    setForm({
      wins: review?.wins ?? "",
      misses: review?.misses ?? "",
      lessons: review?.lessons ?? "",
      next_focus: review?.next_focus ?? "",
      finance_note: review?.finance_note ?? "",
    });
  }, [review?.id, reviewWeek]);

  const weekModel = useMemo(() => {
    const start = parseYmd(reviewWeek);
    const end = addDays(start, 6);
    const capped = end > today ? today : end;
    const time = computeDomainTime(d.items, d.domains, d.itemTags, start, capped);
    const exec = computeExecutionScore(d.items, capped, 7);
    return { time, exec, start, end };
  }, [reviewWeek, d.items, d.domains, d.itemTags, today]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qkDomains });
    qc.invalidateQueries({ queryKey: qkReviews });
  };

  const openNew = () => {
    setDraft(emptyDraft(d.domains.length));
    setDialogOpen(true);
  };

  const openEdit = (dm: LifeDomain) => {
    setDraft({
      id: dm.id,
      label: dm.label,
      weight: Number(dm.weight) || 0,
      color: dm.color,
      match_type_ids: dm.match_type_ids ?? [],
      match_project_ids: dm.match_project_ids ?? [],
      match_tag_ids: dm.match_tag_ids ?? [],
      keywords: (dm.keywords ?? []).join(", "),
      notes: dm.notes ?? "",
    });
    setDialogOpen(true);
  };

  const saveDraft = async () => {
    const payload = {
      label: draft.label.trim(),
      weight: draft.weight,
      color: draft.color,
      match_type_ids: draft.match_type_ids,
      match_project_ids: draft.match_project_ids,
      match_tag_ids: draft.match_tag_ids,
      keywords: draft.keywords.split(",").map((s) => s.trim()).filter(Boolean),
      notes: draft.notes.trim() || null,
    };
    const res = draft.id
      ? await offlineUpdate("life_domains" as any, draft.id, payload)
      : await offlineInsert("life_domains" as any, {
          ...payload,
          user_id: await currentUserId(),
          sort_order: d.domains.length,
          archived: false,
        });
    if (!res.ok) { toast.error(res.error ?? "Échec de l'enregistrement"); return; }
    toast.success(res.queued ? "Enregistré hors ligne — synchronisation à venir" : "Domaine enregistré");
    setDialogOpen(false);
    refresh();
  };

  const removeDomain = async (dm: LifeDomain) => {
    const res = await offlineDelete("life_domains" as any, dm.id);
    if (!res.ok) { toast.error(res.error ?? "Échec de la suppression"); return; }
    toast.success("Domaine supprimé");
    refresh();
  };

  const seedPresets = async () => {
    const uid = await currentUserId();
    let i = 0;
    for (const p of DOMAIN_PRESETS) {
      await offlineInsert("life_domains" as any, {
        user_id: uid,
        label: p.label,
        weight: p.weight,
        color: DOMAIN_PALETTE[i % DOMAIN_PALETTE.length],
        sort_order: i,
        archived: false,
        match_type_ids: [],
        match_project_ids: [],
        match_tag_ids: [],
        keywords: p.keywords,
      });
      i += 1;
    }
    toast.success("Domaines proposés créés — ajustez les poids et les rattachements");
    refresh();
  };

  const saveReview = async (complete: boolean) => {
    const payload: Record<string, unknown> = {
      wins: form.wins.trim() || null,
      misses: form.misses.trim() || null,
      lessons: form.lessons.trim() || null,
      next_focus: form.next_focus.trim() || null,
      finance_note: form.finance_note.trim() || null,
      execution_score: weekModel.exec.score,
      alignment_score: model.alignment?.score ?? null,
      life_score: model.life.score,
      completed_at: complete ? new Date().toISOString() : review?.completed_at ?? null,
    };
    const res = review
      ? await offlineUpdate("weekly_reviews" as any, review.id, payload)
      : await offlineInsert("weekly_reviews" as any, { ...payload, user_id: await currentUserId(), week_start: reviewWeek });
    if (!res.ok) { toast.error(res.error ?? "Échec de l'enregistrement"); return; }
    toast.success(complete ? "Revue clôturée" : res.queued ? "Revue enregistrée hors ligne" : "Revue enregistrée");
    refresh();
  };

  const activeDomains = d.domains.filter((x) => !x.archived);
  const maxPct = Math.max(10, ...model.time.rows.map((r) => Math.max(r.actualPct, r.targetPct)));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Compass className="h-5 w-5 text-primary" /> Priorités de vie & revue
          </h1>
          <p className="text-sm text-muted-foreground">
            Ce que vous dites vouloir, comparé à ce que votre agenda fait réellement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded border border-border">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                onClick={() => setWindowDays(w.days)}
                className={cn(
                  "px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider",
                  windowDays === w.days ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
          <Button onClick={openNew} size="sm"><Plus className="mr-1 h-4 w-4" /> Domaine</Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Alignement temps / priorités"
          value={model.alignment ? `${model.alignment.score}/100` : "—"}
          tone={model.alignment ? scoreTone(model.alignment.score) : "neutral"}
          sub={model.commentary.verdict}
          icon={<Target className="h-4 w-4" />}
        />
        <StatCard
          label="Exécution"
          value={`${model.execution.score}/100`}
          tone={scoreTone(model.execution.score)}
          sub={`${model.execution.completionRate.toFixed(0)} % réalisé · ${model.execution.overdue} en retard`}
          icon={<Check className="h-4 w-4" />}
        />
        <StatCard
          label={`Temps planifié · ${windowDays} j`}
          value={fmtHours(model.time.totalMinutes)}
          sub={`${fmtHours(model.time.unassignedMinutes)} hors domaine`}
        />
        <StatCard
          label="Habitudes suivies"
          value={String(model.habits.length)}
          sub={model.habits.length ? `Meilleure série : ${Math.max(...model.habits.map((h) => h.streak))} j` : "Aucune habitude récurrente"}
          icon={<Flame className="h-4 w-4" />}
        />
      </div>

      {!activeDomains.length && (
        <Panel title="Déclarer vos priorités">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Déclarez 3 à 7 domaines de vie avec un poids cible. OPTIS compare ensuite ce poids au temps réellement
              planifié dans la planification, via les types, projets, tags ou mots-clés que vous rattachez.
            </p>
            <Button onClick={seedPresets} variant="secondary" size="sm">
              <Wand2 className="mr-1 h-4 w-4" /> Partir des domaines proposés
            </Button>
          </div>
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title={`Répartition du temps par domaine · ${windowDays} j`}>
          {!model.time.rows.length ? (
            <p className="text-sm text-muted-foreground">Aucun domaine déclaré.</p>
          ) : (
            <div className="space-y-3">
              {model.time.rows.map((r) => (
                <div key={r.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                      {r.label}
                    </span>
                    <span className="num text-xs text-muted-foreground">
                      {fmtHours(r.minutes)} · {r.actualPct.toFixed(0)} % / cible {r.targetPct.toFixed(0)} %
                      <span className={cn("ml-2", r.gap > 8 ? "text-warning" : r.gap < -8 ? "text-negative" : "text-positive")}>
                        {r.gap >= 0 ? "+" : "−"}{Math.abs(r.gap).toFixed(0)} pt
                      </span>
                    </span>
                  </div>
                  <div className="relative h-3 overflow-hidden rounded bg-muted">
                    <div className="h-full rounded" style={{ width: `${(r.actualPct / maxPct) * 100}%`, background: r.color }} />
                    <div
                      className="absolute top-0 h-full w-0.5 bg-foreground/70"
                      style={{ left: `${(r.targetPct / maxPct) * 100}%` }}
                      title={`Cible ${r.targetPct.toFixed(0)} %`}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.occurrences} occurrence{r.occurrences > 1 ? "s" : ""} · {r.done} terminée{r.done > 1 ? "s" : ""}
                  </div>
                </div>
              ))}
              {model.time.unassignedOccurrences > 0 && (
                <div className="rounded border border-dashed border-border p-2 text-xs text-muted-foreground">
                  {model.time.unassignedOccurrences} occurrence(s) non rattachée(s) — {fmtHours(model.time.unassignedMinutes)}.
                  Rattachez un type, un projet ou un tag à un domaine pour les compter.
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Lecture de l'alignement">
          <div className="space-y-3">
            <div className={cn("text-sm font-medium", TONE_CLASS[model.alignment ? scoreTone(model.alignment.score) : "neutral"])}>
              {model.commentary.verdict}
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {model.commentary.lines.map((l, i) => (
                <li key={i} className="flex gap-2"><ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{l}</li>
              ))}
            </ul>
            <Link to="/planning" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Ouvrir la planification <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </Panel>
      </div>

      <Panel
        title="Domaines déclarés"
        action={<Button size="sm" variant="ghost" onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Ajouter</Button>}
      >
        {!activeDomains.length ? (
          <p className="text-sm text-muted-foreground">Aucun domaine pour l'instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">Domaine</th>
                  <th className="py-2">Poids</th>
                  <th className="py-2">Rattachements</th>
                  <th className="py-2">Mots-clés</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeDomains.map((dm) => {
                  const nType = (dm.match_type_ids ?? []).length;
                  const nProj = (dm.match_project_ids ?? []).length;
                  const nTag = (dm.match_tag_ids ?? []).length;
                  return (
                    <tr key={dm.id} className="border-b border-border/60">
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dm.color }} />
                          {dm.label}
                        </span>
                      </td>
                      <td className="num py-2">{Number(dm.weight) || 0}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {nType + nProj + nTag === 0 ? "—" : `${nType} type(s) · ${nProj} projet(s) · ${nTag} tag(s)`}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">{(dm.keywords ?? []).join(", ") || "—"}</td>
                      <td className="py-2 text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(dm)} aria-label="Modifier">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => removeDomain(dm)} aria-label="Supprimer">
                          <Trash2 className="h-4 w-4 text-negative" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Traces d'habitudes">
        {!model.habits.length ? (
          <p className="text-sm text-muted-foreground">
            Aucune habitude récurrente sur la période. Créez un élément récurrent dans la planification pour suivre une série.
          </p>
        ) : (
          <div className="space-y-3">
            {model.habits.map((h) => {
              const dom = activeDomains.find((x) => x.id === h.domainId);
              return (
                <div key={h.item.id} className="rounded border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      {h.item.title}
                      {dom && (
                        <span className="ml-2 rounded px-1.5 py-0.5 text-[10px]" style={{ background: `${dom.color}22`, color: dom.color }}>
                          {dom.label}
                        </span>
                      )}
                    </div>
                    <div className="num flex items-center gap-3 text-xs text-muted-foreground">
                      <span className={cn(h.adherence >= 70 ? "text-positive" : h.adherence >= 40 ? "text-warning" : "text-negative")}>
                        {h.adherence.toFixed(0)} % tenue
                      </span>
                      <span className="flex items-center gap-1"><Flame className="h-3.5 w-3.5" />{h.streak} j</span>
                      <span>record {h.bestStreak} j</span>
                      <span>{h.done}/{h.expected}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {h.days.map((day) => (
                      <span
                        key={day.day}
                        title={day.day}
                        className={cn(
                          "h-3.5 w-3.5 rounded-sm border",
                          !day.expected ? "border-border/50 bg-transparent"
                          : day.done ? "border-transparent bg-positive"
                          : "border-transparent bg-muted",
                        )}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        title="Revue hebdomadaire guidée"
        action={
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => setReviewWeek(ymd(addDays(parseYmd(reviewWeek), -7)))} aria-label="Semaine précédente">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="num px-1 text-xs">{weekLabel(reviewWeek)}</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setReviewWeek(ymd(addDays(parseYmd(reviewWeek), 7)))}
              disabled={parseYmd(reviewWeek) >= weekStart(today)}
              aria-label="Semaine suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded border border-border bg-muted/30 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{REVIEW_STEPS[0].title}</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Exécution de la semaine</div>
                <div className={cn("num text-lg font-semibold", TONE_CLASS[scoreTone(weekModel.exec.score)])}>
                  {weekModel.exec.score}/100
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {weekModel.exec.completionRate.toFixed(0)} % réalisé · {weekModel.exec.overdue} en retard
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Temps planifié</div>
                <div className="num text-lg font-semibold">{fmtHours(weekModel.time.totalMinutes)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {weekModel.time.rows[0] ? `Dominant : ${weekModel.time.rows[0].label}` : "Aucun domaine rattaché"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Alignement</div>
                <div className={cn("num text-lg font-semibold", TONE_CLASS[model.alignment ? scoreTone(model.alignment.score) : "neutral"])}>
                  {model.alignment ? `${model.alignment.score}/100` : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">{model.commentary.verdict}</div>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{REVIEW_STEPS[0].hint}</p>
          </div>

          {(["wins", "misses", "lessons", "next_focus"] as const).map((key, idx) => {
            const step = REVIEW_STEPS[idx + 1];
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{step.title}</label>
                  <span className="text-[11px] text-muted-foreground">{step.hint}</span>
                </div>
                <Textarea rows={3} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </div>
            );
          })}

          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Note financière (optionnel)</label>
            <Textarea rows={2} value={form.finance_note} onChange={(e) => setForm({ ...form, finance_note: e.target.value })} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {review?.completed_at
                ? `Revue clôturée le ${new Date(review.completed_at).toLocaleDateString("fr-FR")}`
                : "Revue en cours — enregistrez pour la conserver."}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => saveReview(false)}>
                <Save className="mr-1 h-4 w-4" /> Enregistrer
              </Button>
              <Button size="sm" onClick={() => saveReview(true)}>
                <Check className="mr-1 h-4 w-4" /> Clôturer la revue
              </Button>
            </div>
          </div>
        </div>
      </Panel>

      {d.reviews.length > 0 && (
        <Panel title="Historique des revues">
          <div className="space-y-2">
            {d.reviews.slice(0, 12).map((r) => (
              <button
                key={r.id}
                onClick={() => setReviewWeek(r.week_start)}
                className={cn(
                  "flex w-full flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm",
                  r.week_start === reviewWeek ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                )}
              >
                <span className="num">{weekLabel(r.week_start)}</span>
                <span className="truncate text-xs text-muted-foreground">{r.next_focus || r.lessons || r.wins || "—"}</span>
                <span className="num text-xs text-muted-foreground">
                  Exéc. {r.execution_score ?? "—"} · Align. {r.alignment_score ?? "—"}
                  {r.completed_at ? " · clôturée" : ""}
                </span>
              </button>
            ))}
          </div>
        </Panel>
      )}

      <DomainDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        setDraft={setDraft}
        onSave={saveDraft}
        types={d.types}
        tags={d.tags}
        projects={d.projects}
      />
    </div>
  );
}
