import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { offlineInsert, offlineUpdate, offlineDelete } from "@/lib/offline/mutations";
import { counterpartiesQO } from "@/lib/queries";
import {
  PRIORITIES, RECURRENCES, RECURRENCE_PRESETS, WEEKDAYS, detectRecurrencePreset,
  STATUSES, planItemTagsQO, planProjectsQO, planTagsQO, planTypesQO,
  qkPlanItemTags, qkPlanItems, type PlanItem, ymd,
} from "@/lib/planning";
import { Trash2 } from "lucide-react";

const NONE = "__none__";

type TimingMode = "precise" | "all_day" | "floating";

export function PlanItemDialog({
  open, onOpenChange, item, defaultDate, defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: PlanItem | null;
  defaultDate?: string;
  defaultProjectId?: string | null;
}) {
  const qc = useQueryClient();
  const types = useQuery(planTypesQO);
  const tags = useQuery(planTagsQO);
  const projects = useQuery(planProjectsQO);
  const itemTags = useQuery(planItemTagsQO);
  const cps = useQuery(counterpartiesQO);

  const [title, setTitle] = useState("");
  const [typeId, setTypeId] = useState<string>(NONE);
  const [projectId, setProjectId] = useState<string>(NONE);
  const [cpId, setCpId] = useState<string>(NONE);
  const [personLabel, setPersonLabel] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");
  const [urgent, setUrgent] = useState(false);
  const [important, setImportant] = useState(false);
  const [date, setDate] = useState(defaultDate ?? ymd(new Date()));
  const [endOn, setEndOn] = useState("");
  const [timing, setTiming] = useState<TimingMode>("precise");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [duration, setDuration] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [preset, setPreset] = useState("none");
  const [interval, setIntervalValue] = useState("1");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [monthDays, setMonthDays] = useState<number[]>([]);
  const [timesPerDay, setTimesPerDay] = useState("1");
  const [reminder, setReminder] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const currentTagIds = useMemo(
    () => (itemTags.data ?? []).filter((t) => t.item_id === item?.id).map((t) => t.tag_id),
    [itemTags.data, item?.id],
  );

  useEffect(() => {
    if (!open) return;
    if (item) {
      setTitle(item.title);
      setTypeId(item.type_id ?? NONE);
      setProjectId(item.project_id ?? NONE);
      setCpId(item.counterparty_id ?? NONE);
      setPersonLabel(item.person_label ?? "");
      setStatus(item.status);
      setPriority(item.priority);
      setUrgent(item.urgent);
      setImportant(item.important);
      setDate(item.scheduled_on);
      setEndOn(item.end_on ?? "");
      setTiming(item.all_day ? "all_day" : item.no_fixed_time || !item.start_time ? "floating" : "precise");
      setStartTime(item.start_time?.slice(0, 5) ?? "09:00");
      setEndTime(item.end_time?.slice(0, 5) ?? "");
      setDuration(item.duration_minutes ? String(item.duration_minutes) : "");
      setLocation(item.location ?? "");
      setNotes(item.notes ?? "");
      setRecurrence(item.recurrence);
      setRecurrenceUntil(item.recurrence_until ?? "");
      setPreset(detectRecurrencePreset(item));
      setIntervalValue(String(item.recurrence_interval ?? 1));
      setWeekdays(item.recurrence_weekdays ?? []);
      setMonthDays(item.recurrence_month_days ?? []);
      setTimesPerDay(String(item.times_per_day ?? 1));
      setReminder(item.reminder_minutes ? String(item.reminder_minutes) : "");
      setSelectedTags(currentTagIds);
    } else {
      setTitle("");
      setTypeId(types.data?.[0]?.id ?? NONE);
      setProjectId(defaultProjectId ?? NONE);
      setCpId(NONE);
      setPersonLabel("");
      setStatus("todo");
      setPriority("medium");
      setUrgent(false);
      setImportant(false);
      setDate(defaultDate ?? ymd(new Date()));
      setEndOn("");
      setTiming("precise");
      setStartTime("09:00");
      setEndTime("");
      setDuration("");
      setLocation("");
      setNotes("");
      setRecurrence("none");
      setRecurrenceUntil("");
      setReminder("");
      setSelectedTags([]);
    }
  }, [open, item?.id, currentTagIds.join(","), defaultDate, defaultProjectId, types.data?.length]);

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Le titre est obligatoire");
      const payload: Record<string, unknown> = {
        title: title.trim(),
        type_id: typeId === NONE ? null : typeId,
        project_id: projectId === NONE ? null : projectId,
        counterparty_id: cpId === NONE ? null : cpId,
        person_label: personLabel.trim() || null,
        status,
        priority,
        urgent,
        important,
        scheduled_on: date,
        end_on: endOn || null,
        all_day: timing === "all_day",
        no_fixed_time: timing === "floating",
        start_time: timing === "precise" ? startTime : null,
        end_time: timing === "precise" && endTime ? endTime : null,
        duration_minutes: duration ? Number(duration) : null,
        location: location.trim() || null,
        notes: notes.trim() || null,
        recurrence,
        recurrence_until: recurrence !== "none" && recurrenceUntil ? recurrenceUntil : null,
        reminder_minutes: reminder ? Number(reminder) : null,
        completed_at: status === "done" ? new Date().toISOString() : null,
      };

      let itemId = item?.id;
      if (item) {
        const res = await offlineUpdate("plan_items", item.id, payload);
        if (!res.ok) throw new Error(res.error ?? "Erreur enregistrement");
      } else {
        const res = await offlineInsert("plan_items", payload);
        if (!res.ok) throw new Error(res.error ?? "Erreur création");
        itemId = String(res.id ?? "");
      }

      if (itemId) {
        const next = Array.from(new Set(selectedTags));
        const prev = item ? currentTagIds : [];
        for (const tagId of prev.filter((t) => !next.includes(t))) {
          const link = (itemTags.data ?? []).find((l) => l.item_id === itemId && l.tag_id === tagId);
          if (link) await offlineDelete("plan_item_tags", link.id);
        }
        for (const tagId of next.filter((t) => !prev.includes(t))) {
          await offlineInsert("plan_item_tags", { item_id: itemId, tag_id: tagId });
        }
      }
    },
    onSuccess: () => {
      toast.success(item ? "Élément mis à jour" : "Élément planifié");
      qc.invalidateQueries({ queryKey: qkPlanItems });
      qc.invalidateQueries({ queryKey: qkPlanItemTags });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const res = await offlineDelete("plan_items", item.id);
      if (!res.ok) throw new Error(res.error ?? "Erreur suppression");
    },
    onSuccess: () => {
      toast.success("Élément supprimé");
      qc.invalidateQueries({ queryKey: qkPlanItems });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Modifier l'élément planifié" : "Nouvel élément planifié"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Titre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Lecture de la Bible, Appel client, Sport…" />
          </div>

          <div>
            <Label>Type</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sans type</SelectItem>
                {(types.data ?? []).filter((t) => !t.archived).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Projet rattaché</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Projet" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucun</SelectItem>
                {(projects.data ?? []).filter((p) => !p.archived).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Personne liée</Label>
            <Select value={cpId} onValueChange={setCpId}>
              <SelectTrigger><SelectValue placeholder="Tiers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucune</SelectItem>
                {(cps.data ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Ou nom libre</Label>
            <Input value={personLabel} onChange={(e) => setPersonLabel(e.target.value)} placeholder="Nom de la personne" />
          </div>

          <div>
            <Label>Situation</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Priorité</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-6 md:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={urgent} onCheckedChange={(v) => setUrgent(!!v)} /> Urgent
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={important} onCheckedChange={(v) => setImportant(!!v)} /> Important
            </label>
            <span className="text-xs text-muted-foreground">Utilisé par la matrice d'Eisenhower</span>
          </div>

          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Date de fin (optionnel)</Label>
            <Input type="date" value={endOn} onChange={(e) => setEndOn(e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label>Horaire</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {([
                ["precise", "Heure précise"],
                ["all_day", "Journée entière"],
                ["floating", "Durant la journée (sans heure)"],
              ] as [TimingMode, string][]).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTiming(v)}
                  className={`rounded-sm border px-3 py-1.5 text-xs ${timing === v ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}
                >{l}</button>
              ))}
            </div>
          </div>

          {timing === "precise" && (
            <>
              <div>
                <Label>Début</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>Fin</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </>
          )}

          <div>
            <Label>Durée (minutes)</Label>
            <Input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Ex. 45" />
          </div>
          <div>
            <Label>Rappel (minutes avant)</Label>
            <Input type="number" min="0" value={reminder} onChange={(e) => setReminder(e.target.value)} placeholder="Ex. 15" />
          </div>

          <div>
            <Label>Récurrence</Label>
            <Select value={recurrence} onValueChange={setRecurrence}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECURRENCES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Répéter jusqu'au</Label>
            <Input type="date" value={recurrenceUntil} onChange={(e) => setRecurrenceUntil(e.target.value)} disabled={recurrence === "none"} />
          </div>

          <div className="md:col-span-2">
            <Label>Lieu</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex. Bureau, Domicile, Zoom…" />
          </div>

          <div className="md:col-span-2">
            <Label>Tags</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {(tags.data ?? []).map((t) => {
                const on = selectedTags.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTags((prev) => on ? prev.filter((x) => x !== t.id) : [...prev, t.id])}
                    className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-transparent" : "border-border text-muted-foreground"}`}
                    style={on ? { backgroundColor: `${t.color}22`, color: t.color } : undefined}
                  >{t.name}</button>
                );
              })}
              {(tags.data ?? []).length === 0 && <span className="text-xs text-muted-foreground">Aucun tag — créez-en dans « Types & tags ».</span>}
            </div>
          </div>

          <div className="md:col-span-2">
            <Label>Note</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {item && (
            <Button variant="outline" onClick={() => remove.mutate()} disabled={remove.isPending} className="mr-auto text-destructive">
              <Trash2 className="mr-1.5 h-4 w-4" /> Supprimer
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
