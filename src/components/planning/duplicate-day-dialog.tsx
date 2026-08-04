import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { offlineInsert } from "@/lib/offline/mutations";
import {
  addDays, fmtTimeRange, occurrencesInRange, parseYmd, planItemTagsQO, planItemsQO,
  qkPlanItemTags, qkPlanItems, ymd, type PlanItem,
} from "@/lib/planning";
import { CopyPlus } from "lucide-react";

export function DuplicateDayDialog({
  open, onOpenChange, sourceDate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceDate: string;
}) {
  const qc = useQueryClient();
  const items = useQuery(planItemsQO);
  const itemTags = useQuery(planItemTagsQO);

  const [from, setFrom] = useState(sourceDate);
  const [to, setTo] = useState(ymd(addDays(parseYmd(sourceDate), 1)));
  const [keepStatus, setKeepStatus] = useState(false);
  const [copyTags, setCopyTags] = useState(true);
  const [excluded, setExcluded] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setFrom(sourceDate);
    setTo(ymd(addDays(parseYmd(sourceDate), 1)));
    setExcluded([]);
  }, [open, sourceDate]);

  const dayItems = useMemo(() => {
    const d = parseYmd(from);
    return (items.data ?? []).filter((i) => occurrencesInRange(i, d, d).length > 0);
  }, [items.data, from]);

  const selected = dayItems.filter((i) => !excluded.includes(i.id));

  const run = useMutation({
    mutationFn: async () => {
      if (!to) throw new Error("Choisissez la date de destination");
      if (selected.length === 0) throw new Error("Aucun élément à dupliquer");
      for (const it of selected) {
        const payload: Record<string, unknown> = {
          title: it.title,
          type_id: it.type_id,
          project_id: it.project_id,
          counterparty_id: it.counterparty_id,
          person_label: it.person_label,
          status: keepStatus ? it.status : "todo",
          priority: it.priority,
          urgent: it.urgent,
          important: it.important,
          scheduled_on: to,
          end_on: null,
          all_day: it.all_day,
          no_fixed_time: it.no_fixed_time,
          start_time: it.start_time,
          end_time: it.end_time,
          duration_minutes: it.duration_minutes,
          location: it.location,
          notes: it.notes,
          recurrence: "none",
          recurrence_until: null,
          recurrence_interval: 1,
          recurrence_weekdays: null,
          recurrence_month_days: null,
          times_per_day: it.times_per_day ?? 1,
          reminder_minutes: it.reminder_minutes,
          completed_at: keepStatus && it.status === "done" ? new Date().toISOString() : null,
          sort_order: it.sort_order ?? 0,
        };
        const res = await offlineInsert("plan_items", payload);
        if (!res.ok) throw new Error(res.error ?? "Erreur duplication");
        const newId = String(res.id ?? "");
        if (copyTags && newId) {
          for (const l of (itemTags.data ?? []).filter((x) => x.item_id === it.id)) {
            await offlineInsert("plan_item_tags", { item_id: newId, tag_id: l.tag_id });
          }
        }
      }
      return selected.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} élément(s) dupliqué(s) vers le ${to}`);
      qc.invalidateQueries({ queryKey: qkPlanItems });
      qc.invalidateQueries({ queryKey: qkPlanItemTags });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const row = (it: PlanItem) => {
    const off = excluded.includes(it.id);
    return (
      <label key={it.id} className="flex items-center gap-2 border-b border-border px-2 py-1.5 text-xs last:border-0">
        <Checkbox
          checked={!off}
          onCheckedChange={(v) => setExcluded((prev) => (v ? prev.filter((x) => x !== it.id) : [...prev, it.id]))}
        />
        <span className="min-w-0 flex-1 truncate">{it.title}</span>
        <span className="shrink-0 text-muted-foreground">{fmtTimeRange(it)}</span>
      </label>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>Dupliquer une journée</DialogTitle></DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Journée source</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>Journée de destination</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={copyTags} onCheckedChange={(v) => setCopyTags(!!v)} /> Copier les tags
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={keepStatus} onCheckedChange={(v) => setKeepStatus(!!v)} /> Conserver la situation
          </label>

          <div className="md:col-span-2">
            <Label>Éléments à dupliquer ({selected.length}/{dayItems.length})</Label>
            <div className="mt-1 max-h-64 overflow-y-auto rounded-sm border border-border">
              {dayItems.length === 0
                ? <div className="px-2 py-6 text-center text-xs text-muted-foreground">Rien de planifié ce jour-là.</div>
                : dayItems.map(row)}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending || selected.length === 0}>
            <CopyPlus className="mr-1.5 h-4 w-4" /> Dupliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
