import { supabase } from "@/integrations/supabase/client";
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

/** A planned item is "done" (traité) when it reached a terminal state. */
export const CLOSED_STATUSES: PlanStatus[] = ["done", "failed", "cancelled"];
export const isClosed = (s: PlanStatus) => CLOSED_STATUSES.includes(s);

export const statusMeta = (s: PlanStatus) => STATUSES.find((x) => x.value === s) ?? STATUSES[0];
export const priorityMeta = (p: PlanPriority) => PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[1];

export const qkPlanTypes = ["plan_types"] as const;
export const planTypesQO = queryOptions({
  queryKey: qkPlanTypes,
  queryFn: async () =>
    (await fetchAllRows<PlanType>((from, to) =>
      supabase.from("plan_types").select("*").order("sort_order").order("name").range(from, to),
    )) as PlanType[],
});

export const qkPlanTags = ["plan_tags"] as const;
export const planTagsQO = queryOptions({
  queryKey: qkPlanTags,
  queryFn: async () =>
    (await fetchAllRows<PlanTag>((from, to) =>
      supabase.from("plan_tags").select("*").order("name").range(from, to),
    )) as PlanTag[],
});

export const qkPlanProjects = ["plan_projects"] as const;
export const planProjectsQO = queryOptions({
  queryKey: qkPlanProjects,
  queryFn: async () =>
    (await fetchAllRows<PlanProject>((from, to) =>
      supabase.from("plan_projects").select("*").order("created_at", { ascending: false }).range(from, to),
    )) as PlanProject[],
});

export const qkPlanItems = ["plan_items"] as const;
export const planItemsQO = queryOptions({
  queryKey: qkPlanItems,
  queryFn: async () =>
    (await fetchAllRows<PlanItem>((from, to) =>
      supabase
        .from("plan_items")
        .select("*")
        .order("scheduled_on", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true })
        .order("sort_order", { ascending: true })
        .range(from, to),
    )) as PlanItem[],
});

export const qkPlanItemTags = ["plan_item_tags"] as const;
export const planItemTagsQO = queryOptions({
  queryKey: qkPlanItemTags,
  queryFn: async () =>
    (await fetchAllRows<PlanItemTag>((from, to) =>
      supabase.from("plan_item_tags").select("*").range(from, to),
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
  let cursor = new Date(base);
  let guard = 0;
  while (cursor <= limit && guard < 1500) {
    guard++;
    if (cursor >= from) pushRange(cursor);
    if (item.recurrence === "daily") cursor = addDays(cursor, 1);
    else if (item.recurrence === "weekly") cursor = addDays(cursor, 7);
    else if (item.recurrence === "monthly") cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
    else cursor = new Date(cursor.getFullYear() + 1, cursor.getMonth(), cursor.getDate());
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
