import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { walletsQO, profileQO } from "@/lib/queries";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ShoppingCart } from "lucide-react";
import { fmtDate, fmtMoney, toISODate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/shopping")({
  head: () => ({ meta: [{ title: "Listes d'achat — Personal CFO" }] }),
  component: ShoppingPage,
});

type Item = { product_name: string; unit: string; quantity: string; unit_price: string };

function ShoppingPage() {
  const qc = useQueryClient();
  const wallets = useQuery(walletsQO);
  const profile = useQuery(profileQO);

  const lists = useQuery({
    queryKey: ["shopping_lists"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shopping_lists").select("*, shopping_list_items(*)").order("occurred_on", { ascending: false }).limit(50);
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
        </div>
        <AddListDialog wallets={wallets.data ?? []} defaultCur={profile.data?.base_currency ?? "MGA"} onDone={() => qc.invalidateQueries()} />
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {(lists.data ?? []).map((l: any) => (
          <Panel key={l.id} title={`${l.store ?? "Magasin"} · ${fmtDate(l.occurred_on)}`}
            action={<span className="num text-sm font-semibold">{fmtMoney(Number(l.total), l.currency)}</span>}>
            <table className="w-full text-sm">
              <tbody>
                {(l.shopping_list_items ?? []).map((it: any) => (
                  <tr key={it.id} className="border-t border-border/60 first:border-0">
                    <td className="py-1.5">{it.product_name}</td>
                    <td className="num py-1.5 text-right text-muted-foreground">{Number(it.quantity)} {it.unit ?? ""}</td>
                    <td className="num py-1.5 text-right">{fmtMoney(Number(it.total), l.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
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

function AddListDialog({ wallets, defaultCur, onDone }: { wallets: any[]; defaultCur: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [store, setStore] = useState("");
  const [walletId, setWalletId] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [currency, setCurrency] = useState(defaultCur);
  const [items, setItems] = useState<Item[]>([{ product_name: "", unit: "", quantity: "1", unit_price: "0" }]);

  const total = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);

  function updateItem(i: number, patch: Partial<Item>) {
    setItems(s => s.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;

      // 1. find-or-create products
      const productIds: Record<string, string> = {};
      for (const it of items) {
        if (!it.product_name.trim()) continue;
        const { data: existing } = await supabase.from("products").select("id").eq("name", it.product_name).maybeSingle();
        if (existing?.id) { productIds[it.product_name] = existing.id; continue; }
        const { data: created, error } = await supabase.from("products").insert({ user_id: uid, name: it.product_name, unit: it.unit || null }).select("id").single();
        if (error) throw error;
        productIds[it.product_name] = created.id;
      }

      // 2. create shopping list
      const { data: list, error: lerr } = await supabase.from("shopping_lists").insert({
        user_id: uid, store: store || null, occurred_on: date, total, currency,
      }).select("id").single();
      if (lerr) throw lerr;

      // 3. items
      const itemsRows = items.filter(it => it.product_name.trim()).map(it => ({
        user_id: uid, list_id: list.id, product_id: productIds[it.product_name],
        product_name: it.product_name, unit: it.unit || null,
        quantity: Number(it.quantity || 0),
        unit_price: Number(it.unit_price || 0),
        total: Number(it.quantity || 0) * Number(it.unit_price || 0),
      }));
      if (itemsRows.length) {
        const { error: ierr } = await supabase.from("shopping_list_items").insert(itemsRows);
        if (ierr) throw ierr;
      }

      // 4. matching expense transaction
      if (walletId && total > 0) {
        const { data: tx, error: terr } = await supabase.from("transactions").insert({
          user_id: uid, type: "expense", occurred_on: date,
          description: `Courses${store ? " · " + store : ""}`,
          wallet_id: walletId, amount: total, currency, exchange_rate: 1, base_amount: total,
        }).select("id").single();
        if (terr) throw terr;
        await supabase.from("shopping_lists").update({ transaction_id: tx.id }).eq("id", list.id);
      }
    },
    onSuccess: () => { toast.success("Liste enregistrée"); setOpen(false); setItems([{ product_name: "", unit: "", quantity: "1", unit_price: "0" }]); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouvelle liste</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-primary" /> Nouvelle liste d'achat</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Magasin"><Input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Shoprite..." /></Field>
            <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Devise">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["MGA","EUR","USD"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Payé depuis">
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{wallets.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-5" placeholder="Produit" value={it.product_name} onChange={(e) => updateItem(i, { product_name: e.target.value })} />
                <Input className="col-span-1" placeholder="u." value={it.unit} onChange={(e) => updateItem(i, { unit: e.target.value })} />
                <Input className="col-span-2" type="number" step="any" placeholder="Qté" value={it.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} />
                <Input className="col-span-3" type="number" step="any" placeholder="Prix unit." value={it.unit_price} onChange={(e) => updateItem(i, { unit_price: e.target.value })} />
                <button type="button" className="col-span-1 text-muted-foreground hover:text-destructive" onClick={() => setItems(s => s.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4 mx-auto" />
                </button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setItems(s => [...s, { product_name: "", unit: "", quantity: "1", unit_price: "0" }])}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Ligne
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Total</span>
            <span className="num text-lg font-semibold">{fmtMoney(total, currency)}</span>
          </div>

          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>;
}
