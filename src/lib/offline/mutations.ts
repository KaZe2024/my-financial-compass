import { supabase } from "@/integrations/supabase/client";
import { checkOnlineWithHeartbeat } from "./network-status";
import { queueMutation, applyLocalMutation, flushPendingMutations, type SyncedTable } from "./db";
import { v4 as uuidv4 } from "uuid";

export type MutationResult = {
  ok: boolean;
  queued: boolean;
  error?: string;
};

export async function offlineInsert(table: SyncedTable, payload: Record<string, unknown>): Promise<MutationResult> {
  const row = { ...payload, id: payload.id ?? uuidv4(), updated_at: new Date().toISOString() };
  try {
    const online = await checkOnlineWithHeartbeat();
    if (online) {
      const { error } = await (supabase as any).from(table).insert(row);
      if (error) throw error;
      return { ok: true, queued: false };
    }
  } catch (e: any) {
    // Fall through to offline queue on error
    console.warn(`[offline] ${table} insert failed online, queuing`, e);
  }
  await applyLocalMutation(table, "insert", row);
  await queueMutation(table, "insert", row);
  return { ok: true, queued: true };
}

export async function offlineUpdate(table: SyncedTable, id: string, payload: Record<string, unknown>): Promise<MutationResult> {
  const row = { ...payload, id, updated_at: new Date().toISOString() };
  try {
    const online = await checkOnlineWithHeartbeat();
    if (online) {
      const { error } = await (supabase as any).from(table).update(payload).eq("id", id);
      if (error) throw error;
      return { ok: true, queued: false };
    }
  } catch (e: any) {
    console.warn(`[offline] ${table} update failed online, queuing`, e);
  }
  await applyLocalMutation(table, "update", row);
  await queueMutation(table, "update", row);
  return { ok: true, queued: true };
}

export async function offlineDelete(table: SyncedTable, id: string): Promise<MutationResult> {
  try {
    const online = await checkOnlineWithHeartbeat();
    if (online) {
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
      return { ok: true, queued: false };
    }
  } catch (e: any) {
    console.warn(`[offline] ${table} delete failed online, queuing`, e);
  }
  await applyLocalMutation(table, "delete", { id });
  await queueMutation(table, "delete", { id });
  return { ok: true, queued: true };
}

export { flushPendingMutations };
