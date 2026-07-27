import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { offlineInsert, offlineUpdate, offlineDelete } from "@/lib/offline/mutations";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, FileText, History, Archive, ArchiveRestore } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Suivi de mes documents — OPTIS" },
      { name: "description", content: "Inventaire de vos documents personnels et professionnels avec un historique modifiable des modifications, versions et événements." },
      { property: "og:title", content: "Suivi de mes documents — OPTIS" },
      { property: "og:description", content: "Liste de documents, dossiers, versions et historique daté de chaque événement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Suivi de mes documents — OPTIS" },
      { name: "twitter:description", content: "Documents et historique daté de leurs modifications." },
    ],
  }),
  component: DocumentsPage,
});

type Doc = {
  id: string; name: string; description: string | null; folder: string | null; path_or_link: string | null;
  category: string; file_type: string | null; reference: string | null; current_version: string | null;
  status: string; confidentiality: string; owner: string | null; document_date: string | null;
  due_date: string | null; tags: string[] | null; notes: string | null; archived: boolean; created_at: string;
};

type DocEvent = {
  id: string; document_id: string; occurred_at: string; event_type: string; title: string;
  description: string | null; version: string | null; author: string | null; location: string | null; notes: string | null;
};

const CATEGORIES = [
  { v: "perso", l: "Personnel" }, { v: "travail", l: "Travail" }, { v: "administratif", l: "Administratif" },
  { v: "juridique", l: "Juridique" }, { v: "financier", l: "Financier" }, { v: "autre", l: "Autre" },
];
const STATUSES = [
  { v: "brouillon", l: "Brouillon" }, { v: "en_cours", l: "En cours" }, { v: "valide", l: "Validé" },
  { v: "archive", l: "Archivé" }, { v: "obsolete", l: "Obsolète" },
];
const CONFIDENTIALITY = [
  { v: "public", l: "Public" }, { v: "normal", l: "Normal" }, { v: "confidentiel", l: "Confidentiel" }, { v: "secret", l: "Secret" },
];
const EVENT_TYPES = [
  { v: "creation", l: "Création" }, { v: "modification", l: "Modification" }, { v: "revision", l: "Révision" },
  { v: "relecture", l: "Relecture" }, { v: "envoi", l: "Envoi" }, { v: "reception", l: "Réception" },
  { v: "signature", l: "Signature" }, { v: "validation", l: "Validation" }, { v: "depot", l: "Dépôt" },
  { v: "renouvellement", l: "Renouvellement" }, { v: "archivage", l: "Archivage" }, { v: "suppression", l: "Suppression" },
  { v: "autre", l: "Autre" },
];

const label = (arr: { v: string; l: string }[], v: string) => arr.find((x) => x.v === v)?.l ?? v;

const qkDocs = ["documents"] as const;
const qkEvents = ["document_events"] as const;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function DocumentsPage() {
  const qc = useQueryClient();
  const docs = useQuery({
    queryKey: qkDocs,
    queryFn: () => fetchAllRows<Doc>((from, to) =>
      supabase.from("documents").select("*").order("name").range(from, to) as any),
  });
  const events = useQuery({
    queryKey: qkEvents,
    queryFn: () => fetchAllRows<DocEvent>((from, to) =>
      supabase.from("document_events").select("*").order("occurred_at", { ascending: false }).range(from, to) as any),
  });

  const [search, setSearch] = useState("");
  const [fCat, setFCat] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fFolder, setFFolder] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [docDialog, setDocDialog] = useState<{ open: boolean; doc: Doc | null }>({ open: false, doc: null });
  const [evtDialog, setEvtDialog] = useState<{ open: boolean; docId: string; evt: DocEvent | null } | null>(null);

  const folders = useMemo(
    () => Array.from(new Set((docs.data ?? []).map((d) => d.folder).filter(Boolean) as string[])).sort(),
    [docs.data],
  );

  const eventsByDoc = useMemo(() => {
    const m = new Map<string, DocEvent[]>();
    for (const e of events.data ?? []) {
      const arr = m.get(e.document_id) ?? [];
      arr.push(e);
      m.set(e.document_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return m;
  }, [events.data]);

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (docs.data ?? []).filter((d) => {
      if (!showArchived && d.archived) return false;
      if (fCat !== "all" && d.category !== fCat) return false;
      if (fStatus !== "all" && d.status !== fStatus) return false;
      if (fFolder !== "all" && (d.folder ?? "") !== fFolder) return false;
      if (s && ![d.name, d.folder, d.reference, d.owner, d.description, (d.tags ?? []).join(" ")]
        .some((x) => (x ?? "").toLowerCase().includes(s))) return false;
      return true;
    });
  }, [docs.data, search, fCat, fStatus, fFolder, showArchived]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qkDocs });
    qc.invalidateQueries({ queryKey: qkEvents });
  };

  const removeDoc = async (d: Doc) => {
    if (!confirm(`Supprimer le document « ${d.name} » et tout son historique ?`)) return;
    const r = await offlineDelete("documents" as any, d.id);
    if (!r.ok) return toast.error(r.error ?? "Suppression échouée");
    toast.success(r.queued ? "Suppression enregistrée hors ligne" : "Document supprimé");
    refresh();
  };

  const toggleArchive = async (d: Doc) => {
    const r = await offlineUpdate("documents" as any, d.id, { archived: !d.archived });
    if (!r.ok) return toast.error(r.error ?? "Échec");
    toast.success(d.archived ? "Document désarchivé" : "Document archivé");
    refresh();
  };

  const removeEvent = async (e: DocEvent) => {
    if (!confirm("Supprimer cet événement de l'historique ?")) return;
    const r = await offlineDelete("document_events" as any, e.id);
    if (!r.ok) return toast.error(r.error ?? "Échec");
    toast.success("Événement supprimé");
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg uppercase tracking-widest">Suivi de mes documents</h1>
          <p className="text-sm text-muted-foreground">Inventaire de vos documents et historique daté de chaque événement.</p>
        </div>
        <Button onClick={() => setDocDialog({ open: true, doc: null })}>
          <Plus className="mr-1 h-4 w-4" /> Nouveau document
        </Button>
      </div>

      <Panel title="Filtres">
        <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label className="text-xs">Recherche</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, dossier, référence…" />
          </div>
          <div>
            <Label className="text-xs">Catégorie</Label>
            <Select value={fCat} onValueChange={setFCat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Statut</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {STATUSES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Dossier</Label>
            <Select value={fFolder} onValueChange={setFFolder}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {folders.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Masquer archivés" : "Afficher archivés"}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title={`Documents (${list.length})`}>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 w-8" />
                <th className="px-2 py-2">Nom</th>
                <th className="px-2 py-2">Dossier</th>
                <th className="px-2 py-2">Catégorie</th>
                <th className="px-2 py-2">Statut</th>
                <th className="px-2 py-2">Version</th>
                <th className="px-2 py-2">Créé le</th>
                <th className="px-2 py-2 text-center">Événements</th>
                <th className="px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.isLoading ? (
                <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Chargement…</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Aucun document.</td></tr>
              ) : list.map((d) => {
                const evts = eventsByDoc.get(d.id) ?? [];
                const isOpen = expanded === d.id;
                return (
                  <>
                    <tr key={d.id} className={cn("border-t border-border/60", d.archived && "opacity-60")}>
                      <td className="px-2 py-1.5">
                        <button onClick={() => setExpanded(isOpen ? null : d.id)} aria-label="Historique">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2 font-medium">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          {d.path_or_link && /^https?:\/\//.test(d.path_or_link)
                            ? <a href={d.path_or_link} target="_blank" rel="noreferrer" className="hover:underline">{d.name}</a>
                            : d.name}
                        </div>
                        {d.reference && <div className="text-[10px] text-muted-foreground">Réf. {d.reference}</div>}
                        {(d.tags ?? []).length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {(d.tags ?? []).map((t) => (
                              <span key={t} className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase">{t}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">{d.folder ?? "—"}</td>
                      <td className="px-2 py-1.5 text-xs">{label(CATEGORIES, d.category)}</td>
                      <td className="px-2 py-1.5">
                        <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase">{label(STATUSES, d.status)}</span>
                      </td>
                      <td className="px-2 py-1.5 text-xs">{d.current_version ?? "—"}</td>
                      <td className="num px-2 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                        {d.document_date ? new Date(d.document_date).toLocaleDateString("fr-FR") : new Date(d.created_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-2 py-1.5 text-center text-xs">{evts.length}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEvtDialog({ open: true, docId: d.id, evt: null })} title="Ajouter un événement">
                            <History className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDocDialog({ open: true, doc: d })} title="Modifier">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleArchive(d)} title={d.archived ? "Désarchiver" : "Archiver"}>
                            {d.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeDoc(d)} title="Supprimer">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${d.id}-h`} className="border-t border-border/40 bg-muted/30">
                        <td />
                        <td colSpan={8} className="px-2 py-3">
                          {d.description && <p className="mb-2 text-xs text-muted-foreground">{d.description}</p>}
                          <div className="mb-2 flex items-center justify-between">
                            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Historique</span>
                            <Button size="sm" variant="outline" onClick={() => setEvtDialog({ open: true, docId: d.id, evt: null })}>
                              <Plus className="mr-1 h-3 w-3" /> Événement
                            </Button>
                          </div>
                          {evts.length === 0 ? (
                            <p className="py-3 text-center text-xs text-muted-foreground">Aucun événement enregistré.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {evts.map((e) => (
                                <li key={e.id} className="flex items-start justify-between gap-3 rounded-sm border border-border/50 bg-background px-2 py-1.5">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="num text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(e.occurred_at)}</span>
                                      <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase">{label(EVENT_TYPES, e.event_type)}</span>
                                      <span className="text-sm font-medium">{e.title}</span>
                                      {e.version && <span className="text-[10px] text-muted-foreground">v{e.version}</span>}
                                    </div>
                                    {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                                    <div className="text-[10px] text-muted-foreground">
                                      {[e.author && `Par ${e.author}`, e.location, e.notes].filter(Boolean).join(" · ")}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 gap-1">
                                    <Button size="sm" variant="ghost" onClick={() => setEvtDialog({ open: true, docId: d.id, evt: e })}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => removeEvent(e)}>
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {docDialog.open && (
        <DocDialog
          doc={docDialog.doc}
          folders={folders}
          onClose={() => setDocDialog({ open: false, doc: null })}
          onSaved={refresh}
        />
      )}
      {evtDialog?.open && (
        <EventDialog
          docId={evtDialog.docId}
          evt={evtDialog.evt}
          onClose={() => setEvtDialog(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function DocDialog({ doc, folders, onClose, onSaved }: { doc: Doc | null; folders: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: doc?.name ?? "",
    description: doc?.description ?? "",
    folder: doc?.folder ?? "",
    path_or_link: doc?.path_or_link ?? "",
    category: doc?.category ?? "perso",
    file_type: doc?.file_type ?? "",
    reference: doc?.reference ?? "",
    current_version: doc?.current_version ?? "",
    status: doc?.status ?? "en_cours",
    confidentiality: doc?.confidentiality ?? "normal",
    owner: doc?.owner ?? "",
    document_date: doc?.document_date ?? new Date().toISOString().slice(0, 10),
    due_date: doc?.due_date ?? "",
    tags: (doc?.tags ?? []).join(", "),
    notes: doc?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) return toast.error("Le nom du document est requis.");
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: f.name.trim(),
      description: f.description || null,
      folder: f.folder || null,
      path_or_link: f.path_or_link || null,
      category: f.category,
      file_type: f.file_type || null,
      reference: f.reference || null,
      current_version: f.current_version || null,
      status: f.status,
      confidentiality: f.confidentiality,
      owner: f.owner || null,
      document_date: f.document_date || null,
      due_date: f.due_date || null,
      tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      notes: f.notes || null,
    };
    const r = doc
      ? await offlineUpdate("documents" as any, doc.id, payload)
      : await offlineInsert("documents" as any, payload);
    setSaving(false);
    if (!r.ok) return toast.error(r.error ?? "Enregistrement échoué");
    if (!doc && r.id) {
      await offlineInsert("document_events" as any, {
        document_id: r.id,
        occurred_at: new Date().toISOString(),
        event_type: "creation",
        title: "Création du document",
        version: f.current_version || null,
      });
    }
    toast.success(r.queued ? "Enregistré hors ligne" : doc ? "Document mis à jour" : "Document créé");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{doc ? "Modifier le document" : "Nouveau document"}</DialogTitle></DialogHeader>
        <div className="scroll-thin grid max-h-[65vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nom du document *</Label>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Contrat de bail 2026" />
          </div>
          <div>
            <Label>Dossier / emplacement</Label>
            <Input list="doc-folders" value={f.folder} onChange={(e) => set("folder", e.target.value)} placeholder="Documents/Travail" />
            <datalist id="doc-folders">{folders.map((x) => <option key={x} value={x} />)}</datalist>
          </div>
          <div>
            <Label>Chemin ou lien</Label>
            <Input value={f.path_or_link} onChange={(e) => set("path_or_link", e.target.value)} placeholder="https://… ou D:\Docs\…" />
          </div>
          <div>
            <Label>Catégorie</Label>
            <Select value={f.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Statut</Label>
            <Select value={f.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Confidentialité</Label>
            <Select value={f.confidentiality} onValueChange={(v) => set("confidentiality", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONFIDENTIALITY.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Type de fichier</Label>
            <Input value={f.file_type} onChange={(e) => set("file_type", e.target.value)} placeholder="PDF, DOCX, papier…" />
          </div>
          <div>
            <Label>Référence</Label>
            <Input value={f.reference} onChange={(e) => set("reference", e.target.value)} />
          </div>
          <div>
            <Label>Version actuelle</Label>
            <Input value={f.current_version} onChange={(e) => set("current_version", e.target.value)} placeholder="1.0" />
          </div>
          <div>
            <Label>Responsable / propriétaire</Label>
            <Input value={f.owner} onChange={(e) => set("owner", e.target.value)} />
          </div>
          <div>
            <Label>Date de création</Label>
            <Input type="date" value={f.document_date} onChange={(e) => set("document_date", e.target.value)} />
          </div>
          <div>
            <Label>Échéance / expiration</Label>
            <Input type="date" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Tags (séparés par virgule)</Label>
            <Input value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="contrat, urgent" />
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventDialog({ docId, evt, onClose, onSaved }: { docId: string; evt: DocEvent | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    occurred_at: toLocalInput(evt?.occurred_at ?? new Date().toISOString()),
    event_type: evt?.event_type ?? "modification",
    title: evt?.title ?? "",
    description: evt?.description ?? "",
    version: evt?.version ?? "",
    author: evt?.author ?? "",
    location: evt?.location ?? "",
    notes: evt?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.title.trim()) return toast.error("Le titre de l'événement est requis.");
    setSaving(true);
    const payload: Record<string, unknown> = {
      document_id: docId,
      occurred_at: new Date(f.occurred_at).toISOString(),
      event_type: f.event_type,
      title: f.title.trim(),
      description: f.description || null,
      version: f.version || null,
      author: f.author || null,
      location: f.location || null,
      notes: f.notes || null,
    };
    const r = evt
      ? await offlineUpdate("document_events" as any, evt.id, payload)
      : await offlineInsert("document_events" as any, payload);
    if (!evt && f.version) await offlineUpdate("documents" as any, docId, { current_version: f.version });
    setSaving(false);
    if (!r.ok) return toast.error(r.error ?? "Enregistrement échoué");
    toast.success(r.queued ? "Enregistré hors ligne" : "Événement enregistré");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{evt ? "Modifier l'événement" : "Nouvel événement"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Date et heure</Label>
            <Input type="datetime-local" value={f.occurred_at} onChange={(e) => set("occurred_at", e.target.value)} />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={f.event_type} onValueChange={(v) => set("event_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EVENT_TYPES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Titre *</Label>
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Ajout de la clause de garantie" />
          </div>
          <div>
            <Label>Version</Label>
            <Input value={f.version} onChange={(e) => set("version", e.target.value)} placeholder="1.1" />
          </div>
          <div>
            <Label>Auteur</Label>
            <Input value={f.author} onChange={(e) => set("author", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Lieu</Label>
            <Input value={f.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
