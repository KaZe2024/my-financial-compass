import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Journal d'audit — Personal CFO" }] }),
  component: AuditPage,
});

const ENTITY_TYPES = [
  "transaction","asset","debt","receivable","project","goal",
  "budget_node","subscription","income_source","product","counterparty",
];
const ACTIONS = ["create","update","delete","archive","restore","close"];

function AuditPage() {
  const [entity, setEntity] = useState("all");
  const [action, setAction] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const logs = useQuery({
    queryKey: ["audit_log", entity, action, from, to],
    queryFn: async () => {
      let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(500);
      if (entity !== "all") q = q.eq("entity_type", entity);
      if (action !== "all") q = q.eq("action", action);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to + "T23:59:59");
      const { data } = await q;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Système</p>
        <h1 className="mt-1 text-2xl font-semibold">Journal d'audit</h1>
        <p className="mt-1 text-sm text-muted-foreground">Toutes les créations, modifications, suppressions et archivages importants.</p>
      </header>

      <Panel title="Filtres" action={
        <Button variant="ghost" size="sm" onClick={() => { setEntity("all"); setAction("all"); setFrom(""); setTo(""); }}>
          <X className="mr-1 h-3 w-3" /> Réinitialiser
        </Button>
      }>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="space-y-1"><Label>Type</Label>
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {ENTITY_TYPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Du</Label><DatePicker value={from} onChange={(__v) => setFrom(__v)} /></div>
          <div className="space-y-1"><Label>Au</Label><DatePicker value={to} onChange={(__v) => setTo(__v)} /></div>
        </div>
      </Panel>

      <Panel title={`${logs.data?.length ?? 0} événements`}>
        <div className="scroll-thin -mx-4 overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Entité (id)</th>
                <th className="px-4 py-2">Détails</th>
              </tr>
            </thead>
            <tbody>
              {(logs.data ?? []).map((r: any) => (
                <tr key={r.id} className="border-t border-border/60 align-top">
                  <td className="num px-4 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-2"><span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{r.entity_type ?? "—"}</span></td>
                  <td className="px-4 py-2"><span className="rounded-sm bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-accent">{r.action}</span></td>
                  <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{r.entity_id ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground max-w-[400px] truncate" title={r.payload ? JSON.stringify(r.payload) : ""}>
                    {r.payload ? JSON.stringify(r.payload).slice(0, 120) : "—"}
                  </td>
                </tr>
              ))}
              {(logs.data ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">Aucun événement.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
