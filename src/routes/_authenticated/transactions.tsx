import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { walletsQO, budgetNodesQO } from "@/lib/queries";
import { NodePicker } from "@/components/node-picker";
import { buildTree, flattenTree, pathLabel } from "@/lib/budget-nodes";
import { Panel } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { fmtDate, fmtMoney, toISODate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({ meta: [{ title: "Transactions — Personal CFO" }] }),
  component: TxPage,
});

const TX_TYPES = ["expense","income","transfer","investment","asset_purchase","asset_sale","adjustment"] as const;

function TxPage() {
  const qc = useQueryClient();
  const wallets = useQuery(walletsQO);
  const cats = useQuery(categoriesQO);
  const [type, setType] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const txs = useQuery({
    queryKey: ["transactions", type, from, to],
    queryFn: async () => {
      let q = supabase.from("transactions").select("*, wallets:wallet_id(name), to:to_wallet_id(name), budget_categories(name)")
        .order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(200);
      if (type !== "all") q = q.eq("type", type as any);
      if (from) q = q.gte("occurred_on", from);
      if (to) q = q.lte("occurred_on", to);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Supprimé"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Trésorerie</p>
          <h1 className="mt-1 text-2xl font-semibold">Transactions</h1>
        </div>
        <AddTxDialog wallets={wallets.data ?? []} cats={cats.data ?? []} onDone={() => qc.invalidateQueries()} />
      </header>

      <Panel title="Filtres">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Type">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {TX_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Du"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Au"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </Panel>

      <Panel title={`${(txs.data ?? []).length} mouvements`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th><th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Description</th><th className="px-4 py-2">Catégorie</th>
                <th className="px-4 py-2">Portefeuille</th><th className="px-4 py-2 text-right">Montant</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(txs.data ?? []).map((t: any) => {
                const sign = t.type === "income" || t.type === "asset_sale" ? 1 : t.type === "transfer" ? 0 : -1;
                return (
                  <tr key={t.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="num px-4 py-2 text-muted-foreground">{fmtDate(t.occurred_on)}</td>
                    <td className="px-4 py-2"><span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">{t.type}</span></td>
                    <td className="px-4 py-2">{t.description}</td>
                    <td className="px-4 py-2 text-muted-foreground">{t.budget_categories?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{t.type === "transfer" ? `${t.wallets?.name ?? "?"} → ${t.to?.name ?? "?"}` : t.wallets?.name ?? "—"}</td>
                    <td className={`num px-4 py-2 text-right ${sign > 0 ? "text-positive" : sign < 0 ? "text-negative" : ""}`}>
                      {fmtMoney(Number(t.amount) * (sign || 1), t.currency, { sign: sign !== 0 })}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => confirm("Supprimer ?") && del.mutate(t.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {(txs.data ?? []).length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">Aucune transaction</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function AddTxDialog({ wallets, cats, onDone }: { wallets: any[]; cats: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type: "expense" as (typeof TX_TYPES)[number],
    occurred_on: toISODate(new Date()),
    description: "",
    wallet_id: "",
    to_wallet_id: "",
    amount: "",
    currency: "MGA",
    exchange_rate: "1",
    budget_category_id: "none",
    notes: "",
  });
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm(s => ({ ...s, [k]: v })); }

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const amt = Number(form.amount);
      const xr = Number(form.exchange_rate || 1);
      const { error } = await supabase.from("transactions").insert({
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
        budget_category_id: form.budget_category_id === "none" ? null : form.budget_category_id,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Transaction ajoutée"); setOpen(false); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouvelle transaction</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nouvelle transaction</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
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
            {form.type === "transfer" && (
              <Field label="Vers">
                <Select value={form.to_wallet_id} onValueChange={(v) => set("to_wallet_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{wallets.filter(w => w.id !== form.wallet_id).map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
            {form.type !== "transfer" && (
              <Field label="Catégorie">
                <Select value={form.budget_category_id} onValueChange={(v) => set("budget_category_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sans catégorie</SelectItem>
                    {cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Montant"><Input type="number" step="any" value={form.amount} onChange={(e) => set("amount", e.target.value)} required /></Field>
            <Field label="Devise">
              <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["MGA","EUR","USD","GBP","CHF","CAD","AUD","JPY","CNY"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Taux"><Input type="number" step="any" value={form.exchange_rate} onChange={(e) => set("exchange_rate", e.target.value)} /></Field>
          </div>
          <Field label="Notes"><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></Field>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>;
}
