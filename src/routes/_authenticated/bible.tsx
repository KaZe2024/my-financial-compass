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
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { offlineInsert, offlineUpdate, offlineDelete, currentUserId } from "@/lib/offline/mutations";
import {
  BIBLE_BOOKS, CADENCES, TOTAL_BIBLE_CHAPTERS, bibleLogsQO, biblePlansQO, bookChapters, bookCoverage,
  cadenceMeta, fmtDay, planProgress, qkBibleLogs, qkBiblePlans, readingStreak, ymdLocal,
  type BiblePlan, type BibleCadence, type BibleReadingLog,
} from "@/lib/spiritual";
import { BookOpen, Plus, Pencil, Trash2, Flame, Target, CalendarCheck, ListChecks } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bible")({
  head: () => ({
    meta: [
      { title: "Lecture biblique — OPTIS" },
      { name: "description", content: "Planifiez et suivez votre lecture biblique par jour, semaine, mois, trimestre, semestre ou année avec un objectif de Bible entière." },
      { property: "og:title", content: "Lecture biblique — OPTIS" },
      { property: "og:description", content: "Plans de lecture, suivi quotidien, couverture du canon et rythme requis pour lire toute la Bible." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Lecture biblique — OPTIS" },
      { name: "twitter:description", content: "Plans de lecture et suivi de progression sur les 1189 chapitres." },
    ],
  }),
  component: BiblePage,
});

const emptyPlan = (): Partial<BiblePlan> => ({
  name: "Bible en 1 an",
  version: "Louis Segond",
  cadence: "daily",
  start_date: ymdLocal(new Date()),
  end_date: ymdLocal(new Date(new Date().setDate(new Date().getDate() + 364))),
  target_chapters: TOTAL_BIBLE_CHAPTERS,
  whole_bible: true,
  active: true,
  notes: "",
});

function BiblePage() {
  const qc = useQueryClient();
  const { data: plans = [] } = useQuery(biblePlansQO);
  const { data: logs = [] } = useQuery(bibleLogsQO);

  const [planDialog, setPlanDialog] = useState<{ open: boolean; draft: Partial<BiblePlan> }>({ open: false, draft: emptyPlan() });
  const [logDialog, setLogDialog] = useState<{ open: boolean; draft: Partial<BibleReadingLog> }>({ open: false, draft: {} });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qkBiblePlans });
    qc.invalidateQueries({ queryKey: qkBibleLogs });
  };

  const activePlan = plans.find((p) => p.active) ?? plans[0] ?? null;
  const progressList = useMemo(() => plans.map((p) => planProgress(p, logs)), [plans, logs]);
  const mainProgress = activePlan ? progressList.find((p) => p.plan.id === activePlan.id) ?? null : null;

  const coverage = useMemo(() => bookCoverage(logs), [logs]);
  const coveredChapters = coverage.reduce((s, b) => s + b.read, 0);
  const streak = useMemo(() => readingStreak(logs), [logs]);

  const last30 = useMemo(() => {
    const from = ymdLocal(new Date(new Date().setDate(new Date().getDate() - 29)));
    return logs.filter((l) => l.read_on >= from);
  }, [logs]);
  const chapters30 = last30.reduce((s, l) => s + (Number(l.chapters) || 0), 0);
  const minutes30 = last30.reduce((s, l) => s + (Number(l.minutes) || 0), 0);

  async function savePlan() {
    const d = planDialog.draft;
    if (!d.name?.trim()) return toast.error("Nom du plan requis");
    const user_id = await currentUserId();
    const payload = {
      user_id,
      name: d.name.trim(),
      version: d.version?.trim() || null,
      cadence: (d.cadence ?? "daily") as BibleCadence,
      start_date: d.start_date ?? ymdLocal(new Date()),
      end_date: d.end_date || null,
      target_chapters: d.whole_bible ? TOTAL_BIBLE_CHAPTERS : Math.max(1, Number(d.target_chapters) || 1),
      whole_bible: d.whole_bible ?? true,
      notes: d.notes?.trim() || null,
      active: d.active ?? true,
    };
    const res = d.id ? await offlineUpdate("bible_plans", d.id, payload) : await offlineInsert("bible_plans", payload);
    if (!res.ok) return toast.error(res.error ?? "Échec de l'enregistrement");
    setPlanDialog({ open: false, draft: emptyPlan() });
    invalidate();
    toast.success(res.queued ? "Plan enregistré (hors ligne)" : "Plan enregistré");
  }

  async function removePlan(p: BiblePlan) {
    if (!confirm(`Supprimer le plan « ${p.name} » ? Les lectures sont conservées.`)) return;
    await offlineDelete("bible_plans", p.id);
    invalidate();
    toast.success("Plan supprimé");
  }

  async function saveLog() {
    const d = logDialog.draft;
    if (!d.book) return toast.error("Choisissez un livre");
    const start = Math.max(1, Number(d.chapter_start) || 1);
    const end = Math.max(start, Number(d.chapter_end) || start);
    const user_id = await currentUserId();
    const payload = {
      user_id,
      plan_id: d.plan_id ?? activePlan?.id ?? null,
      read_on: d.read_on ?? ymdLocal(new Date()),
      book: d.book,
      chapter_start: start,
      chapter_end: end,
      chapters: end - start + 1,
      minutes: Math.max(0, Number(d.minutes) || 0),
      reflection: d.reflection?.trim() || null,
    };
    const res = d.id ? await offlineUpdate("bible_reading_logs", d.id, payload) : await offlineInsert("bible_reading_logs", payload);
    if (!res.ok) return toast.error(res.error ?? "Échec de l'enregistrement");
    setLogDialog({ open: false, draft: {} });
    invalidate();
    toast.success(res.queued ? "Lecture enregistrée (hors ligne)" : "Lecture enregistrée");
  }

  async function removeLog(l: BibleReadingLog) {
    await offlineDelete("bible_reading_logs", l.id);
    invalidate();
    toast.success("Lecture supprimée");
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold"><BookOpen className="h-5 w-5 text-primary" /> Lecture biblique</h1>
          <p className="text-sm text-muted-foreground">Plans de lecture, suivi des chapitres et couverture des 66 livres.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPlanDialog({ open: true, draft: emptyPlan() })}>
            <Plus className="mr-1 h-4 w-4" /> Nouveau plan
          </Button>
          <Button onClick={() => setLogDialog({ open: true, draft: { read_on: ymdLocal(new Date()), plan_id: activePlan?.id ?? null, chapter_start: 1, chapter_end: 1, minutes: 15 } })}>
            <Plus className="mr-1 h-4 w-4" /> Saisir une lecture
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Progression du plan"
          value={mainProgress ? `${mainProgress.pct.toFixed(1)} %` : "—"}
          sub={mainProgress ? `${mainProgress.chaptersRead} / ${mainProgress.target} chapitres` : "Créez un plan de lecture"}
          tone={mainProgress?.onTrack ? "positive" : "warning"}
          icon={<Target className="h-4 w-4" />}
        />
        <StatCard
          label="Rythme requis"
          value={mainProgress ? `${mainProgress.perDayNeeded.toFixed(1)} ch./j` : "—"}
          sub={mainProgress ? `${mainProgress.perCadenceNeeded.toFixed(0)} ch. par ${cadenceMeta(mainProgress.plan.cadence).label.toLowerCase()}` : "—"}
          icon={<CalendarCheck className="h-4 w-4" />}
        />
        <StatCard label="Série en cours" value={`${streak} j`} sub={`${chapters30} ch. et ${minutes30} min sur 30 jours`} tone={streak > 0 ? "positive" : "neutral"} icon={<Flame className="h-4 w-4" />} />
        <StatCard label="Canon couvert" value={`${((coveredChapters / TOTAL_BIBLE_CHAPTERS) * 100).toFixed(1)} %`} sub={`${coveredChapters} / ${TOTAL_BIBLE_CHAPTERS} chapitres distincts`} icon={<ListChecks className="h-4 w-4" />} />
      </div>

      <Panel title="Plans de lecture">
        {!plans.length ? (
          <p className="text-sm text-muted-foreground">Aucun plan. Créez « Bible en 1 an » pour viser la lecture intégrale sur 365 jours.</p>
        ) : (
          <div className="space-y-3">
            {progressList.map((pr) => (
              <div key={pr.plan.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {pr.plan.name}
                      {pr.plan.active && <Badge className="bg-emerald-500/15 text-emerald-400">Actif</Badge>}
                      <Badge variant="outline">{cadenceMeta(pr.plan.cadence).label}</Badge>
                      {pr.plan.whole_bible && <Badge variant="outline">Bible entière</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {fmtDay(pr.plan.start_date)} → {fmtDay(pr.plan.end_date)} · jour {pr.daysElapsed} / {pr.daysTotal}
                      {pr.plan.version ? ` · ${pr.plan.version}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setPlanDialog({ open: true, draft: pr.plan })}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => removePlan(pr.plan)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <Progress value={pr.pct} className="mt-3" />
                <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div><span className="text-muted-foreground">Lu : </span><span className="num">{pr.chaptersRead}</span></div>
                  <div><span className="text-muted-foreground">Attendu : </span><span className="num">{pr.expectedChapters}</span></div>
                  <div className={cn("num", pr.ahead >= 0 ? "text-positive" : "text-negative")}>
                    {pr.ahead >= 0 ? `+${pr.ahead}` : pr.ahead} ch. vs plan
                  </div>
                  <div><span className="text-muted-foreground">Fin projetée : </span>{fmtDay(pr.projectedEnd)}</div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{pr.verdict}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Dernières lectures">
          {!logs.length ? (
            <p className="text-sm text-muted-foreground">Aucune lecture enregistrée.</p>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto">
              {logs.slice(0, 60).map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-2 rounded-sm border border-border px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{l.book} {l.chapter_start}{l.chapter_end !== l.chapter_start ? `–${l.chapter_end}` : ""}</div>
                    <div className="text-xs text-muted-foreground">{fmtDay(l.read_on)} · {l.chapters} ch. · {l.minutes} min</div>
                    {l.reflection && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{l.reflection}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setLogDialog({ open: true, draft: l })}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => removeLog(l)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Couverture du canon">
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {coverage.map((b) => (
              <div key={b.name} className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 truncate">{b.name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${b.pct}%` }} />
                </div>
                <span className="num w-16 shrink-0 text-right text-muted-foreground">{b.read}/{b.chapters}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* -------- dialog plan -------- */}
      <Dialog open={planDialog.open} onOpenChange={(o) => setPlanDialog((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{planDialog.draft.id ? "Modifier le plan" : "Nouveau plan de lecture"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Nom</Label>
              <Input value={planDialog.draft.name ?? ""} onChange={(e) => setPlanDialog((s) => ({ ...s, draft: { ...s.draft, name: e.target.value } }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Version</Label>
                <Input value={planDialog.draft.version ?? ""} onChange={(e) => setPlanDialog((s) => ({ ...s, draft: { ...s.draft, version: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Cadence de suivi</Label>
                <Select value={planDialog.draft.cadence ?? "daily"} onValueChange={(v) => setPlanDialog((s) => ({ ...s, draft: { ...s.draft, cadence: v as BibleCadence } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CADENCES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Début</Label>
                <Input type="date" value={planDialog.draft.start_date ?? ""} onChange={(e) => setPlanDialog((s) => ({ ...s, draft: { ...s.draft, start_date: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Fin</Label>
                <Input type="date" value={planDialog.draft.end_date ?? ""} onChange={(e) => setPlanDialog((s) => ({ ...s, draft: { ...s.draft, end_date: e.target.value } }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-sm border border-border px-3 py-2">
              <div>
                <div className="text-sm">Objectif Bible entière</div>
                <div className="text-xs text-muted-foreground">{TOTAL_BIBLE_CHAPTERS} chapitres sur la période</div>
              </div>
              <Switch checked={planDialog.draft.whole_bible ?? true} onCheckedChange={(v) => setPlanDialog((s) => ({ ...s, draft: { ...s.draft, whole_bible: v } }))} />
            </div>
            {!(planDialog.draft.whole_bible ?? true) && (
              <div className="grid gap-1.5">
                <Label>Chapitres visés</Label>
                <Input type="number" value={planDialog.draft.target_chapters ?? 0} onChange={(e) => setPlanDialog((s) => ({ ...s, draft: { ...s.draft, target_chapters: Number(e.target.value) } }))} />
              </div>
            )}
            <div className="flex items-center justify-between rounded-sm border border-border px-3 py-2">
              <div className="text-sm">Plan actif</div>
              <Switch checked={planDialog.draft.active ?? true} onCheckedChange={(v) => setPlanDialog((s) => ({ ...s, draft: { ...s.draft, active: v } }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={planDialog.draft.notes ?? ""} onChange={(e) => setPlanDialog((s) => ({ ...s, draft: { ...s.draft, notes: e.target.value } }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog({ open: false, draft: emptyPlan() })}>Annuler</Button>
            <Button onClick={savePlan}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------- dialog lecture -------- */}
      <Dialog open={logDialog.open} onOpenChange={(o) => setLogDialog((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{logDialog.draft.id ? "Modifier la lecture" : "Saisir une lecture"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Date</Label>
                <Input type="date" value={logDialog.draft.read_on ?? ""} onChange={(e) => setLogDialog((s) => ({ ...s, draft: { ...s.draft, read_on: e.target.value } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Plan</Label>
                <Select value={logDialog.draft.plan_id ?? "none"} onValueChange={(v) => setLogDialog((s) => ({ ...s, draft: { ...s.draft, plan_id: v === "none" ? null : v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Hors plan</SelectItem>
                    {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Livre</Label>
              <Select value={logDialog.draft.book ?? ""} onValueChange={(v) => setLogDialog((s) => ({ ...s, draft: { ...s.draft, book: v } }))}>
                <SelectTrigger><SelectValue placeholder="Choisir un livre" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {BIBLE_BOOKS.map((b) => <SelectItem key={b.name} value={b.name}>{b.name} ({b.chapters} ch.)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>Du chapitre</Label>
                <Input type="number" min={1} max={bookChapters(logDialog.draft.book ?? "") || undefined} value={logDialog.draft.chapter_start ?? 1}
                  onChange={(e) => setLogDialog((s) => ({ ...s, draft: { ...s.draft, chapter_start: Number(e.target.value) } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Au chapitre</Label>
                <Input type="number" min={1} max={bookChapters(logDialog.draft.book ?? "") || undefined} value={logDialog.draft.chapter_end ?? 1}
                  onChange={(e) => setLogDialog((s) => ({ ...s, draft: { ...s.draft, chapter_end: Number(e.target.value) } }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Minutes</Label>
                <Input type="number" min={0} value={logDialog.draft.minutes ?? 0}
                  onChange={(e) => setLogDialog((s) => ({ ...s, draft: { ...s.draft, minutes: Number(e.target.value) } }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Réflexion / ce que j'ai retenu</Label>
              <Textarea rows={3} value={logDialog.draft.reflection ?? ""} onChange={(e) => setLogDialog((s) => ({ ...s, draft: { ...s.draft, reflection: e.target.value } }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogDialog({ open: false, draft: {} })}>Annuler</Button>
            <Button onClick={saveLog}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
