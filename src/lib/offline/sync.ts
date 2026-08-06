import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  offlineDb,
  type SyncedTable,
  SYNCED_TABLES,
  setLastSyncAt,
  getLastSyncAt,
  getDeviceId,
  upsertSyncedRows,
  clearAllSyncedData,
  type PendingMutation,
  type SyncAck,
  recordSyncAcks,
  pruneSyncAcks,
} from "./db";
import { v4 as uuidv4 } from "uuid";

export type SyncPullRow = {
  id: string;
  data: Record<string, Json>;
  updatedAt: string;
  deleted: boolean;
};

export type SyncPullResult = {
  at: string;
  tables: Record<string, SyncPullRow[]>;
};

export type SyncPushResult = {
  applied: number;
  failed: number;
  errors: string[];
  appliedIds: string[];
  failedIds: string[];
};

export const pullSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new Error("Invalid input");
    }
    const { lastSyncAt } = input as { lastSyncAt?: string | null };
    return { lastSyncAt: lastSyncAt ?? null };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const since = data.lastSyncAt ? new Date(data.lastSyncAt).toISOString() : "1970-01-01T00:00:00.000Z";
    const now = new Date().toISOString();
    const result: Record<string, SyncPullRow[]> = {};

    await Promise.all(
      SYNCED_TABLES.map(async (table) => {
        try {
          // Pagination obligatoire : PostgREST plafonne à 1000 lignes par requête,
          // sans quoi une synchro complète perdrait silencieusement des données.
          const PAGE = 1000;
          const rows: any[] = [];
          for (let from = 0; ; from += PAGE) {
            const { data: page, error } = await (supabase as any)
              .from(table as string)
              .select("*")
              .eq("user_id", userId)
              .gte("updated_at", since)
              .order("updated_at", { ascending: true })
              .range(from, from + PAGE - 1);
            if (error) {
              console.error(`[offline pull] ${table}:`, error);
              return;
            }
            const chunk = page ?? [];
            rows.push(...chunk);
            if (chunk.length < PAGE) break;
          }
          result[table] = rows.map((r: any) => ({
            id: r.id as string,
            data: r as Record<string, Json>,
            updatedAt: r.updated_at as string,
            deleted: !!(r as any).deleted_at,
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
    const appliedIds: string[] = [];
    const failedIds: string[] = [];

    // Les lignes parentes doivent être créées avant leurs tables de liaison.
    // Cela sécurise aussi les anciennes files où transaction_tags avait été
    // enregistré avant la transaction correspondante.
    const orderedMutations = [...data].sort((a, b) => {
      const priority = (table: string) => table === "transaction_tags" ? 1 : 0;
      return priority(a.table) - priority(b.table) || a.createdAt - b.createdAt;
    });

    for (const mutation of orderedMutations) {
      try {
        const payload = { ...mutation.payload, user_id: userId, updated_at: new Date().toISOString() } as any;
        const table = mutation.table as string;
        if (mutation.op === "insert") {
          const { error } = await (supabase as any).from(table).insert(payload);
          if (error) throw error;
          applied++;
          appliedIds.push(mutation.id);
        } else if (mutation.op === "update") {
          const id = payload.id;
          if (!id) throw new Error("Missing id for update");
          delete payload.id;
          const { error } = await (supabase as any).from(table).update(payload).eq("id", id);
          if (error) throw error;
          applied++;
          appliedIds.push(mutation.id);
        } else if (mutation.op === "delete") {
          const id = payload.id;
          if (!id) throw new Error("Missing id for delete");
          const { error } = await (supabase as any).from(table).delete().eq("id", id);
          if (error) throw error;
          applied++;
          appliedIds.push(mutation.id);
        } else {
          throw new Error(`Unknown op ${mutation.op}`);
        }
      } catch (e: any) {
        failed++;
        failedIds.push(mutation.id);
        errors.push(`${mutation.table}/${mutation.id}: ${e.message}`);
        console.error(`[offline push] ${mutation.table}/${mutation.id}:`, e);
      }
    }

    return { applied, failed, errors, appliedIds, failedIds } as SyncPushResult;
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
  const queued = await offlineDb.pendingMutations.orderBy("createdAt").toArray();

  // Purge des mutations irrécupérables (identifiant "undefined"/vide) : elles
  // échoueraient indéfiniment côté Postgres avec « invalid input syntax for type uuid ».
  const invalid = queued.filter((m) => {
    if (m.op === "insert") return false;
    const id = m.payload?.id;
    return typeof id !== "string" || !id.trim() || id === "undefined" || id === "null";
  });
  if (invalid.length > 0) {
    await offlineDb.pendingMutations.bulkDelete(invalid.map((m) => m.id));
    await recordSyncAcks(
      invalid.map((m) => ({
        mutationId: m.id,
        table: m.table,
        op: m.op,
        rowId: null,
        status: "failed" as const,
        ackedAt: Date.now(),
        error: "Mutation abandonnée : identifiant invalide",
        attempts: m.retryCount + 1,
      })),
    );
  }

  const mutations = queued.filter((m) => !invalid.includes(m));
  if (mutations.length === 0) return { applied: 0, failed: 0, errors: [], appliedIds: [], failedIds: [] };


  const byId = new Map(mutations.map((m) => [m.id, m]));
  const result = await pushSync({ data: mutations });
  const ackedAt = Date.now();
  const acks: SyncAck[] = [];

  const appliedIds = result.appliedIds ?? [];
  for (const id of appliedIds) {
    const m = byId.get(id);
    if (!m) continue;
    acks.push({
      mutationId: id,
      table: m.table,
      op: m.op,
      rowId: (m.payload?.id as string) ?? null,
      status: "applied",
      ackedAt,
      error: null,
      attempts: m.retryCount + 1,
    });
  }

  // On supprime exactement les mutations confirmées par le serveur (plus de
  // supposition « les N premières ont réussi », qui pouvait perdre des saisies).
  await offlineDb.pendingMutations.bulkDelete(appliedIds);

  const failedIds = result.failedIds ?? [];
  for (let i = 0; i < failedIds.length; i++) {
    const id = failedIds[i]!;
    const m = await offlineDb.pendingMutations.get(id);
    if (!m) continue;
    m.retryCount += 1;
    m.error = result.errors[i] ?? "Erreur de synchronisation";
    await offlineDb.pendingMutations.put(m);
    acks.push({
      mutationId: id,
      table: m.table,
      op: m.op,
      rowId: (m.payload?.id as string) ?? null,
      status: "failed",
      ackedAt,
      error: m.error,
      attempts: m.retryCount,
    });
  }

  await recordSyncAcks(acks);
  await pruneSyncAcks();

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
