import Dexie, { type Table } from "dexie";

export type SyncMeta = {
  id: string;
  lastSyncAt: string | null;
  deviceId: string;
};

export type PendingMutation = {
  id: string;
  table: string;
  op: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  original?: Record<string, unknown>;
  createdAt: number;
  retryCount: number;
  error?: string | null;
};

export const SYNCED_TABLES = [
  "wallets",
  "transactions",
  "transaction_tags",
  "counterparties",
  "budget_nodes",
  "budget_node_amounts",
  "budget_categories",
  "budget_groups",
  "budget_periods",
  "assets",
  "asset_events",
  "asset_valuations",
  "asset_types",
  "debts",
  "receivables",
  "projects",
  "financial_goals",
  "shopping_lists",
  "shopping_list_items",
  "products",
  "product_prices",
  "analytical_tags",
  "subscriptions",
  "income_sources",
  "provisions",
  "monthly_snapshots",
  "currencies",
  "exchange_rates",
  "profiles",
  "utility_readings",
  "fridge_items",
  "loans",
  "loan_amortizations",
  "meal_plan_entries",
  "invoices_to_issue",
  "salary_records",
  "scenarios",
  "attachments",
  "audit_log",
  "ai_insights",
  "chat_conversations",
  "chat_messages",
  "plan_types",
  "plan_tags",
  "plan_projects",
  "plan_items",
  "plan_item_tags",
  "documents",
  "document_events",
  "brainstorm_folders",
  "brainstorm_sessions",
  "brainstorm_blocks",
  "advisor_actions",

] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

class OfflineDatabase extends Dexie {
  syncMeta!: Table<SyncMeta, string>;
  pendingMutations!: Table<PendingMutation, string>;

  // Dynamic tables for synced data
  constructor() {
    super("PersonalCFOOffline");
    this.version(1).stores({
      syncMeta: "id",
      pendingMutations: "id, table, createdAt, retryCount",
    });
  }

  async ensureSyncedTable(tableName: SyncedTable) {
    // Dexie doesn't have dynamic schema changes at runtime easily.
    // We use a generic table with a compound key [tableName + id] for all synced rows.
  }
}

export const offlineDb = new OfflineDatabase();

// Generic synced rows store: one table with all synced data, indexed by table+id
export type SyncedRow = {
  table: SyncedTable;
  id: string;
  data: Record<string, unknown>;
  updatedAt: string;
  deleted: boolean;
};

class SyncedDataDatabase extends Dexie {
  rows!: Table<SyncedRow, [string, string]>;

  constructor() {
    super("PersonalCFOSyncedData");
    this.version(1).stores({
      rows: "[table+id], table, updatedAt",
    });
  }
}

export const syncedDataDb = new SyncedDataDatabase();

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("pwa-device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("pwa-device-id", id);
  }
  return id;
}

export async function getSyncMeta(): Promise<SyncMeta> {
  const id = "global";
  let meta = await offlineDb.syncMeta.get(id);
  if (!meta) {
    meta = { id, lastSyncAt: null, deviceId: getDeviceId() };
    await offlineDb.syncMeta.put(meta);
  }
  return meta;
}

export async function setLastSyncAt(at: string) {
  const meta = await getSyncMeta();
  meta.lastSyncAt = at;
  await offlineDb.syncMeta.put(meta);
}

export async function getLastSyncAt(): Promise<string | null> {
  const meta = await getSyncMeta();
  return meta.lastSyncAt;
}

export async function upsertSyncedRows(table: SyncedTable, rows: { id: string; data: Record<string, unknown>; updatedAt: string; deleted?: boolean }[]) {
  const txRows: SyncedRow[] = rows.map((r) => ({
    table,
    id: r.id,
    data: r.data,
    updatedAt: r.updatedAt,
    deleted: r.deleted ?? false,
  }));
  await syncedDataDb.rows.bulkPut(txRows);
}

export async function getSyncedRows(table: SyncedTable): Promise<Record<string, unknown>[]> {
  const rows = await syncedDataDb.rows.where("table").equals(table).and((r) => !r.deleted).toArray();
  return rows.map((r) => r.data);
}

export async function getSyncedRowById(table: SyncedTable, id: string): Promise<Record<string, unknown> | null> {
  const row = await syncedDataDb.rows.get([table, id]);
  if (!row || row.deleted) return null;
  return row.data;
}

export async function applyLocalMutation(table: SyncedTable, op: PendingMutation["op"], payload: Record<string, unknown>) {
  if (op === "delete") {
    const existing = await syncedDataDb.rows.get([table, payload.id as string]);
    if (existing) {
      existing.deleted = true;
      existing.updatedAt = new Date().toISOString();
      await syncedDataDb.rows.put(existing);
    }
  } else if (op === "insert") {
    await syncedDataDb.rows.put({
      table,
      id: payload.id as string,
      data: payload,
      updatedAt: new Date().toISOString(),
      deleted: false,
    });
  } else if (op === "update") {
    const existing = await syncedDataDb.rows.get([table, payload.id as string]);
    if (existing) {
      existing.data = { ...existing.data, ...payload };
      existing.updatedAt = new Date().toISOString();
      await syncedDataDb.rows.put(existing);
    } else {
      await syncedDataDb.rows.put({
        table,
        id: payload.id as string,
        data: payload,
        updatedAt: new Date().toISOString(),
        deleted: false,
      });
    }
  }
}

export async function clearSyncedTable(table: SyncedTable) {
  await syncedDataDb.rows.where("table").equals(table).delete();
}

export async function clearAllSyncedData() {
  await syncedDataDb.rows.clear();
  await offlineDb.pendingMutations.clear();
  await offlineDb.syncMeta.clear();
}
