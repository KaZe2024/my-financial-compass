import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Sparkles, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, History } from "lucide-react";
import { fmtDate, fmtMoney, fmtPct, toISODate } from "@/lib/format";
import { toast } from "sonner";
import { RowActions } from "./assets";
import { NodePicker } from "@/components/node-picker";
import { budgetNodesQO, walletsQO } from "@/lib/queries";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "Projets — Personal CFO" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const wallets = useQuery(walletsQO);
  const nodes = useQuery(budgetNodesQO);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await supabase.from("projects").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const visible = (projects.data ?? []).filter((p: any) => showArchived || !p.archived);
  const [editing, setEditing] = useState<any | null>(null);
  const [action, setAction] = useState<{ kind: "fund" | "borrow" | "spend" | "finalize"; project: any } | null>(null);
  const [history, setHistory] = useState<any | null>(null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Planification</p>
          <h1 className="mt-1 text-2xl font-semibold">Projets (enveloppes de capital)</h1>
          <p className="mt-1 text-sm text-muted-foreground">Une enveloppe = fonds mis de côté pour un usage futur. Le solde vient uniquement des mouvements réels.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Masquer" : "Voir"} archivés</Button>
          <ProjectDialog onDone={() => qc.invalidateQueries({ queryKey: ["projects"] })} />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((p: any) => {
          const envelope = Number(p.envelope_balance ?? 0);
          const spent = Number(p.total_spent ?? 0);
          const target = Number(p.target_amount) || 0;
          // Progression = ce qui est provisionné dans l'enveloppe vs cible
          const pct = target > 0 ? (envelope / target) * 100 : 0;
          const spentPct = target > 0 ? (spent / target) * 100 : 0;
          const closed = p.status === "completed" || !!p.closed_at;
          return (
            <div key={p.id} className={`rounded-md border border-border bg-card p-4 ${p.archived ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> {p.name}</div>
                <div className="flex items-center gap-1">
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{p.archived ? "archivé" : p.status}</span>
                  <RowActions table="projects" id={p.id} archived={p.archived} onEdit={() => setEditing(p)} />
                </div>
              </div>
              {p.description && <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>}
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="font-mono uppercase tracking-widest text-muted-foreground">Enveloppe</div>
                  <div className={`num text-lg font-semibold ${envelope < 0 ? "text-negative" : ""}`}>{fmtMoney(envelope, p.currency)}</div>
                </div>
                <div>
                  <div className="font-mono uppercase tracking-widest text-muted-foreground">Dépensé</div>
                  <div className="num text-lg font-semibold">{fmtMoney(spent, p.currency)}</div>
                </div>
              </div>
              <div className="num mt-3 text-xs text-muted-foreground">Cible · {fmtMoney(target, p.currency)} · Provisionné {fmtPct(pct)} · Dépensé {fmtPct(spentPct)}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              {envelope < 0 && <div className="mt-2 text-xs text-warning">⚠ Emprunt à l'enveloppe · {fmtMoney(Math.abs(envelope), p.currency)}</div>}
              {p.target_date && <div className="mt-2 text-xs text-muted-foreground">Objectif · {fmtDate(p.target_date)}</div>}

              {!closed && !p.archived && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button onClick={() => setAction({ kind: "fund", project: p })}
                    className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted/30 px-2 py-1 text-[11px] hover:bg-muted">
                    <ArrowDownToLine className="h-3 w-3 text-positive" /> Alimenter
                  </button>
                  <button onClick={() => setAction({ kind: "borrow", project: p })}
                    className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted/30 px-2 py-1 text-[11px] hover:bg-muted">
                    <ArrowUpFromLine className="h-3 w-3 text-warning" /> Emprunter
                  </button>
                  <button onClick={() => setAction({ kind: "spend", project: p })}
                    className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted/30 px-2 py-1 text-[11px] hover:bg-muted">
                    <ArrowUpFromLine className="h-3 w-3 text-negative" /> Dépenser
                  </button>
                  <button onClick={() => setAction({ kind: "finalize", project: p })}
                    className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted/30 px-2 py-1 text-[11px] hover:bg-muted">
                    <CheckCircle2 className="h-3 w-3 text-primary" /> Finaliser
                  </button>
                  <button onClick={() => setHistory(p)}
                    className="ml-auto inline-flex items-center gap-1 rounded-sm border border-border bg-muted/30 px-2 py-1 text-[11px] hover:bg-muted">
                    <History className="h-3 w-3" /> Historique
                  </button>
                </div>
              )}
              {(closed || p.archived) && (
                <div className="mt-3 flex">
                  <button onClick={() => setHistory(p)}
                    className="ml-auto inline-flex items-center gap-1 rounded-sm border border-border bg-muted/30 px-2 py-1 text-[11px] hover:bg-muted">
                    <History className="h-3 w-3" /> Historique
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && (
          <Panel title="Démarrer" className="md:col-span-2 lg:col-span-3">
            <p className="py-8 text-center text-sm text-muted-foreground">Créez un projet : voyage, maison, voiture… c'est l'enveloppe qui financera l'achat.</p>
          </Panel>
        )}
      </div>

      {editing && <ProjectDialog editing={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["projects"] }); }} />}
      {action && (
        <ProjectActionDialog
          kind={action.kind}
          project={action.project}
          wallets={wallets.data ?? []}
          nodes={nodes.data ?? []}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); qc.invalidateQueries(); }}
        />
      )}
      {history && <ProjectHistoryDialog project={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function ProjectDialog({ editing, onDone, onClose }: { editing?: any; onDone: () => void; onClose?: () => void }) {
  const [open, setOpen] = useState(!editing ? false : true);
  const [form, setForm] = useState(editing ? {
    name: editing.name, description: editing.description ?? "",
    target: String(editing.target_amount),
    currency: editing.currency, target_date: editing.target_date ?? "",
  } : { name: "", description: "", target: "0", currency: "MGA", target_date: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload: any = {
        user_id: u.user!.id, name: form.name, description: form.description || null,
        target_amount: Number(form.target || 0),
        currency: form.currency, target_date: form.target_date || null,
      };
      if (editing) {
        const { error } = await supabase.from("projects").update(payload).eq("id", editing.id);
        if (error) throw error;
        await logAudit("project", editing.id, "update", payload);
      } else {
        const { data: ins, error } = await supabase.from("projects").insert(payload).select().single();
        if (error) throw error;
        await logAudit("project", ins?.id ?? null, "create", payload);
      }
    },
    onSuccess: () => { toast.success(editing ? "Mis à jour" : "Créé"); setOpen(false); onClose?.(); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={editing ? true : open} onOpenChange={(v) => { setOpen(v); if (!v) onClose?.(); }}>
      {!editing && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nouveau projet</Button></DialogTrigger>}
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Modifier le projet" : "Nouveau projet"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <F label="Nom"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></F>
          <F label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></F>
          <div className="grid grid-cols-3 gap-3">
            <F label="Cible"><Input type="number" step="any" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required /></F>
            <F label="Devise">
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["MGA","EUR","USD","GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Date objectif"><Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></F>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            L'enveloppe et le dépensé se calculent automatiquement à partir des mouvements. Utilisez "Alimenter", "Emprunter" ou "Finaliser" pour créer les transactions.
          </div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectActionDialog({ kind, project, wallets, nodes, onClose, onDone }: {
  kind: "fund" | "borrow" | "spend" | "finalize"; project: any; wallets: any[]; nodes: any[];
  onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState({
    amount: "0",
    wallet_id: project.funding_wallet_id ?? "",
    budget_node_id: null as string | null,
    description: kind === "fund" ? `Alimentation · ${project.name}`
              : kind === "borrow" ? `Emprunt enveloppe · ${project.name}`
              : kind === "spend" ? `Dépense projet · ${project.name}`
              : `Achat finalisé · ${project.name}`,
    // finalize extras
    create_asset: false,
    asset_name: project.name,
    asset_type: "other",
  });

  const title = kind === "fund" ? "Alimenter l'enveloppe"
              : kind === "borrow" ? "Emprunter sur l'enveloppe"
              : kind === "spend" ? "Dépense sur le projet (tranche)"
              : "Finaliser le projet";

  const envelope = Number(project.envelope_balance ?? 0);

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const amt = Number(form.amount || 0);
      if (amt <= 0) throw new Error("Le montant doit être positif");
      if (!form.wallet_id) throw new Error("Portefeuille requis");
      const today = toISODate(new Date());

      if (kind === "fund") {
        const { data: tx, error } = await supabase.from("transactions").insert({
          user_id: uid, type: "enveloppe_projet", occurred_on: today,
          description: form.description, wallet_id: form.wallet_id,
          amount: amt, currency: project.currency, exchange_rate: 1, base_amount: amt,
          project_id: project.id, budget_node_id: form.budget_node_id,
          source_kind: "project", source_id: project.id,
        }).select().single();
        if (error) throw error;
        await logAudit("project", project.id, "update", { action: "fund", amount: amt, tx_id: tx?.id });
      } else if (kind === "borrow") {
        const { data: tx, error } = await supabase.from("transactions").insert({
          user_id: uid, type: "enveloppe_emprunt", occurred_on: today,
          description: form.description, wallet_id: form.wallet_id,
          amount: amt, currency: project.currency, exchange_rate: 1, base_amount: amt,
          project_id: project.id, budget_node_id: form.budget_node_id,
          source_kind: "project", source_id: project.id,
        }).select().single();
        if (error) throw error;
        // Trace as debt owed back to the envelope
        const { data: debt, error: dErr } = await supabase.from("debts").insert({
          user_id: uid,
          creditor: `Enveloppe · ${project.name}`,
          description: "Emprunt sur enveloppe projet",
          original_amount: amt, outstanding: amt,
          currency: project.currency, due_date: project.target_date ?? null,
          status: "outstanding", notes: `Généré par l'action "Emprunter" du projet ${project.name}`,
          linked_transaction_id: tx?.id ?? null,
          project_id: project.id,
        } as any).select().single();
        if (dErr) throw dErr;
        await logAudit("debt", debt?.id ?? null, "create", { source: "project_borrow", project_id: project.id, amount: amt });
        await logAudit("project", project.id, "update", { action: "borrow", amount: amt, tx_id: tx?.id, debt_id: debt?.id });
      } else if (kind === "spend") {
        // Dépense projet: tranche d'achat / travaux, sans clôturer
        const { data: tx, error } = await supabase.from("transactions").insert({
          user_id: uid, type: "investment", occurred_on: today,
          description: form.description, wallet_id: form.wallet_id,
          amount: amt, currency: project.currency, exchange_rate: 1, base_amount: amt,
          project_id: project.id, budget_node_id: form.budget_node_id,
          source_kind: "project", source_id: project.id,
        }).select().single();
        if (error) throw error;
        await logAudit("project", project.id, "update", { action: "spend", amount: amt, tx_id: tx?.id });
      } else {
        // finalize
        let assetId: string | null = null;
        if (form.create_asset) {
          const { data: asset, error: aErr } = await supabase.from("assets").insert({
            user_id: uid, name: form.asset_name, type: form.asset_type,
            purchase_date: today, purchase_value: amt, current_value: amt,
            currency: project.currency,
          } as any).select().single();
          if (aErr) throw aErr;
          assetId = asset?.id ?? null;
          await logAudit("asset", assetId, "create", { source: "project_finalize", project_id: project.id, amount: amt });
        }
        const { data: tx, error } = await supabase.from("transactions").insert({
          user_id: uid, type: "investment", occurred_on: today,
          description: form.description, wallet_id: form.wallet_id,
          amount: amt, currency: project.currency, exchange_rate: 1, base_amount: amt,
          project_id: project.id, budget_node_id: form.budget_node_id,
          asset_id: assetId,
          source_kind: "project", source_id: project.id,
        }).select().single();
        if (error) throw error;
        const { error: pErr } = await supabase.from("projects").update({
          status: "completed", closed_at: new Date().toISOString(),
          resulted_asset_id: assetId, linked_transaction_id: tx?.id ?? null,
        } as any).eq("id", project.id);
        if (pErr) throw pErr;
        await logAudit("project", project.id, "close", { amount: amt, tx_id: tx?.id, asset_id: assetId });
      }
    },
    onSuccess: () => { toast.success("Opération enregistrée"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title} — {project.name}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
            <span className="font-mono uppercase tracking-widest text-muted-foreground">Enveloppe actuelle</span>
            <span className={`num ml-2 font-semibold ${envelope < 0 ? "text-negative" : ""}`}>{fmtMoney(envelope, project.currency)}</span>
          </div>
          {kind === "borrow" && envelope > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              L'enveloppe a des fonds. Préférez "Alimenter"/"Finaliser". L'emprunt crée une dette traçable envers l'enveloppe.
            </div>
          )}
          <F label="Montant">
            <Input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required autoFocus />
          </F>
          <F label={kind === "fund" ? "Depuis le portefeuille" : kind === "borrow" ? "Vers le portefeuille" : "Portefeuille de paiement"}>
            <Select value={form.wallet_id} onValueChange={(v) => setForm({ ...form, wallet_id: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Feuille budgétaire (optionnel)">
            <NodePicker nodes={nodes} value={form.budget_node_id} onChange={(id) => setForm({ ...form, budget_node_id: id })} leafOnly placeholder="Aucune" />
          </F>
          <F label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></F>
          {kind === "finalize" && (
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.create_asset} onChange={(e) => setForm({ ...form, create_asset: e.target.checked })} />
                Créer un actif lié (si l'achat crée un actif)
              </label>
              {form.create_asset && (
                <div className="grid grid-cols-2 gap-3">
                  <F label="Nom de l'actif"><Input value={form.asset_name} onChange={(e) => setForm({ ...form, asset_name: e.target.value })} /></F>
                  <F label="Type">
                    <Select value={form.asset_type} onValueChange={(v) => setForm({ ...form, asset_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["real_estate","land","vehicle","computer","electronics","investment","other"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </F>
                </div>
              )}
            </div>
          )}
          <DialogFooter><Button type="submit" disabled={m.isPending}>Confirmer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectHistoryDialog({ project, onClose }: { project: any; onClose: () => void }) {
  const txs = useQuery({
    queryKey: ["project_history", project.id],
    queryFn: async () => (await supabase.from("transactions").select("*, wallets:wallet_id(name)").eq("project_id", project.id).order("occurred_on", { ascending: false }).order("created_at", { ascending: false })).data ?? [],
  });
  const rows = txs.data ?? [];
  const stats = useMemo(() => {
    let funded = 0, borrowed = 0, spent = 0;
    for (const t of rows) {
      const a = Number(t.base_amount ?? Number(t.amount) * Number(t.exchange_rate ?? 1));
      if (t.type === "enveloppe_projet") funded += a;
      else if (t.type === "enveloppe_emprunt") borrowed += a;
      else if (t.type === "investment") spent += a;
    }
    return { funded, borrowed, spent };
  }, [rows]);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Historique — {project.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <SBox label="Alimenté" value={fmtMoney(stats.funded, project.currency)} tone="positive" />
          <SBox label="Emprunté" value={fmtMoney(stats.borrowed, project.currency)} tone="warning" />
          <SBox label="Dépensé" value={fmtMoney(stats.spent, project.currency)} tone="neutral" />
        </div>
        <div className="scroll-thin -mx-2 max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">Portefeuille</th>
                <th className="px-2 py-2 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t: any) => (
                <tr key={t.id} className="border-t border-border/60">
                  <td className="num px-2 py-1.5 text-muted-foreground whitespace-nowrap">{fmtDate(t.occurred_on)}</td>
                  <td className="px-2 py-1.5"><span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{t.type}</span></td>
                  <td className="px-2 py-1.5">{t.description}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{t.wallets?.name ?? "—"}</td>
                  <td className="num px-2 py-1.5 text-right">{fmtMoney(Number(t.base_amount ?? 0), t.currency ?? project.currency)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="px-2 py-6 text-center text-sm text-muted-foreground">Aucun mouvement</td></tr>}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SBox({ label, value, tone }: { label: string; value: string; tone: "positive" | "warning" | "neutral" }) {
  const c = tone === "positive" ? "text-positive" : tone === "warning" ? "text-warning" : "";
  return <div className="rounded-sm border border-border bg-muted/20 p-2"><div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div><div className={`num text-sm font-semibold ${c}`}>{value}</div></div>;
}

function F({ label, children }: any) { return <div className="space-y-1"><Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>; }
