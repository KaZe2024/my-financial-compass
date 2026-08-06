import { supabase } from "@/integrations/supabase/client";
import { checkOnlineWithHeartbeat, markNetworkFailure } from "./network-status";
import { applyLocalMutation, type SyncedTable } from "./db";
import { queueMutation, flushPendingMutations } from "./sync";
import { v4 as uuidv4 } from "uuid";

export type MutationResult = {
  ok: boolean;
  queued: boolean;
  error?: string;
  id?: string;
};

const UID_KEY = "optis-user-id";

/** Works offline: reads the persisted Supabase session instead of hitting the network. */
export async function currentUserId(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user?.id;
    if (id) {
      if (typeof localStorage !== "undefined") localStorage.setItem(UID_KEY, id);
      return id;
    }
  } catch {
    /* ignore, fall back to cache */
  }
  const cached = typeof localStorage !== "undefined" ? localStorage.getItem(UID_KEY) : null;
  if (cached) return cached;
  throw new Error("Utilisateur non authentifié");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "undefined" / "null" / "" arrivés par String(x) ne doivent jamais partir vers Postgres. */
function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v === "undefined" || v === "null") return null;
  return v;
}

/** Nettoie les colonnes *_id : une chaîne invalide devient NULL au lieu d'un uuid cassé. */
function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if ((key === "id" || key.endsWith("_id")) && typeof value === "string") {
      const cleaned = cleanId(value);
      out[key] = cleaned && (UUID_RE.test(cleaned) || key === "id") ? cleaned : null;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Erreur de données (uuid invalide, type incorrect) : inutile de mettre en file, ça échouera toujours. */
function isDataError(e: any): boolean {
  const code = e?.code ?? "";
  return code === "22P02" || code === "23503" || code === "23502" || code === "22007";
}

export async function offlineInsert(table: SyncedTable, payload: Record<string, unknown>): Promise<MutationResult> {
  const clean = sanitizePayload(payload);
  const row = { ...clean, id: cleanId(clean.id) ?? uuidv4(), updated_at: new Date().toISOString() };
  try {
    const online = await checkOnlineWithHeartbeat();
    if (online) {
      const { error } = await (supabase as any).from(table).insert(row);
      if (error) throw error;
      return { ok: true, queued: false, id: String(row.id) };
    }
  } catch (e: any) {
    if (isDataError(e)) {
      console.error(`[offline] ${table} insert rejeté (données invalides)`, e);
      return { ok: false, queued: false, error: e.message ?? "Données invalides" };
    }
    markNetworkFailure();
    console.warn(`[offline] ${table} insert failed online, queuing`, e);
  }
  await applyLocalMutation(table, "insert", row);
  await queueMutation(table, "insert", row);
  return { ok: true, queued: true, id: String(row.id) };
}

export async function offlineUpdate(table: SyncedTable, id: string, payload: Record<string, unknown>): Promise<MutationResult> {
  const rowId = cleanId(id);
  if (!rowId) {
    console.error(`[offline] ${table} update sans identifiant valide`, id);
    return { ok: false, queued: false, error: "Identifiant manquant ou invalide" };
  }
  const clean = sanitizePayload(payload);
  const row = { ...clean, id: rowId, updated_at: new Date().toISOString() };
  try {
    const online = await checkOnlineWithHeartbeat();
    if (online) {
      const { error } = await (supabase as any).from(table).update(clean).eq("id", rowId);
      if (error) throw error;
      return { ok: true, queued: false };
    }
  } catch (e: any) {
    if (isDataError(e)) {
      console.error(`[offline] ${table} update rejeté (données invalides)`, e);
      return { ok: false, queued: false, error: e.message ?? "Données invalides" };
    }
    markNetworkFailure();
    console.warn(`[offline] ${table} update failed online, queuing`, e);
  }
  await applyLocalMutation(table, "update", row);
  await queueMutation(table, "update", row);
  return { ok: true, queued: true };
}

export async function offlineDelete(table: SyncedTable, id: string): Promise<MutationResult> {
  const rowId = cleanId(id);
  if (!rowId) {
    console.error(`[offline] ${table} delete sans identifiant valide`, id);
    return { ok: false, queued: false, error: "Identifiant manquant ou invalide" };
  }
  try {
    const online = await checkOnlineWithHeartbeat();
    if (online) {
      const { error } = await (supabase as any).from(table).delete().eq("id", rowId);
      if (error) throw error;
      return { ok: true, queued: false };
    }
  } catch (e: any) {
    if (isDataError(e)) {
      console.error(`[offline] ${table} delete rejeté (données invalides)`, e);
      return { ok: false, queued: false, error: e.message ?? "Données invalides" };
    }
    markNetworkFailure();
    console.warn(`[offline] ${table} delete failed online, queuing`, e);
  }
  await applyLocalMutation(table, "delete", { id: rowId });
  await queueMutation(table, "delete", { id: rowId });
  return { ok: true, queued: true };
}

export { flushPendingMutations };

