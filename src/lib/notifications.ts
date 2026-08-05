/**
 * Centre de notifications : dérivation locale des rappels et alertes
 * prioritaires à partir des données déjà chargées. Fonctions pures.
 *
 * Chaque candidat porte une clé anti-doublon (`dedupe_key`) stable dans le
 * temps pour que l'état lu / rejeté soit conservé, mais qui change lorsque
 * l'échéance ou la semaine concernée change.
 */

import type { Recommendation } from "@/lib/advisor";

export type NotifSeverity = "critical" | "warning" | "info" | "success";

export type NotificationRow = {
  id: string;
  dedupe_key: string;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  link_to: string | null;
  due_date: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  created_at?: string;
};

export type NotificationCandidate = {
  dedupe_key: string;
  kind: string;
  severity: NotifSeverity;
  title: string;
  body: string;
  link_to: string;
  due_date: string | null;
};

export const KIND_LABELS: Record<string, string> = {
  echeance: "Échéance",
  budget: "Budget",
  execution: "Exécution",
  habitude: "Habitude",
  tresorerie: "Trésorerie",
  conseil: "Conseil",
  plan: "Plan d'action",
};

export const SEV_ORDER: Record<string, number> = { critical: 3, warning: 2, info: 1, success: 0 };

type Obligation = { id: string; label: string; amount: number; due_date: string | null; kind: string; to: string };

export type NotifInput = {
  today: string;
  cash: number;
  obligations: Obligation[]; // dettes, créances, provisions, abonnements à venir
  overdueTasks: number;
  budgetGap: { planned: number; actual: number } | null;
  habitBreaks: Array<{ label: string; adherence: number }>;
  forecastBreach: { date: string; balance: number } | null;
  recs: Recommendation[];
  planLate: Array<{ title: string; due_date: string | null }>;
};

const fr = (n: number) => Math.round(n).toLocaleString("fr-FR");

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
}

function isoWeekKey(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - dow + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function deriveNotifications(i: NotifInput): NotificationCandidate[] {
  const out: NotificationCandidate[] = [];
  const week = isoWeekKey(i.today);

  // --- Échéances : en retard, puis sous 7 jours.
  for (const o of i.obligations) {
    if (!o.due_date) continue;
    const delta = daysBetween(i.today, o.due_date);
    if (delta < 0) {
      out.push({
        dedupe_key: `due_late:${o.kind}:${o.id}:${o.due_date}`,
        kind: "echeance",
        severity: "critical",
        title: `${o.kind} en retard — ${o.label}`,
        body: `${fr(o.amount)} était attendu le ${o.due_date}. Régler, encaisser ou repousser l'échéance pour garder une lecture juste.`,
        link_to: o.to,
        due_date: o.due_date,
      });
    } else if (delta <= 7) {
      out.push({
        dedupe_key: `due_soon:${o.kind}:${o.id}:${o.due_date}`,
        kind: "echeance",
        severity: o.amount > i.cash ? "critical" : "warning",
        title: `${o.kind} sous ${delta} j — ${o.label}`,
        body: `${fr(o.amount)} à traiter le ${o.due_date}.${o.amount > i.cash ? " Le disponible actuel ne couvre pas ce montant." : ""}`,
        link_to: o.to,
        due_date: o.due_date,
      });
    }
  }

  // --- Trésorerie : rupture prévue.
  if (i.forecastBreach) {
    out.push({
      dedupe_key: `cash_breach:${i.forecastBreach.date}`,
      kind: "tresorerie",
      severity: "critical",
      title: "Rupture de trésorerie prévue",
      body: `La projection passe sous zéro le ${i.forecastBreach.date} (${fr(i.forecastBreach.balance)}). Décaler une sortie ou accélérer une entrée.`,
      link_to: "/dashboard",
      due_date: i.forecastBreach.date,
    });
  }

  // --- Dérive budgétaire du mois.
  if (i.budgetGap && i.budgetGap.planned > 0) {
    const drift = (i.budgetGap.actual - i.budgetGap.planned) / i.budgetGap.planned;
    if (drift > 0.1) {
      out.push({
        dedupe_key: `budget_drift:${i.today.slice(0, 7)}`,
        kind: "budget",
        severity: drift > 0.25 ? "critical" : "warning",
        title: `Dépenses ${Math.round(drift * 100)} % au-dessus du budget du mois`,
        body: `Réel ${fr(i.budgetGap.actual)} contre ${fr(i.budgetGap.planned)} planifié. Identifier la ligne responsable avant la fin du mois.`,
        link_to: "/budgets",
        due_date: null,
      });
    }
  }

  // --- Exécution.
  if (i.overdueTasks >= 3) {
    out.push({
      dedupe_key: `tasks_overdue:${week}`,
      kind: "execution",
      severity: i.overdueTasks >= 10 ? "warning" : "info",
      title: `${i.overdueTasks} élément(s) planifié(s) en retard`,
      body: "Passer l'arriéré en revue : traiter, replanifier ou annuler chaque ligne.",
      link_to: "/planning",
      due_date: null,
    });
  }

  for (const h of i.habitBreaks) {
    out.push({
      dedupe_key: `habit:${h.label}:${week}`,
      kind: "habitude",
      severity: "info",
      title: `Habitude « ${h.label} » tenue à ${h.adherence.toFixed(0)} %`,
      body: "Ancrer l'habitude sur un créneau fixe ou réduire sa fréquence plutôt que de la laisser décrocher.",
      link_to: "/planning",
      due_date: null,
    });
  }

  // --- Plan d'action en retard.
  for (const p of i.planLate) {
    out.push({
      dedupe_key: `plan_late:${p.title}:${p.due_date ?? week}`,
      kind: "plan",
      severity: "warning",
      title: `Action du plan en retard — ${p.title}`,
      body: "Cette action du plan mensuel a dépassé son échéance. La traiter ou la requalifier.",
      link_to: "/coach",
      due_date: p.due_date,
    });
  }

  // --- Conseils critiques non traités.
  for (const r of i.recs.filter((x) => x.severity === "critical").slice(0, 5)) {
    out.push({
      dedupe_key: `rec:${r.key}:${week}`,
      kind: "conseil",
      severity: "critical",
      title: r.title,
      body: r.rationale,
      link_to: r.moduleTo,
      due_date: r.dueDate,
    });
  }

  // Dédoublonnage interne.
  const seen = new Set<string>();
  return out.filter((c) => {
    if (seen.has(c.dedupe_key)) return false;
    seen.add(c.dedupe_key);
    return true;
  });
}

export function sortNotifications(rows: NotificationRow[]): NotificationRow[] {
  return [...rows].sort((a, b) => {
    const s = (SEV_ORDER[b.severity] ?? 0) - (SEV_ORDER[a.severity] ?? 0);
    if (s !== 0) return s;
    const ad = a.due_date ?? "9999";
    const bd = b.due_date ?? "9999";
    if (ad !== bd) return ad.localeCompare(bd);
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

export function unreadCount(rows: NotificationRow[]): number {
  return rows.filter((r) => !r.dismissed_at && !r.read_at).length;
}
