import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { walletsQO, profileQO, budgetNodesQO } from "@/lib/queries";
import { NodePicker } from "@/components/node-picker";
import { TagManager } from "@/components/tag-manager";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ShoppingCart, Settings, Save, Pencil, Check } from "lucide-react";
import { fmtDate, fmtMoney, toISODate } from "@/lib/format";
import { toast } from "sonner";
import { buildTree, flattenTree, pathLabel } from "@/lib/budget-nodes";
import { fetchAllRows } from "@/lib/fetch-all";

export const Route = createFileRoute("/_authenticated/shopping")({
  head: () => ({ meta: [{ title: "Listes d'achat — Personal CFO" }] }),
  component: ShoppingPage,
});

type Item = { id?: string; product_name: string; unit: string; quantity: string; unit_price: string; checked: boolean };

function ShoppingPage() {
  const qc = useQueryClient();
  const wallets = useQuery(walletsQO);
  const profile = useQuery(profileQO);
  const nodes = useQuery(budgetNodesQO);
  const tags = useQuery({
    queryKey: ["analytical_tags"],
    queryFn: async () => (await supabase.from("analytical_tags").select("*").order("name")).data ?? [],
  });

  const nodePath = useMemo(() => {
    const flat = flattenTree(buildTree(nodes.data ?? []));
    return new Map(flat.map((n) => [n.id, pathLabel(n)]));
  }, [nodes.data]);

  const lists = useQuery({
    queryKey: ["shopping_lists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("*, shopping_list_items(*)")
        .order("occurred_on", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Trésorerie · Mode courses</p>
          <h1 className="mt-1 text-2xl font-semibold">Listes d'achat</h1>
          <p className="mt-1 text-xs text-muted-foreground">Devise verrouillée en <strong>MGA</strong>. Cochez les produits achetés puis envoyez la liste vers vos transactions.</p>
        </div>
        <div className="flex gap-2">
          <DefaultsDialog profile={profile.data} wallets={wallets.data ?? []} nodes={nodes.data ?? []} tags={tags.data ?? []} onDone={() => qc.invalidateQueries({ queryKey: ["profile"] })} />
          <AddListDialog
            profile={profile.data}
            wallets={wallets.data ?? []}
            nodes={nodes.data ?? []}
            tags={tags.data ?? []}
            onDone={() => qc.invalidateQueries({ queryKey: ["shopping_lists"] })}
          />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {(lists.data ?? []).map((l: any) => (
          <ListCard
            key={l.id}
            list={l}
            wallets={wallets.data ?? []}
            nodes={nodes.data ?? []}
            tags={tags.data ?? []}
            nodePath={nodePath}
            onChange={() => qc.invalidateQueries()}
          />
        ))}
        {(lists.data ?? []).length === 0 && (
          <Panel title="Vide" className="lg:col-span-2">
            <p className="py-8 text-center text-sm text-muted-foreground">Pas encore de liste d'achat. Cliquez sur "Nouvelle liste".</p>
          </Panel>
        )}
      </div>
    </div>
  );
}

function ListCard({ list, wallets, nodes, tags, nodePath, onChange }: {
  list: any; wallets: any[]; nodes: any[]; tags: any[]; nodePath: Map<string, string>; onChange: () => void;
}) {
  const qc = useQueryClient();
  const isClosed = !!list.transaction_id;
  const [items, setItems] = useState<Item[]>(
    (list.shopping_list_items ?? []).map((it: any) => ({
      id: it.id, product_name: it.product_name, unit: it.unit ?? "",
      quantity: String(it.quantity), unit_price: String(it.unit_price),
      checked: !!it.checked,
    }))
  );
  useEffect(() => {
    setItems((list.shopping_list_items ?? []).map((it: any) => ({
      id: it.id, product_name: it.product_name, unit: it.unit ?? "",
      quantity: String(it.quantity), unit_price: String(it.unit_price),
      checked: !!it.checked,
    })));
  }, [list.id]); // eslint-disable-line

  const checkedTotal = items.filter((i) => i.checked).reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
  const fullTotal = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);

  const toggleChecked = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      const { error } = await supabase.from("shopping_list_items").update({ checked }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChange,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeList = useMutation({
    mutationFn: async () => {
      await supabase.from("shopping_list_items").delete().eq("list_id", list.id);
      const { error } = await supabase.from("shopping_lists").delete().eq("id", list.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Liste supprimée"); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const commit = useMutation({
    mutationFn: async () => {
      const checked = items.filter((i) => i.checked && i.product_name.trim());
      if (!checked.length) throw new Error("Aucun produit coché");
      const amount = checked.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
      const notes = checked.map((i) => {
        const q = Number(i.quantity || 0);
        return q > 1 ? `${i.product_name} ×${q}` : i.product_name;
      }).join(" + ");
      const { data: u } = await supabase.auth.getUser();
      const desc = list.title || list.store || "Courses";
      const { data: tx, error: terr } = await supabase.from("transactions").insert({
        user_id: u.user!.id,
        type: "expense",
        occurred_on: list.occurred_on,
        description: desc,
        wallet_id: list.wallet_id ?? null,
        amount,
        currency: "MGA",
        exchange_rate: 1,
        base_amount: amount,
        budget_node_id: list.budget_node_id ?? null,
        notes,
      }).select("id").single();
      if (terr) throw terr;
      // Tags
      const tagIds: string[] = list.tag_ids ?? [];
      if (tagIds.length) {
        await supabase.from("transaction_tags").insert(tagIds.map((tag_id) => ({ transaction_id: tx.id, tag_id, user_id: u.user!.id })));
      }
      await supabase.from("shopping_lists").update({ transaction_id: tx.id, total: amount }).eq("id", list.id);
    },
    onSuccess: () => { toast.success("Envoyé vers transactions"); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editingMeta, setEditingMeta] = useState(false);

  return (
    <Panel
      title={
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <span className="font-medium">{list.title || list.store || "Liste"}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{fmtDate(list.occurred_on)}</span>
          {isClosed && <span className="rounded-sm bg-positive/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-positive">envoyé</span>}
        </div>
      }
      action={
        <div className="flex items-center gap-2">
          <span className="num text-sm font-semibold">{fmtMoney(checkedTotal, "MGA")}</span>
          <span className="font-mono text-[10px] text-muted-foreground">/ {fmtMoney(fullTotal, "MGA")}</span>
        </div>
      }
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono text-[10px] uppercase tracking-wider">Catégorie · {list.budget_node_id ? (nodePath.get(list.budget_node_id) ?? "—") : "—"}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider">· Portefeuille · {wallets.find((w) => w.id === list.wallet_id)?.name ?? "—"}</span>
          {!isClosed && (
            <button onClick={() => setEditingMeta(true)} className="ml-auto rounded-sm p-1 hover:bg-muted hover:text-foreground" title="Modifier"><Pencil className="h-3 w-3" /></button>
          )}
        </div>

        <table className="w-full text-sm">
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id ?? idx} className="border-t border-border/60 first:border-0">
                <td className="w-6 py-1.5">
                  <input
                    type="checkbox"
                    checked={it.checked}
                    disabled={isClosed || !it.id}
                    onChange={(e) => {
                      setItems((s) => s.map((x, i) => i === idx ? { ...x, checked: e.target.checked } : x));
                      if (it.id) toggleChecked.mutate({ id: it.id, checked: e.target.checked });
                    }}
                  />
                </td>
                <td className={`py-1.5 ${it.checked ? "line-through text-muted-foreground" : ""}`}>{it.product_name}</td>
                <td className="num py-1.5 text-right text-muted-foreground">{Number(it.quantity)} {it.unit}</td>
                <td className="num py-1.5 text-right">{fmtMoney(Number(it.quantity || 0) * Number(it.unit_price || 0), "MGA")}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td className="py-3 text-center text-xs text-muted-foreground" colSpan={4}>Liste vide</td></tr>}
          </tbody>
        </table>

        {!isClosed && (
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" className="text-negative" onClick={() => confirm("Supprimer cette liste ?") && removeList.mutate()}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Supprimer
            </Button>
            <Button size="sm" onClick={() => commit.mutate()} disabled={commit.isPending || items.filter((i) => i.checked).length === 0}>
              <Save className="mr-1 h-3.5 w-3.5" /> Enregistrer vers transactions
            </Button>
          </div>
        )}
      </div>

      {editingMeta && (
        <EditMetaDialog
          list={list} wallets={wallets} nodes={nodes} tags={tags}
          onClose={() => setEditingMeta(false)}
          onDone={() => { setEditingMeta(false); qc.invalidateQueries({ queryKey: ["shopping_lists"] }); }}
        />
      )}
    </Panel>
  );
}

function EditMetaDialog({ list, wallets, nodes, tags, onClose, onDone }: {
  list: any; wallets: any[]; nodes: any[]; tags: any[]; onClose: () => void; onDone: () => void;
}) {
  const [title, setTitle] = useState<string>(list.title ?? "");
  const [walletId, setWalletId] = useState<string>(list.wallet_id ?? "");
  const [nodeId, setNodeId] = useState<string | null>(list.budget_node_id ?? null);
  const [tagIds, setTagIds] = useState<string[]>(list.tag_ids ?? []);

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("shopping_lists").update({
        title: title || null,
        wallet_id: walletId || null,
        budget_node_id: nodeId,
        tag_ids: tagIds,
      }).eq("id", list.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Liste mise à jour"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Modifier la liste</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <Field label="Titre"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Courses Shoprite" /></Field>
          <Field label="Portefeuille">
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{wallets.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Catégorie">
            <NodePicker nodes={nodes} value={nodeId} onChange={setNodeId} onlyDepth={1} hidePath placeholder="Aucune" />
          </Field>
          <Field label="Tags"><TagManager tags={tags} value={tagIds} onChange={setTagIds} /></Field>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DefaultsDialog({ profile, wallets, nodes, tags, onDone }: {
  profile: any; wallets: any[]; nodes: any[]; tags: any[]; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [walletId, setWalletId] = useState<string>(profile?.shopping_default_wallet_id ?? "");
  const [nodeId, setNodeId] = useState<string | null>(profile?.shopping_default_node_id ?? null);
  const [tagIds, setTagIds] = useState<string[]>(profile?.shopping_default_tag_ids ?? []);
  useEffect(() => {
    if (open) {
      setWalletId(profile?.shopping_default_wallet_id ?? "");
      setNodeId(profile?.shopping_default_node_id ?? null);
      setTagIds(profile?.shopping_default_tag_ids ?? []);
    }
  }, [open, profile]);

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("profiles").update({
        shopping_default_wallet_id: walletId || null,
        shopping_default_node_id: nodeId,
        shopping_default_tag_ids: tagIds,
      }).eq("id", u.user!.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Défauts enregistrés"); setOpen(false); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Settings className="mr-2 h-4 w-4" /> Défauts</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Défauts des listes d'achat</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <p className="text-xs text-muted-foreground">Ces valeurs sont pré-remplies à chaque nouvelle liste. La devise est toujours <strong>MGA</strong>.</p>
          <Field label="Portefeuille par défaut">
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{wallets.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Catégorie par défaut">
            <NodePicker nodes={nodes} value={nodeId} onChange={setNodeId} onlyDepth={1} hidePath placeholder="Aucune" />
          </Field>
          <Field label="Tags par défaut"><TagManager tags={tags} value={tagIds} onChange={setTagIds} /></Field>
          <DialogFooter><Button type="submit" disabled={m.isPending}><Check className="mr-1 h-4 w-4" /> Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddListDialog({ profile, wallets, nodes, tags, onDone }: {
  profile: any; wallets: any[]; nodes: any[]; tags: any[]; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [store, setStore] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [walletId, setWalletId] = useState<string>(profile?.shopping_default_wallet_id ?? "");
  const [nodeId, setNodeId] = useState<string | null>(profile?.shopping_default_node_id ?? null);
  const [tagIds, setTagIds] = useState<string[]>(profile?.shopping_default_tag_ids ?? []);
  const [items, setItems] = useState<Item[]>([{ product_name: "", unit: "", quantity: "1", unit_price: "0", checked: false }]);

  useEffect(() => {
    if (open) {
      setWalletId(profile?.shopping_default_wallet_id ?? "");
      setNodeId(profile?.shopping_default_node_id ?? null);
      setTagIds(profile?.shopping_default_tag_ids ?? []);
    }
  }, [open, profile]);

  const total = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  function updateItem(i: number, patch: Partial<Item>) {
    setItems((s) => s.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }

  const m = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Titre requis");
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;

      const productIds: Record<string, string> = {};
      for (const it of items) {
        if (!it.product_name.trim()) continue;
        const { data: existing } = await supabase.from("products").select("id").eq("name", it.product_name).maybeSingle();
        if (existing?.id) { productIds[it.product_name] = existing.id; continue; }
        const { data: created, error } = await supabase.from("products").insert({ user_id: uid, name: it.product_name, unit: it.unit || null }).select("id").single();
        if (error) throw error;
        productIds[it.product_name] = created.id;
      }

      const { data: list, error: lerr } = await supabase.from("shopping_lists").insert({
        user_id: uid,
        title,
        store: store || null,
        occurred_on: date,
        total,
        currency: "MGA",
        wallet_id: walletId || null,
        budget_node_id: nodeId,
        tag_ids: tagIds,
      }).select("id").single();
      if (lerr) throw lerr;

      const itemsRows = items.filter((it) => it.product_name.trim()).map((it) => ({
        user_id: uid, list_id: list.id, product_id: productIds[it.product_name],
        product_name: it.product_name, unit: it.unit || null,
        quantity: Number(it.quantity || 0),
        unit_price: Number(it.unit_price || 0),
        total: Number(it.quantity || 0) * Number(it.unit_price || 0),
        checked: false,
      }));
      if (itemsRows.length) {
        const { error: ierr } = await supabase.from("shopping_list_items").insert(itemsRows);
        if (ierr) throw ierr;
      }
    },
    onSuccess: () => {
      toast.success("Liste créée");
      setOpen(false);
      setTitle(""); setStore("");
      setItems([{ product_name: "", unit: "", quantity: "1", unit_price: "0", checked: false }]);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouvelle liste</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-primary" /> Nouvelle liste d'achat</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="Titre *"><Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Courses semaine 24" /></Field>
            <Field label="Magasin"><Input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Shoprite..." /></Field>
            <Field label="Date"><DatePicker value={date} onChange={(__v) => setDate(__v)} /></Field>
          </div>

          <details className="rounded-md border border-border bg-muted/20 p-3" open>
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Surcharger les défauts (devise verrouillée MGA)</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Portefeuille">
                <Select value={walletId} onValueChange={setWalletId}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{wallets.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Catégorie">
                <NodePicker nodes={nodes} value={nodeId} onChange={setNodeId} onlyDepth={1} hidePath placeholder="Aucune" />
              </Field>
              <Field label="Tags"><TagManager tags={tags} value={tagIds} onChange={setTagIds} /></Field>
            </div>
          </details>

          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
            <div className="grid grid-cols-12 gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              <span className="col-span-5">Produit</span>
              <span className="col-span-1">u.</span>
              <span className="col-span-2 text-right">Qté</span>
              <span className="col-span-3 text-right">PU (MGA)</span>
            </div>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <Input className="col-span-5" placeholder="Produit" value={it.product_name} onChange={(e) => updateItem(i, { product_name: e.target.value })} />
                <Input className="col-span-1" placeholder="kg" value={it.unit} onChange={(e) => updateItem(i, { unit: e.target.value })} />
                <Input className="col-span-2 text-right" type="number" step="any" value={it.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} />
                <Input className="col-span-3 text-right" type="number" step="any" value={it.unit_price} onChange={(e) => updateItem(i, { unit_price: e.target.value })} />
                <button type="button" className="col-span-1 text-muted-foreground hover:text-destructive" onClick={() => setItems((s) => s.filter((_, idx) => idx !== i))}>
                  <Trash2 className="mx-auto h-4 w-4" />
                </button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setItems((s) => [...s, { product_name: "", unit: "", quantity: "1", unit_price: "0", checked: false }])}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Ligne
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Total prévisionnel</span>
            <span className="num text-lg font-semibold">{fmtMoney(total, "MGA")}</span>
          </div>

          <DialogFooter><Button type="submit" disabled={m.isPending}>Créer la liste</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>;
}
