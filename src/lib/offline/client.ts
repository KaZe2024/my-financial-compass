/**
 * Client backend universel « offline-first ».
 *
 * Drop-in replacement de `@/integrations/supabase/client` pour tout le code
 * navigateur : la même API (`.from(...).select().eq()...`, `.insert()`,
 * `.update()`, `.delete()`, `.upsert()`) fonctionne en ligne ET hors ligne.
 *
 * - En ligne  : la requête part vers le backend, et les lignes lues sont
 *               recopiées dans le cache local (Dexie).
 * - Hors ligne (ou erreur réseau) :
 *     • lectures  → évaluées sur le cache local (filtres, tris, jointures
 *                   simples `alias:fk(col)`, range/limit/single/count).
 *     • écritures → appliquées localement puis mises en file d'attente et
 *                   rejouées automatiquement au retour du réseau.
 */
import { supabase as realSupabase } from "@/integrations/supabase/client";
import { checkOnlineWithHeartbeat } from "./network-status";
import {
  applyLocalMutation,
  getSyncedRows,
  upsertSyncedRows,
  SYNCED_TABLES,
  type SyncedTable,
} from "./db";
import { queueMutation } from "./sync";
import { v4 as uuidv4 } from "uuid";

const UID_KEY = "optis-user-id";

function cachedUserId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(UID_KEY);
}

async function resolveUserId(): Promise<string | null> {
  try {
    const { data } = await realSupabase.auth.getSession();
    const id = data.session?.user?.id ?? null;
    if (id && typeof localStorage !== "undefined") localStorage.setItem(UID_KEY, id);
    return id ?? cachedUserId();
  } catch {
    return cachedUserId();
  }
}

function isSynced(table: string): table is SyncedTable {
  return (SYNCED_TABLES as readonly string[]).includes(table);
}

// ---------------------------------------------------------------- filtres

type Op =
  | { k: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is" | "contains"; col: string; val: any }
  | { k: "in"; col: string; val: any[] }
  | { k: "not"; col: string; op: string; val: any }
  | { k: "or"; expr: string }
  | { k: "match"; val: Record<string, any> }
  | { k: "filter"; col: string; op: string; val: any };

function cmp(a: any, b: any) {
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function parseListValue(raw: string): any[] {
  return raw
    .replace(/^\(|\)$/g, "")
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""));
}

function coerce(val: any) {
  if (typeof val !== "string") return val;
  if (val === "null") return null;
  if (val === "true") return true;
  if (val === "false") return false;
  return val;
}

function matchOne(row: any, col: string, op: string, val: any): boolean {
  const cell = row?.[col];
  const v = coerce(val);
  switch (op) {
    case "eq":
      return String(cell) === String(v);
    case "neq":
      return String(cell) !== String(v);
    case "gt":
      return cmp(cell, v) > 0;
    case "gte":
      return cmp(cell, v) >= 0;
    case "lt":
      return cmp(cell, v) < 0;
    case "lte":
      return cmp(cell, v) <= 0;
    case "is":
      if (v === null) return cell === null || cell === undefined;
      return cell === v;
    case "in": {
      const list = Array.isArray(v) ? v : parseListValue(String(v));
      return list.some((x) => String(x) === String(cell));
    }
    case "like":
    case "ilike": {
      const pattern = String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
      return new RegExp(`^${pattern}$`, op === "ilike" ? "i" : "").test(String(cell ?? ""));
    }
    case "cs":
    case "contains": {
      const list = Array.isArray(cell) ? cell : [];
      const need = Array.isArray(v) ? v : [v];
      return need.every((x) => list.some((y: any) => String(y) === String(x)));
    }
    default:
      return true;
  }
}

function matchOrExpr(row: any, expr: string): boolean {
  // ex: "wallet_id.eq.123,to_wallet_id.eq.123"
  return expr.split(/,(?![^(]*\))/).some((part) => {
    const [col, op, ...rest] = part.split(".");
    if (!col || !op) return false;
    return matchOne(row, col, op, rest.join("."));
  });
}

function applyOps(rows: any[], ops: Op[]): any[] {
  return rows.filter((row) =>
    ops.every((o) => {
      switch (o.k) {
        case "or":
          return matchOrExpr(row, o.expr);
        case "not":
          return !matchOne(row, o.col, o.op, o.val);
        case "match":
          return Object.entries(o.val).every(([c, v]) => matchOne(row, c, "eq", v));
        case "filter":
          return matchOne(row, o.col, o.op, o.val);
        default:
          return matchOne(row, o.col, o.k, (o as any).val);
      }
    }),
  );
}

// -------------------------------------------------- select / jointures

const FK_HINTS: Record<string, string> = {
  budget_groups: "group_id",
  budget_nodes: "budget_node_id",
  wallets: "wallet_id",
  counterparties: "counterparty_id",
  products: "product_id",
  projects: "project_id",
  assets: "asset_id",
  plan_types: "type_id",
  plan_projects: "project_id",
  analytical_tags: "tag_id",
  documents: "document_id",
  brainstorm_sessions: "session_id",
  brainstorm_folders: "folder_id",
  fridge_items: "fridge_item_id",
  shopping_lists: "list_id",
  transactions: "transaction_id",
};

type SelectPart =
  | { kind: "col"; name: string }
  | { kind: "embed"; alias: string; table: string; fk: string; cols: string[] };

function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function parseSelect(sel: string): SelectPart[] {
  return splitTopLevel(sel).map((token) => {
    const embed = token.match(/^(?:([\w]+):)?([\w]+)(?:!\w+)?\(([^)]*)\)$/);
    if (embed) {
      const alias = embed[1] ?? embed[2];
      const ref = embed[2];
      const cols = splitTopLevel(embed[3]).map((c) => c.trim());
      // `alias:wallet_id(name)` → la référence est la colonne FK elle-même
      const isFkRef = ref.endsWith("_id");
      const table = isFkRef ? guessTableFromFk(ref) : ref;
      const fk = isFkRef ? ref : (FK_HINTS[ref] ?? `${ref.replace(/s$/, "")}_id`);
      return { kind: "embed", alias, table, fk, cols } as SelectPart;
    }
    return { kind: "col", name: token };
  });
}

function guessTableFromFk(fk: string): string {
  const base = fk.replace(/_id$/, "");
  const candidates = [`${base}s`, base, `${base}es`];
  for (const c of candidates) if (isSynced(c)) return c;
  if (/wallet/.test(base)) return "wallets";
  return `${base}s`;
}

async function projectRows(rows: any[], sel: string): Promise<any[]> {
  const trimmed = (sel || "*").trim();
  if (trimmed === "*") return rows;
  const parts = parseSelect(trimmed);
  const embeds = parts.filter((p): p is Extract<SelectPart, { kind: "embed" }> => p.kind === "embed");
  const cols = parts.filter((p): p is Extract<SelectPart, { kind: "col" }> => p.kind === "col").map((p) => p.name);
  const takeAll = cols.includes("*");

  const lookups = new Map<string, Map<string, any>>();
  for (const e of embeds) {
    if (lookups.has(e.table)) continue;
    if (!isSynced(e.table)) continue;
    const refRows = await getSyncedRows(e.table as SyncedTable);
    lookups.set(e.table, new Map(refRows.map((r: any) => [String(r.id), r])));
  }

  return rows.map((row) => {
    const out: any = takeAll ? { ...row } : {};
    if (!takeAll) for (const c of cols) out[c] = row?.[c] ?? null;
    for (const e of embeds) {
      const target = lookups.get(e.table)?.get(String(row?.[e.fk]));
      if (!target) {
        out[e.alias] = null;
        continue;
      }
      if (e.cols.includes("*")) out[e.alias] = target;
      else {
        const sub: any = {};
        for (const c of e.cols) sub[c] = target?.[c] ?? null;
        out[e.alias] = sub;
      }
    }
    return out;
  });
}

// ----------------------------------------------------------- builder

type Chain = { m: string; args: any[] };

/** Données souples : indexables comme un tableau ET comme un objet (single). */
type FlexData = any[] & Record<string, any>;

type Result<T = FlexData> = { data: T; error: any; count?: number | null; status?: number; statusText?: string };

class OfflineBuilder implements PromiseLike<Result> {
  private chain: Chain[] = [];
  private ops: Op[] = [];
  private selectStr = "*";
  private hasSelect = false;
  private orders: { col: string; asc: boolean }[] = [];
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private limitN: number | null = null;
  private mode: "read" | "insert" | "update" | "delete" | "upsert" = "read";
  private writePayload: any = null;
  private writeOpts: any = null;
  private wantSingle = false;
  private maybe = false;
  private countMode: string | null = null;
  private headOnly = false;

  constructor(private table: string) {}

  private push(m: string, ...args: any[]) {
    this.chain.push({ m, args });
    return this;
  }

  // ---- write entry points
  insert(payload: any, opts?: any) {
    this.mode = "insert";
    this.writePayload = payload;
    this.writeOpts = opts;
    return this.push("insert", payload, opts);
  }
  upsert(payload: any, opts?: any) {
    this.mode = "upsert";
    this.writePayload = payload;
    this.writeOpts = opts;
    return this.push("upsert", payload, opts);
  }
  update(payload: any, opts?: any) {
    this.mode = "update";
    this.writePayload = payload;
    this.writeOpts = opts;
    return this.push("update", payload, opts);
  }
  delete(opts?: any) {
    this.mode = "delete";
    return this.push("delete", opts);
  }

  select(sel = "*", opts?: any) {
    if (this.mode === "read") {
      this.selectStr = sel;
    } else {
      this.selectStr = sel;
    }
    this.hasSelect = true;
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.headOnly = true;
    return this.push("select", sel, opts);
  }

  // ---- filters
  eq(col: string, val: any) { this.ops.push({ k: "eq", col, val }); return this.push("eq", col, val); }
  neq(col: string, val: any) { this.ops.push({ k: "neq", col, val }); return this.push("neq", col, val); }
  gt(col: string, val: any) { this.ops.push({ k: "gt", col, val }); return this.push("gt", col, val); }
  gte(col: string, val: any) { this.ops.push({ k: "gte", col, val }); return this.push("gte", col, val); }
  lt(col: string, val: any) { this.ops.push({ k: "lt", col, val }); return this.push("lt", col, val); }
  lte(col: string, val: any) { this.ops.push({ k: "lte", col, val }); return this.push("lte", col, val); }
  like(col: string, val: any) { this.ops.push({ k: "like", col, val }); return this.push("like", col, val); }
  ilike(col: string, val: any) { this.ops.push({ k: "ilike", col, val }); return this.push("ilike", col, val); }
  is(col: string, val: any) { this.ops.push({ k: "is", col, val }); return this.push("is", col, val); }
  in(col: string, val: any[]) { this.ops.push({ k: "in", col, val }); return this.push("in", col, val); }
  contains(col: string, val: any) { this.ops.push({ k: "contains", col, val }); return this.push("contains", col, val); }
  not(col: string, op: string, val: any) { this.ops.push({ k: "not", col, op, val }); return this.push("not", col, op, val); }
  or(expr: string) { this.ops.push({ k: "or", expr }); return this.push("or", expr); }
  match(val: Record<string, any>) { this.ops.push({ k: "match", val }); return this.push("match", val); }
  filter(col: string, op: string, val: any) { this.ops.push({ k: "filter", col, op, val }); return this.push("filter", col, op, val); }

  // ---- modifiers
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string }) {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this.push("order", col, opts);
  }
  limit(n: number, opts?: any) { this.limitN = n; return this.push("limit", n, opts); }
  range(from: number, to: number, opts?: any) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this.push("range", from, to, opts);
  }
  abortSignal(signal: AbortSignal) { return this.push("abortSignal", signal); }
  maybeSingle() { this.maybe = true; return this.push("maybeSingle"); }
  single() { this.wantSingle = true; return this.push("single"); }
  csv() { return this.push("csv"); }
  throwOnError() { return this.push("throwOnError"); }

  // ---- execution
  private async runOnline(): Promise<Result<any>> {
    let q: any = (realSupabase as any).from(this.table);
    for (const { m, args } of this.chain) {
      q = q[m](...args);
    }
    const res = await q;
    // mirroring du cache pour les lectures
    if (this.mode === "read" && !res.error && isSynced(this.table)) {
      const rows = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
      const clean = rows.filter((r: any) => r && typeof r.id === "string");
      if (clean.length) {
        try {
          await upsertSyncedRows(
            this.table as SyncedTable,
            clean.map((r: any) => ({
              id: r.id,
              data: r,
              updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
            })),
          );
        } catch {
          /* best effort */
        }
      }
    }
    return res;
  }

  private finishRead(rows: any[]): Result<any> {
    let out = rows;
    for (const o of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => (o.asc ? cmp(a?.[o.col], b?.[o.col]) : cmp(b?.[o.col], a?.[o.col])));
    }
    const total = out.length;
    if (this.rangeFrom !== null && this.rangeTo !== null) out = out.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    if (this.headOnly) return { data: null, error: null, count: total };
    if (this.wantSingle || this.maybe) {
      const first = out[0] ?? null;
      if (!first && this.wantSingle) return { data: null, error: { message: "Aucune ligne trouvée (hors ligne)" } };
      return { data: first, error: null, count: this.countMode ? total : null };
    }
    return { data: out, error: null, count: this.countMode ? total : null };
  }

  private async runOfflineRead(): Promise<Result<any>> {
    if (!isSynced(this.table)) {
      return { data: this.wantSingle || this.maybe ? null : [], error: null, count: 0 };
    }
    const all = await getSyncedRows(this.table as SyncedTable);
    const filtered = applyOps(all as any[], this.ops);
    const projected = await projectRows(filtered, this.selectStr);
    return this.finishRead(projected);
  }

  private async runOfflineWrite(): Promise<Result<any>> {
    if (!isSynced(this.table)) {
      return { data: null, error: { message: `Table ${this.table} indisponible hors ligne` } };
    }
    const table = this.table as SyncedTable;
    const userId = await resolveUserId();
    const now = new Date().toISOString();

    if (this.mode === "insert" || this.mode === "upsert") {
      const payloads = (Array.isArray(this.writePayload) ? this.writePayload : [this.writePayload]).filter(Boolean);
      const existing = await getSyncedRows(table);
      const byId = new Map(existing.map((r: any) => [String(r.id), r]));
      const written: any[] = [];
      for (const p of payloads) {
        const id = (p as any).id ?? uuidv4();
        const prev = byId.get(String(id));
        const row = {
          ...(this.mode === "upsert" && prev ? prev : {}),
          ...p,
          id,
          user_id: (p as any).user_id ?? userId ?? undefined,
          updated_at: now,
          created_at: (p as any).created_at ?? (prev as any)?.created_at ?? now,
        };
        const op = this.mode === "upsert" && prev ? "update" : "insert";
        await applyLocalMutation(table, op, row);
        await queueMutation(table, op, row);
        written.push(row);
      }
      const projected = await projectRows(written, this.selectStr);
      if (this.wantSingle || this.maybe) return { data: projected[0] ?? null, error: null };
      return { data: this.hasSelect ? projected : null, error: null };
    }

    const all = await getSyncedRows(table);
    const targets = applyOps(all as any[], this.ops);

    if (this.mode === "update") {
      const written: any[] = [];
      for (const t of targets) {
        const row = { ...t, ...this.writePayload, id: (t as any).id, updated_at: now };
        await applyLocalMutation(table, "update", row);
        await queueMutation(table, "update", row);
        written.push(row);
      }
      const projected = await projectRows(written, this.selectStr);
      if (this.wantSingle || this.maybe) return { data: projected[0] ?? null, error: null };
      return { data: this.hasSelect ? projected : null, error: null };
    }

    // delete
    const deleted: any[] = [];
    for (const t of targets) {
      const id = (t as any).id;
      if (!id) continue;
      await applyLocalMutation(table, "delete", { id });
      await queueMutation(table, "delete", { id });
      deleted.push(t);
    }
    const projected = await projectRows(deleted, this.selectStr);
    if (this.wantSingle || this.maybe) return { data: projected[0] ?? null, error: null };
    return { data: this.hasSelect ? projected : null, error: null };
  }

  private async exec(): Promise<Result<any>> {
    let online = false;
    try {
      online = await checkOnlineWithHeartbeat();
    } catch {
      online = false;
    }

    if (online) {
      try {
        const res = await this.runOnline();
        // Erreur applicative (RLS, contrainte…) : on la remonte telle quelle.
        if (!res.error) return res;
        const msg = String(res.error?.message ?? "");
        const networkish = /fetch|network|Failed to fetch|timeout|offline/i.test(msg);
        if (!networkish) return res;
      } catch (e: any) {
        // exception réseau → bascule hors ligne
        console.warn(`[offline] ${this.table} requête en ligne échouée, bascule locale`, e);
      }
    }

    if (this.mode === "read") return this.runOfflineRead();
    return this.runOfflineWrite();
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled as any, onrejected as any);
  }

  catch(onrejected?: (reason: any) => any) {
    return this.exec().catch(onrejected);
  }

  finally(onfinally?: () => void) {
    return this.exec().finally(onfinally);
  }
}

// ------------------------------------------------------------- auth

const offlineAuth = {
  ...({} as Record<string, never>),
  getSession: (...args: any[]) => (realSupabase.auth as any).getSession(...args),
  onAuthStateChange: (...args: any[]) => (realSupabase.auth as any).onAuthStateChange(...args),
  signInWithPassword: (...args: any[]) => (realSupabase.auth as any).signInWithPassword(...args),
  signUp: (...args: any[]) => (realSupabase.auth as any).signUp(...args),
  signOut: (...args: any[]) => (realSupabase.auth as any).signOut(...args),
  updateUser: (...args: any[]) => (realSupabase.auth as any).updateUser(...args),
  resetPasswordForEmail: (...args: any[]) => (realSupabase.auth as any).resetPasswordForEmail(...args),
  /** Hors ligne : on se rabat sur la session persistée localement. */
  async getUser(...args: any[]) {
    try {
      const online = await checkOnlineWithHeartbeat();
      if (online) {
        const res = await (realSupabase.auth as any).getUser(...args);
        if (!res.error && res.data?.user) {
          if (typeof localStorage !== "undefined") localStorage.setItem(UID_KEY, res.data.user.id);
          return res;
        }
      }
    } catch {
      /* fallback */
    }
    const { data } = await realSupabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (user && typeof localStorage !== "undefined") localStorage.setItem(UID_KEY, user.id);
    if (user) return { data: { user }, error: null };
    const id = cachedUserId();
    if (id) return { data: { user: { id } as any }, error: null };
    return { data: { user: null }, error: { message: "Utilisateur non authentifié (hors ligne)" } };
  },
};

/** Client offline-first : même surface que le client backend généré. */
export const supabaseOffline: any = new Proxy(
  {
    from: (table: string) => new OfflineBuilder(table) as any,
    auth: new Proxy(offlineAuth as any, {
      get(target, prop: string) {
        if (prop in target) return (target as any)[prop];
        const value = (realSupabase.auth as any)[prop];
        return typeof value === "function" ? value.bind(realSupabase.auth) : value;
      },
    }),
  } as any,
  {
    get(target, prop: string) {
      if (prop in target) return (target as any)[prop];
      const value = (realSupabase as any)[prop];
      return typeof value === "function" ? value.bind(realSupabase) : value;
    },
  },
);

export default supabaseOffline;
