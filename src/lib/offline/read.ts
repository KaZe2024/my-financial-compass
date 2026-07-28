import { checkOnlineWithHeartbeat } from "./network-status";
import { getSyncedRows, upsertSyncedRows, type SyncedTable } from "./db";

/**
 * Generic offline-aware read.
 * Online: runs the fetcher, mirrors rows into the local cache, returns them.
 * Offline (or on error): returns the locally cached rows for that table.
 */
export async function offlineSelect<T extends Record<string, unknown>>(
  table: SyncedTable,
  fetcher: () => Promise<T[]>,
  options?: { sort?: (a: T, b: T) => number; filter?: (row: T) => boolean },
): Promise<T[]> {
  const finish = (rows: T[]) => {
    let out = rows;
    if (options?.filter) out = out.filter(options.filter);
    if (options?.sort) out = [...out].sort(options.sort);
    return out;
  };

  try {
    const online = await checkOnlineWithHeartbeat();
    if (online) {
      const rows = await fetcher();
      try {
        await upsertSyncedRows(
          table,
          (rows ?? [])
            .filter((r: any) => r && typeof r.id === "string")
            .map((r: any) => ({
              id: r.id as string,
              data: r as Record<string, unknown>,
              updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
            })),
        );
      } catch {
        /* cache write is best-effort */
      }
      return finish(rows ?? []);
    }
  } catch (e) {
    console.warn(`[offline] read ${table} failed, using local cache`, e);
  }

  const cached = (await getSyncedRows(table)) as unknown as T[];
  return finish(cached);
}

export function byText<T extends Record<string, any>>(key: string) {
  return (a: T, b: T) => String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
}

export function byDateDesc<T extends Record<string, any>>(key: string) {
  return (a: T, b: T) => String(b[key] ?? "").localeCompare(String(a[key] ?? ""));
}
