import { supabase } from "@/integrations/supabase/client";
import { offlineSelect, byText, byDateDesc } from "@/lib/offline/read";
import { queryOptions } from "@tanstack/react-query";
import { fetchAllRows } from "@/lib/fetch-all";

export type PlanType = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string | null;
  in_eisenhower: boolean;
  sort_order: number;
  archived: boolean;
};

export type PlanTag = { id: string; user_id: string; name: string; color: string };

export type PlanProject = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: PlanStatus;
  priority: PlanPriority;
  color: string;
  start_date: string | null;
  due_date: string | null;
  archived: boolean;
};

export type PlanStatus = "todo" | "in_progress" | "done" | "failed" | "cancelled";
export type PlanPriority = "low" | "medium" | "high" | "critical";

export type PlanItem = {
  id: string;
  user_id: string;
  title: string;
  type_id: string | null;
  project_id: string | null;
  counterparty_id: string | null;
  person_label: string | null;
  status: PlanStatus;
  priority: PlanPriority;
  urgent: boolean;
  important: boolean;
  scheduled_on: string;
  end_on: string | null;
  all_day: boolean;
  no_fixed_time: boolean;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  location: string | null;
  notes: string | null;
  recurrence: "none" | "daily" | "weekly" | "monthly" | "yearly";
  recurrence_until: string | null;
  recurrence_interval: number;
  recurrence_weekdays: number[] | null;
  recurrence_month_days: number[] | null;
  times_per_day: number;
  reminder_minutes: number | null;
  completed_at: string | null;
  sort_order: number;
};

export type PlanItemTag = { id: string; user_id: string; item_id: string; tag_id: string };

export const STATUSES: { value: PlanStatus; label: string; className: string }[] = [
  { value: "todo", label: "À faire", className: "bg-muted text-muted-foreground" },
  { value: "in_progress", label: "En cours", className: "bg-sky-500/15 text-sky-400" },
  { value: "done", label: "Terminé", className: "bg-emerald-500/15 text-emerald-400" },
  { value: "failed", label: "Échec", className: "bg-red-500/15 text-red-400" },
  { value: "cancelled", label: "Annulé", className: "bg-amber-500/15 text-amber-400" },
];

export const PRIORITIES: { value: PlanPriority; label: string; className: string }[] = [
  { value: "low", label: "Basse", className: "text-muted-foreground" },
  { value: "medium", label: "Moyenne", className: "text-sky-400" },
  { value: "high", label: "Haute", className: "text-amber-400" },
  { value: "critical", label: "Critique", className: "text-red-400" },
];

export const RECURRENCES: { value: PlanItem["recurrence"]; label: string }[] = [
  { value: "none", label: "Aucune" },
  { value: "daily", label: "Quotidienne" },
  { value: "weekly", label: "Hebdomadaire" },
  { value: "monthly", label: "Mensuelle" },
  { value: "yearly", label: "Annuelle" },
];

export const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: "Lundi", short: "Lun" },
  { value: 2, label: "Mardi", short: "Mar" },
  { value: 3, label: "Mercredi", short: "Mer" },
  { value: 4, label: "Jeudi", short: "Jeu" },
  { value: 5, label: "Vendredi", short: "Ven" },
  { value: 6, label: "Samedi", short: "Sam" },
  { value: 0, label: "Dimanche", short: "Dim" },
];

/** Modular habit patterns. `custom` lets the user tune every field by hand. */
export type RecurrencePreset = {
  id: string;
  label: string;
  group: string;
  freq: PlanItem["recurrence"];
  interval: number;
  weekdays: number[] | null;
  monthDays: number[] | null;
};

export const RECURRENCE_PRESETS: RecurrencePreset[] = [
  { id: "none", label: "Aucune (ponctuel)", group: "Ponctuel", freq: "none", interval: 1, weekdays: null, monthDays: null },

  { id: "daily", label: "Journalier — tous les jours", group: "Journalier", freq: "daily", interval: 1, weekdays: null, monthDays: null },
  { id: "daily_weekdays", label: "Journalier — jours ouvrés (hors week-end)", group: "Journalier", freq: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5], monthDays: null },
  { id: "weekends", label: "Chaque week-end (samedi & dimanche)", group: "Journalier", freq: "weekly", interval: 1, weekdays: [6, 0], monthDays: null },
  { id: "daily_2", label: "Tous les 2 jours", group: "Journalier", freq: "daily", interval: 2, weekdays: null, monthDays: null },
  { id: "daily_3", label: "Tous les 3 jours", group: "Journalier", freq: "daily", interval: 3, weekdays: null, monthDays: null },

  { id: "weekly", label: "Hebdomadaire (1×/semaine)", group: "Hebdomadaire", freq: "weekly", interval: 1, weekdays: null, monthDays: null },
  { id: "weekly_2x", label: "2×/semaine (lundi & jeudi)", group: "Hebdomadaire", freq: "weekly", interval: 1, weekdays: [1, 4], monthDays: null },
  { id: "weekly_3x", label: "3×/semaine (lundi, mercredi, vendredi)", group: "Hebdomadaire", freq: "weekly", interval: 1, weekdays: [1, 3, 5], monthDays: null },
  { id: "biweekly", label: "Toutes les 2 semaines", group: "Hebdomadaire", freq: "weekly", interval: 2, weekdays: null, monthDays: null },
  { id: "monthly_week", label: "Toutes les 4 semaines", group: "Hebdomadaire", freq: "weekly", interval: 4, weekdays: null, monthDays: null },

  { id: "monthly", label: "Mensuel (1×/mois)", group: "Mensuel & plus", freq: "monthly", interval: 1, weekdays: null, monthDays: null },
  { id: "monthly_2x", label: "2×/mois (1 & 15)", group: "Mensuel & plus", freq: "monthly", interval: 1, weekdays: null, monthDays: [1, 15] },
  { id: "monthly_3x", label: "3×/mois (1, 10 & 20)", group: "Mensuel & plus", freq: "monthly", interval: 1, weekdays: null, monthDays: [1, 10, 20] },
  { id: "monthly_5x", label: "5×/mois (1, 7, 14, 21 & 28)", group: "Mensuel & plus", freq: "monthly", interval: 1, weekdays: null, monthDays: [1, 7, 14, 21, 28] },
  { id: "bimonthly", label: "Bimestriel (tous les 2 mois)", group: "Mensuel & plus", freq: "monthly", interval: 2, weekdays: null, monthDays: null },
  { id: "quarterly", label: "Trimestriel (tous les 3 mois)", group: "Mensuel & plus", freq: "monthly", interval: 3, weekdays: null, monthDays: null },
  { id: "semiannual", label: "Semestriel (tous les 6 mois)", group: "Mensuel & plus", freq: "monthly", interval: 6, weekdays: null, monthDays: null },
  { id: "yearly", label: "Annuel", group: "Mensuel & plus", freq: "yearly", interval: 1, weekdays: null, monthDays: null },
  { id: "biennial", label: "Tous les 2 ans", group: "Mensuel & plus", freq: "yearly", interval: 2, weekdays: null, monthDays: null },

  { id: "custom", label: "Personnalisé…", group: "Avancé", freq: "daily", interval: 1, weekdays: null, monthDays: null },
];

const sameSet = (a: number[] | null | undefined, b: number[] | null | undefined) => {
  const x = [...(a ?? [])].sort((m, n) => m - n).join(",");
  const y = [...(b ?? [])].sort((m, n) => m - n).join(",");
  return x === y;
};

/** Find which preset matches the stored recurrence fields (else "custom"). */
export function detectRecurrencePreset(v: {
  recurrence: PlanItem["recurrence"];
  recurrence_interval?: number | null;
  recurrence_weekdays?: number[] | null;
  recurrence_month_days?: number[] | null;
}): string {
  const interval = v.recurrence_interval && v.recurrence_interval > 0 ? v.recurrence_interval : 1;
  const hit = RECURRENCE_PRESETS.find(
    (p) =>
      p.id !== "custom" &&
      p.freq === v.recurrence &&
      p.interval === interval &&
      sameSet(p.weekdays, v.recurrence_weekdays) &&
      sameSet(p.monthDays, v.recurrence_month_days),
  );
  return hit?.id ?? "custom";
}

/** Short human label for a recurrence, used in lists/cards. */
export function recurrenceLabel(item: {
  recurrence: PlanItem["recurrence"];
  recurrence_interval?: number | null;
  recurrence_weekdays?: number[] | null;
  recurrence_month_days?: number[] | null;
  times_per_day?: number | null;
}): string | null {
  if (item.recurrence === "none") return (item.times_per_day ?? 1) > 1 ? `${item.times_per_day}×/jour` : null;
  const id = detectRecurrencePreset(item);
  const preset = RECURRENCE_PRESETS.find((p) => p.id === id);
  const interval = item.recurrence_interval && item.recurrence_interval > 0 ? item.recurrence_interval : 1;
  let base =
    preset && preset.id !== "custom"
      ? preset.label
      : item.recurrence === "daily"
        ? `Tous les ${interval} jour(s)`
        : item.recurrence === "weekly"
          ? `Toutes les ${interval} semaine(s)${(item.recurrence_weekdays ?? []).length ? ` · ${(item.recurrence_weekdays ?? []).map((w) => WEEKDAYS.find((x) => x.value === w)?.short).join(", ")}` : ""}`
          : item.recurrence === "monthly"
            ? `Tous les ${interval} mois${(item.recurrence_month_days ?? []).length ? ` · le ${(item.recurrence_month_days ?? []).join(", ")}` : ""}`
            : `Tous les ${interval} an(s)`;
  if ((item.times_per_day ?? 1) > 1) base += ` · ${item.times_per_day}×/jour`;
  return base;
}

/** A planned item is "done" (traité) when it reached a terminal state. */
export const CLOSED_STATUSES: PlanStatus[] = ["done", "failed", "cancelled"];
export const isClosed = (s: PlanStatus) => CLOSED_STATUSES.includes(s);

export const statusMeta = (s: PlanStatus) => STATUSES.find((x) => x.value === s) ?? STATUSES[0];
export const priorityMeta = (p: PlanPriority) => PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[1];

export const qkPlanTypes = ["plan_types"] as const;
export const planTypesQO = queryOptions({
  queryKey: qkPlanTypes,
  queryFn: async () =>
    (await offlineSelect<any>(
      "plan_types",
      () => fetchAllRows<any>((from, to) => supabase.from("plan_types").select("*").range(from, to)),
      { sort: (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name ?? "").localeCompare(String(b.name ?? "")) },
    )) as PlanType[],
});

export const qkPlanTags = ["plan_tags"] as const;
export const planTagsQO = queryOptions({
  queryKey: qkPlanTags,
  queryFn: async () =>
    (await offlineSelect<any>(
      "plan_tags",
      () => fetchAllRows<any>((from, to) => supabase.from("plan_tags").select("*").range(from, to)),
      { sort: byText("name") },
    )) as PlanTag[],
});

export const qkPlanProjects = ["plan_projects"] as const;
export const planProjectsQO = queryOptions({
  queryKey: qkPlanProjects,
  queryFn: async () =>
    (await offlineSelect<any>(
      "plan_projects",
      () => fetchAllRows<any>((from, to) => supabase.from("plan_projects").select("*").range(from, to)),
      { sort: byDateDesc("created_at") },
    )) as PlanProject[],
});

export const qkPlanItems = ["plan_items"] as const;
export const planItemsQO = queryOptions({
  queryKey: qkPlanItems,
  queryFn: async () =>
    (await offlineSelect<any>(
      "plan_items",
      () => fetchAllRows<any>((from, to) => supabase.from("plan_items").select("*").range(from, to)),
      {
        sort: (a: any, b: any) =>
          String(a.scheduled_on ?? "").localeCompare(String(b.scheduled_on ?? "")) ||
          String(a.start_time ?? "").localeCompare(String(b.start_time ?? "")) ||
          (a.sort_order ?? 0) - (b.sort_order ?? 0),
      },
    )) as PlanItem[],
});

export const qkPlanItemTags = ["plan_item_tags"] as const;
export const planItemTagsQO = queryOptions({
  queryKey: qkPlanItemTags,
  queryFn: async () =>
    (await offlineSelect<any>("plan_item_tags", () =>
      fetchAllRows<any>((from, to) => supabase.from("plan_item_tags").select("*").range(from, to)),
    )) as PlanItemTag[],
});


/* ---------- date helpers (local, no timezone shift) ---------- */

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function startOfWeek(d: Date): Date {
  const c = new Date(d);
  const day = (c.getDay() + 6) % 7; // Monday = 0
  c.setDate(c.getDate() - day);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function monthGrid(anchor: Date): Date[] {
  const first = startOfWeek(startOfMonth(anchor));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function fmtDayLabel(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export function fmtTimeRange(item: PlanItem) {
  if (item.all_day) return "Journée entière";
  if (item.no_fixed_time || !item.start_time) return "Sans heure précise";
  const s = item.start_time.slice(0, 5);
  const e = item.end_time ? item.end_time.slice(0, 5) : null;
  return e ? `${s} – ${e}` : s;
}

/** Expand a recurring item into concrete occurrence dates inside [from, to]. */
export function occurrencesInRange(item: PlanItem, from: Date, to: Date): string[] {
  const base = parseYmd(item.scheduled_on);
  const until = item.recurrence_until ? parseYmd(item.recurrence_until) : null;
  const out: string[] = [];
  const spanEnd = item.end_on ? parseYmd(item.end_on) : null;
  const interval = item.recurrence_interval && item.recurrence_interval > 0 ? item.recurrence_interval : 1;
  const weekdays = (item.recurrence_weekdays ?? []).filter((w) => w >= 0 && w <= 6);
  const monthDays = (item.recurrence_month_days ?? []).filter((d) => d >= 1 && d <= 31);

  const pushRange = (start: Date) => {
    const days = spanEnd ? Math.max(0, Math.round((spanEnd.getTime() - base.getTime()) / 86400000)) : 0;
    for (let i = 0; i <= days; i++) {
      const d = addDays(start, i);
      if (d >= from && d <= to) out.push(ymd(d));
    }
  };

  if (item.recurrence === "none") {
    pushRange(base);
    return out;
  }

  const limit = until && until < to ? until : to;
  if (base > limit) return out;

  if (item.recurrence === "daily") {
    let cursor = new Date(base);
    let guard = 0;
    while (cursor <= limit && guard < 4000) {
      guard++;
      if (cursor >= from && (weekdays.length === 0 || weekdays.includes(cursor.getDay()))) pushRange(cursor);
      cursor = addDays(cursor, interval);
    }
    return out;
  }

  if (item.recurrence === "weekly") {
    const days = weekdays.length ? weekdays : [base.getDay()];
    let weekStart = startOfWeek(base);
    let guard = 0;
    while (weekStart <= limit && guard < 1000) {
      guard++;
      for (const wd of days) {
        const offset = (wd + 6) % 7; // Monday-based offset
        const d = addDays(weekStart, offset);
        if (d >= base && d >= from && d <= limit) pushRange(d);
      }
      weekStart = addDays(weekStart, 7 * interval);
    }
    return out;
  }

  if (item.recurrence === "monthly") {
    const days = monthDays.length ? monthDays : [base.getDate()];
    let monthCursor = new Date(base.getFullYear(), base.getMonth(), 1);
    let guard = 0;
    while (monthCursor <= limit && guard < 600) {
      guard++;
      const lastDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
      for (const dd of days) {
        const d = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), Math.min(dd, lastDay));
        if (d >= base && d >= from && d <= limit) pushRange(d);
      }
      monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + interval, 1);
    }
    return out;
  }

  // yearly
  let year = base.getFullYear();
  let guard = 0;
  while (guard < 200) {
    guard++;
    const d = new Date(year, base.getMonth(), base.getDate());
    if (d > limit) break;
    if (d >= base && d >= from) pushRange(d);
    year += interval;
  }
  return out;
}

export function projectProgress(items: PlanItem[]) {
  const total = items.length;
  const closed = items.filter((i) => isClosed(i.status)).length;
  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const cancelled = items.filter((i) => i.status === "cancelled").length;
  return {
    total,
    closed,
    done,
    failed,
    cancelled,
    open: total - closed,
    pct: total === 0 ? 0 : Math.round((closed / total) * 100),
    successPct: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}
