import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { offlineInsert, offlineUpdate, offlineDelete, currentUserId } from "@/lib/offline/mutations";
import {
  bsBlocksQO, bsFoldersQO, bsSessionsQO, qkBsBlocks, qkBsFolders, qkBsSessions,
  BS_STATUSES, BS_KINDS, bsStatusMeta, sessionToMarkdown, sessionToText, matchesSearch,
  type BsBlock, type BsBlockKind, type BsFolder, type BsSession, type BsStatus,
} from "@/lib/brainstorm";
import {
  Plus, Search, Folder, FolderPlus, ChevronDown, ChevronRight, Trash2, Copy, Pencil, Zap,
  Archive, ArchiveRestore, ArrowLeft, Download, Merge, LayoutList, LayoutGrid, MessageSquare, HelpCircle, ListChecks, StickyNote, Lightbulb, CheckSquare,
} from "lucide-react";
import { ymd } from "@/lib/planning";

export const Route = createFileRoute("/_authenticated/brainstorm")({
  head: () => ({
    meta: [
      { title: "Brainstorming — OPTIS" },
      { name: "description", content: "Capturez, organisez et structurez vos idées par dossiers et sessions, puis transformez-les en actions concrètes." },
      { property: "og:title", content: "Brainstorming — OPTIS" },
      { property: "og:description", content: "Module de brainstorming universel : capture rapide, dossiers, sessions, mode carte libre et actions extraites." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Brainstorming — OPTIS" },
      { name: "twitter:description", content: "Capture rapide d'idées, organisation par dossiers et extraction d'actions." },
    ],
  }),
  component: BrainstormPage,
});

const KIND_ICON: Record<BsBlockKind, typeof Lightbulb> = {
  idea: Lightbulb,
  bullets: ListChecks,
  question: HelpCircle,
  note: StickyNote,
  action: CheckSquare,
};

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function BrainstormPage() {
  const qc = useQueryClient();
  const { data: folders = [] } = useQuery(bsFoldersQO);
  const { data: sessions = [] } = useQuery(bsSessionsQO);
  const { data: blocks = [] } = useQuery(bsBlocksQO);

  const [tab, setTab] = useState<"folders" | "actions">("folders");
  const [selectedFolder, setSelectedFolder] = useState<string | "all">("all");
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [folderDialog, setFolderDialog] = useState<{ open: boolean; id?: string; parent?: string | null; name: string }>({ open: false, name: "" });
  const [mergeFor, setMergeFor] = useState<BsSession | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qkBsFolders });
    qc.invalidateQueries({ queryKey: qkBsSessions });
    qc.invalidateQueries({ queryKey: qkBsBlocks });
  };

  const blocksBySession = useMemo(() => {
    const m = new Map<string, BsBlock[]>();
    for (const b of blocks) {
      const arr = m.get(b.session_id) ?? [];
      arr.push(b);
      m.set(b.session_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.sort_order - b.sort_order);
    return m;
  }, [blocks]);

  const visibleSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (!showArchived && (s.archived || s.status === "archive")) return search.trim().length > 0;
      return true;
    });
  }, [sessions, showArchived, search]);

  const filteredSessions = useMemo(() => {
    return visibleSessions.filter((s) => {
      if (search.trim()) return matchesSearch(search, s, blocksBySession.get(s.id) ?? []);
      if (selectedFolder === "all") return true;
      return s.folder_id === selectedFolder;
    });
  }, [visibleSessions, search, selectedFolder, blocksBySession]);

  const countFor = (folderId: string) =>
    sessions.filter((s) => s.folder_id === folderId && !s.archived && s.status !== "archive").length;

  const openSession = openSessionId ? sessions.find((s) => s.id === openSessionId) ?? null : null;

  /* ---------------- folders ---------------- */

  async function saveFolder() {
    const name = folderDialog.name.trim();
    if (!name) return toast.error("Nom requis");
    const user_id = await currentUserId();
    if (folderDialog.id) {
      await offlineUpdate("brainstorm_folders", folderDialog.id, { name });
    } else {
      await offlineInsert("brainstorm_folders", {
        user_id, name, parent_id: folderDialog.parent ?? null, is_system: false, sort_order: folders.length + 10,
      });
    }
    setFolderDialog({ open: false, name: "" });
    invalidate();
    toast.success("Dossier enregistré");
  }

  async function removeFolder(f: BsFolder) {
    if (f.is_system) return toast.error("Les dossiers Perso, Pro et Autre ne peuvent pas être supprimés.");
    if (!confirm(`Supprimer le dossier « ${f.name} » ? Les sessions seront déplacées hors dossier.`)) return;
    for (const s of sessions.filter((s) => s.folder_id === f.id)) {
      await offlineUpdate("brainstorm_sessions", s.id, { folder_id: null });
    }
    await offlineDelete("brainstorm_folders", f.id);
    if (selectedFolder === f.id) setSelectedFolder("all");
    invalidate();
  }

  /* ---------------- sessions ---------------- */

  async function quickIdea() {
    const user_id = await currentUserId();
    const fallback = folders.find((f) => f.is_system && f.name === "Perso") ?? folders[0];
    const res = await offlineInsert("brainstorm_sessions", {
      user_id, title: "", folder_id: (selectedFolder !== "all" ? selectedFolder : fallback?.id) ?? null,
      status: "brouillon", tags: [], view_mode: "list", archived: false,
    });
    invalidate();
    if (res.id) setOpenSessionId(res.id);
  }

  async function newSession(folderId: string | null) {
    const user_id = await currentUserId();
    const res = await offlineInsert("brainstorm_sessions", {
      user_id, title: "", folder_id: folderId, status: "brouillon", tags: [], view_mode: "list", archived: false,
    });
    invalidate();
    if (res.id) setOpenSessionId(res.id);
  }

  async function patchSession(id: string, patch: Record<string, unknown>) {
    await offlineUpdate("brainstorm_sessions", id, patch);
    qc.invalidateQueries({ queryKey: qkBsSessions });
  }

  async function removeSession(s: BsSession) {
    if (!confirm("Supprimer définitivement cette session et ses idées ?")) return;
    for (const b of blocksBySession.get(s.id) ?? []) await offlineDelete("brainstorm_blocks", b.id);
    await offlineDelete("brainstorm_sessions", s.id);
    if (openSessionId === s.id) setOpenSessionId(null);
    invalidate();
  }

  async function mergeInto(source: BsSession, targetId: string) {
    const target = sessions.find((s) => s.id === targetId);
    if (!target) return;
    const targetBlocks = blocksBySession.get(targetId) ?? [];
    let order = (targetBlocks.at(-1)?.sort_order ?? 0) + 1;
    for (const b of blocksBySession.get(source.id) ?? []) {
      await offlineUpdate("brainstorm_blocks", b.id, { session_id: targetId, sort_order: order++ });
    }
    const tags = Array.from(new Set([...(target.tags ?? []), ...(source.tags ?? [])]));
    await offlineUpdate("brainstorm_sessions", targetId, { tags });
    await offlineDelete("brainstorm_sessions", source.id);
    setMergeFor(null);
    setOpenSessionId(targetId);
    invalidate();
    toast.success("Sessions fusionnées");
  }

  /* ---------------- render ---------------- */

  const actionBlocks = useMemo(
    () => blocks.filter((b) => b.is_action || b.kind === "action").sort((a, b) => Number(a.action_done) - Number(b.action_done)),
    [blocks],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg uppercase tracking-[0.2em]">Brainstorming</h1>
          <p className="text-xs text-muted-foreground">Capturez d'abord, rangez ensuite.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Recherche globale (titres, tags, idées)"
              className="h-8 w-72 pl-7 text-xs"
            />
          </div>
          <Button size="sm" variant={tab === "actions" ? "default" : "outline"} onClick={() => setTab(tab === "actions" ? "folders" : "actions")}>
            <Zap className="mr-1 h-3.5 w-3.5" /> Actions extraites
          </Button>
          <Button size="sm" onClick={quickIdea}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nouvelle idée
          </Button>
        </div>
      </header>

      {tab === "actions" ? (
        <ActionsView
          blocks={actionBlocks}
          sessions={sessions}
          onOpen={(id) => { setTab("folders"); setOpenSessionId(id); }}
          onChanged={invalidate}
        />
      ) : openSession ? (
        <SessionView
          session={openSession}
          blocks={blocksBySession.get(openSession.id) ?? []}
          folders={folders}
          sessions={sessions}
          onBack={() => setOpenSessionId(null)}
          onPatch={patchSession}
          onChanged={invalidate}
          onDelete={() => removeSession(openSession)}
          onMerge={() => setMergeFor(openSession)}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Panel
            title="Dossiers"
            action={
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setFolderDialog({ open: true, name: "", parent: null })}>
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            }
          >
            <div className="space-y-0.5 text-sm">
              <button
                onClick={() => setSelectedFolder("all")}
                className={cn("flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-muted/50", selectedFolder === "all" && "bg-muted")}
              >
                <span className="flex items-center gap-2"><Folder className="h-3.5 w-3.5" /> Tout</span>
                <span className="text-xs text-muted-foreground">{sessions.filter((s) => !s.archived).length}</span>
              </button>
              <FolderTree
                folders={folders}
                parent={null}
                depth={0}
                selected={selectedFolder}
                collapsed={collapsed}
                onToggle={(id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))}
                onSelect={setSelectedFolder}
                count={countFor}
                onAddChild={(id) => setFolderDialog({ open: true, name: "", parent: id })}
                onRename={(f) => setFolderDialog({ open: true, id: f.id, name: f.name })}
                onDelete={removeFolder}
              />
            </div>
            <label className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Afficher les sessions archivées
            </label>
          </Panel>

          <Panel
            title={search.trim() ? `Résultats de recherche (${filteredSessions.length})` : "Sessions"}
            action={
              <Button size="sm" variant="outline" onClick={() => newSession(selectedFolder === "all" ? null : selectedFolder)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Nouvelle session
              </Button>
            }
          >
            {filteredSessions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucune session. Lancez-vous avec « Nouvelle idée ».</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredSessions.map((s) => {
                  const bs = blocksBySession.get(s.id) ?? [];
                  const meta = bsStatusMeta(s.status);
                  return (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/session", s.id)}
                      className="cursor-pointer rounded-md border border-border bg-background p-3 transition-colors hover:border-primary/50"
                      onClick={() => setOpenSessionId(s.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium">{s.title || "Sans titre"}</h3>
                        <Badge variant="outline" className={cn("shrink-0 text-[10px]", meta.className)}>{meta.label}</Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">Modifié le {fmtDate(s.updated_at)} · {bs.length} bloc(s)</p>
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {bs.slice(0, 2).map((b) => (
                          <li key={b.id} className="truncate">• {b.content || (b.items ?? []).join(", ") || "…"}</li>
                        ))}
                      </ul>
                      {(s.tags ?? []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {s.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      )}

      <Dialog open={folderDialog.open} onOpenChange={(o) => setFolderDialog((d) => ({ ...d, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>{folderDialog.id ? "Renommer le dossier" : "Nouveau dossier"}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Nom</Label>
            <Input value={folderDialog.name} onChange={(e) => setFolderDialog((d) => ({ ...d, name: e.target.value }))} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialog({ open: false, name: "" })}>Annuler</Button>
            <Button onClick={saveFolder}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!mergeFor} onOpenChange={(o) => !o && setMergeFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Fusionner « {mergeFor?.title || "Sans titre"} » dans…</DialogTitle></DialogHeader>
          <div className="max-h-72 space-y-1 overflow-auto">
            {sessions.filter((s) => s.id !== mergeFor?.id).map((s) => (
              <button
                key={s.id}
                onClick={() => mergeFor && mergeInto(mergeFor, s.id)}
                className="w-full rounded border border-border px-3 py-2 text-left text-sm hover:bg-muted/50"
              >
                {s.title || "Sans titre"} <span className="text-xs text-muted-foreground">· {fmtDate(s.updated_at)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- folder tree ---------------- */

function FolderTree({
  folders, parent, depth, selected, collapsed, onToggle, onSelect, count, onAddChild, onRename, onDelete,
}: {
  folders: BsFolder[]; parent: string | null; depth: number; selected: string | "all";
  collapsed: Record<string, boolean>; onToggle: (id: string) => void; onSelect: (id: string) => void;
  count: (id: string) => number; onAddChild: (id: string) => void; onRename: (f: BsFolder) => void; onDelete: (f: BsFolder) => void;
}) {
  const children = folders.filter((f) => (f.parent_id ?? null) === parent);
  return (
    <>
      {children.map((f) => {
        const kids = folders.filter((x) => x.parent_id === f.id);
        const isCollapsed = collapsed[f.id];
        return (
          <div key={f.id}>
            <div
              className={cn("group flex items-center gap-1 rounded px-1 py-1.5 hover:bg-muted/50", selected === f.id && "bg-muted")}
              style={{ paddingLeft: 4 + depth * 12 }}
            >
              <button className="shrink-0 text-muted-foreground" onClick={() => onToggle(f.id)}>
                {kids.length > 0 ? (isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <span className="inline-block w-3.5" />}
              </button>
              <button className="flex flex-1 items-center gap-2 truncate text-left" onClick={() => onSelect(f.id)}>
                <Folder className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
              <span className="text-xs text-muted-foreground">{count(f.id)}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100"><Pencil className="h-3 w-3" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onAddChild(f.id)}><FolderPlus className="mr-2 h-3.5 w-3.5" /> Sous-dossier</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRename(f)}><Pencil className="mr-2 h-3.5 w-3.5" /> Renommer</DropdownMenuItem>
                  {!f.is_system && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => onDelete(f)}><Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {!isCollapsed && kids.length > 0 && (
              <FolderTree
                folders={folders} parent={f.id} depth={depth + 1} selected={selected} collapsed={collapsed}
                onToggle={onToggle} onSelect={onSelect} count={count} onAddChild={onAddChild} onRename={onRename} onDelete={onDelete}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/* ---------------- session view ---------------- */

function SessionView({
  session, blocks, folders, sessions, onBack, onPatch, onChanged, onDelete, onMerge,
}: {
  session: BsSession; blocks: BsBlock[]; folders: BsFolder[]; sessions: BsSession[];
  onBack: () => void; onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onChanged: () => void; onDelete: () => void; onMerge: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState(session.title);
  const [tagInput, setTagInput] = useState("");
  const dragId = useRef<string | null>(null);

  const canvas = session.view_mode === "canvas";

  async function addBlock(kind: BsBlockKind = "idea") {
    const content = draft.trim();
    if (!content) return;
    const user_id = await currentUserId();
    await offlineInsert("brainstorm_blocks", {
      user_id, session_id: session.id, kind, content, items: [],
      is_action: kind === "action", action_done: false,
      pos_x: 24 + (blocks.length % 4) * 220, pos_y: 24 + Math.floor(blocks.length / 4) * 140,
      sort_order: (blocks.at(-1)?.sort_order ?? 0) + 1,
    });
    setDraft("");
    await onPatch(session.id, { updated_at: new Date().toISOString() });
    onChanged();
  }

  async function patchBlock(id: string, patch: Record<string, unknown>) {
    await offlineUpdate("brainstorm_blocks", id, patch);
    onChanged();
  }

  async function duplicate(b: BsBlock) {
    const user_id = await currentUserId();
    await offlineInsert("brainstorm_blocks", {
      user_id, session_id: session.id, kind: b.kind, content: b.content, items: b.items ?? [],
      is_action: b.is_action, action_done: false, pos_x: b.pos_x + 24, pos_y: b.pos_y + 24,
      sort_order: b.sort_order + 1,
    });
    onChanged();
  }

  async function remove(b: BsBlock) {
    await offlineDelete("brainstorm_blocks", b.id);
    onChanged();
  }

  async function reorder(targetId: string) {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    const list = [...blocks];
    const fromIdx = list.findIndex((b) => b.id === from);
    const toIdx = list.findIndex((b) => b.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    for (let i = 0; i < list.length; i++) {
      if (list[i].sort_order !== i) await offlineUpdate("brainstorm_blocks", list[i].id, { sort_order: i });
    }
    onChanged();
  }

  async function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    await onPatch(session.id, { tags: Array.from(new Set([...(session.tags ?? []), t])) });
    setTagInput("");
  }

  return (
    <div className="space-y-4">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <button onClick={onBack} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /></button>
            Session
          </span>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onPatch(session.id, { view_mode: canvas ? "list" : "canvas" })}>
              {canvas ? <LayoutList className="mr-1 h-3.5 w-3.5" /> : <LayoutGrid className="mr-1 h-3.5 w-3.5" />}
              {canvas ? "Mode liste" : "Mode carte libre"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm" variant="outline"><Download className="mr-1 h-3.5 w-3.5" /> Export</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => download(`${session.title || "session"}.md`, sessionToMarkdown(session, blocks))}>Markdown (.md)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => download(`${session.title || "session"}.txt`, sessionToText(session, blocks))}>Texte brut (.txt)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" onClick={onMerge} disabled={sessions.length < 2}><Merge className="mr-1 h-3.5 w-3.5" /> Fusionner</Button>
            <Button size="sm" variant="outline" onClick={() => onPatch(session.id, { archived: !session.archived, status: session.archived ? "en_cours" : "archive" })}>
              {session.archived ? <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> : <Archive className="mr-1 h-3.5 w-3.5" />}
              {session.archived ? "Désarchiver" : "Archiver"}
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <Input
            value={title}
            placeholder="Titre (optionnel)"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== session.title && onPatch(session.id, { title })}
            className="text-base font-medium"
          />
          <Select value={session.status} onValueChange={(v) => onPatch(session.id, { status: v as BsStatus })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{BS_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={session.folder_id ?? "none"} onValueChange={(v) => onPatch(session.id, { folder_id: v === "none" ? null : v })}>
            <SelectTrigger><SelectValue placeholder="Dossier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sans dossier</SelectItem>
              {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(session.tags ?? []).map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 text-[10px]">
              {t}
              <button onClick={() => onPatch(session.id, { tags: session.tags.filter((x) => x !== t) })}>×</button>
            </Badge>
          ))}
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder="+ tag"
            className="h-7 w-32 text-xs"
          />
        </div>
      </Panel>

      <Panel title={`Idées (${blocks.length})`}>
        <div className="mb-3 flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBlock("idea"); } }}
            placeholder="Tapez une idée puis Entrée…"
            autoFocus
          />
          <Button onClick={() => addBlock("idea")}><Plus className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" onClick={() => addBlock("question")} title="Ajouter comme question ouverte"><HelpCircle className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" onClick={() => addBlock("action")} title="Ajouter comme action"><CheckSquare className="h-3.5 w-3.5" /></Button>
        </div>

        {blocks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucune idée pour l'instant. Tout commence par une phrase.</p>
        ) : canvas ? (
          <CanvasBoard blocks={blocks} onPatch={patchBlock} onRemove={remove} onDuplicate={duplicate} />
        ) : (
          <div className="space-y-2">
            {blocks.map((b) => (
              <BlockRow
                key={b.id}
                block={b}
                onDragStart={() => (dragId.current = b.id)}
                onDrop={() => reorder(b.id)}
                onPatch={patchBlock}
                onRemove={() => remove(b)}
                onDuplicate={() => duplicate(b)}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function BlockRow({
  block, onDragStart, onDrop, onPatch, onRemove, onDuplicate,
}: {
  block: BsBlock; onDragStart: () => void; onDrop: () => void;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>; onRemove: () => void; onDuplicate: () => void;
}) {
  const [value, setValue] = useState(block.content);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const Icon = KIND_ICON[block.kind];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={cn(
        "group rounded-md border border-border bg-background p-2",
        block.kind === "question" && "border-l-2 border-l-sky-500",
        block.kind === "note" && "border-l-2 border-l-muted-foreground/50 bg-muted/30",
        (block.is_action || block.kind === "action") && "border-l-2 border-l-amber-500",
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => value !== block.content && onPatch(block.id, { content: value })}
          rows={1}
          className="min-h-[36px] resize-y border-none bg-transparent px-1 py-1.5 text-sm shadow-none focus-visible:ring-0"
        />
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Select value={block.kind} onValueChange={(v) => onPatch(block.id, { kind: v, is_action: v === "action" ? true : block.is_action })}>
            <SelectTrigger className="h-7 w-[130px] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>{BS_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Marquer comme action" onClick={() => onPatch(block.id, { is_action: !block.is_action })}>
            <Zap className={cn("h-3.5 w-3.5", block.is_action && "text-amber-500")} />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Commenter" onClick={() => setShowComment((s) => !s)}><MessageSquare className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Dupliquer" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Supprimer" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {block.kind === "bullets" && (
        <div className="ml-6 mt-1 space-y-1">
          {(block.items ?? []).map((it, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-muted-foreground">•</span>
              <Input
                defaultValue={it}
                onBlur={(e) => {
                  const items = [...(block.items ?? [])];
                  items[i] = e.target.value;
                  onPatch(block.id, { items });
                }}
                className="h-7 text-xs"
              />
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onPatch(block.id, { items: (block.items ?? []).filter((_, j) => j !== i) })}>×</Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => onPatch(block.id, { items: [...(block.items ?? []), ""] })}>
            <Plus className="mr-1 h-3 w-3" /> Puce
          </Button>
        </div>
      )}

      {showComment && (
        <div className="ml-6 mt-2 flex gap-2">
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Note liée à cette idée" className="h-7 text-xs" />
          <Button
            size="sm"
            className="h-7"
            onClick={async () => {
              const c = comment.trim();
              if (!c) return;
              const user_id = await currentUserId();
              await offlineInsert("brainstorm_blocks", {
                user_id, session_id: block.session_id, parent_id: block.id, kind: "note", content: c,
                items: [], is_action: false, action_done: false, pos_x: block.pos_x + 20, pos_y: block.pos_y + 80,
                sort_order: block.sort_order + 1,
              });
              setComment("");
              setShowComment(false);
              await onPatch(block.id, {});
            }}
          >
            Ajouter
          </Button>
        </div>
      )}
    </div>
  );
}

function CanvasBoard({
  blocks, onPatch, onRemove, onDuplicate,
}: {
  blocks: BsBlock[];
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onRemove: (b: BsBlock) => void;
  onDuplicate: (b: BsBlock) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const posOf = (b: BsBlock) => positions[b.id] ?? { x: Number(b.pos_x) || 0, y: Number(b.pos_y) || 0 };

  const onMouseDown = (e: React.MouseEvent, b: BsBlock) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const p = posOf(b);
    drag.current = { id: b.id, dx: e.clientX - rect.left - p.x, dy: e.clientY - rect.top - p.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const d = drag.current;
    const rect = ref.current?.getBoundingClientRect();
    if (!d || !rect) return;
    setPositions((p) => ({
      ...p,
      [d.id]: { x: Math.max(0, e.clientX - rect.left - d.dx), y: Math.max(0, e.clientY - rect.top - d.dy) },
    }));
  };

  const onMouseUp = async () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const p = positions[d.id];
    if (p) await onPatch(d.id, { pos_x: Math.round(p.x), pos_y: Math.round(p.y) });
  };

  const height = Math.max(420, ...blocks.map((b) => posOf(b).y + 160));

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      className="relative w-full overflow-auto rounded-md border border-dashed border-border bg-muted/20"
      style={{ height }}
    >
      {blocks.map((b) => {
        const p = posOf(b);
        const Icon = KIND_ICON[b.kind];
        return (
          <div
            key={b.id}
            className={cn(
              "group absolute w-52 select-none rounded-md border border-border bg-card p-2 shadow-sm",
              (b.is_action || b.kind === "action") && "border-amber-500/60",
              b.kind === "question" && "border-sky-500/60",
            )}
            style={{ left: p.x, top: p.y }}
          >
            <div className="mb-1 flex cursor-move items-center justify-between" onMouseDown={(e) => onMouseDown(e, b)}>
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onPatch(b.id, { is_action: !b.is_action })}><Zap className={cn("h-3 w-3", b.is_action && "text-amber-500")} /></Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onDuplicate(b)}><Copy className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => onRemove(b)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
            <Textarea
              defaultValue={b.content}
              onBlur={(e) => e.target.value !== b.content && onPatch(b.id, { content: e.target.value })}
              rows={3}
              className="resize-none border-none bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
            />
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- actions view ---------------- */

function ActionsView({
  blocks, sessions, onOpen, onChanged,
}: {
  blocks: BsBlock[]; sessions: BsSession[]; onOpen: (sessionId: string) => void; onChanged: () => void;
}) {
  async function toPlanning(b: BsBlock) {
    try {
      const user_id = await currentUserId();
      const res = await offlineInsert("plan_items", {
        user_id, title: b.content || "Idée sans titre", status: "todo", priority: "medium",
        urgent: false, important: true, scheduled_on: ymd(new Date()), all_day: true,
        no_fixed_time: true, recurrence: "none", sort_order: 0,
      });
      await offlineUpdate("brainstorm_blocks", b.id, { plan_item_id: res.id ?? null });
      onChanged();
      toast.success("Envoyé vers la planification");
    } catch (e: any) {
      toast.error(e.message ?? "Échec de l'envoi");
    }
  }

  return (
    <Panel title={`Actions extraites (${blocks.length})`}>
      {blocks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Marquez une idée comme action (icône éclair) pour la retrouver ici.</p>
      ) : (
        <div className="space-y-2">
          {blocks.map((b) => {
            const s = sessions.find((x) => x.id === b.session_id);
            return (
              <div key={b.id} className="flex items-center gap-3 rounded-md border border-border bg-background p-2">
                <input
                  type="checkbox"
                  checked={b.action_done}
                  onChange={async () => { await offlineUpdate("brainstorm_blocks", b.id, { action_done: !b.action_done }); onChanged(); }}
                />
                <span className={cn("flex-1 text-sm", b.action_done && "text-muted-foreground line-through")}>{b.content || "—"}</span>
                <button className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => onOpen(b.session_id)}>
                  {s?.title || "Sans titre"}
                </button>
                {b.plan_item_id ? (
                  <Badge variant="secondary" className="text-[10px]">Dans le planning</Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => toPlanning(b)}>
                    <ListChecks className="mr-1 h-3.5 w-3.5" /> Vers planification
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
