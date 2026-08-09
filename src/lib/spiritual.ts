/**
 * Section Spirituelle — logique pure et accès données.
 *
 * Quatre modules : lecture biblique (plans + suivi), notes de sermon,
 * étude biblique (cahier), quiz & learn fact (dérivés des trois autres).
 * Aucune écriture ici : uniquement des query options et des fonctions pures.
 */

import { supabaseOffline as supabase } from "@/lib/offline/client";
import { offlineSelect, byDateDesc } from "@/lib/offline/read";
import { queryOptions } from "@tanstack/react-query";
import { fetchAllRows } from "@/lib/fetch-all";

/* ------------------------------------------------------------------ types */

export type BibleCadence = "daily" | "weekly" | "monthly" | "quarterly" | "semester" | "annual";

export type BiblePlan = {
  id: string;
  user_id: string;
  name: string;
  version: string | null;
  cadence: BibleCadence;
  start_date: string;
  end_date: string | null;
  target_chapters: number;
  whole_bible: boolean;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type BibleReadingLog = {
  id: string;
  user_id: string;
  plan_id: string | null;
  read_on: string;
  book: string;
  chapter_start: number;
  chapter_end: number;
  chapters: number;
  minutes: number;
  reflection: string | null;
  created_at: string;
  updated_at: string;
};

export type SermonOutlinePoint = { heading: string; points: string[] };

export type SermonNote = {
  id: string;
  user_id: string;
  preached_on: string;
  title: string;
  preacher: string | null;
  church: string | null;
  series: string | null;
  main_text: string | null;
  key_verses: string[];
  big_idea: string | null;
  outline: SermonOutlinePoint[];
  applications: string | null;
  quotes: string | null;
  prayer: string | null;
  tags: string[];
  favorite: boolean;
  created_at: string;
  updated_at: string;
};

export type StudyKind = "theme" | "person" | "book" | "word" | "event";

export type BibleStudy = {
  id: string;
  user_id: string;
  kind: StudyKind;
  title: string;
  subject: string | null;
  summary: string | null;
  content: string | null;
  refs: string[];
  key_facts: string[];
  tags: string[];
  status: string;
  studied_on: string;
  created_at: string;
  updated_at: string;
};

export type QuizAttempt = {
  id: string;
  user_id: string;
  asked_on: string;
  source: string;
  question: string;
  answer: string | null;
  correct: boolean;
  points: number;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------- constantes */

export const CADENCES: { value: BibleCadence; label: string; days: number }[] = [
  { value: "daily", label: "Journalier", days: 1 },
  { value: "weekly", label: "Hebdomadaire", days: 7 },
  { value: "monthly", label: "Mensuel", days: 30 },
  { value: "quarterly", label: "Trimestriel", days: 91 },
  { value: "semester", label: "Semestriel", days: 182 },
  { value: "annual", label: "Annuel", days: 365 },
];

export const cadenceMeta = (c: BibleCadence) => CADENCES.find((x) => x.value === c) ?? CADENCES[0];

export const STUDY_KINDS: { value: StudyKind; label: string }[] = [
  { value: "theme", label: "Thématique" },
  { value: "person", label: "Personnage historique" },
  { value: "book", label: "Livre biblique" },
  { value: "word", label: "Mot / notion" },
  { value: "event", label: "Événement" },
];

export const studyKindLabel = (k: StudyKind) => STUDY_KINDS.find((x) => x.value === k)?.label ?? k;

export const STUDY_STATUSES: { value: string; label: string; className: string }[] = [
  { value: "en_cours", label: "En cours", className: "bg-sky-500/15 text-sky-400" },
  { value: "a_revoir", label: "À revoir", className: "bg-amber-500/15 text-amber-400" },
  { value: "maitrise", label: "Maîtrisé", className: "bg-emerald-500/15 text-emerald-400" },
];

export const studyStatusMeta = (s: string) => STUDY_STATUSES.find((x) => x.value === s) ?? STUDY_STATUSES[0];

/** Canon protestant : 66 livres et leur nombre de chapitres (total 1189). */
export const BIBLE_BOOKS: { name: string; chapters: number; testament: "AT" | "NT" }[] = [
  { name: "Genèse", chapters: 50, testament: "AT" },
  { name: "Exode", chapters: 40, testament: "AT" },
  { name: "Lévitique", chapters: 27, testament: "AT" },
  { name: "Nombres", chapters: 36, testament: "AT" },
  { name: "Deutéronome", chapters: 34, testament: "AT" },
  { name: "Josué", chapters: 24, testament: "AT" },
  { name: "Juges", chapters: 21, testament: "AT" },
  { name: "Ruth", chapters: 4, testament: "AT" },
  { name: "1 Samuel", chapters: 31, testament: "AT" },
  { name: "2 Samuel", chapters: 24, testament: "AT" },
  { name: "1 Rois", chapters: 22, testament: "AT" },
  { name: "2 Rois", chapters: 25, testament: "AT" },
  { name: "1 Chroniques", chapters: 29, testament: "AT" },
  { name: "2 Chroniques", chapters: 36, testament: "AT" },
  { name: "Esdras", chapters: 10, testament: "AT" },
  { name: "Néhémie", chapters: 13, testament: "AT" },
  { name: "Esther", chapters: 10, testament: "AT" },
  { name: "Job", chapters: 42, testament: "AT" },
  { name: "Psaumes", chapters: 150, testament: "AT" },
  { name: "Proverbes", chapters: 31, testament: "AT" },
  { name: "Ecclésiaste", chapters: 12, testament: "AT" },
  { name: "Cantique des cantiques", chapters: 8, testament: "AT" },
  { name: "Ésaïe", chapters: 66, testament: "AT" },
  { name: "Jérémie", chapters: 52, testament: "AT" },
  { name: "Lamentations", chapters: 5, testament: "AT" },
  { name: "Ézéchiel", chapters: 48, testament: "AT" },
  { name: "Daniel", chapters: 12, testament: "AT" },
  { name: "Osée", chapters: 14, testament: "AT" },
  { name: "Joël", chapters: 3, testament: "AT" },
  { name: "Amos", chapters: 9, testament: "AT" },
  { name: "Abdias", chapters: 1, testament: "AT" },
  { name: "Jonas", chapters: 4, testament: "AT" },
  { name: "Michée", chapters: 7, testament: "AT" },
  { name: "Nahum", chapters: 3, testament: "AT" },
  { name: "Habacuc", chapters: 3, testament: "AT" },
  { name: "Sophonie", chapters: 3, testament: "AT" },
  { name: "Aggée", chapters: 2, testament: "AT" },
  { name: "Zacharie", chapters: 14, testament: "AT" },
  { name: "Malachie", chapters: 4, testament: "AT" },
  { name: "Matthieu", chapters: 28, testament: "NT" },
  { name: "Marc", chapters: 16, testament: "NT" },
  { name: "Luc", chapters: 24, testament: "NT" },
  { name: "Jean", chapters: 21, testament: "NT" },
  { name: "Actes", chapters: 28, testament: "NT" },
  { name: "Romains", chapters: 16, testament: "NT" },
  { name: "1 Corinthiens", chapters: 16, testament: "NT" },
  { name: "2 Corinthiens", chapters: 13, testament: "NT" },
  { name: "Galates", chapters: 6, testament: "NT" },
  { name: "Éphésiens", chapters: 6, testament: "NT" },
  { name: "Philippiens", chapters: 4, testament: "NT" },
  { name: "Colossiens", chapters: 4, testament: "NT" },
  { name: "1 Thessaloniciens", chapters: 5, testament: "NT" },
  { name: "2 Thessaloniciens", chapters: 3, testament: "NT" },
  { name: "1 Timothée", chapters: 6, testament: "NT" },
  { name: "2 Timothée", chapters: 4, testament: "NT" },
  { name: "Tite", chapters: 3, testament: "NT" },
  { name: "Philémon", chapters: 1, testament: "NT" },
  { name: "Hébreux", chapters: 13, testament: "NT" },
  { name: "Jacques", chapters: 5, testament: "NT" },
  { name: "1 Pierre", chapters: 5, testament: "NT" },
  { name: "2 Pierre", chapters: 3, testament: "NT" },
  { name: "1 Jean", chapters: 5, testament: "NT" },
  { name: "2 Jean", chapters: 1, testament: "NT" },
  { name: "3 Jean", chapters: 1, testament: "NT" },
  { name: "Jude", chapters: 1, testament: "NT" },
  { name: "Apocalypse", chapters: 22, testament: "NT" },
];

export const TOTAL_BIBLE_CHAPTERS = BIBLE_BOOKS.reduce((s, b) => s + b.chapters, 0);

export const bookChapters = (name: string) => BIBLE_BOOKS.find((b) => b.name === name)?.chapters ?? 0;

/* ---------------------------------------------------------- query options */

const all = <T,>(table: string) =>
  fetchAllRows<T>((from, to) => (supabase as any).from(table).select("*").range(from, to));

export const qkBiblePlans = ["bible_plans"] as const;
export const biblePlansQO = queryOptions({
  queryKey: qkBiblePlans,
  queryFn: async () =>
    (await offlineSelect<any>("bible_plans" as any, () => all<any>("bible_plans"), {
      sort: byDateDesc("start_date"),
    })) as BiblePlan[],
});

export const qkBibleLogs = ["bible_reading_logs"] as const;
export const bibleLogsQO = queryOptions({
  queryKey: qkBibleLogs,
  queryFn: async () =>
    (await offlineSelect<any>("bible_reading_logs" as any, () => all<any>("bible_reading_logs"), {
      sort: byDateDesc("read_on"),
    })) as BibleReadingLog[],
});

export const qkSermons = ["sermon_notes"] as const;
export const sermonsQO = queryOptions({
  queryKey: qkSermons,
  queryFn: async () =>
    (await offlineSelect<any>("sermon_notes" as any, () => all<any>("sermon_notes"), {
      sort: byDateDesc("preached_on"),
    })) as SermonNote[],
});

export const qkStudies = ["bible_studies"] as const;
export const studiesQO = queryOptions({
  queryKey: qkStudies,
  queryFn: async () =>
    (await offlineSelect<any>("bible_studies" as any, () => all<any>("bible_studies"), {
      sort: byDateDesc("studied_on"),
    })) as BibleStudy[],
});

export const qkQuizAttempts = ["quiz_attempts"] as const;
export const quizAttemptsQO = queryOptions({
  queryKey: qkQuizAttempts,
  queryFn: async () =>
    (await offlineSelect<any>("quiz_attempts" as any, () => all<any>("quiz_attempts"), {
      sort: byDateDesc("asked_on"),
    })) as QuizAttempt[],
});

/* ----------------------------------------------------------- dates utiles */

export const ymdLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const addDaysLocal = (d: Date, n: number) => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

const dayDiff = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);

export const fmtDay = (s?: string | null) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/* -------------------------------------------------- progression de lecture */

export type PlanProgress = {
  plan: BiblePlan;
  chaptersRead: number;
  target: number;
  pct: number;
  daysElapsed: number;
  daysTotal: number;
  expectedChapters: number;
  ahead: number;              // chapitres d'avance (négatif = retard)
  perDayNeeded: number;       // rythme requis pour finir à temps
  perCadenceNeeded: number;   // rythme requis sur la cadence choisie
  perDayActual: number;
  projectedEnd: string | null;
  verdict: string;
  onTrack: boolean;
};

export function planProgress(plan: BiblePlan, logs: BibleReadingLog[], today = new Date()): PlanProgress {
  const todayStr = ymdLocal(today);
  const mine = logs.filter((l) => l.plan_id === plan.id);
  const chaptersRead = mine.reduce((s, l) => s + Math.max(0, Number(l.chapters) || 0), 0);
  const target = Math.max(1, plan.whole_bible ? TOTAL_BIBLE_CHAPTERS : Number(plan.target_chapters) || 1);
  const end = plan.end_date ?? ymdLocal(addDaysLocal(new Date(`${plan.start_date}T00:00:00`), 364));
  const daysTotal = Math.max(1, dayDiff(plan.start_date, end) + 1);
  const daysElapsed = Math.min(daysTotal, Math.max(0, dayDiff(plan.start_date, todayStr) + 1));
  const expectedChapters = Math.round((target / daysTotal) * daysElapsed);
  const perDayNeeded = Math.max(0, (target - chaptersRead) / Math.max(1, daysTotal - daysElapsed + 1));
  const perDayActual = daysElapsed > 0 ? chaptersRead / daysElapsed : 0;
  const remaining = Math.max(0, target - chaptersRead);
  const projectedEnd =
    perDayActual > 0 ? ymdLocal(addDaysLocal(today, Math.ceil(remaining / perDayActual))) : null;
  const ahead = chaptersRead - expectedChapters;
  const pct = Math.min(100, (chaptersRead / target) * 100);
  const onTrack = ahead >= 0;
  const verdict =
    chaptersRead >= target ? "Objectif atteint : Bible parcourue en entier."
    : ahead >= target * 0.02 ? "En avance sur le plan, rythme confortable."
    : onTrack ? "Dans les temps : maintenir le rythme actuel."
    : ahead > -target * 0.05 ? "Léger retard, rattrapable en quelques jours."
    : "Retard net : augmenter le nombre de chapitres par séance.";
  return {
    plan, chaptersRead, target, pct, daysElapsed, daysTotal, expectedChapters, ahead,
    perDayNeeded, perCadenceNeeded: perDayNeeded * cadenceMeta(plan.cadence).days,
    perDayActual, projectedEnd, verdict, onTrack,
  };
}

/** Couverture du canon : chapitres distincts lus par livre. */
export function bookCoverage(logs: BibleReadingLog[]) {
  const m = new Map<string, Set<number>>();
  for (const l of logs) {
    const set = m.get(l.book) ?? new Set<number>();
    const a = Math.min(l.chapter_start, l.chapter_end);
    const b = Math.max(l.chapter_start, l.chapter_end);
    for (let c = a; c <= b; c++) set.add(c);
    m.set(l.book, set);
  }
  return BIBLE_BOOKS.map((b) => {
    const read = m.get(b.name)?.size ?? 0;
    return { ...b, read: Math.min(read, b.chapters), pct: b.chapters ? Math.min(100, (read / b.chapters) * 100) : 0 };
  });
}

/** Série de jours consécutifs avec au moins une lecture. */
export function readingStreak(logs: BibleReadingLog[], today = new Date()): number {
  const days = new Set(logs.map((l) => l.read_on));
  let streak = 0;
  let cursor = new Date(today);
  if (!days.has(ymdLocal(cursor))) cursor = addDaysLocal(cursor, -1);
  while (days.has(ymdLocal(cursor))) {
    streak += 1;
    cursor = addDaysLocal(cursor, -1);
  }
  return streak;
}

/* -------------------------------------------------------- points & statut */

export const POINTS_CORRECT = 2;
export const POINTS_WRONG = -1;
export const POINTS_DECAY_PER_IDLE_DAY = -1;

export const POINT_TIERS: { min: number; max: number; label: string; className: string; advice: string }[] = [
  { min: -Infinity, max: -1, label: "Décrochage", className: "bg-red-500/15 text-red-400", advice: "Reprenez avec un quiz par jour : chaque bonne réponse remonte le score." },
  { min: 0, max: 5, label: "Mauvais", className: "bg-red-500/15 text-red-400", advice: "Un quiz quotidien suffit pour dépasser 6 points en trois jours." },
  { min: 6, max: 9, label: "Peut mieux faire", className: "bg-amber-500/15 text-amber-400", advice: "Alimentez sermons et études : plus de contenu, plus de questions." },
  { min: 10, max: 19, label: "En progrès", className: "bg-sky-500/15 text-sky-400", advice: "Régularité installée, visez la série de 7 jours." },
  { min: 20, max: 39, label: "Bon", className: "bg-sky-500/15 text-sky-400", advice: "Bon niveau : ajoutez des faits clés à vos études pour varier les questions." },
  { min: 40, max: 69, label: "Solide", className: "bg-emerald-500/15 text-emerald-400", advice: "Solide. Concentrez-vous sur la lecture annuelle complète." },
  { min: 70, max: 119, label: "Très bon", className: "bg-emerald-500/15 text-emerald-400", advice: "Très bon. Relisez les études marquées « À revoir »." },
  { min: 120, max: Infinity, label: "Excellent", className: "bg-primary/15 text-primary", advice: "Excellent : transmettez, enseignez ce que vous avez appris." },
];

export const tierFor = (points: number) =>
  POINT_TIERS.find((t) => points >= t.min && points <= t.max) ?? POINT_TIERS[0];

export type PointsSummary = {
  earned: number;
  decay: number;
  total: number;
  idleDays: number;
  streak: number;
  answered: number;
  correct: number;
  accuracy: number;
  todayAnswered: number;
  tier: ReturnType<typeof tierFor>;
  nextTierAt: number | null;
};

/**
 * Score = points gagnés/perdus au quiz − 1 point par jour sans aucune réponse
 * (depuis la première participation, aujourd'hui excepté).
 */
export function pointsSummary(attempts: QuizAttempt[], today = new Date()): PointsSummary {
  const todayStr = ymdLocal(today);
  const earned = attempts.reduce((s, a) => s + (Number(a.points) || 0), 0);
  const days = new Set(attempts.map((a) => a.asked_on));
  const first = attempts.length ? [...days].sort()[0] : todayStr;
  const span = Math.max(0, dayDiff(first, todayStr)); // hors aujourd'hui
  let idleDays = 0;
  for (let i = 0; i < span; i++) {
    const d = ymdLocal(addDaysLocal(new Date(`${first}T00:00:00`), i));
    if (!days.has(d)) idleDays += 1;
  }
  const decay = idleDays * POINTS_DECAY_PER_IDLE_DAY;
  const total = earned + decay;
  const answered = attempts.length;
  const correct = attempts.filter((a) => a.correct).length;

  let streak = 0;
  let cursor = new Date(today);
  if (!days.has(ymdLocal(cursor))) cursor = addDaysLocal(cursor, -1);
  while (days.has(ymdLocal(cursor))) {
    streak += 1;
    cursor = addDaysLocal(cursor, -1);
  }

  const tier = tierFor(total);
  const nextTierAt = Number.isFinite(tier.max) ? tier.max + 1 : null;
  return {
    earned, decay, total, idleDays, streak, answered, correct,
    accuracy: answered ? (correct / answered) * 100 : 0,
    todayAnswered: attempts.filter((a) => a.asked_on === todayStr).length,
    tier, nextTierAt,
  };
}

/* ------------------------------------------------------------ quiz & fact */

export type QuizQuestion = {
  id: string;
  source: "sermon" | "study" | "reading";
  prompt: string;
  options: string[];
  answer: string;
  hint?: string;
};

/** PRNG déterministe (mulberry32) pour un tirage stable par jour si besoin. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const seedFromString = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

function pickDistractors(pool: string[], answer: string, rng: () => number, n = 3): string[] {
  const uniq = [...new Set(pool.map((x) => (x ?? "").trim()).filter((x) => x && x !== answer.trim()))];
  const out: string[] = [];
  while (out.length < n && uniq.length) {
    const i = Math.floor(rng() * uniq.length);
    out.push(uniq.splice(i, 1)[0]);
  }
  return out;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Construit la banque de questions à partir des trois autres modules. */
export function buildQuizBank(
  sermons: SermonNote[],
  studies: BibleStudy[],
  logs: BibleReadingLog[],
  rng: () => number = Math.random,
): QuizQuestion[] {
  const bank: QuizQuestion[] = [];
  const add = (q: QuizQuestion | null) => { if (q && q.options.length >= 2) bank.push(q); };

  const build = (
    id: string, source: QuizQuestion["source"], prompt: string, answer: string | null | undefined,
    pool: string[], hint?: string,
  ): QuizQuestion | null => {
    const a = (answer ?? "").trim();
    if (!a) return null;
    const opts = shuffle([a, ...pickDistractors(pool, a, rng)], rng);
    return { id, source, prompt, options: opts, answer: a, hint };
  };

  const preachers = sermons.map((s) => s.preacher ?? "").filter(Boolean);
  const titles = sermons.map((s) => s.title);
  const ideas = sermons.map((s) => s.big_idea ?? "").filter(Boolean);
  const texts = sermons.map((s) => s.main_text ?? "").filter(Boolean);

  for (const s of sermons) {
    add(build(`s-preacher-${s.id}`, "sermon", `Qui a prêché « ${s.title} » ?`, s.preacher, preachers, fmtDay(s.preached_on)));
    add(build(`s-text-${s.id}`, "sermon", `Quel est le texte principal du sermon « ${s.title} » ?`, s.main_text, texts));
    add(build(`s-idea-${s.id}`, "sermon", `Quelle est l'idée maîtresse de « ${s.title} » ?`, s.big_idea, ideas));
    if (s.big_idea) add(build(`s-title-${s.id}`, "sermon", `À quel sermon correspond cette idée maîtresse : « ${s.big_idea} » ?`, s.title, titles));
    const first = s.outline?.[0]?.heading;
    if (first) add(build(`s-outline-${s.id}`, "sermon", `Quel est le premier point du plan de « ${s.title} » ?`, first, sermons.flatMap((x) => (x.outline ?? []).map((o) => o.heading))));
  }

  const studyTitles = studies.map((s) => s.title);
  const subjects = studies.map((s) => s.subject ?? "").filter(Boolean);
  const facts = studies.flatMap((s) => s.key_facts ?? []);
  const kinds = STUDY_KINDS.map((k) => k.label);

  for (const st of studies) {
    add(build(`st-kind-${st.id}`, "study", `De quel type est l'étude « ${st.title} » ?`, studyKindLabel(st.kind), kinds));
    add(build(`st-subject-${st.id}`, "study", `Quel est le sujet central de l'étude « ${st.title} » ?`, st.subject, subjects));
    for (const [i, f] of (st.key_facts ?? []).entries()) {
      add(build(`st-fact-${st.id}-${i}`, "study", `À quelle étude appartient ce fait clé : « ${f} » ?`, st.title, studyTitles));
    }
    const ref = (st.refs ?? [])[0];
    if (ref) add(build(`st-ref-${st.id}`, "study", `Quelle référence biblique appuie l'étude « ${st.title} » ?`, ref, studies.flatMap((x) => x.refs ?? [])));
    void facts;
  }

  const books = [...new Set(logs.map((l) => l.book))];
  for (const l of logs.slice(0, 60)) {
    add(build(`r-book-${l.id}`, "reading", `Quel livre avez-vous lu le ${fmtDay(l.read_on)} ?`, l.book, books.length > 1 ? books : BIBLE_BOOKS.map((b) => b.name)));
    add(build(
      `r-chapters-${l.id}`, "reading",
      `Combien de chapitres de ${l.book} avez-vous lus le ${fmtDay(l.read_on)} ?`,
      String(l.chapters),
      [String(l.chapters + 1), String(Math.max(1, l.chapters - 1)), String(l.chapters + 3), String(l.chapters + 2)],
    ));
  }

  // Culture biblique de base issue du canon (toujours disponible).
  for (const b of shuffle(BIBLE_BOOKS, rng).slice(0, 12)) {
    add(build(
      `b-chapters-${b.name}`, "reading",
      `Combien de chapitres compte le livre de ${b.name} ?`,
      String(b.chapters),
      BIBLE_BOOKS.filter((x) => x.name !== b.name).map((x) => String(x.chapters)),
      b.testament === "AT" ? "Ancien Testament" : "Nouveau Testament",
    ));
    add(build(
      `b-testament-${b.name}`, "reading",
      `Le livre de ${b.name} appartient à quel testament ?`,
      b.testament === "AT" ? "Ancien Testament" : "Nouveau Testament",
      ["Ancien Testament", "Nouveau Testament"],
    ));
  }

  return bank;
}

export type LearnFact = { id: string; title: string; body: string; source: string };

/** « Le saviez-vous » du jour, tiré des trois modules puis du canon. */
export function buildLearnFacts(
  sermons: SermonNote[],
  studies: BibleStudy[],
  logs: BibleReadingLog[],
): LearnFact[] {
  const facts: LearnFact[] = [];

  for (const st of studies) {
    for (const [i, f] of (st.key_facts ?? []).entries()) {
      facts.push({ id: `st-${st.id}-${i}`, title: st.title, body: f, source: `Étude · ${studyKindLabel(st.kind)}` });
    }
    if (st.summary) facts.push({ id: `st-sum-${st.id}`, title: st.title, body: st.summary, source: `Étude · ${studyKindLabel(st.kind)}` });
  }
  for (const s of sermons) {
    if (s.big_idea) facts.push({ id: `s-${s.id}`, title: s.title, body: s.big_idea, source: `Sermon · ${s.preacher ?? "prédicateur inconnu"}` });
    for (const [i, v] of (s.key_verses ?? []).entries()) {
      facts.push({ id: `s-v-${s.id}-${i}`, title: s.title, body: `Verset clé retenu : ${v}`, source: "Sermon" });
    }
    if (s.quotes) facts.push({ id: `s-q-${s.id}`, title: s.title, body: s.quotes, source: "Sermon · citation" });
  }
  for (const l of logs.slice(0, 40)) {
    if (l.reflection) facts.push({ id: `r-${l.id}`, title: `${l.book} ${l.chapter_start}–${l.chapter_end}`, body: l.reflection, source: `Lecture du ${fmtDay(l.read_on)}` });
  }

  const at = BIBLE_BOOKS.filter((b) => b.testament === "AT");
  const nt = BIBLE_BOOKS.filter((b) => b.testament === "NT");
  facts.push(
    { id: "canon-1", title: "Le canon en chiffres", body: `La Bible protestante compte 66 livres et ${TOTAL_BIBLE_CHAPTERS} chapitres : ${at.length} livres pour l'Ancien Testament et ${nt.length} pour le Nouveau.`, source: "Culture biblique" },
    { id: "canon-2", title: "Le plus long livre", body: "Les Psaumes forment le livre le plus long avec 150 chapitres ; Abdias, Philémon, 2 et 3 Jean et Jude n'en comptent qu'un seul.", source: "Culture biblique" },
    { id: "canon-3", title: "Lire la Bible en un an", body: `Lire l'intégralité de la Bible en un an demande environ ${(TOTAL_BIBLE_CHAPTERS / 365).toFixed(1)} chapitres par jour, soit environ ${Math.round((TOTAL_BIBLE_CHAPTERS / 365) * 4)} minutes de lecture quotidienne.`, source: "Culture biblique" },
  );

  return facts;
}

/** Fait du jour : sélection déterministe pour une même date. */
export function factOfTheDay(facts: LearnFact[], day: string): LearnFact | null {
  if (!facts.length) return null;
  const rng = makeRng(seedFromString(day));
  return facts[Math.floor(rng() * facts.length)];
}
