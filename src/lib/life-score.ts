/**
 * Scores complémentaires au score de santé financière :
 *   - exécution : ce qui était planifié a-t-il été fait ?
 *   - alignement : le temps passé correspond-il aux priorités déclarées ?
 *
 * Fonctions pures — elles n'écrivent rien et ne dépendent d'aucun réseau.
 */

import { occurrencesInRange, isClosed, ymd, addDays, type PlanItem } from "@/lib/planning";

export type ScorePart = { label: string; value: number; max: number };

export type ExecutionScore = {
  score: number;              // 0..100
  completionRate: number;     // % des occurrences échues réalisées
  overdue: number;            // occurrences échues encore ouvertes
  habitAdherence: number | null; // % de tenue des habitudes, null si aucune
  streak: number;             // jours consécutifs sans retard
  plannedDays: number;
  parts: ScorePart[];
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

const isHabit = (i: PlanItem) => i.recurrence !== "none";

/**
 * Exécution mesurée sur une fenêtre glissante (30 jours par défaut).
 * Une occurrence échue compte comme réalisée si son élément est terminé.
 */
export function computeExecutionScore(items: PlanItem[], today = new Date(), windowDays = 30): ExecutionScore {
  const from = addDays(today, -windowDays);
  const todayStr = ymd(today);

  let dueTotal = 0;
  let dueDone = 0;
  let overdue = 0;
  let habitDue = 0;
  let habitDone = 0;
  const daysWithOverdue = new Set<string>();
  const plannedDays = new Set<string>();

  for (const item of items) {
    const occ = occurrencesInRange(item, from, today);
    if (!occ.length) continue;
    const closed = isClosed(item.status);
    const done = item.status === "done";
    for (const day of occ) {
      plannedDays.add(day);
      if (day > todayStr) continue;
      dueTotal += 1;
      if (done) dueDone += 1;
      else if (!closed) {
        overdue += 1;
        daysWithOverdue.add(day);
      }
      if (isHabit(item)) {
        habitDue += 1;
        if (done) habitDone += 1;
      }
    }
  }

  const completionRate = dueTotal > 0 ? (dueDone / dueTotal) * 100 : 0;
  const habitAdherence = habitDue > 0 ? (habitDone / habitDue) * 100 : null;

  // Série : jours consécutifs (en remontant depuis aujourd'hui) sans occurrence en retard.
  let streak = 0;
  for (let d = 0; d < windowDays; d++) {
    const day = ymd(addDays(today, -d));
    if (daysWithOverdue.has(day)) break;
    streak += 1;
  }

  const sCompletion = clamp01(completionRate / 85) * 45;
  const sHabits = habitAdherence == null ? 20 : clamp01(habitAdherence / 80) * 25;
  const sBacklog = (1 - clamp01(overdue / 15)) * 20;
  const sStreak = clamp01(streak / 14) * 10;

  const score = Math.round(sCompletion + sHabits + sBacklog + sStreak);

  return {
    score: Math.max(0, Math.min(100, score)),
    completionRate,
    overdue,
    habitAdherence,
    streak,
    plannedDays: plannedDays.size,
    parts: [
      { label: "Réalisation", value: Math.round(sCompletion), max: 45 },
      { label: "Habitudes", value: Math.round(sHabits), max: 25 },
      { label: "Arriéré", value: Math.round(sBacklog), max: 20 },
      { label: "Régularité", value: Math.round(sStreak), max: 10 },
    ],
  };
}

export type AlignmentInput = {
  /** Domaines déclarés avec leur poids cible (%). Vide → alignement non mesurable. */
  priorities: Array<{ key: string; label: string; weight: number }>;
  /** Temps réellement consacré par domaine (minutes). */
  actualMinutes: Record<string, number>;
};

export type AlignmentScore = {
  score: number;
  rows: Array<{ key: string; label: string; targetPct: number; actualPct: number; gap: number }>;
};

/**
 * Alignement temps / priorités. Renvoie null tant qu'aucune priorité n'est
 * déclarée — la couche « priorités de vie » arrive plus tard, le score se
 * dégrade proprement en attendant.
 */
export function computeAlignmentScore(input: AlignmentInput): AlignmentScore | null {
  if (!input.priorities.length) return null;
  const totalWeight = input.priorities.reduce((s, p) => s + Math.max(0, p.weight), 0);
  const totalMinutes = Object.values(input.actualMinutes).reduce((s, m) => s + Math.max(0, m), 0);
  if (totalWeight <= 0 || totalMinutes <= 0) return null;

  const rows = input.priorities.map((p) => {
    const targetPct = (Math.max(0, p.weight) / totalWeight) * 100;
    const actualPct = ((input.actualMinutes[p.key] ?? 0) / totalMinutes) * 100;
    return { key: p.key, label: p.label, targetPct, actualPct, gap: actualPct - targetPct };
  });

  const divergence = rows.reduce((s, r) => s + Math.abs(r.gap), 0) / 2; // 0..100
  return { score: Math.round(Math.max(0, 100 - divergence)), rows };
}

export type LifeScore = {
  score: number;
  finance: number;
  execution: number;
  alignment: number | null;
  verdict: string;
};

/** Score de vie global — moyenne pondérée des dimensions disponibles. */
export function computeLifeScore(finance: number, execution: number, alignment: number | null): LifeScore {
  const parts: Array<[number, number]> = [
    [finance, 0.5],
    [execution, 0.3],
  ];
  if (alignment != null) parts.push([alignment, 0.2]);
  const weight = parts.reduce((s, [, w]) => s + w, 0);
  const score = Math.round(parts.reduce((s, [v, w]) => s + v * w, 0) / weight);
  const verdict =
    score >= 75 ? "Système en place — continuer à capitaliser"
    : score >= 55 ? "Base saine — deux ou trois leviers à activer"
    : score >= 35 ? "Fragile — se concentrer sur l'essentiel"
    : "Sous tension — reprendre le contrôle poste par poste";
  return { score, finance, execution, alignment, verdict };
}

export function scoreTone(score: number): "positive" | "neutral" | "warning" | "negative" {
  if (score >= 75) return "positive";
  if (score >= 55) return "neutral";
  if (score >= 35) return "warning";
  return "negative";
}
