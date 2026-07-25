import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  offlineDb,
  syncedDataDb,
  type SyncedTable,
  SYNCED_TABLES,
  setLastSyncAt,
  getLastSyncAt,
  getDeviceId,
  upsertSyncedRows,
  clearAllSyncedData,
  type PendingMutation,
} from "./db";
import { v4 as uuidv4 } from "uuid";

export type SyncPullResult = {
  at: string;
  tables: Partial<Record<SyncedTable, { id: string; data: Record<string, unknown>; updatedAt: string; deleted: boolean }[]>>;
};

export type SyncPushResult = {
  applied: number;
  failed: number;
  errors: string[];
};

export const pullSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => {
    if (typeof input !== "object" || input === null) throw new Error("Invalid input");
    const { lastSyncAt } = input as { lastSyncAt?: string | null };
    return { lastSyncAt: lastSyncAt ?? null };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const since = data.lastSyncAt ? new Date(data.lastSyncAt).toISOString() : "1970-01-01T00:00:00.000Z";
    const now = new Date().toISOString();
    const result: SyncPullResult["tables"] = {};

    await Promise.all(
      SYNCED_TABLES.map(async (table) => {
        try {
          const q = supabase
            .from(table as string)
            .select("*")
            .eq("user_id", userId)
            .gte("updated_at", since);
          const { data: rows, error } = await q;
          if (error) {
            console.error(`[offline pull] ${table}:`, error);
            return;
          }
          result[table] = (rows ?? []).map((r: any) => ({
            id: r.id as string,
            data: r as Record<string, unknown>,
            updatedAt: r.updated_at as string,
            deleted: r.deleted_at ? true : false,
          }));
        } catch (e) {
          console.error(`[offline pull] ${table} exception:`, e);
        }
      }),
    );

    return { at: now, tables: result } as SyncPullResult;
  });

export const pushSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => {
    if (!Array.isArray(input)) throw new Error("Expected array of mutations");
    return input as PendingMutation[];
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let applied = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const mutation of data) {
      try {
        const payload = { ...mutation.payload, user_id: userId, updated_at: new Date().toISOString() };
        if (mutation.op === "insert") {
          const { error } = await supabase.from(mutation.table).insert(payload);
          if (error) throw error;
          applied++;
        } else if (mutation.op === "update") {
          const id = payload.id;
          if (!id) throw new Error("Missing id for update");
          delete payload.id;
          const { error } = await supabase.from(mutation.table).update(payload).eq("id", id);
          if (error) throw error;
          applied++;
        } else if (mutation.op === "delete") {
          const id = payload.id;
          if (!id) throw new Error("Missing id for delete");
          const { error } = await supabase.from(mutation.table).delete().eq("id", id);
          if (error) throw error;
          applied++;
        } else {
          throw new Error(`Unknown op ${mutation.op}`);
        }
      } catch (e: any) {
        failed++;
        errors.push(`${mutation.table}/${mutation.id}: ${e.message}`);
        console.error(`[offline push] ${mutation.table}/${mutation.id}:`, e);
      }
    }

    return { applied, failed, errors } as SyncPushResult;
  });

export async function queueMutation(
  table: SyncedTable,
  op: PendingMutation["op"],
  payload: Record<string, unknown>,
  original?: Record<string, unknown>,
) {
  await offlineDb.pendingMutations.add({
    id: uuidv4(),
    table,
    op,
    payload,
    original,
    createdAt: Date.now(),
    retryCount: 0,
    error: null,
  });
}

export async function applyPullResult(result: SyncPullResult) {
  for (const [table, rows] of Object.entries(result.tables)) {
    if (!rows) continue;
    await upsertSyncedRows(table as SyncedTable, rows);
  }
  await setLastSyncAt(result.at);
}

export async function performPull(): Promise<SyncPullResult> {
  const lastSyncAt = await getLastSyncAt();
  const result = await pullSync({ data: { lastSyncAt } });
  await applyPullResult(result);
  return result;
}

export async function flushPendingMutations(): Promise<SyncPushResult> {
  const mutations = await offlineDb.pendingMutations.orderBy("createdAt").toArray();
  if (mutations.length === 0) return { applied: 0, failed: 0, errors: [] };

  const result = await pushSync({ data: mutations });

  // Remove successfully applied mutations; keep failed ones for retry
  const appliedIds = mutations.slice(0, result.applied).map((m) => m.id);
  await offlineDb.pendingMutations.bulkDelete(appliedIds);

  // Update retry count / error for failed ones
  for (const error of result.errors) {
    const mutationId = error.split(":")[0]?.trim();
    if (!mutationId) continue;
    const m = await offlineDb.pendingMutations.get(mutationId);
    if (m) {
      m.retryCount += 1;
      m.error = error;
      await offlineDb.pendingMutations.put(m);
    }
  }

  return result;
}

export async function fullSync(): Promise<{ pulled: number; pushed: SyncPushResult }> {
  const pullResult = await performPull();
  const pushResult = await flushPendingMutations();
  const pulledCount = Object.values(pullResult.tables).reduce((sum, rows) => sum + (rows?.length ?? 0), 0);
  return { pulled: pulledCount, pushed: pushResult };
}

export async function resetOfflineData() {
  await clearAllSyncedData();
}

export function getDeviceIdSafe(): string {
  return getDeviceId();
}
