import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { supabaseOffline as supabase } from "@/lib/offline/client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Target } from "lucide-react";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { toast } from "sonner";
import { RowActions } from "./assets";
import { NodePicker } from "@/components/node-picker";
import { budgetNodesQO, walletsQO } from "@/lib/queries";
import {
  computeGoalProgress, GOAL_TYPE_LABELS, GOAL_TYPES_NEED_NODE, GOAL_TYPES_NEED_PERIOD,
  type GoalType, type ProgressInput,
} from "@/lib/goal-progress";
import { logAudit } from "@/lib/audit";
import { fetchAllRows } from "@/lib/fetch-all";

export const Route = createFileRoute("/_authenticated/goals")({
  head: () => ({ meta: [{ title: "Objectifs — OPTIS" }] }),
  component: GoalsPage,
});

const PERIOD_SCOPES: Array<{ v: string; l: string }> = [
  { v: "mtd", l: "Mois en cours" },
  { v: "qtd", l: "Trimestre en cours" },
  { v: "ytd", l: "Année en cours" },
  { v: "ltm", l: "12 derniers mois" },
  { v: "all_time", l: "Tout l'historique" },
  { v: "custom", l: "Personnalisée" },
];

function useProgressData() {
  const wallets = useQuery(walletsQO);
  const nodesQ = useQuery(budgetNodesQO);
  const txs = useQuery({
    queryKey: ["tx", "for-goals"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) =>
        supabase.from("transactions").select("type, wallet_id, to_wallet_id, amount, base_amount, exchange_rate, occurred_on, budget_node_id").range(from, to),
      ),
  });

  const debts = useQuery({
    queryKey: ["debts", "all-for-goals"],
    queryFn: async () => (await supabase.from("debts").select("original_amount, outstanding, status")).data ?? [],
  });
  const assets = useQuery({
    queryKey: ["assets", "all-for-goals"],
    queryFn: async () => (await supabase.from("assets").select("id, purchase_value, current_value, status, archived")).data ?? [],
  });
  const assetEvents = useQuery({
    queryKey: ["asset_events", "all-for-goals"],
    queryFn: async () =>
      await fetchAllRows<any>((from, to) =>
        supabase.from("asset_events").select("asset_id, event_type, amount, event_date, event_month").range(from, to),
      ),
  });
  const rec = useQuery({
    queryKey: ["rec", "all-for-goals"],
    queryFn: async () => (await supabase.from("receivables").select("outstanding, status")).data ?? [],
  });
  const data: ProgressInput = {
    txs: (txs.data as any) ?? [],
    wallets: (wallets.data as any) ?? [],
    debts: (debts.data as any) ?? [],
    assets: (assets.data as any) ?? [],
    assetEvents: (assetEvents.data as any) ?? [],
    receivables: (rec.data as any) ?? [],
    nodes: (nodesQ.data as any) ?? [],
  };
  return { data, nodes: nodesQ.data ?? [] };
}

function GoalsPage() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const { data: progressData, nodes } = useProgressData();
  const goals = useQuery({
    queryKey: ["goals"],
    queryFn: async () => (await supabase.from("financial_goals").select("*").order("target_date", { nullsFirst: false })).data ?? [],
  });
  const [editing, setEditing] = useState<any | null>(null);
  const syncedRef = useRef<string>("");

  // Progression + statut dérivé pour chaque objectif (source de vérité unique).
  const rows = useMemo(() => {
    return (goals.data ?? []).map((g: any) => {
      const p = computeGoalProgress(g, progressData);
      return { goal: g, progress: p, status: deriveGoalStatus(g, p) };
    });
  }, [goals.data, progressData]);

  const visible = rows.filter((r) => showArchived || !r.goal.archived);
  const achievedCount = rows.filter((r) => !r.goal.archived && r.status === "achieved").length;
  const trackedCount = rows.filter((r) => !r.goal.archived).length;

  // Persistance fiable de current_amount + status : une passe, attendue, puis rafraîchie.
  useEffect(() => {
    if (!goals.data || !goals.data.length) return;
    if (!progressData.wallets.length && !progressData.txs.length) return;

    const stale = rows.filter(
      (r) =>
        Math.abs(Number(r.goal.current_amount ?? 0) - r.progress.current) > 0.5 ||
        (r.goal.status ?? "active") !== r.status,
    );
    if (!stale.length) return;

    const signature = stale.map((r) => `${r.goal.id}:${Math.round(r.progress.current)}:${r.status}`).join("|");
    if (syncedRef.current === signature) return;
    syncedRef.current = signature;

    (async () => {
      const results = await Promise.all(
        stale.map((r) =>
          supabase
            .from("financial_goals")
            .update({ current_amount: r.progress.current, status: r.status } as any)
            .eq("id", r.goal.id),
        ),
      );
      const failed = results.filter((res: any) => res?.error);
      if (failed.length) {
        console.warn("[goals] sync failed", failed.map((f: any) => f.error?.message));
        return;
      }
      qc.invalidateQueries({ queryKey: ["goals"] });
    })();
  }, [goals.data, progressData, rows, qc]);

  const setPaused = useMutation({
    mutationFn: async ({ id, paused }: { id: string; paused: boolean }) => {
      const { error } = await supabase
        .from("financial_goals")
        .update({ status: paused ? "paused" : "active" } as any)
        .eq("id", id);
      if (error) throw error;
      await logAudit("goal", id, "update", { status: paused ? "paused" : "active" });
    },
    onSuccess: () => {
      syncedRef.current = "";
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Planification</p>
          <h1 className="mt-1 text-2xl font-semibold">Objectifs financiers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            La progression et le statut sont calculés automatiquement à partir de vos transactions et données réelles.
          </p>
          {trackedCount > 0 && (
            <p className="num mt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {achievedCount} atteint{achievedCount > 1 ? "s" : ""} sur {trackedCount}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Masquer" : "Voir"} archivés</Button>
          <GoalDialog nodes={nodes as any} onDone={() => qc.invalidateQueries({ queryKey: ["goals"] })} />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {visible.map(({ goal: g, progress: p, status }) => {
          const typeLabel = GOAL_TYPE_LABELS[(g.goal_type ?? "savings_balance") as GoalType];
          return (
            <div key={g.id} className={`rounded-md border border-border bg-card p-4 ${g.archived ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" /> {g.name}</div>
                <RowActions table="financial_goals" id={g.id} archived={g.archived} onEdit={() => setEditing(g)} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{typeLabel}</span>
                <GoalStatusBadge status={status} />
              </div>
              <div className="num mt-3 text-2xl font-semibold">
                {g.goal_type === "savings_rate" ? fmtPct(p.current) : fmtMoney(p.current, g.currency)}
              </div>
              <div className="num text-xs text-muted-foreground">
                {p.inverse ? "vers ≤ " : "sur "} {g.goal_type === "savings_rate" ? fmtPct(p.target) : fmtMoney(p.target, g.currency)} · {fmtPct(p.pct)}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full ${status === "achieved" ? "bg-positive" : p.inverse ? "bg-warning" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, p.pct)}%` }}
                />
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">{p.label}</div>
              <div className="mt-2 flex items-center justify-between gap-2">
                {g.target_date ? <div className="text-xs text-muted-foreground">Échéance · {fmtDate(g.target_date)}</div> : <span />}
                {!g.archived && (
                  <button
                    type="button"
                    disabled={setPaused.isPending}
                    onClick={() => setPaused.mutate({ id: g.id, paused: status !== "paused" })}
                    className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                  >
                    {status === "paused" ? "Reprendre" : "Mettre en pause"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <Panel title="Démarrer" className="md:col-span-2 lg:col-span-3">
            <p className="py-8 text-center text-sm text-muted-foreground">Définissez un objectif : fonds d'urgence, valeur nette, plafond de dépense, taux d'épargne…</p>
          </Panel>
        )}
      </div>

      {editing && <GoalDialog editing={editing} nodes={nodes as any} onClose={() => setEditing(null)} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["goals"] }); }} />}
    </div>
  );
}

function GoalStatusBadge({ status }: { status: GoalStatus }) {
  const tone = GOAL_STATUS_TONE[status];
  const cls =
    tone === "positive" ? "bg-positive/15 text-positive"
    : tone === "warning" ? "bg-warning/15 text-warning"
    : tone === "negative" ? "bg-negative/15 text-negative"
    : "bg-primary/15 text-primary";
  return (
    <span className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${cls}`}>
      {GOAL_STATUS_LABELS[status]}
    </span>
  );
}


function GoalDialog({ editing, nodes, onDone, onClose }: { editing?: any; nodes: any[]; onDone: () => void; onClose?: () => void }) {
  const [open, setOpen] = useState(!editing ? false : true);
  const [form, setForm] = useState(editing ? {
    name: editing.name,
    goal_type: (editing.goal_type ?? "savings_balance") as GoalType,
    target: String(editing.target_amount),
    currency: editing.currency,
    target_date: editing.target_date ?? "",
    period_scope: editing.period_scope ?? "ytd",
    period_start: editing.period_start ?? "",
    period_end: editing.period_end ?? "",
    budget_node_id: editing.budget_node_id ?? null,
  } : {
    name: "",
    goal_type: "savings_balance" as GoalType,
    target: "0",
    currency: "MGA",
    target_date: "",
    period_scope: "ytd",
    period_start: "",
    period_end: "",
    budget_node_id: null as string | null,
  });

  const needsNode = GOAL_TYPES_NEED_NODE.includes(form.goal_type);
  const needsPeriod = GOAL_TYPES_NEED_PERIOD.includes(form.goal_type);

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload: any = {
        user_id: u.user!.id,
        name: form.name,
        goal_type: form.goal_type,
        target_amount: Number(form.target || 0),
        currency: form.currency,
        target_date: form.target_date || null,
        period_scope: needsPeriod ? form.period_scope : null,
        period_start: needsPeriod && form.period_scope === "custom" ? (form.period_start || null) : null,
        period_end: needsPeriod && form.period_scope === "custom" ? (form.period_end || null) : null,
        budget_node_id: needsNode ? form.budget_node_id : null,
      };
      if (editing) {
        const { error } = await supabase.from("financial_goals").update(payload).eq("id", editing.id);
        if (error) throw error;
        await logAudit("goal", editing.id, "update", payload);
      } else {
        const { data: ins, error } = await supabase.from("financial_goals").insert(payload).select().single();
        if (error) throw error;
        await logAudit("goal", ins?.id ?? null, "create", payload);
      }
    },
    onSuccess: () => { toast.success(editing ? "Mis à jour" : "Créé"); setOpen(false); onClose?.(); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={editing ? true : open} onOpenChange={(v) => { setOpen(v); if (!v) onClose?.(); }}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouvel objectif</Button></DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Modifier l'objectif" : "Nouvel objectif"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <F label="Nom"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></F>
          <F label="Type d'objectif">
            <Select value={form.goal_type} onValueChange={(v) => setForm({ ...form, goal_type: v as GoalType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(GOAL_TYPE_LABELS) as GoalType[]).map(t => <SelectItem key={t} value={t}>{GOAL_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label={form.goal_type === "savings_rate" ? "Cible (%)" : "Cible"}>
              <Input type="number" step="any" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required />
            </F>
            <F label="Échéance"><DatePicker value={form.target_date} onChange={(__v) => setForm({ ...form, target_date: __v })} /></F>
          </div>
          {needsPeriod && (
            <F label="Période à surveiller">
              <Select value={form.period_scope} onValueChange={(v) => setForm({ ...form, period_scope: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PERIOD_SCOPES.map(p => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
              </Select>
            </F>
          )}
          {needsPeriod && form.period_scope === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <F label="Du"><DatePicker value={form.period_start} onChange={(__v) => setForm({ ...form, period_start: __v })} /></F>
              <F label="Au"><DatePicker value={form.period_end} onChange={(__v) => setForm({ ...form, period_end: __v })} /></F>
            </div>
          )}
          {needsNode && (
            <F label={form.goal_type === "spending_cap" ? "Catégorie à surveiller (intermédiaire ou feuille)" : "Feuille budgétaire à surveiller"}>
              <NodePicker nodes={nodes} value={form.budget_node_id} onChange={(id) => setForm({ ...form, budget_node_id: id })} leafOnly={form.goal_type === "category_spend"} placeholder="Sélectionner…" />
            </F>
          )}
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            La progression sera calculée automatiquement à partir de vos données réelles — aucun montant à saisir manuellement.
          </div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: any) { return <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>; }
