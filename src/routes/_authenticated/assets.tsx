import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { walletsQO } from "@/lib/queries";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Landmark, Pencil, Archive, ArchiveRestore, Trash2, TrendingDown } from "lucide-react";
import { fmtDate, fmtMoney, toISODate } from "@/lib/format";
import { toast } from "sonner";

/** Linear depreciation: returns {months, cumul, vnc, pct} for a given asset. */
function computeAmortization(a: any, refDate = new Date()) {
  const life = Number(a.useful_life_months ?? 0);
  const cost = Number(a.purchase_value ?? 0);
  if (!life || !a.purchase_date || cost <= 0) return null;
  const start = new Date(a.purchase_date);
  const months = Math.max(0, Math.round((refDate.getFullYear() - start.getFullYear()) * 12 + (refDate.getMonth() - start.getMonth())));
  const used = Math.min(months, life);
  const cumul = (cost / life) * used;
  const vnc = Math.max(0, cost - cumul);
  return { months: used, life, cumul, vnc, pct: used / life };
}

export const Route = createFileRoute("/_authenticated/assets")({
  head: () => ({ meta: [{ title: "Actifs — Personal CFO" }] }),
  component: AssetsPage,
});

const TYPES = ["real_estate","land","vehicle","computer","electronics","investment","other"];

type FormShape = {
  name: string; type: string; purchase_date: string;
  purchase_value: string; current_value: string; currency: string;
  useful_life_months: string; notes: string;
  link_tx: boolean; wallet_id: string;
};

const EMPTY: FormShape = {
  name: "", type: "vehicle", purchase_date: toISODate(new Date()),
  purchase_value: "0", current_value: "0", currency: "MGA",
  useful_life_months: "", notes: "",
  link_tx: true, wallet_id: "",
};

function AssetsPage() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const wallets = useQuery(walletsQO);
  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await supabase.from("assets").select("*").order("purchase_date", { nullsFirst: false, ascending: false })).data ?? [],
  });

  const visible = (assets.data ?? []).filter((a: any) => showArchived || !a.archived);
  const totalCur = visible.filter((a: any) => a.status === "owned").reduce((s: number, a: any) => s + Number(a.current_value), 0);
  const totalPurchase = visible.filter((a: any) => a.status === "owned").reduce((s: number, a: any) => s + Number(a.purchase_value), 0);
  const gain = totalCur - totalPurchase;

  const [editing, setEditing] = useState<any | null>(null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Patrimoine</p>
          <h1 className="mt-1 text-2xl font-semibold">Actifs</h1>
          <p className="num mt-1 text-sm text-muted-foreground">
            Valeur · <span className="text-foreground">{fmtMoney(totalCur)}</span> ·{" "}
            Plus/moins-value latente · <span className={gain >= 0 ? "text-positive" : "text-negative"}>{fmtMoney(gain, "MGA", { sign: true })}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Masquer" : "Voir"} archivés</Button>
          <AssetDialog wallets={wallets.data ?? []} onDone={() => qc.invalidateQueries()} />
        </div>
      </header>

      <Panel title={`${visible.length} actifs`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nom</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Achat</th>
                <th className="px-4 py-2 text-right">Coût</th>
                <th className="px-4 py-2 text-right">Amort. cumulé</th>
                <th className="px-4 py-2 text-right">VNC</th>
                <th className="px-4 py-2 text-right">Valeur</th>
                <th className="px-4 py-2 text-right">Δ</th><th className="px-4 py-2">Statut</th><th className="px-4 py-2 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a: any) => {
                const delta = Number(a.current_value) - Number(a.purchase_value);
                const amo = computeAmortization(a);
                return (
                  <tr key={a.id} className={`border-t border-border/60 ${a.archived ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2 flex items-center gap-2"><Landmark className="h-3.5 w-3.5 text-muted-foreground" /> {a.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.type}</td>
                    <td className="num px-4 py-2 text-muted-foreground">{fmtDate(a.purchase_date)}</td>
                    <td className="num px-4 py-2 text-right">{fmtMoney(Number(a.purchase_value), a.currency)}</td>
                    <td className="num px-4 py-2 text-right text-muted-foreground" title={amo ? `${amo.months}/${amo.life} mois (${Math.round(amo.pct * 100)}%)` : "—"}>
                      {amo ? fmtMoney(amo.cumul, a.currency) : "—"}
                    </td>
                    <td className="num px-4 py-2 text-right">{amo ? fmtMoney(amo.vnc, a.currency) : "—"}</td>
                    <td className="num px-4 py-2 text-right font-semibold">{fmtMoney(Number(a.current_value), a.currency)}</td>
                    <td className={`num px-4 py-2 text-right ${delta >= 0 ? "text-positive" : "text-negative"}`}>{fmtMoney(delta, a.currency, { sign: true })}</td>
                    <td className="px-4 py-2"><span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{a.archived ? "archivé" : a.status}</span></td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end">
                        {amo && (
                          <button
                            title={`Appliquer dépréciation → VNC ${fmtMoney(amo.vnc, a.currency)}`}
                            onClick={async () => {
                              const { data: u } = await supabase.auth.getUser();
                              const today = toISODate(new Date());
                              const amount = Number(a.current_value) - amo.vnc;
                              await supabase.from("assets").update({ current_value: amo.vnc }).eq("id", a.id);
                              if (amount !== 0) {
                                await supabase.from("asset_events").insert({
                                  user_id: u.user!.id, asset_id: a.id, event_type: "depreciation",
                                  occurred_on: today, amount, notes: `Amortissement linéaire (${amo.months}/${amo.life} mois)`,
                                });
                              }
                              toast.success("Dépréciation appliquée");
                              qc.invalidateQueries();
                            }}
                            className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          ><TrendingDown className="h-3.5 w-3.5" /></button>
                        )}
                        <RowActions table="assets" id={a.id} archived={a.archived} onEdit={() => setEditing(a)} linkedTxId={a.linked_transaction_id} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">Aucun actif</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {editing && (
        <AssetDialog editingAsset={editing} wallets={wallets.data ?? []} onDone={() => { setEditing(null); qc.invalidateQueries(); }} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

export function RowActions({ table, id, archived, onEdit, linkedTxId, cascadeTo }: { table: string; id: string; archived: boolean; onEdit: () => void; linkedTxId?: string | null; cascadeTo?: string }) {
  const qc = useQueryClient();
  const arch = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from(table).update({ archived: !archived }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success(archived ? "Restauré" : "Archivé"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (alsoTx: boolean) => {
      if (alsoTx && linkedTxId) {
        await supabase.from("transaction_tags").delete().eq("transaction_id", linkedTxId);
        await supabase.from("transactions").delete().eq("id", linkedTxId);
      }
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Supprimé"); },
    onError: (e: Error) => toast.error(e.message),
  });
  function onDelete() {
    if (!confirm("Supprimer cette entrée ?")) return;
    const alsoTx = linkedTxId ? confirm("Supprimer aussi la transaction liée ?") : false;
    del.mutate(alsoTx);
    void cascadeTo;
  }
  return (
    <div className="flex justify-end gap-0.5 text-muted-foreground">
      <button title="Modifier" onClick={onEdit} className="rounded-sm p-1 hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
      <button title={archived ? "Restaurer" : "Archiver"} onClick={() => arch.mutate()} className="rounded-sm p-1 hover:bg-muted hover:text-foreground">
        {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
      </button>
      <button title="Supprimer" onClick={onDelete} className="rounded-sm p-1 hover:bg-muted hover:text-negative"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function AssetDialog({ editingAsset, wallets, onDone, onClose }: { editingAsset?: any; wallets: any[]; onDone: () => void; onClose?: () => void }) {
  const [open, setOpen] = useState(!editingAsset ? false : true);
  const [form, setForm] = useState<FormShape>(editingAsset ? {
    name: editingAsset.name, type: editingAsset.type, purchase_date: editingAsset.purchase_date ?? toISODate(new Date()),
    purchase_value: String(editingAsset.purchase_value), current_value: String(editingAsset.current_value), currency: editingAsset.currency,
    useful_life_months: editingAsset.useful_life_months ? String(editingAsset.useful_life_months) : "",
    notes: editingAsset.notes ?? "", link_tx: false, wallet_id: "",
  } : EMPTY);

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const pv = Number(form.purchase_value || 0);
      const cv = Number(form.current_value || pv);
      const payload: any = {
        user_id: u.user!.id, name: form.name, type: form.type,
        purchase_date: form.purchase_date || null, purchase_value: pv, current_value: cv,
        currency: form.currency, useful_life_months: form.useful_life_months ? Number(form.useful_life_months) : null,
        notes: form.notes || null,
      };
      if (editingAsset) {
        const { error } = await supabase.from("assets").update(payload).eq("id", editingAsset.id);
        if (error) throw error;
      } else {
        const { data: assetIns, error } = await supabase.from("assets").insert(payload).select().single();
        if (error) throw error;
        if (form.link_tx && form.wallet_id) {
          const { data: tx, error: txErr } = await supabase.from("transactions").insert({
            user_id: u.user!.id, type: "asset_purchase", occurred_on: form.purchase_date || toISODate(new Date()),
            description: `Achat actif · ${form.name}`, wallet_id: form.wallet_id,
            amount: pv, currency: form.currency, exchange_rate: 1, base_amount: pv,
            asset_id: assetIns.id, source_kind: "asset", source_id: assetIns.id,
          }).select().single();
          if (txErr) throw txErr;
          await supabase.from("assets").update({ linked_transaction_id: tx.id }).eq("id", assetIns.id);
        }
      }
    },
    onSuccess: () => { toast.success(editingAsset ? "Mis à jour" : "Actif ajouté"); setOpen(false); onClose?.(); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={editingAsset ? true : open} onOpenChange={(v) => { setOpen(v); if (!v) onClose?.(); }}>
      {!editingAsset && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouvel actif</Button></DialogTrigger>}
      <DialogContent>
        <DialogHeader><DialogTitle>{editingAsset ? "Modifier l'actif" : "Nouvel actif"}</DialogTitle></DialogHeader>
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
          {!editingAsset && (
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.link_tx} onChange={(e) => setForm({ ...form, link_tx: e.target.checked })} />
                Créer une transaction d'achat liée (sortie de portefeuille)
              </label>
              {form.link_tx && (
                <F label="Portefeuille de paiement">
                  <Select value={form.wallet_id} onValueChange={(v) => setForm({ ...form, wallet_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
              )}
            </div>
          )}
          <DialogFooter><Button type="submit" disabled={m.isPending}>{editingAsset ? "Enregistrer" : "Créer"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: any) { return <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>; }
