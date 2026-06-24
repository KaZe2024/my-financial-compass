import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";

export type Tag = { id: string; name: string };

export function TagManager({
  tags,
  value,
  onChange,
  allowManage = true,
}: {
  tags: Tag[];
  value: string[];
  onChange: (ids: string[]) => void;
  allowManage?: boolean;
}) {
  const qc = useQueryClient();
  const [newTag, setNewTag] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("analytical_tags").insert({ user_id: u.user!.id, name: newTag.trim() }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => { onChange([...value, d.id]); setNewTag(""); qc.invalidateQueries({ queryKey: ["analytical_tags"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("analytical_tags").update({ name: name.trim() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: ["analytical_tags"] }); toast.success("Tag renommé"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Clean links first (no ON DELETE CASCADE assumed)
      await supabase.from("transaction_tags").delete().eq("tag_id", id);
      const { error } = await supabase.from("analytical_tags").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      onChange(value.filter((x) => x !== id));
      qc.invalidateQueries({ queryKey: ["analytical_tags"] });
      qc.invalidateQueries({ queryKey: ["tx_tags"] });
      toast.success("Tag supprimé");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => {
          const on = value.includes(t.id);
          if (editing?.id === t.id) {
            return (
              <span key={t.id} className="flex items-center gap-1 rounded-sm bg-muted px-1 py-0.5">
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-6 w-28 text-xs" autoFocus />
                <button type="button" onClick={() => rename.mutate({ id: t.id, name: editing.name })} className="text-positive" title="Valider"><Check className="h-3 w-3" /></button>
                <button type="button" onClick={() => setEditing(null)} className="text-muted-foreground" title="Annuler"><X className="h-3 w-3" /></button>
              </span>
            );
          }
          return (
            <span key={t.id} className="group inline-flex items-center gap-0.5">
              <button type="button" onClick={() => toggle(t.id)}
                className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${on ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {t.name}
              </button>
              {allowManage && (
                <span className="hidden gap-0.5 group-hover:inline-flex">
                  <button type="button" title="Renommer" onClick={() => setEditing({ id: t.id, name: t.name })} className="text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button type="button" title="Supprimer" onClick={() => { if (confirm(`Supprimer le tag « ${t.name} » ?`)) remove.mutate(t.id); }} className="text-muted-foreground hover:text-negative">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              )}
            </span>
          );
        })}
        {tags.length === 0 && <span className="text-xs text-muted-foreground">Aucun tag</span>}
      </div>
      <div className="flex gap-1">
        <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Nouveau tag…" className="h-7 text-xs" />
        <Button type="button" size="sm" variant="outline" disabled={!newTag.trim() || create.isPending} onClick={() => create.mutate()}>+</Button>
      </div>
    </div>
  );
}
