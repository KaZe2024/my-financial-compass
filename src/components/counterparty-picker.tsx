import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export type Counterparty = { id: string; name: string; group_name: string | null; service_name: string | null; notes: string | null; archived: boolean };

/**
 * Free-text picker for counterparties. Uses a native <datalist> for auto-complete.
 * When the user types a name that doesn't exist and submits, the parent should
 * call `ensureCounterparty(name)` to upsert and obtain an id before saving.
 */
export function CounterpartyPicker({
  list,
  value,
  onChange,
  placeholder = "Tiers…",
}: {
  list: Counterparty[];
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  const id = useMemo(() => `cp-list-${Math.random().toString(36).slice(2, 8)}`, []);
  const active = list.filter((c) => !c.archived);
  return (
    <>
      <Input list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <datalist id={id}>
        {active.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </>
  );
}

/** Find a counterparty by name (case-insensitive); create one if missing. Returns id or null. */
export async function ensureCounterparty(name: string, list: Counterparty[]): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = list.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing.id;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from("counterparties")
    .insert({ user_id: u.user.id, name: trimmed })
    .select()
    .single();
  if (error) {
    toast.error(`Tiers : ${error.message}`);
    return null;
  }
  return data.id;
}

/** Inline mini-editor: name + group + service + notes, used in modals. */
export function CounterpartyMiniEditor({
  cp,
  onSaved,
}: {
  cp: Counterparty;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: cp.name,
    group_name: cp.group_name ?? "",
    service_name: cp.service_name ?? "",
    notes: cp.notes ?? "",
  });
  useEffect(() => {
    setForm({ name: cp.name, group_name: cp.group_name ?? "", service_name: cp.service_name ?? "", notes: cp.notes ?? "" });
  }, [cp.id, cp.name, cp.group_name, cp.service_name, cp.notes]);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("counterparties")
        .update({
          name: form.name.trim(),
          group_name: form.group_name.trim() || null,
          service_name: form.service_name.trim() || null,
          notes: form.notes.trim() || null,
        })
        .eq("id", cp.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tiers mis à jour");
      qc.invalidateQueries({ queryKey: ["counterparties"] });
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
      className="grid grid-cols-2 gap-2"
    >
      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nom" required />
      <Input value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} placeholder="Groupe" />
      <Input value={form.service_name} onChange={(e) => setForm({ ...form, service_name: e.target.value })} placeholder="Prestation" />
      <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" />
      <button type="submit" className="col-span-2 rounded-sm bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90" disabled={m.isPending}>
        Enregistrer
      </button>
    </form>
  );
}
