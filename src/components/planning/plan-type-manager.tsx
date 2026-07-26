import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { offlineInsert, offlineUpdate, offlineDelete } from "@/lib/offline/mutations";
import { planTagsQO, planTypesQO, qkPlanTags, qkPlanTypes } from "@/lib/planning";
import { Plus, Trash2, Check, X, Pencil } from "lucide-react";

export function PlanTypeManager({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Types & tags de planification</DialogTitle></DialogHeader>
        <Tabs defaultValue="types">
          <TabsList>
            <TabsTrigger value="types">Types</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
          </TabsList>
          <TabsContent value="types" className="pt-3"><TypesPane /></TabsContent>
          <TabsContent value="tags" className="pt-3"><TagsPane /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function TypesPane() {
  const qc = useQueryClient();
  const types = useQuery(planTypesQO);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#38bdf8");
  const [eis, setEis] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; color: string; in_eisenhower: boolean }>({ name: "", color: "#38bdf8", in_eisenhower: true });

  const done = () => qc.invalidateQueries({ queryKey: qkPlanTypes });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nom obligatoire");
      const res = await offlineInsert("plan_types", { name: name.trim(), color, in_eisenhower: eis, sort_order: (types.data?.length ?? 0) + 1 });
      if (!res.ok) throw new Error(res.error ?? "Erreur");
    },
    onSuccess: () => { toast.success("Type ajouté"); setName(""); done(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (id: string) => {
      const res = await offlineUpdate("plan_types", id, draft);
      if (!res.ok) throw new Error(res.error ?? "Erreur");
    },
    onSuccess: () => { toast.success("Type modifié"); setEditId(null); done(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await offlineDelete("plan_types", id);
      if (!res.ok) throw new Error(res.error ?? "Erreur");
    },
    onSuccess: () => { toast.success("Type supprimé"); done(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-sm border border-border p-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
        <div>
          <Label>Nouveau type</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Formation" />
        </div>
        <div>
          <Label>Couleur</Label>
          <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-16 p-1" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs">
          <Checkbox checked={eis} onCheckedChange={(v) => setEis(!!v)} /> Matrice Eisenhower
        </label>
        <Button onClick={() => create.mutate()} disabled={create.isPending}><Plus className="mr-1 h-4 w-4" /> Ajouter</Button>
      </div>

      <div className="divide-y divide-border rounded-sm border border-border">
        {(types.data ?? []).map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-3 py-2">
            {editId === t.id ? (
              <>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8 flex-1" />
                <Input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} className="h-8 w-14 p-1" />
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox checked={draft.in_eisenhower} onCheckedChange={(v) => setDraft({ ...draft, in_eisenhower: !!v })} /> Eisenhower
                </label>
                <Button size="sm" variant="ghost" onClick={() => update.mutate(t.id)}><Check className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="flex-1 text-sm">{t.name}</span>
                {t.in_eisenhower && <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Eisenhower</span>}
                <Button size="sm" variant="ghost" onClick={() => { setEditId(t.id); setDraft({ name: t.name, color: t.color, in_eisenhower: t.in_eisenhower }); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
              </>
            )}
          </div>
        ))}
        {(types.data ?? []).length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun type.</div>}
      </div>
    </div>
  );
}

function TagsPane() {
  const qc = useQueryClient();
  const tags = useQuery(planTagsQO);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#a78bfa");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; color: string }>({ name: "", color: "#a78bfa" });

  const done = () => qc.invalidateQueries({ queryKey: qkPlanTags });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nom obligatoire");
      const res = await offlineInsert("plan_tags", { name: name.trim(), color });
      if (!res.ok) throw new Error(res.error ?? "Erreur");
    },
    onSuccess: () => { toast.success("Tag ajouté"); setName(""); done(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (id: string) => {
      const res = await offlineUpdate("plan_tags", id, draft);
      if (!res.ok) throw new Error(res.error ?? "Erreur");
    },
    onSuccess: () => { toast.success("Tag modifié"); setEditId(null); done(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await offlineDelete("plan_tags", id);
      if (!res.ok) throw new Error(res.error ?? "Erreur");
    },
    onSuccess: () => { toast.success("Tag supprimé"); done(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-sm border border-border p-3 md:grid-cols-[1fr_auto_auto] md:items-end">
        <div>
          <Label>Nouveau tag</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Prioritaire" />
        </div>
        <div>
          <Label>Couleur</Label>
          <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-16 p-1" />
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}><Plus className="mr-1 h-4 w-4" /> Ajouter</Button>
      </div>

      <div className="divide-y divide-border rounded-sm border border-border">
        {(tags.data ?? []).map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-3 py-2">
            {editId === t.id ? (
              <>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8 flex-1" />
                <Input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} className="h-8 w-14 p-1" />
                <Button size="sm" variant="ghost" onClick={() => update.mutate(t.id)}><Check className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="flex-1 text-sm">{t.name}</span>
                <Button size="sm" variant="ghost" onClick={() => { setEditId(t.id); setDraft({ name: t.name, color: t.color }); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
              </>
            )}
          </div>
        ))}
        {(tags.data ?? []).length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun tag.</div>}
      </div>
    </div>
  );
}
