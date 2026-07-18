import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Refrigerator, GripVertical, Archive, ArchiveRestore } from "lucide-react";
import { fmtDate, toISODate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fridge")({
  head: () => ({ meta: [{ title: "Gestion frigo — Personal CFO" }] }),
  component: FridgePage,
});

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - dow);
  return x;
}

function FridgePage() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<Date>(mondayOf(new Date()));
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [entryEdit, setEntryEdit] = useState<any | null>(null);
  const [dragItem, setDragItem] = useState<any | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ day: number; item: any } | null>(null);
  const [dropQty, setDropQty] = useState<string>("");

  const weekIso = toISODate(weekStart);

  const items = useQuery({
    queryKey: ["fridge_items"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fridge_items")
        .select("*")
        .order("added_on", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const entries = useQuery({
    queryKey: ["meal_plan_entries", weekIso],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("meal_plan_entries")
        .select("*")
        .eq("week_start", weekIso)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const visibleItems = (items.data ?? []).filter((i) => showArchived || !i.archived);

  const addEntry = useMutation({
    mutationFn: async (payload: { day: number; label: string; fridge_item_id: string | null }) => {
      const { data: u } = await supabase.auth.getUser();
      const list = (entries.data ?? []).filter((e) => e.day_of_week === payload.day);
      const nextOrder = list.reduce((m, e) => Math.max(m, e.sort_order ?? 0), 0) + 1;
      const { error } = await (supabase as any).from("meal_plan_entries").insert({
        user_id: u.user!.id,
        week_start: weekIso,
        day_of_week: payload.day,
        slot: "lunch",
        label: payload.label,
        fridge_item_id: payload.fridge_item_id,
        sort_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meal_plan_entries", weekIso] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await (supabase as any).from("meal_plan_entries").update({ label }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meal_plan_entries", weekIso] }); setEntryEdit(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveEntry = useMutation({
    mutationFn: async ({ id, day }: { id: string; day: number }) => {
      const { error } = await (supabase as any).from("meal_plan_entries").update({ day_of_week: day }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meal_plan_entries", weekIso] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const delEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("meal_plan_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meal_plan_entries", weekIso] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const byDay = useMemo(() => {
    const m = new Map<number, any[]>();
    for (const e of entries.data ?? []) {
      const arr = m.get(e.day_of_week) ?? [];
      arr.push(e);
      m.set(e.day_of_week, arr);
    }
    return m;
  }, [entries.data]);

  function shiftWeek(delta: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d);
  }

  function onDropDay(day: number, e: React.DragEvent) {
    e.preventDefault();
    const data = e.dataTransfer.getData("application/json");
    if (!data) return;
    const payload = JSON.parse(data);
    if (payload.kind === "fridge") {
      const item = (items.data ?? []).find((i) => i.id === payload.id);
      if (!item) return;
      // Ouvrir la fenêtre quantité avant d'ajouter et de déduire.
      setPendingDrop({ day, item });
      setDropQty(item.quantity != null ? "1" : "");
    } else if (payload.kind === "entry") {
      moveEntry.mutate({ id: payload.id, day });
    }
    setDragItem(null);
  }

  async function confirmDrop() {
    if (!pendingDrop) return;
    const { day, item } = pendingDrop;
    const qty = dropQty ? Number(dropQty) : null;
    const available = item.quantity != null ? Number(item.quantity) : null;
    if (qty != null && available != null && qty > available) {
      toast.error(`Quantité disponible : ${available} ${item.unit ?? ""}`);
      return;
    }
    const unit = item.unit ? ` ${item.unit}` : "";
    const label = qty != null ? `${item.name} (${qty}${unit})` : item.name;
    await addEntry.mutateAsync({ day, label, fridge_item_id: item.id });
    if (qty != null && available != null) {
      const remaining = Math.max(0, available - qty);
      const { error } = await (supabase as any).from("fridge_items").update({ quantity: remaining }).eq("id", item.id);
      if (error) toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["fridge_items"] });
    }
    setPendingDrop(null);
    setDropQty("");
  }


  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Planification</p>
          <h1 className="mt-1 text-2xl font-semibold">Gestion frigo</h1>
          <p className="text-xs text-muted-foreground">Glissez les items du frigo vers les jours de la semaine.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => shiftWeek(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="font-mono text-xs text-muted-foreground min-w-[180px] text-center">
            {fmtDate(toISODate(weekStart))} → {fmtDate(toISODate(weekEnd))}
          </div>
          <Button variant="ghost" size="icon" onClick={() => shiftWeek(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(mondayOf(new Date()))}>Cette semaine</Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <Panel title="Contenu du frigo" action={
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setShowArchived(v => !v)}>{showArchived ? "Masquer" : "Voir"} archivés</Button>
            <FridgeItemDialog onDone={() => qc.invalidateQueries({ queryKey: ["fridge_items"] })} />
          </div>
        }>
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto scroll-thin">
            {visibleItems.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Aucun item</p>}
            {visibleItems.map((it) => {
              const outOfStock = it.quantity != null && Number(it.quantity) <= 0;
              return (
              <div
                key={it.id}
                draggable={!it.archived && !outOfStock}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/json", JSON.stringify({ kind: "fridge", id: it.id }));
                  setDragItem(it);
                }}
                onDragEnd={() => setDragItem(null)}
                className={`group flex items-center gap-2 rounded-sm border border-border bg-card px-2 py-1.5 text-sm ${it.archived || outOfStock ? "opacity-60" : "cursor-grab hover:border-primary/40"} ${dragItem?.id === it.id ? "opacity-40" : ""}`}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate flex items-center gap-1.5">
                    <span className="truncate">{it.name}</span>
                    {outOfStock && !it.archived && (
                      <span className="rounded-sm bg-negative/15 text-negative px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider">Stock épuisé</span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {it.quantity != null ? `${it.quantity} ${it.unit ?? ""}` : ""}
                    {it.expires_on ? ` · exp. ${fmtDate(it.expires_on)}` : ""}
                  </div>
                </div>
                <div className="flex opacity-0 group-hover:opacity-100 transition">
                  <button title="Modifier" onClick={() => setEditing(it)} className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                  <button title={it.archived ? "Restaurer" : "Archiver"} onClick={() => toggleArchive(it, qc)} className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    {it.archived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
                  </button>
                  <button title="Supprimer" onClick={() => { if (confirm(`Supprimer « ${it.name} » ?`)) deleteItem(it.id, qc); }} className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-negative"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
              );
            })}
          </div>
        </Panel>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-7">
          {DAYS.map((d, idx) => {
            const dayEntries = byDay.get(idx) ?? [];
            const date = new Date(weekStart);
            date.setDate(date.getDate() + idx);
            return (
              <div
                key={d}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropDay(idx, e)}
                className="min-h-[240px] rounded-md border border-border bg-card/50 p-2 flex flex-col"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold">{d}</div>
                    <div className="font-mono text-[9px] uppercase text-muted-foreground">{date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</div>
                  </div>
                  <button
                    title="Ajouter"
                    onClick={() => {
                      const label = prompt(`Repas pour ${d} :`);
                      if (label && label.trim()) addEntry.mutate({ day: idx, label: label.trim(), fridge_item_id: null });
                    }}
                    className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  ><Plus className="h-3.5 w-3.5" /></button>
                </div>
                <div className="space-y-1 flex-1">
                  {dayEntries.map((ent) => (
                    <div
                      key={ent.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ kind: "entry", id: ent.id }))}
                      className="group flex items-center gap-1 rounded-sm border border-border/60 bg-background px-2 py-1 text-xs cursor-grab hover:border-primary/40"
                    >
                      {ent.fridge_item_id && <Refrigerator className="h-3 w-3 text-primary shrink-0" />}
                      <span className="flex-1 truncate">{ent.label || "(sans nom)"}</span>
                      <button onClick={() => setEntryEdit(ent)} className="opacity-0 group-hover:opacity-100 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => delEntry.mutate(ent.id)} className="opacity-0 group-hover:opacity-100 rounded-sm p-0.5 text-muted-foreground hover:text-negative"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                  {dayEntries.length === 0 && <div className="py-4 text-center text-[10px] text-muted-foreground/60 border border-dashed border-border/40 rounded-sm">Glisser ici</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && <FridgeItemDialog editingItem={editing} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["fridge_items"] }); }} onClose={() => setEditing(null)} />}
      {entryEdit && (
        <Dialog open onOpenChange={(v) => !v && setEntryEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Modifier le repas</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); updateEntry.mutate({ id: entryEdit.id, label: String(f.get("label") ?? "") }); }}>
              <Input name="label" defaultValue={entryEdit.label} autoFocus />
              <DialogFooter className="mt-3"><Button type="submit">Enregistrer</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {pendingDrop && (
        <Dialog open onOpenChange={(v) => { if (!v) { setPendingDrop(null); setDropQty(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajouter au {DAYS[pendingDrop.day]} — {pendingDrop.item.name}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); confirmDrop(); }} className="space-y-3">
              <div className="text-xs text-muted-foreground">
                {pendingDrop.item.quantity != null
                  ? <>Disponible dans le frigo : <span className="font-mono text-foreground">{pendingDrop.item.quantity} {pendingDrop.item.unit ?? ""}</span></>
                  : <>Aucune quantité renseignée sur l'item — la déduction sera ignorée.</>}
              </div>
              {pendingDrop.item.quantity != null && (
                <div className="space-y-1">
                  <Label>Quantité utilisée{pendingDrop.item.unit ? ` (${pendingDrop.item.unit})` : ""}</Label>
                  <Input type="number" step="any" min="0" max={pendingDrop.item.quantity} value={dropQty} onChange={(e) => setDropQty(e.target.value)} autoFocus required />
                </div>
              )}
              <DialogFooter>
                <Button variant="ghost" type="button" onClick={() => { setPendingDrop(null); setDropQty(""); }}>Annuler</Button>
                <Button type="submit">Confirmer</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

async function toggleArchive(it: any, qc: any) {
  const { error } = await (supabase as any).from("fridge_items").update({ archived: !it.archived }).eq("id", it.id);
  if (error) return toast.error(error.message);
  qc.invalidateQueries({ queryKey: ["fridge_items"] });
}

async function deleteItem(id: string, qc: any) {
  const { error } = await (supabase as any).from("fridge_items").delete().eq("id", id);
  if (error) return toast.error(error.message);
  qc.invalidateQueries({ queryKey: ["fridge_items"] });
}

function FridgeItemDialog({ editingItem, onDone, onClose }: { editingItem?: any; onDone: () => void; onClose?: () => void }) {
  const [open, setOpen] = useState(!!editingItem);
  const [form, setForm] = useState({
    name: editingItem?.name ?? "",
    quantity: editingItem?.quantity != null ? String(editingItem.quantity) : "",
    unit: editingItem?.unit ?? "",
    added_on: editingItem?.added_on ?? toISODate(new Date()),
    expires_on: editingItem?.expires_on ?? "",
    notes: editingItem?.notes ?? "",
  });

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload: any = {
        user_id: u.user!.id,
        name: form.name.trim(),
        quantity: form.quantity ? Number(form.quantity) : null,
        unit: form.unit || null,
        added_on: form.added_on || toISODate(new Date()),
        expires_on: form.expires_on || null,
        notes: form.notes || null,
      };
      if (editingItem) {
        const { error } = await (supabase as any).from("fridge_items").update(payload).eq("id", editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("fridge_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editingItem ? "Mis à jour" : "Ajouté"); setOpen(false); onClose?.(); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={editingItem ? true : open} onOpenChange={(v) => { setOpen(v); if (!v) onClose?.(); }}>
      {!editingItem && <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" /> Item</Button></DialogTrigger>}
      <DialogContent>
        <DialogHeader><DialogTitle>{editingItem ? "Modifier l'item" : "Nouvel item du frigo"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="space-y-1"><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Quantité</Label><Input type="number" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
            <div className="space-y-1"><Label>Unité</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg, L, pièce..." /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Date d'ajout</Label><DatePicker value={form.added_on} onChange={(v) => setForm({ ...form, added_on: v })} /></div>
            <div className="space-y-1"><Label>Expiration</Label><DatePicker value={form.expires_on} onChange={(v) => setForm({ ...form, expires_on: v })} /></div>
          </div>
          <div className="space-y-1"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
