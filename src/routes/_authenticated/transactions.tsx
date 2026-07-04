import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { walletsQO, budgetNodesQO, counterpartiesQO, projectsQO } from "@/lib/queries";
import { NodePicker } from "@/components/node-picker";
import { TagManager } from "@/components/tag-manager";
import { CounterpartyPicker, ensureCounterparty, type Counterparty } from "@/components/counterparty-picker";
import { buildTree, flattenTree, pathLabel } from "@/lib/budget-nodes";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, X, CheckSquare, Square, Copy } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtDate, fmtMonth, fmtMoney, toISODate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({ meta: [{ title: "Transactions — Personal CFO" }] }),
  component: TxPage,
});

const TX_TYPES = [
  "expense","income","transfer","investment","asset_purchase","asset_sale","adjustment",
  "enveloppe_projet","enveloppe_emprunt",
  "dette","creance",
] as const;
const CURRENCIES = ["MGA","EUR","USD","GBP","CHF","CAD","AUD","JPY","CNY"];
const PROJECT_TYPES = new Set(["investment","enveloppe_projet","enveloppe_emprunt"]);
const DEBT_TYPES = new Set(["dette"]);
const RECEIVABLE_TYPES = new Set(["creance"]);
const NO_BUDGET_TYPES = new Set(["transfer","dette","creance"]);
const CASH_IN_TYPES = new Set(["income","asset_sale","adjustment","enveloppe_emprunt","dette"]);

type Filters = {
  fromDate: string;
  toDate: string;
  amountMin: string;
  amountMax: string;
  counterparty: string;
  type: string;
  walletId: string;
  currency: string;
  keyword: string;
  notesKw: string;
  lineId: string | null;
  nodeId: string | null;
  projectId: string;
  tagIds: string[];
};

const EMPTY_FILTERS: Filters = {
  fromDate: "", toDate: "", amountMin: "", amountMax: "",
  counterparty: "", type: "all", walletId: "all", currency: "all",
  keyword: "", notesKw: "", lineId: null, nodeId: null, projectId: "all", tagIds: [],
};

function parseDateParts(s: string): { y: number; mo: number; d: number } | null {
  const value = s.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(value);
  if (iso) return { y: +iso[1], mo: +iso[2], d: +iso[3] };
  if (!dmy) return null;
  return { y: +dmy[3], mo: +dmy[2], d: +dmy[1] };
}

function clampDateStr(s: string): string {
  if (!s) return s;
  const parts = parseDateParts(s);
  if (!parts || parts.mo < 1 || parts.mo > 12 || parts.d < 1) return s;
  const last = new Date(parts.y, parts.mo, 0).getDate();
  const d = Math.min(parts.d, last);
  return `${String(parts.y).padStart(4, "0")}-${String(parts.mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function normalizeCompleteDate(s: string): string | null {
  const parts = parseDateParts(s);
  if (!parts || parts.mo < 1 || parts.mo > 12 || parts.d < 1) return null;
  return clampDateStr(s);
}

function DateInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <DatePicker value={value} onChange={onChange} />;
}

function baseAmount(t: any) {
  return Number(t.base_amount ?? Number(t.amount) * Number(t.exchange_rate ?? 1));
}

function signedCashImpact(t: any, walletId: string | null) {
  const mga = baseAmount(t);
  if (t.type === "transfer") {
    if (!walletId) return 0;
    let impact = 0;
    if (t.wallet_id === walletId) impact -= mga;
    if (t.to_wallet_id === walletId) impact += mga;
    return impact;
  }
  if (walletId && t.wallet_id !== walletId) return 0;
  return CASH_IN_TYPES.has(t.type) ? mga : -mga;
}

function TxPage() {
  const qc = useQueryClient();
  const wallets = useQuery(walletsQO);
  const nodesQ = useQuery(budgetNodesQO);
  const cps = useQuery(counterpartiesQO);
  const projects = useQuery(projectsQO);

  const nodeInfo = useMemo(() => {
    const tree = buildTree(nodesQ.data ?? []);
    const flat = flattenTree(tree);
    const m = new Map<string, { path: string; name: string; line: string; lineId: string | null }>();
    for (const n of flat) {
      const line = n.path[0] ?? n.name;
      const root = flat.find((x) => x.depth === 0 && x.name === line);
      m.set(n.id, { path: pathLabel(n), name: n.name, line, lineId: root?.id ?? null });
    }
    return m;
  }, [nodesQ.data]);

  const cpById = useMemo(() => new Map((cps.data ?? []).map((c: any) => [c.id, c])), [cps.data]);
  const projectById = useMemo(() => new Map((projects.data ?? []).map((p: any) => [p.id, p])), [projects.data]);

  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((s) => ({ ...s, [k]: v }));
  const setDate = (k: "fromDate" | "toDate", v: string) => set(k, clampDateStr(v));

  const tags = useQuery({
    queryKey: ["analytical_tags"],
    queryFn: async () => (await supabase.from("analytical_tags").select("*").order("name")).data ?? [],
  });

  const txs = useQuery({
    queryKey: ["transactions", f.type, f.fromDate, f.toDate, f.walletId],
    queryFn: async () => {
      let q = supabase.from("transactions")
        .select("*, wallets:wallet_id(name), to:to_wallet_id(name)")
        .order("occurred_on", { ascending: false }).order("created_at", { ascending: false })
        .limit(10000);
      if (f.type !== "all") q = q.eq("type", f.type as any);
      if (f.fromDate) q = q.gte("occurred_on", f.fromDate);
      if (f.toDate) q = q.lte("occurred_on", f.toDate);
      if (f.walletId !== "all") q = q.or(`wallet_id.eq.${f.walletId},to_wallet_id.eq.${f.walletId}`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const txTags = useQuery({
    queryKey: ["tx_tags_all"],
    queryFn: async () => (await supabase.from("transaction_tags").select("transaction_id,tag_id")).data ?? [],
  });
  const tagIdsByTx = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of txTags.data ?? []) {
      const arr = m.get(r.transaction_id) ?? [];
      arr.push(r.tag_id);
      m.set(r.transaction_id, arr);
    }
    return m;
  }, [txTags.data]);
  const tagNameById = useMemo(() => new Map((tags.data ?? []).map((t: any) => [t.id, t.name])), [tags.data]);

  const filtered = useMemo(() => {
    const kw = f.keyword.trim().toLowerCase();
    const kwN = f.notesKw.trim().toLowerCase();
    const cpKw = f.counterparty.trim().toLowerCase();
    const minV = f.amountMin ? Number(f.amountMin) : null;
    const maxV = f.amountMax ? Number(f.amountMax) : null;
    return (txs.data ?? []).filter((t: any) => {
      if (f.nodeId && t.budget_node_id !== f.nodeId) return false;
      if (f.lineId) {
        const info = t.budget_node_id ? nodeInfo.get(t.budget_node_id) : null;
        if (info?.lineId !== f.lineId) return false;
      }
      if (f.projectId !== "all" && t.project_id !== f.projectId) return false;
      if (f.currency !== "all" && t.currency !== f.currency) return false;
      if (kw && !(t.description ?? "").toLowerCase().includes(kw)) return false;
      if (kwN && !(t.notes ?? "").toLowerCase().includes(kwN)) return false;
      if (cpKw) {
        const cp = t.counterparty_id ? (cpById.get(t.counterparty_id) as any)?.name : t.counterparty_label;
        if (!String(cp ?? "").toLowerCase().includes(cpKw)) return false;
      }
      if (f.tagIds.length) {
        const own = tagIdsByTx.get(t.id) ?? [];
        if (!f.tagIds.every((id) => own.includes(id))) return false;
      }
      const mga = Number(t.base_amount ?? Number(t.amount) * Number(t.exchange_rate ?? 1));
      if (minV != null && mga < minV) return false;
      if (maxV != null && mga > maxV) return false;
      return true;
    });
  }, [txs.data, f, nodeInfo, tagIdsByTx, cpById]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("transaction_tags").delete().eq("transaction_id", id);
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
      const { logAudit } = await import("@/lib/audit");
      await logAudit("transaction", id, "delete");
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Supprimé"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const chunk = <T,>(arr: T[], size = 200): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const bulkDel = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const c of chunk(ids)) {
        const { error: e1 } = await supabase.from("transaction_tags").delete().in("transaction_id", c);
        if (e1) throw e1;
        const { error } = await supabase.from("transactions").delete().in("id", c);
        if (error) throw error;
      }
    },
    onSuccess: (_d, ids) => { qc.invalidateQueries(); toast.success(`${ids.length} supprimées`); setSelected(new Set()); },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkArchive = useMutation({
    mutationFn: async ({ ids, archived }: { ids: string[]; archived: boolean }) => {
      for (const c of chunk(ids)) {
        const { error } = await supabase.from("transactions").update({ archived } as any).in("id", c);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => { qc.invalidateQueries(); toast.success(`${v.ids.length} ${v.archived ? "archivée(s)" : "désarchivée(s)"}`); setSelected(new Set()); },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkEdit = useMutation({
    mutationFn: async ({ ids, patch, tagIdsAdd }: { ids: string[]; patch: Record<string, any>; tagIdsAdd: string[] }) => {
      if (Object.keys(patch).length) {
        for (const c of chunk(ids)) {
          const { error } = await supabase.from("transactions").update(patch as any).in("id", c);
          if (error) throw error;
        }
      }
      if (tagIdsAdd.length) {
        const { data: u } = await supabase.auth.getUser();
        for (const c of chunk(ids)) {
          const { error: dErr } = await supabase.from("transaction_tags").delete().in("transaction_id", c).in("tag_id", tagIdsAdd);
          if (dErr) throw dErr;
          const rows = c.flatMap((tid) => tagIdsAdd.map((tag_id) => ({ transaction_id: tid, tag_id, user_id: u.user!.id })));
          for (const rc of chunk(rows, 500)) {
            const { error: iErr } = await supabase.from("transaction_tags").insert(rc);
            if (iErr) throw iErr;
          }
        }
      }
    },
    onSuccess: (_d, v) => { qc.invalidateQueries(); toast.success(`${v.ids.length} modifiée(s)`); setSelected(new Set()); setBulkEditOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: u } = await supabase.auth.getUser();
      const src: any[] = [];
      for (const c of chunk(ids)) {
        const { data, error } = await supabase.from("transactions").select("*").in("id", c);
        if (error) throw error;
        src.push(...(data ?? []));
      }
      const today = toISODate(new Date());
      const clones = src.map((t: any) => {
        const { id: _id, created_at: _c, updated_at: _up, ...rest } = t;
        return { ...rest, user_id: u.user!.id, occurred_on: today };
      });
      if (!clones.length) return { ids: [] as string[], count: 0 };
      const insIds: { id: string }[] = [];
      for (const cc of chunk(clones, 500)) {
        const { data: ins, error: iErr } = await supabase.from("transactions").insert(cc as any).select("id");
        if (iErr) throw iErr;
        insIds.push(...(ins ?? []));
      }
      const srcTags: any[] = [];
      for (const c of chunk(ids)) {
        const { data } = await supabase.from("transaction_tags").select("*").in("transaction_id", c);
        srcTags.push(...(data ?? []));
      }
      if (srcTags.length) {
        const map = new Map<string, string>();
        src.forEach((s: any, i: number) => map.set(s.id, insIds[i]?.id));
        const tagRows = srcTags
          .map((tt: any) => ({ transaction_id: map.get(tt.transaction_id)!, tag_id: tt.tag_id, user_id: u.user!.id }))
          .filter((r) => r.transaction_id);
        for (const rc of chunk(tagRows, 500)) {
          if (rc.length) await supabase.from("transaction_tags").insert(rc);
        }
      }
      return { ids: insIds.map((r) => r.id), count: clones.length };
    },
    onSuccess: (r) => { qc.invalidateQueries(); toast.success(`${r.count} dupliquée(s)`); setSelected(new Set()); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [dupForm, setDupForm] = useState<FormState | null>(null);

  // Group rows by month with per-month and grand totals (MGA base_amount, signed by tx type).
  // When a wallet filter is active, transfers count with their sign for that wallet.
  const grouped = useMemo(() => {
    const walletFilter = f.walletId !== "all" ? f.walletId : null;
    const groups = new Map<string, any[]>();
    for (const t of filtered) {
      const k = String(t.occurred_on).slice(0, 7);
      const arr = groups.get(k) ?? [];
      arr.push(t);
      groups.set(k, arr);
    }
    return Array.from(groups.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([month, rows]) => {
        let inflow = 0, outflow = 0;
        for (const t of rows) {
          const signedCash = signedCashImpact(t, walletFilter);
          if (signedCash > 0) inflow += signedCash;
          else if (signedCash < 0) outflow += Math.abs(signedCash);
        }
        return { month, rows, inflow, outflow, net: inflow - outflow };
      });
  }, [filtered, f.walletId]);


  const totals = useMemo(() => {
    let inflow = 0, outflow = 0;
    for (const g of grouped) { inflow += g.inflow; outflow += g.outflow; }
    return { inflow, outflow, net: inflow - outflow };
  }, [grouped]);

  const allVisibleIds = useMemo(() => filtered.map((t: any) => t.id), [filtered]);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allVisibleIds));
  }
  function toggleOne(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Trésorerie</p>
          <h1 className="mt-1 text-2xl font-semibold">Transactions</h1>
        </div>
        <AddTxDialog wallets={wallets.data ?? []} nodes={nodesQ.data ?? []} tags={tags.data ?? []} cps={cps.data ?? []} projects={projects.data ?? []} onDone={() => qc.invalidateQueries()} />
      </header>

      <Panel
        title="Filtres"
        action={
          <Button variant="ghost" size="sm" onClick={() => setF(EMPTY_FILTERS)}>
            <X className="mr-1 h-3 w-3" /> Réinitialiser
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Date du"><DateInput value={f.fromDate} onChange={(v) => setDate("fromDate", v)} /></Field>
          <Field label="Date au"><DateInput value={f.toDate} onChange={(v) => setDate("toDate", v)} /></Field>
          <Field label="Montant MGA min"><Input type="number" step="any" value={f.amountMin} onChange={(e) => set("amountMin", e.target.value)} /></Field>
          <Field label="Montant MGA max"><Input type="number" step="any" value={f.amountMax} onChange={(e) => set("amountMax", e.target.value)} /></Field>
          <Field label="Tiers"><Input value={f.counterparty} onChange={(e) => set("counterparty", e.target.value)} placeholder="Nom contient…" /></Field>
          <Field label="Type">
            <Select value={f.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {TX_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Portefeuille">
            <Select value={f.walletId} onValueChange={(v) => set("walletId", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {(wallets.data ?? []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Devise">
            <Select value={f.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Mot-clé description"><Input value={f.keyword} onChange={(e) => set("keyword", e.target.value)} /></Field>
          <Field label="Mot-clé notes"><Input value={f.notesKw} onChange={(e) => set("notesKw", e.target.value)} /></Field>
          <Field label="Ligne budgétaire">
            <NodePicker nodes={nodesQ.data ?? []} value={f.lineId} onChange={(id) => set("lineId", id)} onlyDepth={0} hidePath placeholder="Toutes" />
          </Field>
          <Field label="Catégorie (intermédiaire)">
            <NodePicker nodes={nodesQ.data ?? []} value={f.nodeId} onChange={(id) => set("nodeId", id)} onlyDepth={1} hidePath placeholder="Toutes" />
          </Field>
          <Field label="Projet">
            <Select value={f.projectId} onValueChange={(v) => set("projectId", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {(projects.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-3">
            <Field label="Tags">
              <TagManager tags={tags.data ?? []} value={f.tagIds} onChange={(ids) => set("tagIds", ids)} allowManage={false} />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel
        title={`${filtered.length} mouvements`}
        action={
          selected.size > 0 ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
              <Button variant="outline" size="sm" onClick={() => setBulkEditOpen(true)}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Modifier
              </Button>
              <Button variant="outline" size="sm" disabled={duplicate.isPending} onClick={() => duplicate.mutate(Array.from(selected))}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Dupliquer
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkArchive.isPending}
                onClick={() => bulkArchive.mutate({ ids: Array.from(selected), archived: true })}
              >
                Archiver
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={bulkDel.isPending}
                onClick={() => { if (confirm(`Supprimer ${selected.size} transaction(s) ?`)) bulkDel.mutate(Array.from(selected)); }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Supprimer
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Annuler</Button>
            </div>
          ) : (
            <div className="flex gap-4 font-mono text-[10px] uppercase tracking-widest">
              <span className="text-positive">+ {fmtMoney(totals.inflow, "MGA")}</span>
              <span className="text-negative">− {fmtMoney(totals.outflow, "MGA")}</span>
              <span className={totals.net >= 0 ? "text-positive" : "text-negative"}>Net {fmtMoney(totals.net, "MGA", { sign: true })}</span>
            </div>
          )
        }
      >
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[1240px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 w-8">
                  <button onClick={toggleAll} title={allSelected ? "Tout désélectionner" : "Tout sélectionner"} className="text-muted-foreground hover:text-foreground">
                    {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Tiers</th>
                <th className="px-4 py-2">Catégorie</th>
                <th className="px-4 py-2">Tags</th>
                <th className="px-4 py-2">Portefeuille</th>
                <th className="px-4 py-2 text-right">Montant MGA</th>
                <th className="px-4 py-2">Notes</th>
                <th className="px-4 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <Fragment key={g.month}>
                  <tr key={`h-${g.month}`} className="border-t border-border bg-muted/40">
                    <td colSpan={8} className="px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {fmtMonth(`${g.month}-01`)} · {g.rows.length} mvt{g.rows.length > 1 ? "s" : ""}
                    </td>
                    <td className={`num px-4 py-1.5 text-right whitespace-nowrap font-semibold ${g.net >= 0 ? "text-positive" : "text-negative"}`}>
                      {fmtMoney(g.net, "MGA", { sign: true })}
                    </td>
                    <td colSpan={2} className="px-4 py-1.5 text-right font-mono text-[10px] text-muted-foreground">
                      <span className="text-positive">+{fmtMoney(g.inflow, "MGA")}</span> · <span className="text-negative">−{fmtMoney(g.outflow, "MGA")}</span>
                    </td>
                  </tr>
                  {g.rows.map((t: any) => {
                    const isTransfer = t.type === "transfer";
                    const tList = (tagIdsByTx.get(t.id) ?? []).map((id) => tagNameById.get(id) ?? "?");
                    const info = t.budget_node_id ? nodeInfo.get(t.budget_node_id) : null;
                    const mga = baseAmount(t);
                    const walletFilter = f.walletId !== "all" ? f.walletId : null;
                    const signedRow = signedCashImpact(t, walletFilter);
                    const sign = signedRow > 0 ? 1 : signedRow < 0 ? -1 : 0;
                    const cpName = t.counterparty_id ? (cpById.get(t.counterparty_id) as any)?.name : t.counterparty_label;
                    const proj = t.project_id ? (projectById.get(t.project_id) as any)?.name : null;
                    const isSel = selected.has(t.id);
                    return (
                      <tr key={t.id} className={`border-t border-border/60 hover:bg-muted/40 align-top ${isSel ? "bg-primary/5" : ""}`}>
                        <td className="px-3 py-2">
                          <Checkbox checked={isSel} onCheckedChange={() => toggleOne(t.id)} />
                        </td>
                        <td className="num px-4 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(t.occurred_on)}</td>
                        <td className="px-4 py-2"><span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">{t.type}</span></td>
                        <td className="px-4 py-2">
                          {t.description}
                          {proj && <div className="text-[10px] text-muted-foreground">↳ {proj}</div>}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{cpName ?? "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground">{info?.name ?? "—"}</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {tList.map((n) => <span key={n} className="rounded-sm bg-accent/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">{n}</span>)}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{t.type === "transfer" ? `${t.wallets?.name ?? "?"} → ${t.to?.name ?? "?"}` : t.wallets?.name ?? "—"}</td>
                        <td className={`num px-4 py-2 text-right whitespace-nowrap ${sign > 0 ? "text-positive" : sign < 0 ? "text-negative" : "text-muted-foreground"}`}>
                          {isTransfer && !walletFilter ? fmtMoney(0, "MGA") : fmtMoney(signedRow, "MGA", { sign: sign !== 0 })}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground max-w-[240px] truncate" title={t.notes ?? ""}>{t.notes ?? "—"}</td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex justify-end gap-0.5 text-muted-foreground">
                            <button title="Modifier" onClick={() => setEditingTx(t)} className="rounded-sm p-1 hover:bg-muted hover:text-foreground">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button title="Dupliquer" onClick={() => duplicate.mutate([t.id])} className="rounded-sm p-1 hover:bg-muted hover:text-foreground">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button title="Supprimer" onClick={() => confirm("Supprimer ?") && del.mutate(t.id)} className="rounded-sm p-1 hover:bg-muted hover:text-negative">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
              {filtered.length === 0 && <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">Aucune transaction</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {editingTx && (
        <EditTxDialog
          tx={editingTx}
          wallets={wallets.data ?? []}
          nodes={nodesQ.data ?? []}
          tags={tags.data ?? []}
          cps={cps.data ?? []}
          projects={projects.data ?? []}
          currentTagIds={(txTags.data ?? []).filter((r: any) => r.transaction_id === editingTx.id).map((r: any) => r.tag_id)}
          onClose={() => setEditingTx(null)}
          onDone={() => { setEditingTx(null); qc.invalidateQueries(); }}
        />
      )}

      {bulkEditOpen && (
        <BulkEditDialog
          count={selected.size}
          wallets={wallets.data ?? []}
          nodes={nodesQ.data ?? []}
          tags={tags.data ?? []}
          projects={projects.data ?? []}
          onClose={() => setBulkEditOpen(false)}
          onSubmit={(patch, tagIdsAdd) => bulkEdit.mutate({ ids: Array.from(selected), patch, tagIdsAdd })}
          pending={bulkEdit.isPending}
        />
      )}
    </div>
  );
}

async function syncTags(txId: string, userId: string, newIds: string[], oldIds: string[]) {
  const toAdd = newIds.filter((x) => !oldIds.includes(x));
  const toRemove = oldIds.filter((x) => !newIds.includes(x));
  if (toRemove.length) {
    await supabase.from("transaction_tags").delete().eq("transaction_id", txId).in("tag_id", toRemove);
  }
  if (toAdd.length) {
    await supabase.from("transaction_tags").insert(toAdd.map((tag_id) => ({ transaction_id: txId, tag_id, user_id: userId })));
  }
}

type FormState = {
  type: (typeof TX_TYPES)[number];
  occurred_on: string;
  description: string;
  wallet_id: string;
  to_wallet_id: string;
  amount: string;
  currency: string;
  exchange_rate: string;
  budget_node_id: string | null;
  project_id: string;
  counterparty: string;
  notes: string;
  tag_ids: string[];
  debt_id: string;
  receivable_id: string;
};

async function fetchDebtOrReceivable(userId: string, kind: "debts" | "receivables") {
  const { data } = await (supabase as any).from(kind).select("id, " + (kind === "debts" ? "creditor" : "debtor") + ", outstanding, currency").neq("status","cancelled");
  return data ?? [];
}

function AddTxDialog({ wallets, nodes, tags, cps, projects, onDone, initialForm, open: openProp, onOpenChange, hideTrigger, title }: { wallets: any[]; nodes: any[]; tags: any[]; cps: Counterparty[]; projects: any[]; onDone: () => void; initialForm?: FormState; open?: boolean; onOpenChange?: (v: boolean) => void; hideTrigger?: boolean; title?: string }) {
  const [openInner, setOpenInner] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? !!openProp : openInner;
  const setOpen = (v: boolean) => { if (isControlled) onOpenChange?.(v); else setOpenInner(v); };
  const defaultForm: FormState = {
    type: "expense",
    occurred_on: toISODate(new Date()),
    description: "",
    wallet_id: "",
    to_wallet_id: "",
    amount: "",
    currency: "MGA",
    exchange_rate: "1",
    budget_node_id: null,
    project_id: "",
    counterparty: "",
    notes: "",
    tag_ids: [],
    debt_id: "",
    receivable_id: "",
  };
  const [form, setForm] = useState<FormState>(initialForm ?? defaultForm);
  // Re-seed the form whenever the dialog opens with a fresh initialForm (duplicate).
  useEffect(() => {
    if (open) setForm(initialForm ?? defaultForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialForm]);
  function set<K extends keyof FormState>(k: K, v: FormState[K]) { setForm(s => ({ ...s, [k]: v })); }

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const amt = Number(form.amount);
      const xr = Number(form.exchange_rate || 1);
      const cpId = form.counterparty.trim() ? await ensureCounterparty(form.counterparty, cps) : null;
      const isProjType = PROJECT_TYPES.has(form.type);
      const isDebtType = DEBT_TYPES.has(form.type);
      const isRecType = RECEIVABLE_TYPES.has(form.type);
      // Auto-create debt/receivable on _incur / _grant when none selected
      let debtId: string | null = form.debt_id || null;
      let recId: string | null = form.receivable_id || null;
      if (form.type === "dette" && !debtId) {
        const { data: d, error: dErr } = await supabase.from("debts").insert({
          user_id: u.user!.id, creditor: form.counterparty.trim() || form.description || "Créancier",
          description: form.description || null, original_amount: amt, outstanding: 0,
          currency: form.currency, status: "outstanding",
        } as any).select().single();
        if (dErr) throw dErr;
        debtId = d?.id ?? null;
      }
      if (form.type === "creance" && !recId) {
        const { data: r, error: rErr } = await supabase.from("receivables").insert({
          user_id: u.user!.id, debtor: form.counterparty.trim() || form.description || "Débiteur",
          description: form.description || null, original_amount: amt, outstanding: 0,
          currency: form.currency, status: "outstanding",
        } as any).select().single();
        if (rErr) throw rErr;
        recId = r?.id ?? null;
      }
      const { data: ins, error } = await supabase.from("transactions").insert({
        user_id: u.user!.id,
        type: form.type,
        occurred_on: form.occurred_on,
        description: form.description,
        wallet_id: form.wallet_id || null,
        to_wallet_id: form.type === "transfer" ? (form.to_wallet_id || null) : null,
        amount: amt,
        currency: form.currency,
        exchange_rate: xr,
        base_amount: amt * xr,
        budget_node_id: NO_BUDGET_TYPES.has(form.type) ? null : form.budget_node_id,
        project_id: isProjType && form.project_id ? form.project_id : null,
        counterparty_id: cpId,
        counterparty_label: form.counterparty.trim() || null,
        notes: form.notes || null,
        debt_id: isDebtType ? debtId : null,
        receivable_id: isRecType ? recId : null,
      } as any).select().single();
      if (error) throw error;
      if (form.tag_ids.length) await syncTags(ins.id, u.user!.id, form.tag_ids, []);
      const { logAudit } = await import("@/lib/audit");
      await logAudit("transaction", ins?.id ?? null, "create", { type: form.type, amount: amt });
    },
    onSuccess: () => { toast.success("Transaction ajoutée"); setOpen(false); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouvelle transaction</Button></DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title ?? "Nouvelle transaction"}</DialogTitle></DialogHeader>
        <TxForm form={form} set={set} wallets={wallets} nodes={nodes} tags={tags} cps={cps} projects={projects} onSubmit={() => m.mutate()} pending={m.isPending} />
      </DialogContent>
    </Dialog>
  );
}

function EditTxDialog({ tx, wallets, nodes, tags, cps, projects, currentTagIds, onClose, onDone }: {
  tx: any; wallets: any[]; nodes: any[]; tags: any[]; cps: Counterparty[]; projects: any[]; currentTagIds: string[];
  onClose: () => void; onDone: () => void;
}) {
  const cpInitial = tx.counterparty_id ? (cps.find((c) => c.id === tx.counterparty_id)?.name ?? "") : (tx.counterparty_label ?? "");
  const [form, setForm] = useState<FormState>({
    type: tx.type,
    occurred_on: tx.occurred_on,
    description: tx.description ?? "",
    wallet_id: tx.wallet_id ?? "",
    to_wallet_id: tx.to_wallet_id ?? "",
    amount: String(tx.amount ?? ""),
    currency: tx.currency,
    exchange_rate: String(tx.exchange_rate ?? "1"),
    budget_node_id: tx.budget_node_id ?? null,
    project_id: tx.project_id ?? "",
    counterparty: cpInitial,
    notes: tx.notes ?? "",
    tag_ids: currentTagIds,
    debt_id: tx.debt_id ?? "",
    receivable_id: tx.receivable_id ?? "",
  });
  useEffect(() => { setForm((s) => ({ ...s, tag_ids: currentTagIds })); /* eslint-disable-next-line */ }, [currentTagIds.join(",")]);
  function set<K extends keyof FormState>(k: K, v: FormState[K]) { setForm(s => ({ ...s, [k]: v })); }

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const amt = Number(form.amount);
      const xr = Number(form.exchange_rate || 1);
      const cpId = form.counterparty.trim() ? await ensureCounterparty(form.counterparty, cps) : null;
      const isProjType = PROJECT_TYPES.has(form.type);
      const isDebtType = DEBT_TYPES.has(form.type);
      const isRecType = RECEIVABLE_TYPES.has(form.type);
      const { error } = await supabase.from("transactions").update({
        type: form.type,
        occurred_on: form.occurred_on,
        description: form.description,
        wallet_id: form.wallet_id || null,
        to_wallet_id: form.type === "transfer" ? (form.to_wallet_id || null) : null,
        amount: amt,
        currency: form.currency,
        exchange_rate: xr,
        base_amount: amt * xr,
        budget_node_id: NO_BUDGET_TYPES.has(form.type) ? null : form.budget_node_id,
        project_id: isProjType && form.project_id ? form.project_id : null,
        counterparty_id: cpId,
        counterparty_label: form.counterparty.trim() || null,
        notes: form.notes || null,
        debt_id: isDebtType ? (form.debt_id || null) : null,
        receivable_id: isRecType ? (form.receivable_id || null) : null,
      } as any).eq("id", tx.id);
      if (error) throw error;
      await syncTags(tx.id, u.user!.id, form.tag_ids, currentTagIds);
      const { logAudit } = await import("@/lib/audit");
      await logAudit("transaction", tx.id, "update", { type: form.type, amount: amt });
    },
    onSuccess: () => { toast.success("Transaction mise à jour"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Modifier la transaction</DialogTitle></DialogHeader>
        <TxForm form={form} set={set} wallets={wallets} nodes={nodes} tags={tags} cps={cps} projects={projects} onSubmit={() => m.mutate()} pending={m.isPending} submitLabel="Enregistrer" />
      </DialogContent>
    </Dialog>
  );
}

function TxForm({ form, set, wallets, nodes, tags, cps, projects, onSubmit, pending, submitLabel = "Enregistrer" }: {
  form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  wallets: any[]; nodes: any[]; tags: any[]; cps: Counterparty[]; projects: any[];
  onSubmit: () => void; pending: boolean; submitLabel?: string;
}) {
  const mga = Number(form.amount || 0) * Number(form.exchange_rate || 1);
  const isProj = PROJECT_TYPES.has(form.type);
  const isTransfer = form.type === "transfer";
  const isDebt = DEBT_TYPES.has(form.type);
  const isRec = RECEIVABLE_TYPES.has(form.type);
  const noBudget = NO_BUDGET_TYPES.has(form.type);
  const projectLabel = form.type === "enveloppe_emprunt" ? "Emprunt à l'enveloppe (projet)"
    : form.type === "enveloppe_projet" ? "Vers l'enveloppe (projet)"
    : "Projet";

  // Fetch debts/receivables when needed
  const debtsQ = useQuery({
    queryKey: ["debts", "for-tx"], enabled: isDebt,
    queryFn: async () => (await supabase.from("debts").select("id, creditor, description, outstanding, currency").neq("status","cancelled")).data ?? [],
  });
  const recsQ = useQuery({
    queryKey: ["receivables", "for-tx"], enabled: isRec,
    queryFn: async () => (await supabase.from("receivables").select("id, debtor, description, outstanding, currency").neq("status","cancelled")).data ?? [],
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={form.type} onValueChange={(v) => set("type", v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TX_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Date"><DateInput value={form.occurred_on} onChange={(v) => set("occurred_on", v)} /></Field>
      </div>
      <Field label="Description"><Input value={form.description} onChange={(e) => set("description", e.target.value)} required /></Field>
      <Field label="Tiers"><CounterpartyPicker list={cps} value={form.counterparty} onChange={(v) => set("counterparty", v)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Portefeuille">
          <Select value={form.wallet_id} onValueChange={(v) => set("wallet_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{wallets.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        {isTransfer ? (
          <Field label="Vers">
            <Select value={form.to_wallet_id} onValueChange={(v) => set("to_wallet_id", v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{wallets.filter(w => w.id !== form.wallet_id).map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        ) : isProj ? (
          <Field label={projectLabel}>
            <Select value={form.project_id} onValueChange={(v) => set("project_id", v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{projects.filter((p: any) => !p.archived).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        ) : isDebt ? (
          <Field label="Dette (laisser vide = créer)">
            <Select value={form.debt_id} onValueChange={(v) => set("debt_id", v)}>
              <SelectTrigger><SelectValue placeholder="Nouvelle dette" /></SelectTrigger>
              <SelectContent>{(debtsQ.data ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.creditor}{d.description ? ` — ${d.description}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        ) : isRec ? (
          <Field label="Créance (laisser vide = créer)">
            <Select value={form.receivable_id} onValueChange={(v) => set("receivable_id", v)}>
              <SelectTrigger><SelectValue placeholder="Nouvelle créance" /></SelectTrigger>
              <SelectContent>{(recsQ.data ?? []).map((r: any) => <SelectItem key={r.id} value={r.id}>{r.debtor}{r.description ? ` — ${r.description}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        ) : (
          <Field label="Catégorie budgétaire">
            <NodePicker nodes={nodes} value={form.budget_node_id} onChange={(id) => set("budget_node_id", id)} placeholder="Sélectionner une catégorie" />
          </Field>
        )}
      </div>
      {isProj && (
        <Field label="Catégorie budgétaire (optionnel)">
          <NodePicker nodes={nodes} value={form.budget_node_id} onChange={(id) => set("budget_node_id", id)} placeholder="Aucune" />
        </Field>
      )}
      {noBudget && !isTransfer && (
        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Les dettes et créances sont des mouvements de trésorerie, sans lien avec le budget.
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Montant"><Input type="number" step="any" value={form.amount} onChange={(e) => set("amount", e.target.value)} required /></Field>
        <Field label="Devise">
          <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Taux"><Input type="number" step="any" value={form.exchange_rate} onChange={(e) => set("exchange_rate", e.target.value)} /></Field>
      </div>
      <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
        <span className="font-mono uppercase tracking-widest text-muted-foreground">Montant MGA</span>
        <span className="num ml-2 font-semibold">{fmtMoney(mga, "MGA")}</span>
      </div>
      <Field label="Tags"><TagManager tags={tags} value={form.tag_ids} onChange={(ids) => set("tag_ids", ids)} /></Field>
      <Field label="Notes"><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></Field>
      <DialogFooter><Button type="submit" disabled={pending}>{submitLabel}</Button></DialogFooter>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>;
}

function BulkEditDialog({ count, wallets, nodes, tags, projects, onClose, onSubmit, pending }: {
  count: number;
  wallets: any[];
  nodes: any[];
  tags: any[];
  projects: any[];
  onClose: () => void;
  onSubmit: (patch: Record<string, any>, tagIdsAdd: string[]) => void;
  pending: boolean;
}) {
  const [occurred_on, setDate] = useState("");
  const [type, setType] = useState("");
  const [wallet_id, setWallet] = useState("");
  const [budget_node_id, setNode] = useState<string | null>(null);
  const [project_id, setProject] = useState("");
  const [notes, setNotes] = useState("");
  const [addTags, setAddTags] = useState<string[]>([]);

  function submit() {
    const patch: Record<string, any> = {};
    if (occurred_on) patch.occurred_on = occurred_on;
    if (type) patch.type = type;
    if (wallet_id) patch.wallet_id = wallet_id === "__null__" ? null : wallet_id;
    if (budget_node_id !== null) patch.budget_node_id = budget_node_id;
    if (project_id) patch.project_id = project_id === "__null__" ? null : project_id;
    if (notes) patch.notes = notes;
    if (Object.keys(patch).length === 0 && addTags.length === 0) {
      toast.error("Aucun champ à modifier");
      return;
    }
    onSubmit(patch, addTags);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Modifier {count} transaction(s)</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Seuls les champs remplis seront appliqués à toutes les lignes sélectionnées.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><DateInput value={occurred_on} onChange={setDate} /></Field>
          <Field label="Type">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {TX_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Portefeuille">
            <Select value={wallet_id} onValueChange={setWallet}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__null__">Aucun</SelectItem>
                {wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Projet">
            <Select value={project_id} onValueChange={setProject}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__null__">Aucun</SelectItem>
                {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="col-span-2">
            <Field label="Catégorie budgétaire">
              <NodePicker nodes={nodes} value={budget_node_id} onChange={setNode} placeholder="—" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Notes (remplace)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
          </div>
          <div className="col-span-2">
            <Field label="Ajouter des tags">
              <TagManager tags={tags} value={addTags} onChange={setAddTags} allowManage={false} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={pending}>Appliquer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
