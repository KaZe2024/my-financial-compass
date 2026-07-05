import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { walletsQO, budgetNodesQO } from "@/lib/queries";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NodePicker } from "@/components/node-picker";
import { HistoryDialog } from "@/components/history-dialog";
import { Plus, Landmark, Pencil, Archive, ArchiveRestore, Trash2, TrendingDown, RefreshCcw, HandCoins, History as HistoryIcon, Tags, Check, X } from "lucide-react";
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

const DEFAULT_TYPE = "other";

type FormShape = {
  name: string; type: string; purchase_date: string;
  purchase_value: string; current_value: string; currency: string;
  useful_life_months: string; notes: string;
  link_tx: boolean; wallet_id: string;
};

const EMPTY: FormShape = {
  name: "", type: DEFAULT_TYPE, purchase_date: toISODate(new Date()),
  purchase_value: "0", current_value: "0", currency: "MGA",
  useful_life_months: "", notes: "",
  link_tx: true, wallet_id: "",
};

function AssetsPage() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [manageTypes, setManageTypes] = useState(false);
  const wallets = useQuery(walletsQO);
  const nodesQ = useQuery(budgetNodesQO);
  const assetTypes = useQuery({
    queryKey: ["asset_types"],
    queryFn: async () => (await supabase.from("asset_types").select("*").order("sort_order", { ascending: true }).order("name", { ascending: true })).data ?? [],
  });
  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await supabase.from("assets").select("*").order("purchase_date", { nullsFirst: false, ascending: false })).data ?? [],
  });

  const visible = (assets.data ?? []).filter((a: any) => showArchived || !a.archived);
  const totalCur = visible.filter((a: any) => a.status === "owned").reduce((s: number, a: any) => s + Number(a.current_value), 0);
  const totalPurchase = visible.filter((a: any) => a.status === "owned").reduce((s: number, a: any) => s + Number(a.purchase_value), 0);
  const gain = totalCur - totalPurchase;

  const [editing, setEditing] = useState<any | null>(null);
  const [amortizing, setAmortizing] = useState<any | null>(null);
  const [revaluing, setRevaluing] = useState<any | null>(null);
  const [selling, setSelling] = useState<any | null>(null);
  const [historyOf, setHistoryOf] = useState<any | null>(null);

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
          <Button variant="secondary" size="sm" onClick={() => setManageTypes(true)}><Tags className="mr-2 h-4 w-4" /> Types</Button>
          <AssetDialog types={assetTypes.data ?? []} wallets={wallets.data ?? []} onDone={() => qc.invalidateQueries()} />
        </div>
      </header>
      {manageTypes && <AssetTypesDialog onClose={() => setManageTypes(false)} />}

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
                      <div className="flex items-center justify-end gap-0.5 text-muted-foreground">
                        {amo && (
                          <button title="Générer amortissements rétroactifs" onClick={() => setAmortizing(a)} className="rounded-sm p-1 hover:bg-muted hover:text-foreground">
                            <TrendingDown className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button title="Réévaluer" onClick={() => setRevaluing(a)} className="rounded-sm p-1 hover:bg-muted hover:text-foreground"><RefreshCcw className="h-3.5 w-3.5" /></button>
                        {a.status === "owned" && (
                          <button title="Vendre" onClick={() => setSelling(a)} className="rounded-sm p-1 hover:bg-muted hover:text-positive"><HandCoins className="h-3.5 w-3.5" /></button>
                        )}
                        <button title="Historique" onClick={() => setHistoryOf(a)} className="rounded-sm p-1 hover:bg-muted hover:text-foreground"><HistoryIcon className="h-3.5 w-3.5" /></button>
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
        <AssetDialog editingAsset={editing} types={assetTypes.data ?? []} wallets={wallets.data ?? []} onDone={() => { setEditing(null); qc.invalidateQueries(); }} onClose={() => setEditing(null)} />
      )}
      {amortizing && (
        <AmortDialog asset={amortizing} nodes={nodesQ.data ?? []} onClose={() => setAmortizing(null)} onDone={() => { setAmortizing(null); qc.invalidateQueries(); }} />
      )}
      {revaluing && (
        <RevalueDialog asset={revaluing} onClose={() => setRevaluing(null)} onDone={() => { setRevaluing(null); qc.invalidateQueries(); }} />
      )}
      {selling && (
        <SellDialog asset={selling} wallets={wallets.data ?? []} onClose={() => setSelling(null)} onDone={() => { setSelling(null); qc.invalidateQueries(); }} />
      )}
      {historyOf && (
        <HistoryDialog open onOpenChange={(v) => !v && setHistoryOf(null)} title={`Historique · ${historyOf.name}`} column="asset_id" sourceKind="asset" entityId={historyOf.id} />
      )}
    </div>
  );
}

function tableToEntity(t: string): any {
  const m: Record<string, string> = {
    assets: "asset", debts: "debt", receivables: "receivable",
    projects: "project", financial_goals: "goal", products: "product",
    counterparties: "counterparty", subscriptions: "subscription", income_sources: "income_source",
    budget_nodes: "budget_node", transactions: "transaction",
  };
  return m[t] ?? t;
}


export function RowActions({ table, id, archived, onEdit, linkedTxId, cascadeTo }: { table: string; id: string; archived: boolean; onEdit: () => void; linkedTxId?: string | null; cascadeTo?: string }) {
  const qc = useQueryClient();
  const arch = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from(table).update({ archived: !archived }).eq("id", id);
      if (error) throw error;
      const { logAudit } = await import("@/lib/audit");
      await logAudit(tableToEntity(table), id, archived ? "restore" : "archive");
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
      const { logAudit } = await import("@/lib/audit");
      await logAudit(tableToEntity(table), id, "delete", alsoTx ? { linked_tx_deleted: linkedTxId } : undefined);
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

function AssetDialog({ editingAsset, types, wallets, onDone, onClose }: { editingAsset?: any; types: any[]; wallets: any[]; onDone: () => void; onClose?: () => void }) {
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
            <F label="Date d'achat"><DatePicker value={form.purchase_date} onChange={(__v) => setForm({ ...form, purchase_date: __v })} /></F>
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

/**
 * Génère un événement d'amortissement + une transaction (charge sans portefeuille)
 * pour chaque mois écoulé depuis l'achat jusqu'à aujourd'hui, dans la limite de la
 * durée de vie utile. Utilise l'index unique (asset_id, event_type, event_month)
 * pour éviter les doublons.
 */
function AmortDialog({ asset, nodes, onClose, onDone }: { asset: any; nodes: any[]; onClose: () => void; onDone: () => void }) {
  const [nodeId, setNodeId] = useState<string | null>(null);

  const months = useMemo(() => {
    const life = Number(asset.useful_life_months ?? 0);
    const cost = Number(asset.purchase_value ?? 0);
    if (!life || !asset.purchase_date || cost <= 0) return [] as { month: string; amount: number }[];
    const monthly = cost / life;
    const start = new Date(asset.purchase_date);
    const today = new Date();
    const out: { month: string; amount: number }[] = [];
    const first = new Date(start.getFullYear(), start.getMonth(), 1);
    for (let i = 0; i < life; i++) {
      const d = new Date(first.getFullYear(), first.getMonth() + i, 1);
      if (d > today) break;
      out.push({ month: toISODate(d), amount: monthly });
    }
    return out;
  }, [asset]);

  const existing = useQuery({
    queryKey: ["ae-existing", asset.id],
    queryFn: async () => (await supabase.from("asset_events").select("event_month").eq("asset_id", asset.id).eq("event_type", "depreciation")).data ?? [],
  });
  const done = new Set((existing.data ?? []).map((r: any) => r.event_month));
  const pending = months.filter((m) => !done.has(m.month));
  const totalPending = pending.reduce((s, m) => s + m.amount, 0);

  const run = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      for (const m of pending) {
        const { data: tx, error: txErr } = await supabase.from("transactions").insert({
          user_id: uid,
          type: "expense",
          occurred_on: m.month,
          description: `Amortissement · ${asset.name}`,
          wallet_id: null,
          amount: m.amount,
          currency: asset.currency ?? "MGA",
          exchange_rate: 1,
          base_amount: m.amount,
          budget_node_id: nodeId,
          asset_id: asset.id,
          source_kind: "asset",
          source_id: asset.id,
          notes: `Dotation aux amortissements (linéaire)`,
        } as any).select().single();
        if (txErr) throw txErr;
        const { error } = await supabase.from("asset_events").insert({
          user_id: uid,
          asset_id: asset.id,
          event_type: "depreciation",
          event_date: m.month,
          event_month: m.month,
          amount: m.amount,
          transaction_id: tx.id,
          notes: `Amortissement mensuel ${m.month.slice(0, 7)}`,
        } as any);
        if (error) throw error;
      }
      // Baisse la valeur courante
      const currentVal = Math.max(0, Number(asset.current_value) - totalPending);
      await supabase.from("assets").update({ current_value: currentVal }).eq("id", asset.id);
    },
    onSuccess: () => { toast.success(`${pending.length} amortissement(s) générés`); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Amortissements rétroactifs · {asset.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <F label="Catégorie budgétaire · Amortissement">
            <NodePicker nodes={nodes} value={nodeId} onChange={setNodeId} placeholder="Sélectionner…" />
          </F>
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
            <p><strong>{pending.length}</strong> mois à générer (sur {months.length}), pour un total de <strong>{fmtMoney(totalPending, asset.currency)}</strong>.</p>
            {done.size > 0 && <p className="mt-1 text-muted-foreground">{done.size} mois déjà passés — ignorés (contrainte d'unicité).</p>}
          </div>
          <div className="scroll-thin max-h-48 overflow-y-auto rounded-md border border-border/60">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-2 py-1">Mois</th><th className="px-2 py-1 text-right">Dotation</th><th className="px-2 py-1">Statut</th></tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month} className="border-t border-border/60">
                    <td className="px-2 py-1 font-mono">{m.month.slice(0, 7)}</td>
                    <td className="num px-2 py-1 text-right">{fmtMoney(m.amount, asset.currency)}</td>
                    <td className="px-2 py-1 text-muted-foreground">{done.has(m.month) ? "déjà passé" : "à générer"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Annuler</Button>
            <Button disabled={run.isPending || pending.length === 0 || !nodeId} onClick={() => run.mutate()}>
              Générer {pending.length} écriture{pending.length > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RevalueDialog({ asset, onClose, onDone }: { asset: any; onClose: () => void; onDone: () => void }) {
  const [value, setValue] = useState<string>(String(asset.current_value ?? ""));
  const [date, setDate] = useState<string>(toISODate(new Date()));
  const [notes, setNotes] = useState<string>("");
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const newVal = Number(value);
      const delta = newVal - Number(asset.current_value);
      await supabase.from("assets").update({ current_value: newVal }).eq("id", asset.id);
      await supabase.from("asset_events").insert({
        user_id: u.user!.id, asset_id: asset.id,
        event_type: delta >= 0 ? "revaluation" : "impairment",
        event_date: date, amount: delta, notes: notes || (delta >= 0 ? "Réévaluation" : "Dépréciation exceptionnelle"),
      } as any);
    },
    onSuccess: () => { toast.success("Réévaluation enregistrée"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Réévaluer · {asset.name}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <F label="Nouvelle valeur"><Input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} required /></F>
          <F label="Date"><DatePicker value={date} onChange={(__v) => setDate(__v)} /></F>
          <F label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Commentaire (optionnel)" /></F>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SellDialog({ asset, wallets, onClose, onDone }: { asset: any; wallets: any[]; onClose: () => void; onDone: () => void }) {
  const [price, setPrice] = useState<string>(String(asset.current_value ?? ""));
  const [walletId, setWalletId] = useState<string>("");
  const [date, setDate] = useState<string>(toISODate(new Date()));
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const amt = Number(price);
      const { data: tx, error: txErr } = await supabase.from("transactions").insert({
        user_id: uid, type: "asset_sale", occurred_on: date,
        description: `Vente actif · ${asset.name}`,
        wallet_id: walletId || null,
        amount: amt, currency: asset.currency ?? "MGA", exchange_rate: 1, base_amount: amt,
        asset_id: asset.id, source_kind: "asset", source_id: asset.id,
      } as any).select().single();
      if (txErr) throw txErr;
      await supabase.from("asset_events").insert({
        user_id: uid, asset_id: asset.id, event_type: "sale",
        event_date: date, amount: amt, transaction_id: tx.id,
      } as any);
      await supabase.from("assets").update({ status: "sold", current_value: 0 }).eq("id", asset.id);
    },
    onSuccess: () => { toast.success("Actif vendu"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Vendre · {asset.name}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (!walletId) { toast.error("Choisissez un portefeuille"); return; } m.mutate(); }} className="space-y-3">
          <F label="Prix de vente"><Input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} required /></F>
          <F label="Portefeuille encaisseur">
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Date"><DatePicker value={date} onChange={(__v) => setDate(__v)} /></F>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer la vente</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
