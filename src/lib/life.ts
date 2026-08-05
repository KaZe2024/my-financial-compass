/**
 * Vague 3 — la dimension « vie ».
 *
 * Fonctions pures : domaines de vie déclarés, répartition réelle du temps par
 * domaine, traces d'habitudes et cadre de la revue hebdomadaire.
 * Aucun accès réseau, aucune écriture.
 */

import { occurrencesInRange, isClosed, ymd, addDays, parseYmd, type PlanItem, type PlanItemTag } from "@/lib/planning";

export type LifeDomain = {
  id: string;
  user_id: string;
  label: string;
  weight: number;
  color: string;
  sort_order: number;
  archived: boolean;
  match_type_ids: string[] | null;
  match_project_ids: string[] | null;
  match_tag_ids: string[] | null;
  keywords: string[] | null;
  notes: string | null;
};

export type WeeklyReview = {
  id: string;
  user_id: string;
  week_start: string;
  wins: string | null;
  misses: string | null;
  lessons: string | null;
  next_focus: string | null;
  finance_note: string | null;
  execution_score: number | null;
  alignment_score: number | null;
  finance_score: number | null;
  life_score: number | null;
  completed_at: string | null;
};

export const DOMAIN_PALETTE = [
  "#38bdf8", "#34d399", "#f59e0b", "#a78bfa", "#f472b6", "#22d3ee", "#fb7185", "#84cc16",
];

/** Domaines proposés au premier lancement (l'utilisateur ajuste ensuite). */
export const DOMAIN_PRESETS: Array<{ label: string; weight: number; keywords: string[] }> = [
  { label: "Santé & énergie", weight: 20, keywords: ["sport", "sommeil", "santé", "médecin", "marche"] },
  { label: "Travail & revenus", weight: 30, keywords: ["client", "mission", "facture", "réunion", "projet"] },
  { label: "Famille & proches", weight: 20, keywords: ["famille", "enfant", "parents", "appel"] },
  { label: "Finances & patrimoine", weight: 10, keywords: ["budget", "banque", "épargne", "impôt"] },
  { label: "Apprentissage", weight: 10, keywords: ["lecture", "cours", "formation", "étude"] },
  { label: "Repos & loisirs", weight: 10, keywords: ["repos", "loisir", "film", "sortie", "voyage"] },
];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Durée retenue pour une occurrence : durée saisie, sinon plage horaire, sinon 30 min. */
export function occurrenceMinutes(item: PlanItem, fallback = 30): number {
  if (item.duration_minutes && item.duration_minutes > 0) return item.duration_minutes;
  if (item.start_time && item.end_time) {
    const [h1, m1] = item.start_time.split(":").map(Number);
    const [h2, m2] = item.end_time.split(":").map(Number);
    const mins = h2 * 60 + m2 - (h1 * 60 + m1);
    if (mins > 0) return mins;
  }
  return fallback;
}

/** Retourne l'id du domaine correspondant à un élément, ou null. */
export function domainForItem(
  item: PlanItem,
  domains: LifeDomain[],
  tagIdsByItem: Map<string, string[]>,
): string | null {
  const tags = tagIdsByItem.get(item.id) ?? [];
  const title = norm(`${item.title} ${item.notes ?? ""}`);
  // 1) rattachements explicites (tags > projet > type), 2) mots-clés
  for (const pass of [0, 1] as const) {
    for (const dm of domains) {
      if (dm.archived) continue;
      if (pass === 0) {
        if ((dm.match_tag_ids ?? []).some((t) => tags.includes(t))) return dm.id;
        if (item.project_id && (dm.match_project_ids ?? []).includes(item.project_id)) return dm.id;
        if (item.type_id && (dm.match_type_ids ?? []).includes(item.type_id)) return dm.id;
      } else {
        if ((dm.keywords ?? []).some((k) => k.trim() && title.includes(norm(k.trim())))) return dm.id;
      }
    }
  }
  return null;
}

export type DomainTimeRow = {
  id: string;
  label: string;
  color: string;
  minutes: number;
  occurrences: number;
  done: number;
  targetPct: number;
  actualPct: number;
  gap: number;
};

export type DomainTimeResult = {
  rows: DomainTimeRow[];
  unassignedMinutes: number;
  unassignedOccurrences: number;
  totalMinutes: number;
  days: number;
};

/** Temps réellement planifié / réalisé par domaine sur une fenêtre. */
export function computeDomainTime(
  items: PlanItem[],
  domains: LifeDomain[],
  itemTags: PlanItemTag[],
  from: Date,
  to: Date,
): DomainTimeResult {
  const tagIdsByItem = new Map<string, string[]>();
  for (const t of itemTags) {
    const list = tagIdsByItem.get(t.item_id) ?? [];
    list.push(t.tag_id);
    tagIdsByItem.set(t.item_id, list);
  }

  const active = domains.filter((d) => !d.archived);
  const acc = new Map<string, { minutes: number; occ: number; done: number }>();
  for (const d of active) acc.set(d.id, { minutes: 0, occ: 0, done: 0 });
  let unassignedMinutes = 0;
  let unassignedOcc = 0;

  for (const item of items) {
    const occ = occurrencesInRange(item, from, to);
    if (!occ.length) continue;
    const mins = occurrenceMinutes(item);
    const domainId = domainForItem(item, active, tagIdsByItem);
    const done = item.status === "done";
    if (!domainId) {
      unassignedMinutes += mins * occ.length;
      unassignedOcc += occ.length;
      continue;
    }
    const bucket = acc.get(domainId)!;
    bucket.minutes += mins * occ.length;
    bucket.occ += occ.length;
    if (done) bucket.done += occ.length;
  }

  const totalMinutes = [...acc.values()].reduce((s, b) => s + b.minutes, 0);
  const totalWeight = active.reduce((s, d) => s + Math.max(0, Number(d.weight) || 0), 0);

  const rows: DomainTimeRow[] = active.map((d) => {
    const b = acc.get(d.id)!;
    const targetPct = totalWeight > 0 ? (Math.max(0, Number(d.weight) || 0) / totalWeight) * 100 : 0;
    const actualPct = totalMinutes > 0 ? (b.minutes / totalMinutes) * 100 : 0;
    return {
      id: d.id,
      label: d.label,
      color: d.color,
      minutes: b.minutes,
      occurrences: b.occ,
      done: b.done,
      targetPct,
      actualPct,
      gap: actualPct - targetPct,
    };
  });
  rows.sort((a, b) => b.minutes - a.minutes);

  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  return { rows, unassignedMinutes, unassignedOccurrences: unassignedOcc, totalMinutes, days };
}

export type HabitTrace = {
  item: PlanItem;
  expected: number;
  done: number;
  adherence: number;      // %
  streak: number;         // jours consécutifs tenus (en remontant)
  bestStreak: number;
  lastDay: string | null;
  days: Array<{ day: string; expected: boolean; done: boolean }>;
  domainId: string | null;
};

/**
 * Traces d'habitudes : pour chaque élément récurrent, les jours attendus sur la
 * fenêtre, la tenue et les séries. Une occurrence échue compte comme tenue si
 * l'élément est terminé (le modèle de données ne trace pas encore le jour).
 */
export function computeHabitTraces(
  items: PlanItem[],
  domains: LifeDomain[],
  itemTags: PlanItemTag[],
  today = new Date(),
  windowDays = 28,
): HabitTrace[] {
  const tagIdsByItem = new Map<string, string[]>();
  for (const t of itemTags) {
    const list = tagIdsByItem.get(t.item_id) ?? [];
    list.push(t.tag_id);
    tagIdsByItem.set(t.item_id, list);
  }
  const active = domains.filter((d) => !d.archived);
  const todayStr = ymd(today);
  const from = addDays(today, -(windowDays - 1));

  const traces: HabitTrace[] = [];
  for (const item of items) {
    if (item.recurrence === "none") continue;
    const occ = new Set(occurrencesInRange(item, from, today));
    if (!occ.size) continue;
    const done = item.status === "done";
    const closed = isClosed(item.status);

    const days: HabitTrace["days"] = [];
    for (let i = 0; i < windowDays; i++) {
      const day = ymd(addDays(from, i));
      const expected = occ.has(day);
      days.push({ day, expected, done: expected && day <= todayStr && done });
    }
    const dueDays = days.filter((d) => d.expected && d.day <= todayStr);
    const doneDays = dueDays.filter((d) => d.done);

    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i];
      if (d.day > todayStr || !d.expected) continue;
      if (d.done) streak += 1;
      else break;
    }
    let best = 0;
    let run = 0;
    for (const d of days) {
      if (!d.expected || d.day > todayStr) continue;
      if (d.done) { run += 1; best = Math.max(best, run); } else run = 0;
    }

    traces.push({
      item,
      expected: dueDays.length,
      done: doneDays.length,
      adherence: dueDays.length ? (doneDays.length / dueDays.length) * 100 : 0,
      streak,
      bestStreak: best,
      lastDay: dueDays.length ? dueDays[dueDays.length - 1].day : null,
      days,
      domainId: domainForItem(item, active, tagIdsByItem),
    });
    void closed;
  }
  traces.sort((a, b) => b.adherence - a.adherence || b.expected - a.expected);
  return traces;
}

/** Lundi de la semaine contenant `d`. */
export function weekStart(d: Date): Date {
  const day = d.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  const out = addDays(d, delta);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function weekLabel(weekStartYmd: string): string {
  const s = parseYmd(weekStartYmd);
  const e = addDays(s, 6);
  const f = (x: Date) => x.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  return `${f(s)} → ${f(e)}`;
}

export const REVIEW_STEPS: Array<{ key: keyof WeeklyReview | "recap"; title: string; hint: string }> = [
  { key: "recap", title: "1 · Constat", hint: "Ce que disent les chiffres de la semaine (exécution, alignement, finances)." },
  { key: "wins", title: "2 · Réussites", hint: "Qu'est-ce qui a fonctionné, et pourquoi ?" },
  { key: "misses", title: "3 · Manques", hint: "Qu'est-ce qui n'a pas été fait, et qu'est-ce qui a bloqué ?" },
  { key: "lessons", title: "4 · Enseignements", hint: "Une règle à garder pour les semaines suivantes." },
  { key: "next_focus", title: "5 · Focus de la semaine", hint: "Trois priorités maximum, formulées comme des actions." },
];

/** Petit commentaire qualitatif sur l'alignement temps / priorités. */
export function alignmentCommentary(res: DomainTimeResult): { verdict: string; lines: string[] } {
  if (!res.rows.length) {
    return { verdict: "Priorités non déclarées", lines: ["Déclarez 3 à 7 domaines de vie avec un poids cible pour activer la mesure d'alignement."] };
  }
  if (res.totalMinutes <= 0) {
    return { verdict: "Aucun temps rattaché", lines: ["Rattachez vos types, projets ou tags de planification à un domaine pour que le temps soit compté."] };
  }
  const over = res.rows.filter((r) => r.gap > 8).sort((a, b) => b.gap - a.gap);
  const under = res.rows.filter((r) => r.gap < -8).sort((a, b) => a.gap - b.gap);
  const divergence = res.rows.reduce((s, r) => s + Math.abs(r.gap), 0) / 2;
  const verdict =
    divergence < 10 ? "Temps aligné sur vos priorités"
    : divergence < 25 ? "Alignement correct, deux arbitrages à faire"
    : divergence < 45 ? "Décalage net entre intentions et emploi du temps"
    : "Emploi du temps déconnecté des priorités déclarées";
  const lines: string[] = [];
  for (const r of under.slice(0, 2)) {
    lines.push(`${r.label} : ${r.actualPct.toFixed(0)} % du temps pour une cible de ${r.targetPct.toFixed(0)} % — bloquer un créneau récurrent.`);
  }
  for (const r of over.slice(0, 2)) {
    lines.push(`${r.label} absorbe ${r.actualPct.toFixed(0)} % du temps (cible ${r.targetPct.toFixed(0)} %) — déléguer ou plafonner.`);
  }
  if (res.unassignedMinutes > res.totalMinutes * 0.3) {
    lines.push(`${Math.round(res.unassignedMinutes / 60)} h non rattachées à un domaine : la mesure reste partielle.`);
  }
  if (!lines.length) lines.push("Aucun écart significatif : conserver la structure actuelle de la semaine.");
  return { verdict, lines };
}

export function fmtHours(minutes: number): string {
  if (!minutes) return "0 h";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}
