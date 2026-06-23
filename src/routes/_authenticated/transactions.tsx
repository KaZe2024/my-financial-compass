import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { walletsQO, budgetNodesQO } from "@/lib/queries";
import { NodePicker } from "@/components/node-picker";
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

const TX_TYPES = ["expense","income","transfer","investment","asset_purchase","asset_sale","adjustment"] as const;
const CURRENCIES = ["MGA","EUR","USD","GBP","CHF","CAD","AUD","JPY","CNY"];

type Filters = {
  type: string;
  from: string;
  to: string;
  keyword: string;
  nodeId: string | null;
  walletId: string;
  amountMin: string;
  amountMax: string;
};

const EMPTY_FILTERS: Filters = {
  type: "all", from: "", to: "", keyword: "", nodeId: null, walletId: "all", amountMin: "", amountMax: "",
};

function TxPage() {
  const qc = useQueryClient();
  const wallets = useQuery(walletsQO);
  const nodesQ = useQuery(budgetNodesQO);
  const nodeMap = useMemo(() => {
    const tree = buildTree((nodesQ.data ?? []));
    const flat = flattenTree(tree);
    const m = new Map<string, string>();
    for (const n of flat) m.set(n.id, pathLabel(n));
    return m;
  }, [nodesQ.data]);

  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((s) => ({ ...s, [k]: v }));

  // Tags catalog
  const tags = useQuery({
    queryKey: ["analytical_tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("analytical_tags").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Server-side filterable subset
  const txs = useQuery({
    queryKey: ["transactions", f.type, f.from, f.to, f.walletId],
    queryFn: async () => {
      let q = supabase.from("transactions")
        .select("*, wallets:wallet_id(name), to:to_wallet_id(name)")
        .order("occurred_on", { ascending: false }).order("created_at", { ascending: false })
        .limit(500);
      if (f.type !== "all") q = q.eq("type", f.type as any);
      if (f.from) q = q.gte("occurred_on", f.from);
      if (f.to) q = q.lte("occurred_on", f.to);
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
    queryFn: async () => {
      const { data, error } = await supabase.from("transaction_tags").select("*").in("transaction_id", txIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const tagsByTx = useMemo(() => {
    const m = new Map<string, string[]>();
    const tagName = new Map((tags.data ?? []).map((t: any) => [t.id, t.name]));
    for (const r of txTags.data ?? []) {
      const arr = m.get(r.transaction_id) ?? [];
      arr.push(tagName.get(r.tag_id) ?? "?");
      m.set(r.transaction_id, arr);
    }
    return m;
  }, [txTags.data, tags.data]);

  // Client-side filtering
  const filtered = useMemo(() => {
    const kw = f.keyword.trim().toLowerCase();
    const minV = f.amountMin ? Number(f.amountMin) : null;
    const maxV = f.amountMax ? Number(f.amountMax) : null;
    return (txs.data ?? []).filter((t: any) => {
      if (f.nodeId && t.budget_node_id !== f.nodeId) return false;
      if (kw && !(t.description ?? "").toLowerCase().includes(kw) && !(t.notes ?? "").toLowerCase().includes(kw)) return false;
      const amt = Number(t.amount);
      if (minV != null && amt < minV) return false;
      if (maxV != null && amt > maxV) return false;
      return true;
    });
  }, [txs.data, f.keyword, f.nodeId, f.amountMin, f.amountMax]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
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
        <AddTxDialog wallets={wallets.data ?? []} nodes={nodesQ.data ?? []} tags={tags.data ?? []} onDone={() => qc.invalidateQueries()} />
      </header>

      <Panel
        title="Filtres"
        action={
          <Button variant="ghost" size="sm" onClick={() => setF(EMPTY_FILTERS)}>
            <X className="mr-1 h-3 w-3" /> Réinitialiser
          </Button>
        }
      >
        <div className="space-y-3">
          {/* Row 1 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Type">
              <Select value={f.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {TX_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Du"><Input type="date" value={f.from} onChange={(e) => set("from", e.target.value)} /></Field>
            <Field label="Au"><Input type="date" value={f.to} onChange={(e) => set("to", e.target.value)} /></Field>
            <Field label="Mot-clé description"><Input value={f.keyword} onChange={(e) => set("keyword", e.target.value)} placeholder="Rechercher…" /></Field>
          </div>
          {/* Row 2 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Catégorie">
              <NodePicker nodes={nodesQ.data ?? []} value={f.nodeId} onChange={(id) => set("nodeId", id)} onlyDepth={1} hidePath placeholder="Toutes" />
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
            <Field label="Montant min"><Input type="number" step="any" value={f.amountMin} onChange={(e) => set("amountMin", e.target.value)} /></Field>
            <Field label="Montant max"><Input type="number" step="any" value={f.amountMax} onChange={(e) => set("amountMax", e.target.value)} /></Field>
          </div>
        </div>
      </Panel>

      <Panel title={`${filtered.length} mouvements`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th><th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Description</th><th className="px-4 py-2">Catégorie</th>
                <th className="px-4 py-2">Tags</th>
                <th className="px-4 py-2">Portefeuille</th><th className="px-4 py-2 text-right">Montant</th>
                <th className="px-4 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t: any) => {
                const sign = t.type === "income" || t.type === "asset_sale" ? 1 : t.type === "transfer" ? 0 : -1;
                const tList = tagsByTx.get(t.id) ?? [];
                return (
                  <tr key={t.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="num px-4 py-2 text-muted-foreground">{fmtDate(t.occurred_on)}</td>
                    <td className="px-4 py-2"><span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">{t.type}</span></td>
                    <td className="px-4 py-2">{t.description}</td>
                    <td className="px-4 py-2 text-muted-foreground">{t.budget_node_id ? (nodeMap.get(t.budget_node_id) ?? "—") : "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {tList.map((n) => <span key={n} className="rounded-sm bg-accent/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">{n}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{t.type === "transfer" ? `${t.wallets?.name ?? "?"} → ${t.to?.name ?? "?"}` : t.wallets?.name ?? "—"}</td>
                    <td className={`num px-4 py-2 text-right ${sign > 0 ? "text-positive" : sign < 0 ? "text-negative" : ""}`}>
                      {fmtMoney(Number(t.amount) * (sign || 1), t.currency, { sign: sign !== 0 })}
                    </td>
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
              {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">Aucune transaction</td></tr>}
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
          currentTagIds={(txTags.data ?? []).filter((r: any) => r.transaction_id === editingTx.id).map((r: any) => r.tag_id)}
          onClose={() => setEditingTx(null)}
          onDone={() => { setEditingTx(null); qc.invalidateQueries(); }}
        />
      )}
    </div>
  );
}

function TagSelector({ tags, value, onChange }: { tags: any[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [newTag, setNewTag] = useState("");
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("analytical_tags").insert({ user_id: u.user!.id, name: newTag.trim() }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => { onChange([...value, d.id]); setNewTag(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tags.map((t: any) => {
          const on = value.includes(t.id);
          return (
            <button type="button" key={t.id} onClick={() => toggle(t.id)}
              className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${on ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {t.name}
            </button>
          );
        })}
        {tags.length === 0 && <span className="text-xs text-muted-foreground">Aucun tag</span>}
      </div>
      <div className="flex gap-1">
        <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Nouveau tag…" className="h-7 text-xs" />
        <Button type="button" size="sm" variant="outline" disabled={!newTag.trim() || create.isPending} onClick={() => create.mutate()}>+</Button>
      </div>
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
  notes: string;
  tag_ids: string[];
};

function AddTxDialog({ wallets, nodes, tags, onDone }: { wallets: any[]; nodes: any[]; tags: any[]; onDone: () => void }) {
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
    notes: "",
    tag_ids: [],
  });
  function set<K extends keyof FormState>(k: K, v: FormState[K]) { setForm(s => ({ ...s, [k]: v })); }

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const amt = Number(form.amount);
      const xr = Number(form.exchange_rate || 1);
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
        notes: form.notes || null,
      }).select().single();
      if (error) throw error;
      if (form.tag_ids.length) await syncTags(ins.id, u.user!.id, form.tag_ids, []);
    },
    onSuccess: () => { toast.success("Transaction ajoutée"); setOpen(false); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouvelle transaction</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nouvelle transaction</DialogTitle></DialogHeader>
        <TxForm form={form} set={set} wallets={wallets} nodes={nodes} tags={tags} onSubmit={() => m.mutate()} pending={m.isPending} />
      </DialogContent>
    </Dialog>
  );
}

function EditTxDialog({ tx, wallets, nodes, tags, currentTagIds, onClose, onDone }: {
  tx: any; wallets: any[]; nodes: any[]; tags: any[]; currentTagIds: string[];
  onClose: () => void; onDone: () => void;
}) {
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
    notes: tx.notes ?? "",
    tag_ids: currentTagIds,
  });
  // refresh tag_ids if loaded async
  useEffect(() => { setForm((s) => ({ ...s, tag_ids: currentTagIds })); /* eslint-disable-next-line */ }, [currentTagIds.join(",")]);
  function set<K extends keyof FormState>(k: K, v: FormState[K]) { setForm(s => ({ ...s, [k]: v })); }

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const amt = Number(form.amount);
      const xr = Number(form.exchange_rate || 1);
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
        notes: form.notes || null,
      }).eq("id", tx.id);
      if (error) throw error;
      await syncTags(tx.id, u.user!.id, form.tag_ids, currentTagIds);
    },
    onSuccess: () => { toast.success("Transaction mise à jour"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Modifier la transaction</DialogTitle></DialogHeader>
        <TxForm form={form} set={set} wallets={wallets} nodes={nodes} tags={tags} onSubmit={() => m.mutate()} pending={m.isPending} submitLabel="Enregistrer" />
      </DialogContent>
    </Dialog>
  );
}

function TxForm({ form, set, wallets, nodes, tags, onSubmit, pending, submitLabel = "Enregistrer" }: {
  form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  wallets: any[]; nodes: any[]; tags: any[]; onSubmit: () => void; pending: boolean; submitLabel?: string;
}) {
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Portefeuille">
          <Select value={form.wallet_id} onValueChange={(v) => set("wallet_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{wallets.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        {form.type === "transfer" ? (
          <Field label="Vers">
            <Select value={form.to_wallet_id} onValueChange={(v) => set("to_wallet_id", v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{wallets.filter(w => w.id !== form.wallet_id).map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        ) : (
          <Field label="Catégorie">
            <NodePicker nodes={nodes} value={form.budget_node_id} onChange={(id) => set("budget_node_id", id)} onlyDepth={1} hidePath placeholder="Aucune" />
          </Field>
        )}
      </div>
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
      <Field label="Tags"><TagSelector tags={tags} value={form.tag_ids} onChange={(ids) => set("tag_ids", ids)} /></Field>
      <Field label="Notes"><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></Field>
      <DialogFooter><Button type="submit" disabled={pending}>{submitLabel}</Button></DialogFooter>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>;
}
