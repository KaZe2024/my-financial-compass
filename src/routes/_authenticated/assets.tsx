import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Landmark } from "lucide-react";
import { fmtDate, fmtMoney } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assets")({
  head: () => ({ meta: [{ title: "Actifs — Personal CFO" }] }),
  component: AssetsPage,
});

const TYPES = ["real_estate","land","vehicle","computer","electronics","investment","other"];

function AssetsPage() {
  const qc = useQueryClient();
  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await supabase.from("assets").select("*").order("purchase_date", { nullsFirst: false, ascending: false })).data ?? [],
  });

  const totalCur = (assets.data ?? []).filter((a: any) => a.status === "owned").reduce((s: number, a: any) => s + Number(a.current_value), 0);
  const totalPurchase = (assets.data ?? []).filter((a: any) => a.status === "owned").reduce((s: number, a: any) => s + Number(a.purchase_value), 0);
  const gain = totalCur - totalPurchase;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Patrimoine</p>
          <h1 className="mt-1 text-2xl font-semibold">Actifs</h1>
          <p className="num mt-1 text-sm text-muted-foreground">
            Valeur · <span className="text-foreground">{fmtMoney(totalCur)}</span> · 
            Plus/moins-value latente · <span className={gain >= 0 ? "text-positive" : "text-negative"}>{fmtMoney(gain, "MGA", { sign: true })}</span>
          </p>
        </div>
        <AddDialog onDone={() => qc.invalidateQueries({ queryKey: ["assets"] })} />
      </header>

      <Panel title={`${(assets.data ?? []).length} actifs`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[750px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nom</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Achat</th>
                <th className="px-4 py-2 text-right">Coût</th><th className="px-4 py-2 text-right">Valeur</th>
                <th className="px-4 py-2 text-right">Δ</th><th className="px-4 py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {(assets.data ?? []).map((a: any) => {
                const delta = Number(a.current_value) - Number(a.purchase_value);
                return (
                  <tr key={a.id} className="border-t border-border/60">
                    <td className="px-4 py-2 flex items-center gap-2"><Landmark className="h-3.5 w-3.5 text-muted-foreground" /> {a.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.type}</td>
                    <td className="num px-4 py-2 text-muted-foreground">{fmtDate(a.purchase_date)}</td>
                    <td className="num px-4 py-2 text-right">{fmtMoney(Number(a.purchase_value), a.currency)}</td>
                    <td className="num px-4 py-2 text-right font-semibold">{fmtMoney(Number(a.current_value), a.currency)}</td>
                    <td className={`num px-4 py-2 text-right ${delta >= 0 ? "text-positive" : "text-negative"}`}>{fmtMoney(delta, a.currency, { sign: true })}</td>
                    <td className="px-4 py-2"><span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{a.status}</span></td>
                  </tr>
                );
              })}
              {(assets.data ?? []).length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">Aucun actif</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function AddDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "vehicle", purchase_date: "", purchase_value: "0", current_value: "0", currency: "MGA", useful_life_months: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const pv = Number(form.purchase_value || 0);
      const cv = Number(form.current_value || pv);
      const { error } = await supabase.from("assets").insert({
        user_id: u.user!.id, name: form.name, type: form.type,
        purchase_date: form.purchase_date || null, purchase_value: pv, current_value: cv,
        currency: form.currency, useful_life_months: form.useful_life_months ? Number(form.useful_life_months) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Actif ajouté"); setOpen(false); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouvel actif</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouvel actif</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <F label="Nom"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Type">
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Date d'achat"><Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></F>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <F label="Coût"><Input type="number" step="any" value={form.purchase_value} onChange={(e) => setForm({ ...form, purchase_value: e.target.value })} required /></F>
            <F label="Valeur actuelle"><Input type="number" step="any" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} /></F>
            <F label="Devise">
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["MGA","EUR","USD","GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </F>
          </div>
          <F label="Durée de vie utile (mois)"><Input type="number" value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: e.target.value })} /></F>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Créer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function F({ label, children }: any) { return <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>; }
