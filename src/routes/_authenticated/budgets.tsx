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
import { Plus } from "lucide-react";
import { profileQO } from "@/lib/queries";
import { fmtMoney, fmtPct, monthStart, toISODate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/budgets")({
  head: () => ({ meta: [{ title: "Budgets — Personal CFO" }] }),
  component: BudgetsPage,
});

function BudgetsPage() {
  const qc = useQueryClient();
  const profile = useQuery(profileQO);
  const cur = profile.data?.base_currency ?? "MGA";
  const month = toISODate(monthStart());

  const groups = useQuery({
    queryKey: ["bgroups"],
    queryFn: async () => (await supabase.from("budget_groups").select("*").order("sort_order").order("name")).data ?? [],
  });
  const cats = useQuery({
    queryKey: ["bcats"],
    queryFn: async () => (await supabase.from("budget_categories").select("*").order("name")).data ?? [],
  });
  const spend = useQuery({
    queryKey: ["catspend", month],
    queryFn: async () => (await supabase.from("v_category_spend").select("*").eq("month", month)).data ?? [],
  });

  const totalPlan = (cats.data ?? []).reduce((s, c: any) => s + Number(c.planned_monthly || 0), 0);
  const totalSpent = (spend.data ?? []).reduce((s: number, r: any) => s + Number(r.spent || 0), 0);
  const totalPct = totalPlan > 0 ? (totalSpent / totalPlan) * 100 : 0;

  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const projection = dayOfMonth > 0 ? (totalSpent / dayOfMonth) * daysInMonth : 0;
  const dailyAllowed = Math.max(0, (totalPlan - totalSpent) / Math.max(1, daysInMonth - dayOfMonth + 1));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Planification · {new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</p>
          <h1 className="mt-1 text-2xl font-semibold">Budgets</h1>
        </div>
        <div className="flex gap-2">
          <AddGroupDialog onDone={() => qc.invalidateQueries({ queryKey: ["bgroups"] })} />
          <AddCategoryDialog groups={groups.data ?? []} onDone={() => qc.invalidateQueries({ queryKey: ["bcats"] })} />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Planifié" value={fmtMoney(totalPlan, cur)} />
        <Stat label="Dépensé" value={fmtMoney(totalSpent, cur)} />
        <Stat label="Consommation" value={fmtPct(totalPct)} tone={totalPct > 100 ? "negative" : totalPct > 75 ? "warning" : "positive"} />
        <Stat label="Projection fin de mois" value={fmtMoney(projection, cur)} />
      </section>

      <Panel title="Recommandation quotidienne">
        <p className="num text-sm">
          Vous pouvez dépenser jusqu'à <span className="font-semibold text-primary">{fmtMoney(dailyAllowed, cur)}</span> par jour pour tenir vos budgets ce mois-ci.
        </p>
      </Panel>

      <div className="space-y-4">
        {(groups.data ?? []).map((g: any) => {
          const groupCats = (cats.data ?? []).filter((c: any) => c.group_id === g.id);
          if (groupCats.length === 0) return null;
          return (
            <Panel key={g.id} title={g.name}>
              <div className="space-y-3">
                {groupCats.map((c: any) => {
                  const spent = Number((spend.data ?? []).find((r: any) => r.budget_category_id === c.id)?.spent ?? 0);
                  const plan = Number(c.planned_monthly || 0);
                  const pct = plan > 0 ? (spent / plan) * 100 : 0;
                  const tone = pct >= 100 ? "bg-negative" : pct >= 90 ? "bg-warning" : pct >= 75 ? "bg-accent" : "bg-primary";
                  return (
                    <div key={c.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span>{c.name}</span>
                        <span className="num text-muted-foreground">{fmtMoney(spent, cur)} / {fmtMoney(plan, cur)} · <span className={pct >= 100 ? "text-negative" : "text-foreground"}>{fmtPct(pct)}</span></span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          );
        })}
        {(groups.data ?? []).length === 0 && (
          <Panel title="Démarrer"><p className="py-6 text-center text-sm text-muted-foreground">Créez un groupe budgétaire (ex: Alimentation, Logement) puis des catégories.</p></Panel>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive"|"negative"|"warning" }) {
  const c = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : tone === "warning" ? "text-warning" : "";
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className={`num mt-2 text-xl font-semibold ${c}`}>{value}</div>
    </div>
  );
}

function AddGroupDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("budget_groups").insert({ user_id: u.user!.id, name });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Groupe créé"); setOpen(false); setName(""); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary"><Plus className="mr-2 h-4 w-4" /> Groupe</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau groupe budgétaire</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="space-y-1.5"><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Créer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddCategoryDialog({ groups, onDone }: { groups: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [planned, setPlanned] = useState("0");
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("budget_categories").insert({
        user_id: u.user!.id, name, group_id: groupId || null, planned_monthly: Number(planned || 0),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Catégorie créée"); setOpen(false); setName(""); setPlanned("0"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Catégorie</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouvelle catégorie</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="space-y-1.5"><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label>Groupe</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Budget mensuel</Label><Input type="number" step="any" value={planned} onChange={(e) => setPlanned(e.target.value)} /></div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Créer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
