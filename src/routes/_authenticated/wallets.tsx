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
import { Plus, Wallet as WalletIcon, ArrowLeftRight } from "lucide-react";
import { fmtMoney, toISODate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/wallets")({
  head: () => ({ meta: [{ title: "Portefeuilles — Personal CFO" }] }),
  component: WalletsPage,
});

const TYPES = ["cash","hidden_cash","bank","mobile_money","savings","investment","project_fund","other"] as const;
const CURRENCIES = ["MGA","EUR","USD","GBP","CHF","CAD","AUD","JPY","CNY"];

function WalletsPage() {
  const qc = useQueryClient();
  const wallets = useQuery(walletsQO);
  const profile = useQuery(profileQO);
  const baseCur = profile.data?.base_currency ?? "MGA";

  const total = (wallets.data ?? []).reduce((s, w) => s + Number(w.current_balance), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Trésorerie</p>
          <h1 className="mt-1 text-2xl font-semibold">Portefeuilles</h1>
          <p className="num mt-1 text-sm text-muted-foreground">Solde consolidé · <span className="text-foreground">{fmtMoney(total, baseCur)}</span></p>
        </div>
        <div className="flex gap-2">
          <TransferDialog wallets={wallets.data ?? []} onDone={() => qc.invalidateQueries()} />
          <AddWalletDialog defaultCur={baseCur} onDone={() => qc.invalidateQueries({ queryKey: ["wallets"] })} />
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(wallets.data ?? []).map((w) => (
          <div key={w.id} className="group rounded-md border border-border bg-card p-4 transition-colors hover:border-primary/40">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <WalletIcon className="h-4 w-4 text-primary" /> {w.name}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{w.type} · {w.currency}</div>
              </div>
              <span className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${w.status === "active" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{w.status}</span>
            </div>
            <div className={`num mt-4 text-2xl font-semibold ${Number(w.current_balance) < 0 ? "text-negative" : ""}`}>
              {fmtMoney(Number(w.current_balance), w.currency)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Ouverture · {fmtMoney(Number(w.opening_balance), w.currency)}</div>
          </div>
        ))}
        {(wallets.data ?? []).length === 0 && (
          <Panel title="Vide" className="sm:col-span-2 lg:col-span-3">
            <p className="py-8 text-center text-sm text-muted-foreground">Créez votre premier portefeuille pour commencer.</p>
          </Panel>
        )}
      </section>
    </div>
  );
}

function AddWalletDialog({ defaultCur, onDone }: { defaultCur: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("cash");
  const [currency, setCurrency] = useState(defaultCur);
  const [opening, setOpening] = useState("0");

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const ob = Number(opening || 0);
      const { error } = await supabase.from("wallets").insert({
        user_id: u.user!.id, name, type, currency, opening_balance: ob, current_balance: ob,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Portefeuille créé"); setOpen(false); setName(""); setOpening("0"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouveau portefeuille</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau portefeuille</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <Field label="Nom"><Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="MCB Bank, Mvola..." /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Devise">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Solde d'ouverture"><Input type="number" step="any" value={opening} onChange={(e) => setOpening(e.target.value)} /></Field>
          <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending ? "..." : "Créer"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ wallets, onDone }: { wallets: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("Transfert");

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const w = wallets.find(x => x.id === from);
      const amt = Number(amount);
      const { error } = await supabase.from("transactions").insert({
        user_id: u.user!.id, type: "transfer", occurred_on: toISODate(new Date()),
        description: desc, wallet_id: from, to_wallet_id: to, amount: amt, currency: w?.currency ?? "MGA",
        exchange_rate: 1, base_amount: amt,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Transfert enregistré"); setOpen(false); setAmount(""); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary"><ArrowLeftRight className="mr-2 h-4 w-4" /> Transfert</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Transfert entre portefeuilles</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <Field label="Description"><Input value={desc} onChange={(e) => setDesc(e.target.value)} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Depuis">
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>{wallets.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Vers">
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                <SelectContent>{wallets.filter(w => w.id !== from).map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Montant"><Input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
          <DialogFooter><Button type="submit" disabled={m.isPending || !from || !to}>Transférer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>;
}
