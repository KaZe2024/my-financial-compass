/**
 * Coach : transformation des recommandations en plan d'action mensuel suivi.
 * Fonctions pures — aucun accès réseau.
 */

import type { Recommendation } from "@/lib/advisor";
import { CATEGORY_LABELS } from "@/lib/advisor";

export type CoachPlan = {
  id: string;
  user_id?: string;
  period_month: string; // YYYY-MM
  title: string;
  focus: string | null;
  summary: string | null;
  status: string;
  source: string;
  archived: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CoachPlanItem = {
  id: string;
  plan_id: string;
  rec_key: string | null;
  title: string;
  detail: string | null;
  category: string | null;
  module_to: string | null;
  impact: number;
  effort: string | null;
  due_date: string | null;
  status: string; // todo | doing | done | dropped
  order_index: number;
  done_at: string | null;
};

export const ITEM_STATUS: Array<{ value: string; label: string }> = [
  { value: "todo", label: "À faire" },
  { value: "doing", label: "En cours" },
  { value: "done", label: "Fait" },
  { value: "dropped", label: "Abandonné" },
];

export const ITEM_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  ITEM_STATUS.map((s) => [s.value, s.label]),
);

export type PlanItemDraft = {
  rec_key: string | null;
  title: string;
  detail: string | null;
  category: string | null;
  module_to: string | null;
  impact: number;
  effort: string | null;
  due_date: string | null;
  order_index: number;
};

/** Fin de mois (YYYY-MM-DD) du mois passé en paramètre. */
export function monthEnd(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/**
 * Sélectionne les recommandations les plus rentables du mois et les convertit
 * en lignes de plan : les critiques d'abord, puis le meilleur rapport
 * impact / effort.
 */
export function planDraftsFromRecs(recs: Recommendation[], periodMonth: string, limit = 6): PlanItemDraft[] {
  const effortWeight: Record<string, number> = { faible: 1, moyen: 2, eleve: 3.5 };
  const severityWeight: Record<string, number> = { critical: 4, warning: 3, info: 1.6, opportunity: 2.2 };
  const end = monthEnd(periodMonth);

  const scored = recs.map((r) => {
    const eff = effortWeight[r.effort ?? "moyen"] ?? 2;
    const sev = severityWeight[r.severity] ?? 1;
    // Rendement : gravité pondérée + impact normalisé, divisé par l'effort.
    const yieldScore = (sev * 10 + Math.log10(1 + Math.max(0, r.impact)) * 6) / eff;
    return { r, yieldScore };
  });

  scored.sort((a, b) => {
    if (a.r.severity === "critical" && b.r.severity !== "critical") return -1;
    if (b.r.severity === "critical" && a.r.severity !== "critical") return 1;
    return b.yieldScore - a.yieldScore;
  });

  return scored.slice(0, limit).map(({ r }, idx) => ({
    rec_key: r.key,
    title: r.title,
    detail: r.rationale,
    category: r.category,
    module_to: r.moduleTo,
    impact: Math.max(0, Math.round(r.impact)),
    effort: r.effort,
    due_date: r.dueDate && r.dueDate <= end ? r.dueDate : end,
    order_index: idx,
  }));
}

/** Thème dominant du plan, dérivé des catégories retenues. */
export function planFocus(drafts: PlanItemDraft[]): string {
  const counts = new Map<string, number>();
  for (const d of drafts) if (d.category) counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return "Consolidation";
  return CATEGORY_LABELS[best[0] as keyof typeof CATEGORY_LABELS] ?? best[0];
}

export function planSummary(drafts: PlanItemDraft[]): string {
  const impact = drafts.reduce((s, d) => s + d.impact, 0);
  const quick = drafts.filter((d) => d.effort === "faible").length;
  const parts = [`${drafts.length} action(s) retenue(s)`];
  if (impact > 0) parts.push(`enjeu estimé ${Math.round(impact).toLocaleString("fr-FR")}`);
  if (quick > 0) parts.push(`${quick} gain(s) rapide(s)`);
  return `${parts.join(" · ")}.`;
}

export type PlanProgress = {
  total: number;
  done: number;
  doing: number;
  dropped: number;
  pct: number;
  impactDone: number;
  impactTotal: number;
  late: number;
};

export function planProgress(items: CoachPlanItem[], today: string): PlanProgress {
  const active = items.filter((i) => i.status !== "dropped");
  const done = active.filter((i) => i.status === "done");
  return {
    total: items.length,
    done: done.length,
    doing: items.filter((i) => i.status === "doing").length,
    dropped: items.filter((i) => i.status === "dropped").length,
    pct: active.length ? (done.length / active.length) * 100 : 0,
    impactDone: done.reduce((s, i) => s + Number(i.impact ?? 0), 0),
    impactTotal: active.reduce((s, i) => s + Number(i.impact ?? 0), 0),
    late: active.filter((i) => i.status !== "done" && i.due_date && i.due_date < today).length,
  };
}

/** Relances : lignes du plan qui appellent une action immédiate. */
export function planNudges(items: CoachPlanItem[], today: string): string[] {
  const out: string[] = [];
  const active = items.filter((i) => i.status !== "dropped" && i.status !== "done");
  const late = active.filter((i) => i.due_date && i.due_date < today);
  if (late.length) out.push(`${late.length} action(s) du plan ont dépassé leur échéance — traiter ou replanifier.`);
  const untouched = active.filter((i) => i.status === "todo");
  if (untouched.length === active.length && active.length > 0) {
    out.push("Aucune action encore engagée : commencer par la ligne la plus haute du plan.");
  }
  const bigOpen = active.filter((i) => Number(i.impact ?? 0) > 0).sort((a, b) => Number(b.impact) - Number(a.impact))[0];
  if (bigOpen) {
    out.push(`Priorité au plus fort enjeu : « ${bigOpen.title} » (${Math.round(Number(bigOpen.impact)).toLocaleString("fr-FR")}).`);
  }
  return out;
}
