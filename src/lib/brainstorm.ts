import { supabaseOffline as supabase } from "@/lib/offline/client";
import { offlineSelect, byDateDesc } from "@/lib/offline/read";
import { queryOptions } from "@tanstack/react-query";
import { fetchAllRows } from "@/lib/fetch-all";

export type BsFolder = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BsStatus = "brouillon" | "en_cours" | "termine" | "archive";

export type BsSession = {
  id: string;
  user_id: string;
  folder_id: string | null;
  title: string;
  status: BsStatus;
  tags: string[];
  color: string | null;
  icon: string | null;
  view_mode: "list" | "canvas";
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type BsBlockKind = "idea" | "bullets" | "question" | "note" | "action";

export type BsBlock = {
  id: string;
  user_id: string;
  session_id: string;
  parent_id: string | null;
  kind: BsBlockKind;
  content: string;
  items: string[];
  is_action: boolean;
  action_done: boolean;
  plan_item_id: string | null;
  pos_x: number;
  pos_y: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const BS_STATUSES: { value: BsStatus; label: string; className: string }[] = [
  { value: "brouillon", label: "Brouillon", className: "bg-muted text-muted-foreground" },
  { value: "en_cours", label: "En cours", className: "bg-sky-500/15 text-sky-400" },
  { value: "termine", label: "Terminé", className: "bg-emerald-500/15 text-emerald-400" },
  { value: "archive", label: "Archivé", className: "bg-amber-500/15 text-amber-400" },
];

export const BS_KINDS: { value: BsBlockKind; label: string }[] = [
  { value: "idea", label: "Idée simple" },
  { value: "bullets", label: "Liste à puces" },
  { value: "question", label: "Question ouverte" },
  { value: "note", label: "Note / commentaire" },
  { value: "action", label: "Action à retenir" },
];

export const bsStatusMeta = (s: BsStatus) => BS_STATUSES.find((x) => x.value === s) ?? BS_STATUSES[0];
export const bsKindLabel = (k: BsBlockKind) => BS_KINDS.find((x) => x.value === k)?.label ?? k;

export const qkBsFolders = ["brainstorm_folders"] as const;
export const bsFoldersQO = queryOptions({
  queryKey: qkBsFolders,
  queryFn: async () =>
    (await offlineSelect<any>(
      "brainstorm_folders",
      () => fetchAllRows<any>((from, to) => (supabase as any).from("brainstorm_folders").select("*").range(from, to)),
      {
        sort: (a: any, b: any) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name ?? "").localeCompare(String(b.name ?? "")),
      },
    )) as BsFolder[],
});

export const qkBsSessions = ["brainstorm_sessions"] as const;
export const bsSessionsQO = queryOptions({
  queryKey: qkBsSessions,
  queryFn: async () =>
    (await offlineSelect<any>(
      "brainstorm_sessions",
      () => fetchAllRows<any>((from, to) => (supabase as any).from("brainstorm_sessions").select("*").range(from, to)),
      { sort: byDateDesc("updated_at") },
    )) as BsSession[],
});

export const qkBsBlocks = ["brainstorm_blocks"] as const;
export const bsBlocksQO = queryOptions({
  queryKey: qkBsBlocks,
  queryFn: async () =>
    (await offlineSelect<any>(
      "brainstorm_blocks",
      () => fetchAllRows<any>((from, to) => (supabase as any).from("brainstorm_blocks").select("*").range(from, to)),
      { sort: (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0) },
    )) as BsBlock[],
});

/** Markdown export of a session and its blocks. */
export function sessionToMarkdown(session: BsSession, blocks: BsBlock[]): string {
  const lines: string[] = [];
  lines.push(`# ${session.title || "Sans titre"}`);
  lines.push("");
  lines.push(`_Statut : ${bsStatusMeta(session.status).label} — modifié le ${new Date(session.updated_at).toLocaleString("fr-FR")}_`);
  if (session.tags?.length) lines.push(`_Tags : ${session.tags.join(", ")}_`);
  lines.push("");
  const sorted = [...blocks].sort((a, b) => a.sort_order - b.sort_order);
  for (const b of sorted) {
    if (b.kind === "bullets") {
      if (b.content) lines.push(`**${b.content}**`);
      for (const it of b.items ?? []) lines.push(`- ${it}`);
    } else if (b.kind === "question") {
      lines.push(`> ❓ ${b.content}`);
    } else if (b.kind === "note") {
      lines.push(`> ${b.content}`);
    } else if (b.is_action || b.kind === "action") {
      lines.push(`- [${b.action_done ? "x" : " "}] ${b.content}`);
    } else {
      lines.push(b.content);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function sessionToText(session: BsSession, blocks: BsBlock[]): string {
  return sessionToMarkdown(session, blocks).replace(/[#>*_`]/g, "").replace(/\n{3,}/g, "\n\n");
}

export function matchesSearch(q: string, session: BsSession, blocks: BsBlock[]): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (session.title.toLowerCase().includes(needle)) return true;
  if ((session.tags ?? []).some((t) => t.toLowerCase().includes(needle))) return true;
  return blocks.some(
    (b) => b.content.toLowerCase().includes(needle) || (b.items ?? []).some((i) => i.toLowerCase().includes(needle)),
  );
}
