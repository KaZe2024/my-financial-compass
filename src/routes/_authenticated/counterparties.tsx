import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { counterpartiesQO } from "@/lib/queries";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PeriodPicker, usePeriodState } from "@/components/period-picker";
import { resolvePeriod, isoDate } from "@/lib/period";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Users, History as HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import { HistoryDialog } from "@/components/history-dialog";

export const Route = createFileRoute("/_authenticated/counterparties")({
  head: () => ({ meta: [{ title: "Tiers — Personal CFO" }] }),
  component: CounterpartiesPage,
});

function CounterpartiesPage() {
  const qc = useQueryClient();
  const cps = useQuery(counterpartiesQO);
  const { preset, setPreset, custom, setCustom } = usePeriodState("ytd");
  const period = resolvePeriod(preset, new Date(), custom);

  const [filters, setFilters] = useState({ name: "", notes: "", group: "all", service: "all", showArchived: false });
  const [editing, setEditing] = useState<any | null>(null);
  const [historyOf, setHistoryOf] = useState<any | null>(null);

  const txs = useQuery({
    queryKey: ["cp_txs", isoDate(period.from), isoDate(period.to)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, type, occurred_on, amount, base_amount, exchange_rate, counterparty_id, counterparty_label")
        .gte("occurred_on", isoDate(period.from))
        .lte("occurred_on", isoDate(period.to))
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const m = new Map<string, { in: number; out: number; count: number }>();
    for (const t of txs.data ?? []) {
      const key = (t as any).counterparty_id;
      if (!key) continue;
      const cur = m.get(key) ?? { in: 0, out: 0, count: 0 };
      const mga = Number((t as any).base_amount ?? Number((t as any).amount) * Number((t as any).exchange_rate ?? 1));
      const type = (t as any).type;
      if (type === "transfer") { cur.count++; m.set(key, cur); continue; }
      const inCash = ["income","asset_sale","adjustment","enveloppe_emprunt","dette"].includes(type);
      const signed = inCash ? mga : -mga;
      if (signed > 0) cur.in += signed; else cur.out += -signed;
      cur.count++;
      m.set(key, cur);
    }
    return m;
  }, [txs.data]);

  const groups = useMemo(() => Array.from(new Set((cps.data ?? []).map((c: any) => c.group_name).filter(Boolean))) as string[], [cps.data]);
  const services = useMemo(() => Array.from(new Set((cps.data ?? []).map((c: any) => c.service_name).filter(Boolean))) as string[], [cps.data]);

  const visible = (cps.data ?? []).filter((c: any) => {
    if (!filters.showArchived && c.archived) return false;
    if (filters.name && !c.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
    if (filters.notes && !(c.notes ?? "").toLowerCase().includes(filters.notes.toLowerCase())) return false;
    if (filters.group !== "all" && c.group_name !== filters.group) return false;
    if (filters.service !== "all" && c.service_name !== filters.service) return false;
    return true;
  });

  const arch = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const { error } = await supabase.from("counterparties").update({ archived: on }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["counterparties"] }); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("counterparties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["counterparties"] }); toast.success("Supprimé"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Tiers</p>
          <h1 className="mt-1 text-2xl font-semibold">Comptes de tiers</h1>
        </div>
        <div className="flex items-center gap-2">
          <PeriodPicker preset={preset} onPresetChange={setPreset} custom={custom} onCustomChange={setCustom}
            presets={["month","quarter","semester","year","ytd","ltm","custom"]} />
          <AddCpDialog onDone={() => qc.invalidateQueries({ queryKey: ["counterparties"] })} />
        </div>
      </header>

      <Panel title="Filtres">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Nom</Label>
            <Input value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} placeholder="Contient…" /></div>
          <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Notes</Label>
            <Input value={filters.notes} onChange={(e) => setFilters({ ...filters, notes: e.target.value })} placeholder="Contient…" /></div>
          <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Groupe</Label>
            <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={filters.group} onChange={(e) => setFilters({ ...filters, group: e.target.value })}>
              <option value="all">Tous</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select></div>
          <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Prestation</Label>
            <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={filters.service} onChange={(e) => setFilters({ ...filters, service: e.target.value })}>
              <option value="all">Toutes</option>
              {services.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
          <div className="flex items-end"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={filters.showArchived} onChange={(e) => setFilters({ ...filters, showArchived: e.target.checked })} /> Voir archivés</label></div>
        </div>
      </Panel>

      <Panel title={`${visible.length} tiers · période ${fmtDate(period.from)} → ${fmtDate(period.to)}`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nom</th><th className="px-4 py-2">Groupe</th><th className="px-4 py-2">Prestation</th>
                <th className="px-4 py-2 text-right">Entrées</th><th className="px-4 py-2 text-right">Sorties</th><th className="px-4 py-2 text-right">Net</th>
                <th className="px-4 py-2 text-right"># Mvt</th><th className="px-4 py-2">Notes</th><th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c: any) => {
                const s = stats.get(c.id) ?? { in: 0, out: 0, count: 0 };
                const net = s.in - s.out;
                return (
                  <tr key={c.id} className={`border-t border-border/60 ${c.archived ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2 flex items-center gap-2"><Users className="h-3.5 w-3.5 text-muted-foreground" /> {c.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{c.group_name ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{c.service_name ?? "—"}</td>
                    <td className="num px-4 py-2 text-right text-positive">{fmtMoney(s.in)}</td>
                    <td className="num px-4 py-2 text-right text-negative">{fmtMoney(s.out)}</td>
                    <td className={`num px-4 py-2 text-right font-semibold ${net >= 0 ? "text-positive" : "text-negative"}`}>{fmtMoney(net, "MGA", { sign: true })}</td>
                    <td className="num px-4 py-2 text-right text-muted-foreground">{s.count}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground max-w-[240px] truncate" title={c.notes ?? ""}>{c.notes ?? "—"}</td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex justify-end gap-0.5 text-muted-foreground">
                        <button title="Historique" onClick={() => setHistoryOf(c)} className="rounded-sm p-1 hover:bg-muted hover:text-foreground"><HistoryIcon className="h-3.5 w-3.5" /></button>
                        <button title="Modifier" onClick={() => setEditing(c)} className="rounded-sm p-1 hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                        <button title={c.archived ? "Restaurer" : "Archiver"} onClick={() => arch.mutate({ id: c.id, on: !c.archived })} className="rounded-sm p-1 hover:bg-muted hover:text-foreground">{c.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</button>
                        <button title="Supprimer" onClick={() => confirm(`Supprimer « ${c.name} » ?`) && del.mutate(c.id)} className="rounded-sm p-1 hover:bg-muted hover:text-negative"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">Aucun tiers</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {editing && <CpDialog editing={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["counterparties"] }); }} />}
      {historyOf && <HistoryDialog open onOpenChange={(v) => !v && setHistoryOf(null)} title={`Historique · ${historyOf.name}`} column="counterparty_id" sourceKind="counterparty" entityId={historyOf.id} />}
    </div>
  );
}

function AddCpDialog({ onDone }: { onDone: () => void }) { return <CpDialog onDone={onDone} />; }

function CpDialog({ editing, onDone, onClose }: { editing?: any; onDone: () => void; onClose?: () => void }) {
  const [open, setOpen] = useState(!editing ? false : true);
  const [form, setForm] = useState(editing ? {
    name: editing.name, group_name: editing.group_name ?? "", service_name: editing.service_name ?? "", notes: editing.notes ?? "",
  } : { name: "", group_name: "", service_name: "", notes: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        user_id: u.user!.id,
        name: form.name.trim(),
        group_name: form.group_name.trim() || null,
        service_name: form.service_name.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("counterparties").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("counterparties").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Enregistré"); setOpen(false); onClose?.(); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={editing ? true : open} onOpenChange={(v) => { setOpen(v); if (!v) onClose?.(); }}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouveau tiers</Button></DialogTrigger>}
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Modifier le tiers" : "Nouveau tiers"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="space-y-1"><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Groupe</Label><Input value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} placeholder="ex. Famille" /></div>
            <div className="space-y-1"><Label>Prestation</Label><Input value={form.service_name} onChange={(e) => setForm({ ...form, service_name: e.target.value })} placeholder="ex. Loyer" /></div>
          </div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
