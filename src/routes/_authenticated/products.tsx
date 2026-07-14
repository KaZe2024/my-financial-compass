import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Archive, ArchiveRestore, Trash2, StickyNote, Check, X } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { fetchAllRows } from "@/lib/fetch-all";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Prix produits — Personal CFO" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);

  const products = useQuery({
    queryKey: ["products", search, showArchived],
    queryFn: async () => {
      const rows = await fetchAllRows<any>((from, to) => {
        let q = supabase.from("products").select("*").order("name").range(from, to);
        if (search) q = q.ilike("name", `%${search}%`);
        return q;
      });
      return rows.filter((p: any) => showArchived || !p.archived);
    },
  });

  const [selected, setSelected] = useState<string | null>(null);
  const prices = useQuery({
    queryKey: ["product_prices", selected],
    enabled: !!selected,
    queryFn: async () =>
      await fetchAllRows<any>((from, to) =>
        supabase.from("product_prices").select("*").eq("product_id", selected!).order("observed_on", { ascending: false }).range(from, to),
      ),
  });


  const stats = (() => {
    const arr = (prices.data ?? []).map((p: any) => Number(p.unit_price));
    if (!arr.length) return null;
    return { min: Math.min(...arr), max: Math.max(...arr), avg: arr.reduce((s, x) => s + x, 0) / arr.length };
  })();

  const arch = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const { error } = await (supabase as any).from("products").update({ archived: on }).eq("id", id);
      if (error) throw error;
      await logAudit("product", id, on ? "archive" : "restore");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("Mis à jour"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("product_prices").delete().eq("product_id", id);
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      await logAudit("product", id, "delete");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("Produit supprimé"); if (selected) setSelected(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const merge = useMutation({
    mutationFn: async ({ targetId, sourceIds }: { targetId: string; sourceIds: string[] }) => {
      const dedup = sourceIds.filter((id) => id !== targetId);
      if (dedup.length === 0) throw new Error("Sélectionnez au moins deux produits différents");
      // Réaffecter l'historique de prix et les items de listes vers le produit cible
      const { error: e1 } = await (supabase as any).from("product_prices").update({ product_id: targetId }).in("product_id", dedup);
      if (e1) throw e1;
      const { error: e2 } = await (supabase as any).from("shopping_list_items").update({ product_id: targetId }).in("product_id", dedup);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from("products").delete().in("id", dedup);
      if (e3) throw e3;
      for (const id of dedup) await logAudit("product", id, "delete", { merged_into: targetId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product_prices"] });
      setSelectedIds(new Set());
      setMergeOpen(false);
      toast.success("Produits fusionnés");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const selectedList = (products.data ?? []).filter((p: any) => selectedIds.has(p.id));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Catalogue</p>
          <h1 className="mt-1 text-2xl font-semibold">Prix produits</h1>
          <p className="mt-1 text-sm text-muted-foreground">Les produits sont créés automatiquement depuis les listes d'achat. L'historique de prix est en lecture seule.</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size >= 2 && (
            <Button size="sm" onClick={() => setMergeOpen(true)}>Fusionner ({selectedIds.size})</Button>
          )}
          {selectedIds.size > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Effacer sélection</Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowArchived(v => !v)}>{showArchived ? "Masquer" : "Voir"} archivés</Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Panel title="Produits">
          <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" />
          <ul className="scroll-thin max-h-[560px] space-y-1 overflow-y-auto pr-1">
            {(products.data ?? []).map((p: any) => (
              <li key={p.id} className={`flex items-center gap-1 rounded-sm ${selected === p.id ? "bg-muted" : ""} ${p.archived ? "opacity-50" : ""}`}>
                <input type="checkbox" className="ml-1 h-3.5 w-3.5" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} title="Sélectionner pour fusion" />
                <button onClick={() => setSelected(p.id)} className={`flex-1 px-2 py-1.5 text-left text-sm hover:bg-muted rounded-sm ${selected === p.id ? "text-primary" : ""}`}>
                  {p.name} {p.unit ? <span className="text-xs text-muted-foreground">/ {p.unit}</span> : null}
                </button>
                <button title="Modifier" onClick={() => setEditing(p)} className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                <button title={p.archived ? "Restaurer" : "Archiver"} onClick={() => arch.mutate({ id: p.id, on: !p.archived })} className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                  {p.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                </button>
                <button title="Supprimer" onClick={() => confirm(`Supprimer "${p.name}" et son historique de prix ?`) && del.mutate(p.id)} className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-negative">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {(products.data ?? []).length === 0 && <li className="px-2 py-4 text-sm text-muted-foreground">Aucun produit. Ajoutez des articles à une liste d'achat pour peupler le catalogue.</li>}
          </ul>
        </Panel>


        <Panel title={selected ? "Historique de prix (lecture seule)" : "Sélectionnez un produit"}>
          {!selected && <p className="py-10 text-center text-sm text-muted-foreground">Choisissez un produit à gauche.</p>}
          {selected && (
            <>
              {stats && (
                <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
                  <Stat label="Min" value={fmtMoney(stats.min)} />
                  <Stat label="Moy" value={fmtMoney(stats.avg)} />
                  <Stat label="Max" value={fmtMoney(stats.max)} />
                </div>
              )}
              <div className="scroll-thin -mx-4 overflow-x-auto">
                <table className="w-full min-w-[500px] text-sm">
                  <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Fournisseur</th><th className="px-4 py-2 text-right">Prix unit.</th><th className="px-4 py-2">Note</th></tr>
                  </thead>
                  <tbody>
                    {(prices.data ?? []).map((p: any) => (
                      <tr key={p.id} className="border-t border-border/60 align-top">
                        <td className="num px-4 py-1.5 text-muted-foreground">{fmtDate(p.observed_on)}</td>
                        <td className="px-4 py-1.5">{p.supplier ?? "—"}</td>
                        <td className="num px-4 py-1.5 text-right">{fmtMoney(Number(p.unit_price), p.currency)}</td>
                        <td className="px-4 py-1.5"><PriceNoteCell priceId={p.id} initial={p.notes ?? ""} productId={selected!} /></td>
                      </tr>
                    ))}
                    {(prices.data ?? []).length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun achat enregistré.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      </div>

      {editing && <EditProductDialog product={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["products"] }); }} />}

      {mergeOpen && (
        <MergeProductsDialog
          products={selectedList}
          onClose={() => setMergeOpen(false)}
          onMerge={(targetId) => merge.mutate({ targetId, sourceIds: selectedList.map((p: any) => p.id) })}
          pending={merge.isPending}
        />
      )}
    </div>
  );
}

function MergeProductsDialog({ products, onClose, onMerge, pending }: { products: any[]; onClose: () => void; onMerge: (targetId: string) => void; pending: boolean }) {
  const [target, setTarget] = useState<string>(products[0]?.id ?? "");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Fusionner {products.length} produits</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Sélectionnez le produit maître. L'historique de prix et les items de listes des autres seront réaffectés au produit maître, puis les doublons seront supprimés.</p>
          <ul className="space-y-1 max-h-64 overflow-y-auto rounded-md border border-border p-2">
            {products.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <input type="radio" name="mtarget" checked={target === p.id} onChange={() => setTarget(p.id)} />
                <span>{p.name} {p.unit ? <span className="text-xs text-muted-foreground">/ {p.unit}</span> : null}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Annuler</Button>
            <Button disabled={!target || pending} onClick={() => onMerge(target)}>Fusionner</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditProductDialog({ product, onClose, onDone }: { product: any; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: product.name ?? "", unit: product.unit ?? "", notes: product.notes ?? "" });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").update({
        name: form.name, unit: form.unit || null, notes: form.notes || null,
      } as any).eq("id", product.id);
      if (error) throw error;
      await logAudit("product", product.id, "update", { before: { name: product.name, unit: product.unit }, after: form });
    },
    onSuccess: () => { toast.success("Produit mis à jour"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Modifier le produit</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="space-y-1"><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="space-y-1"><Label>Unité</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg, L, pièce…" /></div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-sm border border-border bg-muted/20 p-2"><div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="num text-sm font-semibold">{value}</div></div>;
}

function PriceNoteCell({ priceId, initial, productId }: { priceId: string; initial: string; productId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("product_prices").update({ notes: value || null }).eq("id", priceId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["product_prices", productId] }); toast.success("Note enregistrée"); setEditing(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!editing) {
    return (
      <button onClick={() => { setValue(initial); setEditing(true); }} className="group flex w-full items-start gap-1 rounded-sm px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-muted">
        {initial ? <span className="line-clamp-2">{initial}</span> : <span className="italic opacity-60">Ajouter une note</span>}
        <StickyNote className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-70" />
      </button>
    );
  }
  return (
    <div className="flex items-start gap-1">
      <Textarea autoFocus rows={2} value={value} onChange={(e) => setValue(e.target.value)} className="min-h-[48px] text-xs" />
      <div className="flex flex-col gap-1">
        <button title="Enregistrer" onClick={() => save.mutate()} disabled={save.isPending} className="rounded-sm p-1 text-positive hover:bg-muted"><Check className="h-3.5 w-3.5" /></button>
        <button title="Annuler" onClick={() => setEditing(false)} className="rounded-sm p-1 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
