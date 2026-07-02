import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { walletsQO, budgetNodesQO, counterpartiesQO, projectsQO } from "@/lib/queries";
import { NodePicker } from "@/components/node-picker";
import { TagManager } from "@/components/tag-manager";
import { CounterpartyPicker, ensureCounterparty, type Counterparty } from "@/components/counterparty-picker";
import { buildTree, flattenTree, pathLabel } from "@/lib/budget-nodes";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { fmtDate, fmtMoney, toISODate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({ meta: [{ title: "Transactions — Personal CFO" }] }),
  component: TxPage,
});

const TX_TYPES = [
  "expense","income","transfer","investment","asset_purchase","asset_sale","adjustment",
  "enveloppe_projet","enveloppe_emprunt",
  "debt_incur","debt_repay","receivable_grant","receivable_collect",
] as const;
const CURRENCIES = ["MGA","EUR","USD","GBP","CHF","CAD","AUD","JPY","CNY"];
const PROJECT_TYPES = new Set(["investment","enveloppe_projet","enveloppe_emprunt"]);
const DEBT_TYPES = new Set(["debt_incur","debt_repay"]);
const RECEIVABLE_TYPES = new Set(["receivable_grant","receivable_collect"]);
const NO_BUDGET_TYPES = new Set(["transfer","debt_incur","debt_repay","receivable_grant","receivable_collect"]);

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
        .limit(1000);
      if (f.type !== "all") q = q.eq("type", f.type as any);
      if (f.fromDate) q = q.gte("occurred_on", f.fromDate);
      if (f.toDate) q = q.lte("occurred_on", f.toDate);
      if (f.walletId !== "all") q = q.or(`wallet_id.eq.${f.walletId},to_wallet_id.eq.${f.walletId}`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const txIds = (txs.data ?? []).map((t: any) => t.id);
  const txTags = useQuery({
    queryKey: ["tx_tags", txIds.join(",")],
    enabled: txIds.length > 0,
    queryFn: async () => (await supabase.from("transaction_tags").select("*").in("transaction_id", txIds)).data ?? [],
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

  const [editingTx, setEditingTx] = useState<any | null>(null);

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
          <Field label="Date du"><Input type="date" value={f.fromDate} onChange={(e) => set("fromDate", e.target.value)} /></Field>
          <Field label="Date au"><Input type="date" value={f.toDate} onChange={(e) => set("toDate", e.target.value)} /></Field>
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
          <Field label="Feuille budgétaire">
            <NodePicker nodes={nodesQ.data ?? []} value={f.nodeId} onChange={(id) => set("nodeId", id)} leafOnly placeholder="Toutes (feuilles)" />
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

      <Panel title={`${filtered.length} mouvements`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
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
              {filtered.map((t: any) => {
                const sign = t.type === "income" || t.type === "asset_sale" || t.type === "enveloppe_emprunt" ? 1 : t.type === "transfer" ? 0 : -1;
                const tList = (tagIdsByTx.get(t.id) ?? []).map((id) => tagNameById.get(id) ?? "?");
                const info = t.budget_node_id ? nodeInfo.get(t.budget_node_id) : null;
                const mga = Number(t.base_amount ?? Number(t.amount) * Number(t.exchange_rate ?? 1));
                const cpName = t.counterparty_id ? (cpById.get(t.counterparty_id) as any)?.name : t.counterparty_label;
                const proj = t.project_id ? (projectById.get(t.project_id) as any)?.name : null;
                return (
                  <tr key={t.id} className="border-t border-border/60 hover:bg-muted/40 align-top">
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
                    <td className={`num px-4 py-2 text-right whitespace-nowrap ${sign > 0 ? "text-positive" : sign < 0 ? "text-negative" : ""}`}>
                      {fmtMoney(mga * (sign || 1), "MGA", { sign: sign !== 0 })}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground max-w-[240px] truncate" title={t.notes ?? ""}>{t.notes ?? "—"}</td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex justify-end gap-0.5 text-muted-foreground">
                        <button title="Modifier" onClick={() => setEditingTx(t)} className="rounded-sm p-1 hover:bg-muted hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button title="Supprimer" onClick={() => confirm("Supprimer ?") && del.mutate(t.id)} className="rounded-sm p-1 hover:bg-muted hover:text-negative">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">Aucune transaction</td></tr>}
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
};

function AddTxDialog({ wallets, nodes, tags, cps, projects, onDone }: { wallets: any[]; nodes: any[]; tags: any[]; cps: Counterparty[]; projects: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
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
  });
  function set<K extends keyof FormState>(k: K, v: FormState[K]) { setForm(s => ({ ...s, [k]: v })); }

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const amt = Number(form.amount);
      const xr = Number(form.exchange_rate || 1);
      const cpId = form.counterparty.trim() ? await ensureCounterparty(form.counterparty, cps) : null;
      const isProjType = PROJECT_TYPES.has(form.type);
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
        budget_node_id: form.budget_node_id,
        project_id: isProjType && form.project_id ? form.project_id : null,
        counterparty_id: cpId,
        counterparty_label: form.counterparty.trim() || null,
        notes: form.notes || null,
      }).select().single();
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
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouvelle transaction</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nouvelle transaction</DialogTitle></DialogHeader>
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
        budget_node_id: form.budget_node_id,
        project_id: isProjType && form.project_id ? form.project_id : null,
        counterparty_id: cpId,
        counterparty_label: form.counterparty.trim() || null,
        notes: form.notes || null,
      }).eq("id", tx.id);
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
  const projectLabel = form.type === "enveloppe_emprunt" ? "Emprunt à l'enveloppe (projet)"
    : form.type === "enveloppe_projet" ? "Vers l'enveloppe (projet)"
    : "Projet";
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={form.type} onValueChange={(v) => set("type", v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TX_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Date"><Input type="date" value={form.occurred_on} onChange={(e) => set("occurred_on", e.target.value)} /></Field>
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
        ) : (
          <Field label="Feuille budgétaire">
            <NodePicker nodes={nodes} value={form.budget_node_id} onChange={(id) => set("budget_node_id", id)} leafOnly placeholder="Sélectionner une feuille" />
          </Field>
        )}
      </div>
      {isProj && (
        <Field label="Feuille budgétaire (optionnel)">
          <NodePicker nodes={nodes} value={form.budget_node_id} onChange={(id) => set("budget_node_id", id)} leafOnly placeholder="Aucune" />
        </Field>
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
