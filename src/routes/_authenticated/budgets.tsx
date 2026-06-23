import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronRight, ChevronDown, Plus, Pencil, Trash2, Archive, ArchiveRestore,
  ArrowUp, ArrowDown, Search, FolderTree,
} from "lucide-react";
import { profileQO, budgetNodesQO } from "@/lib/queries";
import { buildTree, flattenTree, pathLabel, type TreeNode } from "@/lib/budget-nodes";
import { fmtMoney, fmtPct, monthStart, toISODate } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/budgets")({
  head: () => ({ meta: [{ title: "Budgets — Personal CFO" }] }),
  component: BudgetsPage,
});

function monthsFor(viewMonth: Date, view: "month" | "quarter" | "year"): string[] {
  const out: string[] = [];
  const start = new Date(viewMonth);
  start.setDate(1);
  if (view === "month") return [toISODate(start)];
  const count = view === "quarter" ? 3 : 12;
  // Anchor: month for "month", quarter start for "quarter", year start for "year"
  if (view === "quarter") {
    const q = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(q);
  } else {
    start.setMonth(0);
  }
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    out.push(toISODate(d));
  }
  return out;
}

function BudgetsPage() {
  const qc = useQueryClient();
  const profile = useQuery(profileQO);
  const nodesQ = useQuery(budgetNodesQO);
  const cur = profile.data?.base_currency ?? "MGA";

  const [anchorMonth, setAnchorMonth] = useState<string>(toISODate(monthStart()));
  const [view, setView] = useState<"month" | "quarter" | "year">("month");
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<TreeNode | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<{ parent: TreeNode | null } | null>(null);
  const [amountFor, setAmountFor] = useState<TreeNode | null>(null);

  const months = useMemo(() => monthsFor(new Date(anchorMonth), view), [anchorMonth, view]);
  const monthStartISO = months[0]!;
  const monthEndExclusive = months[months.length - 1]!;

  const amounts = useQuery({
    queryKey: ["bna", monthStartISO, monthEndExclusive],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_node_amounts")
        .select("*")
        .gte("period_month", monthStartISO)
        .lte("period_month", monthEndExclusive);
      if (error) throw error;
      return data ?? [];
    },
  });

  const spend = useQuery({
    queryKey: ["nodespend-roll", monthStartISO, monthEndExclusive],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_node_spend_rollup")
        .select("*")
        .gte("month", monthStartISO)
        .lte("month", monthEndExclusive);
      if (error) throw error;
      return data ?? [];
    },
  });

  const directSpend = useQuery({
    queryKey: ["nodespend", monthStartISO, monthEndExclusive],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_node_spend")
        .select("*")
        .gte("month", monthStartISO)
        .lte("month", monthEndExclusive);
      if (error) throw error;
      return data ?? [];
    },
  });

  const tree = useMemo(() => {
    const visible = (nodesQ.data ?? []).filter((n) => showArchived || !n.archived);
    return buildTree(visible);
  }, [nodesQ.data, showArchived]);

  // Aggregate planned per node across the visible window (sum of months)
  const plannedByNode = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of amounts.data ?? []) {
      const v = Number(a.revised ?? a.planned ?? 0);
      m.set(a.node_id, (m.get(a.node_id) ?? 0) + v);
    }
    return m;
  }, [amounts.data]);

  const spentRollupByNode = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of spend.data ?? []) {
      if (!r.node_id) continue;
      m.set(r.node_id, (m.get(r.node_id) ?? 0) + Number(r.spent_rollup));
    }
    return m;
  }, [spend.data]);

  const directSpendByNode = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of directSpend.data ?? []) {
      if (!r.node_id) continue;
      m.set(r.node_id, (m.get(r.node_id) ?? 0) + Number(r.spent));
    }
    return m;
  }, [directSpend.data]);

  // Planned rollup = planned of self + planned of all descendants
  const plannedRollupByNode = useMemo(() => {
    const out = new Map<string, number>();
    function compute(n: TreeNode): number {
      let total = plannedByNode.get(n.id) ?? 0;
      for (const c of n.children) total += compute(c);
      out.set(n.id, total);
      return total;
    }
    for (const root of tree) compute(root);
    return out;
  }, [tree, plannedByNode]);

  // Filter by search
  const flat = useMemo(() => flattenTree(tree), [tree]);
  const matchedIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return new Set(flat.filter((n) => pathLabel(n).toLowerCase().includes(q)).map((n) => n.id));
  }, [search, flat]);

  // Totals (roots only to avoid double counting)
  const totals = useMemo(() => {
    let planned = 0;
    let spent = 0;
    for (const root of tree) {
      planned += plannedRollupByNode.get(root.id) ?? 0;
      spent += spentRollupByNode.get(root.id) ?? 0;
    }
    return { planned, spent };
  }, [tree, plannedRollupByNode, spentRollupByNode]);

  const totalPct = totals.planned > 0 ? (totals.spent / totals.planned) * 100 : 0;
  const variance = totals.planned - totals.spent;

  // Mutations
  const createNode = useMutation({
    mutationFn: async (input: { name: string; parent_id: string | null; is_income: boolean }) => {
      const { data: u } = await supabase.auth.getUser();
      const siblings = (nodesQ.data ?? []).filter((n) => n.parent_id === input.parent_id);
      const sort_order = (siblings.reduce((max, n) => Math.max(max, n.sort_order), -1) + 1);
      const { error } = await supabase.from("budget_nodes").insert({
        user_id: u.user!.id, name: input.name.trim(), parent_id: input.parent_id, is_income: input.is_income, sort_order,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Node créé"); qc.invalidateQueries({ queryKey: ["budget_nodes"] }); setCreatingUnder(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateNode = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<import("@/lib/budget-nodes").BudgetNode> }) => {
      const { error } = await supabase.from("budget_nodes").update(input.patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["budget_nodes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNode = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budget_nodes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Supprimé"); qc.invalidateQueries({ queryKey: ["budget_nodes"] }); qc.invalidateQueries({ queryKey: ["bna"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggle(id: string) { setExpanded((s) => ({ ...s, [id]: !s[id] })); }
  function expandAll() { const all: Record<string, boolean> = {}; for (const n of flat) all[n.id] = true; setExpanded(all); }
  function collapseAll() { setExpanded({}); }

  function move(node: TreeNode, dir: -1 | 1) {
    const siblings = (nodesQ.data ?? []).filter((n) => n.parent_id === node.parent_id).sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.findIndex((n) => n.id === node.id);
    const target = siblings[idx + dir];
    if (!target) return;
    updateNode.mutate({ id: node.id, patch: { sort_order: target.sort_order } });
    updateNode.mutate({ id: target.id, patch: { sort_order: node.sort_order } });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Planification</p>
          <h1 className="mt-1 text-2xl font-semibold">Budgets · Arborescence</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={view} onValueChange={(v) => setView(v as typeof view)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Mensuel</SelectItem>
              <SelectItem value="quarter">Trimestriel</SelectItem>
              <SelectItem value="year">Annuel</SelectItem>
            </SelectContent>
          </Select>
          <Input type="month" value={anchorMonth.slice(0, 7)} onChange={(e) => setAnchorMonth(`${e.target.value}-01`)} className="w-40" />
          <Button onClick={() => setCreatingUnder({ parent: null })}><Plus className="mr-2 h-4 w-4" /> Racine</Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Planifié" value={fmtMoney(totals.planned, cur)} />
        <Stat label="Dépensé" value={fmtMoney(totals.spent, cur)} />
        <Stat label="Consommation" value={fmtPct(totalPct)} tone={totalPct > 100 ? "negative" : totalPct > 75 ? "warning" : "positive"} />
        <Stat label="Variance" value={fmtMoney(variance, cur)} tone={variance >= 0 ? "positive" : "negative"} />
      </section>

      <Panel
        title={`Arbre · ${flat.length} nodes${view !== "month" ? ` · ${months.length} mois` : ""}`}
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="h-8 w-44 pl-7 text-xs" />
            </div>
            <Button variant="ghost" size="sm" onClick={expandAll}>Déplier</Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>Replier</Button>
            <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              archivés
            </label>
          </div>
        }
      >
        {tree.length === 0 ? (
          <div className="py-10 text-center">
            <FolderTree className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Aucun budget. Créez une branche racine pour démarrer.</p>
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Node</th>
                  <th className="px-4 py-2 text-right">Planifié</th>
                  <th className="px-4 py-2 text-right">Dépensé</th>
                  <th className="px-4 py-2 text-right w-24">%</th>
                  <th className="px-4 py-2 text-right">Variance</th>
                  <th className="px-4 py-2 w-44 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tree.map((n) => (
                  <Row
                    key={n.id}
                    node={n}
                    cur={cur}
                    expanded={expanded}
                    matchedIds={matchedIds}
                    toggle={toggle}
                    onAddChild={(p) => setCreatingUnder({ parent: p })}
                    onEdit={setEditing}
                    onDelete={(id) => { if (confirm("Supprimer ce node et tous ses enfants ?")) deleteNode.mutate(id); }}
                    onArchive={(node, val) => updateNode.mutate({ id: node.id, patch: { archived: val } })}
                    onMove={move}
                    onAmount={setAmountFor}
                    plannedRollup={plannedRollupByNode}
                    plannedDirect={plannedByNode}
                    spentRollup={spentRollupByNode}
                    spentDirect={directSpendByNode}
                    maxDepth={2}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <CreateDialog
        open={!!creatingUnder}
        onOpenChange={(v) => !v && setCreatingUnder(null)}
        parent={creatingUnder?.parent ?? null}
        onSubmit={(name, isIncome) => createNode.mutate({ name, parent_id: creatingUnder?.parent?.id ?? null, is_income: isIncome })}
        pending={createNode.isPending}
      />
      <EditDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        node={editing}
        onSubmit={(patch) => editing && updateNode.mutate({ id: editing.id, patch }, { onSuccess: () => { toast.success("Mis à jour"); setEditing(null); } })}
        pending={updateNode.isPending}
      />
      <AmountDialog
        open={!!amountFor}
        onOpenChange={(v) => !v && setAmountFor(null)}
        node={amountFor}
        months={months}
        amounts={amounts.data ?? []}
        onDone={() => { qc.invalidateQueries({ queryKey: ["bna"] }); setAmountFor(null); }}
        cur={cur}
      />
    </div>
  );
}

function Row({
  node, cur, expanded, matchedIds, toggle, onAddChild, onEdit, onDelete, onArchive, onMove, onAmount,
  plannedRollup, plannedDirect, spentRollup, spentDirect, maxDepth = 2,
}: {
  node: TreeNode; cur: string;
  expanded: Record<string, boolean>;
  matchedIds: Set<string> | null;
  toggle: (id: string) => void;
  onAddChild: (n: TreeNode | null) => void;
  onEdit: (n: TreeNode) => void;
  onDelete: (id: string) => void;
  onArchive: (n: TreeNode, val: boolean) => void;
  onMove: (n: TreeNode, dir: -1 | 1) => void;
  onAmount: (n: TreeNode) => void;
  plannedRollup: Map<string, number>;
  plannedDirect: Map<string, number>;
  spentRollup: Map<string, number>;
  spentDirect: Map<string, number>;
  maxDepth?: number;
}) {
  // Match filter: render only if self or any descendant matches
  if (matchedIds && !matchedIds.has(node.id)) {
    const anyDesc = node.children.some((c) => subtreeHasMatch(c, matchedIds));
    if (!anyDesc) return null;
  }
  const isOpen = expanded[node.id] ?? !!matchedIds; // expand all when searching
  const planned = node.childCount > 0 ? (plannedRollup.get(node.id) ?? 0) : (plannedDirect.get(node.id) ?? 0);
  const spent = node.childCount > 0 ? (spentRollup.get(node.id) ?? 0) : (spentDirect.get(node.id) ?? 0);
  const pct = planned > 0 ? (spent / planned) * 100 : 0;
  const variance = planned - spent;
  const toneBar = pct >= 100 ? "bg-negative" : pct >= 90 ? "bg-warning" : pct >= 75 ? "bg-accent" : "bg-primary";
  const canAddChild = node.depth < maxDepth;
  const isLocked = node.childCount > 0;
  const levelLabel = node.depth === 0 ? "Ligne" : node.depth === 1 ? "Catégorie" : "Sous-cat.";

  return (
    <>
      <tr className={cn("border-t border-border/60 hover:bg-muted/40", node.archived && "opacity-50")}>
        <td className="px-4 py-2">
          <div className="flex items-center gap-1" style={{ paddingLeft: node.depth * 18 }}>
            {node.childCount > 0 ? (
              <button onClick={() => toggle(node.id)} className="text-muted-foreground hover:text-foreground">
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : <span className="inline-block w-3.5" />}
            <span className={cn("font-medium", node.is_income && "text-positive")}>{node.name}</span>
            <span className="ml-1.5 rounded-sm bg-muted/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{levelLabel}</span>
            {node.childCount > 0 && (
              <span className="ml-1 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{node.childCount}</span>
            )}
            {isLocked && (
              <span className="ml-1 rounded-sm bg-warning/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-warning" title="Montant calculé = somme des enfants">∑</span>
            )}
            {node.archived && <span className="ml-1.5 font-mono text-[9px] uppercase text-muted-foreground">archivé</span>}
          </div>
        </td>
        <td className="num px-4 py-2 text-right">{fmtMoney(planned, cur)}</td>
        <td className="num px-4 py-2 text-right">{fmtMoney(spent, cur)}</td>
        <td className="px-4 py-2 text-right">
          {planned > 0 ? (
            <div className="ml-auto w-20">
              <div className="text-right text-[10px] text-muted-foreground">{fmtPct(pct)}</div>
              <div className="mt-0.5 h-1 rounded-sm bg-muted">
                <div className={cn("h-full rounded-sm", toneBar)} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </div>
          ) : <span className="text-muted-foreground">—</span>}
        </td>
        <td className={cn("num px-4 py-2 text-right", variance < 0 ? "text-negative" : "text-positive")}>
          {planned > 0 ? fmtMoney(variance, cur) : "—"}
        </td>
        <td className="px-4 py-2">
          <div className="flex justify-end gap-0.5 text-muted-foreground">
            <IconBtn title="Monter" onClick={() => onMove(node, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
            <IconBtn title="Descendre" onClick={() => onMove(node, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
            <IconBtn
              title={isLocked ? "Verrouillé · somme des enfants" : "Montant mensuel"}
              onClick={() => { if (isLocked) { toast.info("Montant calculé automatiquement à partir des sous-éléments"); return; } onAmount(node); }}
            >
              <span className={cn("font-mono text-[10px]", isLocked && "opacity-40")}>$</span>
            </IconBtn>
            {canAddChild ? (
              <IconBtn title="Ajouter enfant" onClick={() => onAddChild(node)}><Plus className="h-3.5 w-3.5" /></IconBtn>
            ) : <span className="inline-block w-6" />}
            <IconBtn title="Modifier" onClick={() => onEdit(node)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
            <IconBtn title={node.archived ? "Désarchiver" : "Archiver"} onClick={() => onArchive(node, !node.archived)}>
              {node.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </IconBtn>
            <IconBtn title="Supprimer" onClick={() => onDelete(node.id)} hoverClass="hover:text-negative"><Trash2 className="h-3.5 w-3.5" /></IconBtn>
          </div>
        </td>
      </tr>
      {isOpen && node.children.map((c) => (
        <Row
          key={c.id}
          node={c}
          cur={cur}
          expanded={expanded}
          matchedIds={matchedIds}
          toggle={toggle}
          onAddChild={onAddChild}
          onEdit={onEdit}
          onDelete={onDelete}
          onArchive={onArchive}
          onMove={onMove}
          onAmount={onAmount}
          plannedRollup={plannedRollup}
          plannedDirect={plannedDirect}
          spentRollup={spentRollup}
          spentDirect={spentDirect}
          maxDepth={maxDepth}
        />
      ))}
    </>
  );
}

function subtreeHasMatch(n: TreeNode, ids: Set<string>): boolean {
  if (ids.has(n.id)) return true;
  return n.children.some((c) => subtreeHasMatch(c, ids));
}

function IconBtn({ children, onClick, title, hoverClass }: { children: React.ReactNode; onClick: () => void; title: string; hoverClass?: string }) {
  return (
    <button title={title} onClick={onClick} className={cn("rounded-sm p-1 hover:bg-muted hover:text-foreground", hoverClass)}>
      {children}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" | "warning" }) {
  const c = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : tone === "warning" ? "text-warning" : "";
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className={`num mt-2 text-xl font-semibold ${c}`}>{value}</div>
    </div>
  );
}

function CreateDialog({ open, onOpenChange, parent, onSubmit, pending }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  parent: TreeNode | null;
  onSubmit: (name: string, isIncome: boolean) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [isIncome, setIsIncome] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) { setName(""); setIsIncome(parent?.is_income ?? false); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{parent ? `Nouveau sous-node de « ${parent.name} »` : "Nouveau node racine"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit(name, isIncome); }} className="space-y-3">
          <div className="space-y-1.5"><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isIncome} onChange={(e) => setIsIncome(e.target.checked)} />
            Branche de revenu
          </label>
          <DialogFooter><Button type="submit" disabled={pending}>Créer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ open, onOpenChange, node, onSubmit, pending }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  node: TreeNode | null;
  onSubmit: (patch: Partial<import("@/lib/budget-nodes").BudgetNode>) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [isIncome, setIsIncome] = useState(false);
  useMemoSetter(node, (n) => { setName(n.name); setColor(n.color ?? ""); setIsIncome(n.is_income); });
  if (!node) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Modifier « {node.name} »</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ name: name.trim(), color: color || null, is_income: isIncome }); }} className="space-y-3">
          <div className="space-y-1.5"><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label>Couleur (hex)</Label><Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#10b981" /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isIncome} onChange={(e) => setIsIncome(e.target.checked)} />
            Branche de revenu
          </label>
          <DialogFooter><Button type="submit" disabled={pending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function useMemoSetter<T>(value: T | null, fn: (v: T) => void) {
  useEffect(() => { if (value) fn(value); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [value]);
}

function AmountDialog({ open, onOpenChange, node, months, amounts, onDone, cur }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  node: TreeNode | null; months: string[]; amounts: any[]; onDone: () => void; cur: string;
}) {
  const qc = useQueryClient();
  const initial: Record<string, { planned: string; revised: string }> = {};
  for (const m of months) {
    const row = amounts.find((a) => a.node_id === node?.id && a.period_month === m);
    initial[m] = { planned: row ? String(row.planned) : "0", revised: row?.revised != null ? String(row.revised) : "" };
  }
  const [vals, setVals] = useState(initial);
  useMemoSetter(node, () => setVals(initial));

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const rows = months.map((m) => ({
        user_id: u.user!.id,
        node_id: node!.id,
        period_month: m,
        planned: Number(vals[m]?.planned || 0),
        revised: vals[m]?.revised === "" ? null : Number(vals[m]!.revised),
      }));
      const { error } = await supabase.from("budget_node_amounts").upsert(rows, { onConflict: "node_id,period_month" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Montants enregistrés"); qc.invalidateQueries({ queryKey: ["bna"] }); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!node) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Montants · {pathLabel(node)} <span className="ml-2 font-mono text-[10px] text-muted-foreground">{cur}</span></DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
          <div className="scroll-thin max-h-[50vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="py-2">Mois</th><th className="py-2">Planifié</th><th className="py-2">Révisé</th></tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m} className="border-t border-border/60">
                    <td className="py-1.5 pr-3 font-mono text-xs">{m.slice(0, 7)}</td>
                    <td className="py-1.5 pr-3">
                      <Input type="number" step="any" value={vals[m]?.planned ?? "0"} onChange={(e) => setVals((s) => ({ ...s, [m]: { ...s[m], planned: e.target.value } }))} className="h-8" />
                    </td>
                    <td className="py-1.5">
                      <Input type="number" step="any" value={vals[m]?.revised ?? ""} placeholder="—" onChange={(e) => setVals((s) => ({ ...s, [m]: { ...s[m], revised: e.target.value } }))} className="h-8" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter><Button type="submit" disabled={save.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
