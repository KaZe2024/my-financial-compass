import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NodePicker } from "@/components/node-picker";
import { CounterpartyPicker, ensureCounterparty, type Counterparty } from "@/components/counterparty-picker";
import { walletsQO, budgetNodesQO, counterpartiesQO } from "@/lib/queries";
import { fmtMoney, fmtDate, toISODate } from "@/lib/format";
import { Plus, Pencil, Trash2, Wallet, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/provisions")({
  head: () => ({ meta: [{ title: "Provisions — Personal CFO" }] }),
  component: ProvisionsPage,
});

/**
 * Insert the "constatation" transaction for a provision.
 * Convention: wallet_id = NULL → aucun mouvement de trésorerie, mais budget consommé.
 */
export async function bookProvisionTx(prov: any, userId: string) {
  const type = prov.direction === "in" ? "income" : "expense";
  const rate = Number(prov.exchange_rate ?? 1) || 1;
  const amt = Number(prov.amount) || 0;
  const base = amt * rate;
  const { data: tx, error } = await supabase.from("transactions").insert({
    user_id: userId,
    type,
    occurred_on: prov.due_date ?? toISODate(new Date()),
    description: prov.description || `Provision · ${prov.name}`,
    wallet_id: null,
    amount: amt,
    currency: prov.currency ?? "MGA",
    exchange_rate: rate,
    base_amount: base,
    budget_node_id: prov.budget_node_id ?? null,
    counterparty_id: prov.counterparty_id ?? null,
    source_kind: "provision",
    source_id: prov.id,
    notes: "Provision (sans mouvement de trésorerie)",
  } as any).select().single();
  if (error) throw error;
  await supabase.from("provisions").update({ booking_tx_id: tx.id }).eq("id", prov.id);
  return tx;
}

function ProvisionsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [payingProv, setPayingProv] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<"open" | "all">("open");

  const wallets = useQuery(walletsQO);
  const nodesQ = useQuery(budgetNodesQO);
  const cps = useQuery(counterpartiesQO);

  const provisions = useQuery({
    queryKey: ["provisions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("provisions").select("*").order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const visible = (provisions.data ?? []).filter((p: any) => statusFilter === "all" || p.status !== "settled");

  const stats = useMemo(() => {
    let inflow = 0, outflow = 0;
    for (const p of visible) {
      if (p.status === "settled") continue;
      const a = Number(p.amount ?? 0);
      if (p.direction === "in") inflow += a; else outflow += a;
    }
    return { inflow, outflow, net: inflow - outflow, count: visible.filter((p: any) => p.status !== "settled").length };
  }, [visible]);

  const del = useMutation({
    mutationFn: async (p: any) => {
      // Nettoie les transactions liées (constatation, extourne, paiement)
      const ids = [p.booking_tx_id, p.reversal_tx_id, p.payment_tx_id].filter(Boolean);
      if (ids.length) await supabase.from("transactions").delete().in("id", ids);
      const { error } = await supabase.from("provisions").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Supprimé"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Trésorerie prévisionnelle</p>
          <h1 className="mt-1 text-2xl font-semibold">Provisions</h1>
          <p className="mt-1 text-xs text-muted-foreground">Constate la charge (ou le produit) dans le budget <strong>sans</strong> mouvement de trésorerie. Le paiement effectif se règle plus tard : extourne automatique + passage de la charge avec portefeuille.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="open">En cours</option>
            <option value="all">Toutes</option>
          </select>
          <ProvDialog wallets={wallets.data ?? []} nodes={nodesQ.data ?? []} cps={cps.data ?? []} onDone={() => qc.invalidateQueries()} />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Ouvertes" value={stats.count} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Entrées provisionnées" value={fmtMoney(stats.inflow)} tone="positive" />
        <StatCard label="Sorties provisionnées" value={fmtMoney(stats.outflow)} tone="negative" />
        <StatCard label="Net attendu" value={fmtMoney(stats.net, "MGA", { sign: true })} tone={stats.net >= 0 ? "positive" : "negative"} />
      </div>

      <Panel title={`${visible.length} provision${visible.length > 1 ? "s" : ""}`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Tiers</th>
                <th className="px-4 py-2">Sens</th>
                <th className="px-4 py-2 text-right">Montant</th>
                <th className="px-4 py-2">Échéance</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2 w-40 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p: any) => {
                const cp = (cps.data ?? []).find((c) => c.id === p.counterparty_id);
                return (
                  <tr key={p.id} className={`border-t border-border/60 ${p.status === "settled" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2 font-medium">{p.name}{p.description ? <div className="text-[10px] text-muted-foreground">{p.description}</div> : null}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{cp?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{p.direction === "in" ? "↓ Entrée" : "↑ Sortie"}</td>
                    <td className={`num px-4 py-2 text-right font-medium ${p.direction === "in" ? "text-positive" : "text-negative"}`}>{fmtMoney(p.amount, p.currency ?? "MGA")}</td>
                    <td className="px-4 py-2 text-xs">{fmtDate(p.due_date)}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {p.status === "settled" ? "Payée" : p.booking_tx_id ? "Constatée" : "Planifiée"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex justify-end gap-0.5 text-muted-foreground">
                        {p.status !== "settled" && (
                          <Button size="sm" variant="outline" onClick={() => setPayingProv(p)}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Payer
                          </Button>
                        )}
                        <button title="Modifier" onClick={() => setEditing(p)} className="rounded-sm p-1 hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                        <button title="Supprimer" onClick={() => confirm(`Supprimer « ${p.name} » et ses écritures ?`) && del.mutate(p)} className="rounded-sm p-1 hover:bg-muted hover:text-negative"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Aucune provision.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {editing && <ProvDialog editing={editing} wallets={wallets.data ?? []} nodes={nodesQ.data ?? []} cps={cps.data ?? []} onClose={() => setEditing(null)} onDone={() => { setEditing(null); qc.invalidateQueries(); }} />}
      {payingProv && <PayDialog prov={payingProv} wallets={wallets.data ?? []} onClose={() => setPayingProv(null)} onDone={() => { setPayingProv(null); qc.invalidateQueries(); }} />}
    </div>
  );
}

function ProvDialog({ editing, wallets, nodes, cps, onDone, onClose }: { editing?: any; wallets: any[]; nodes: any[]; cps: Counterparty[]; onDone: () => void; onClose?: () => void }) {
  const [open, setOpen] = useState(!!editing);
  const initialCp = editing?.counterparty_id ? cps.find((c) => c.id === editing.counterparty_id)?.name ?? "" : "";
  const [form, setForm] = useState({
    name: editing?.name ?? "",
    description: editing?.description ?? "",
    counterparty: initialCp,
    budget_node_id: (editing?.budget_node_id ?? null) as string | null,
    wallet_id: editing?.wallet_id ?? "",
    amount: String(editing?.amount ?? ""),
    currency: editing?.currency ?? "MGA",
    exchange_rate: String(editing?.exchange_rate ?? 1),
    direction: editing?.direction === "in" ? "in" : "out",
    due_date: editing?.due_date ?? toISODate(new Date()),
    notes: editing?.notes ?? "",
  });

  const currencies = useQuery({
    queryKey: ["fx_currencies_all"],
    queryFn: async () => {
      const { data } = await supabase.from("currencies").select("code").order("code");
      const set = new Set<string>(["MGA","EUR","USD","GBP","CHF","JPY","CNY","CAD","AUD"]);
      for (const c of (data ?? []) as any[]) if (c.code) set.add(c.code);
      return Array.from(set).sort();
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const cpId = form.counterparty.trim() ? await ensureCounterparty(form.counterparty, cps) : null;
      const rate = Number(form.exchange_rate) || 1;
      const amt = Number(form.amount) || 0;
      const base = amt * rate;
      const payload: any = {
        user_id: uid,
        name: form.name.trim(),
        description: form.description.trim() || null,
        counterparty_id: cpId,
        budget_node_id: form.budget_node_id,
        wallet_id: form.wallet_id || null,
        amount: amt,
        currency: form.currency || "MGA",
        exchange_rate: rate,
        direction: form.direction,
        due_date: form.due_date || null,
        notes: form.notes.trim() || null,
        status: "planned",
      };
      if (editing) {
        const { error } = await supabase.from("provisions").update(payload).eq("id", editing.id);
        if (error) throw error;
        if (editing.booking_tx_id) {
          await supabase.from("transactions").update({
            type: form.direction === "in" ? "income" : "expense",
            occurred_on: form.due_date || toISODate(new Date()),
            description: form.description || `Provision · ${form.name}`,
            amount: amt,
            base_amount: base,
            exchange_rate: rate,
            currency: form.currency || "MGA",
            budget_node_id: form.budget_node_id,
            counterparty_id: cpId,
          } as any).eq("id", editing.booking_tx_id);
        } else {
          await bookProvisionTx({ ...editing, ...payload, id: editing.id }, uid);
        }
      } else {
        const { data: ins, error } = await supabase.from("provisions").insert(payload).select().single();
        if (error) throw error;
        await bookProvisionTx(ins, uid);
      }
    },
    onSuccess: () => { toast.success("Provision constatée"); setOpen(false); onClose?.(); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={editing ? true : open} onOpenChange={(v) => { setOpen(v); if (!v) onClose?.(); }}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouvelle provision</Button></DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Modifier la provision" : "Nouvelle provision"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="Nom"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></F>
            <F label="Sens">
              <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="out">Charge (sortie)</SelectItem>
                  <SelectItem value="in">Produit (entrée)</SelectItem>
                </SelectContent>
              </Select>
            </F>
          </div>
          <F label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></F>
          <F label="Tiers"><CounterpartyPicker list={cps} value={form.counterparty} onChange={(v) => setForm({ ...form, counterparty: v })} /></F>
          <F label="Catégorie budgétaire">
            <NodePicker nodes={nodes} value={form.budget_node_id} onChange={(id) => setForm({ ...form, budget_node_id: id })} placeholder="Sélectionner…" />
          </F>
          <div className="grid grid-cols-3 gap-3">
            <F label="Montant"><Input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></F>
            <F label="Devise"><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></F>
            <F label="Échéance"><DatePicker value={form.due_date} onChange={(__v) => setForm({ ...form, due_date: __v })} /></F>
          </div>
          <F label="Portefeuille cible (paiement futur)">
            <Select value={form.wallet_id || "none"} onValueChange={(v) => setForm({ ...form, wallet_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— à définir au paiement</SelectItem>
                {wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></F>
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
            Une transaction sans portefeuille sera créée : la {form.direction === "in" ? "produit" : "charge"} apparaît dans le budget consommé, sans mouvement de trésorerie.
          </div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ prov, wallets, onDone, onClose }: { prov: any; wallets: any[]; onDone: () => void; onClose?: () => void }) {
  const [walletId, setWalletId] = useState<string>(prov.wallet_id ?? "");
  const [paidOn, setPaidOn] = useState<string>(toISODate(new Date()));
  const [amount, setAmount] = useState<string>(String(prov.amount ?? ""));

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const amt = Number(amount);
      // 1) Assure que la constatation existe (si créée avant refactor)
      if (!prov.booking_tx_id) {
        await bookProvisionTx(prov, uid);
      }
      // 2) Extourne : même type que la constatation, montant négatif (auto-annulation)
      const reversalType = prov.direction === "in" ? "income" : "expense";
      const { data: reversal, error: rErr } = await supabase.from("transactions").insert({
        user_id: uid,
        type: reversalType,
        occurred_on: paidOn,
        description: `Extourne provision · ${prov.name}`,
        wallet_id: null,
        amount: -amt,
        currency: prov.currency ?? "MGA",
        exchange_rate: 1,
        base_amount: -amt,
        budget_node_id: prov.budget_node_id ?? null,
        counterparty_id: prov.counterparty_id ?? null,
        source_kind: "provision",
        source_id: prov.id,
        notes: "Extourne automatique de la provision",
      } as any).select().single();
      if (rErr) throw rErr;
      // 3) Paiement effectif (avec portefeuille)
      const payType = prov.direction === "in" ? "income" : "expense";
      const { data: pay, error: pErr } = await supabase.from("transactions").insert({
        user_id: uid,
        type: payType,
        occurred_on: paidOn,
        description: `Paiement · ${prov.name}`,
        wallet_id: walletId || null,
        amount: amt,
        currency: prov.currency ?? "MGA",
        exchange_rate: 1,
        base_amount: amt,
        budget_node_id: prov.budget_node_id ?? null,
        counterparty_id: prov.counterparty_id ?? null,
        source_kind: "provision",
        source_id: prov.id,
      } as any).select().single();
      if (pErr) throw pErr;
      const { error: uErr } = await supabase.from("provisions").update({
        status: "settled",
        settled_at: new Date().toISOString(),
        actual_amount: amt,
        reversal_tx_id: reversal.id,
        payment_tx_id: pay.id,
        wallet_id: walletId || null,
      }).eq("id", prov.id);
      if (uErr) throw uErr;
    },
    onSuccess: () => { toast.success("Provision soldée · extourne + paiement passés"); onClose?.(); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Payer la provision · {prov.name}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (!walletId) { toast.error("Choisissez un portefeuille"); return; } m.mutate(); }} className="space-y-3">
          <F label="Portefeuille">
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Date de paiement"><DatePicker value={paidOn} onChange={(__v) => setPaidOn(__v)} required /></F>
            <F label="Montant réel"><Input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required /></F>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            3 écritures seront passées : constatation (déjà là), extourne automatique, paiement avec portefeuille. Net budget = 1 charge, net trésorerie = −{fmtMoney(Number(amount) || 0, prov.currency ?? "MGA")}.
          </div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Valider le paiement</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>;
}
