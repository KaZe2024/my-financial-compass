import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Sparkles, Plus, Trash2, Send, Loader2, MessageSquare, Pencil } from "lucide-react";
import { listConversations, getConversation, createConversation, deleteConversation, renameConversation, sendMessage } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({ meta: [{ title: "Assistant CFO — Personal CFO" }] }),
  component: AiPage,
});

function AiPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listConversations);
  const createFn = useServerFn(createConversation);
  const deleteFn = useServerFn(deleteConversation);
  const renameFn = useServerFn(renameConversation);
  const getFn = useServerFn(getConversation);
  const sendFn = useServerFn(sendMessage);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const convs = useQuery({ queryKey: ["ai_convs"], queryFn: () => listFn() });
  const active = useQuery({
    queryKey: ["ai_conv", activeId],
    queryFn: () => getFn({ data: { id: activeId! } }),
    enabled: !!activeId,
  });

  useEffect(() => {
    if (!activeId && convs.data && convs.data.length > 0) setActiveId(convs.data[0].id);
  }, [convs.data, activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active.data?.messages.length]);

  const createMut = useMutation({
    mutationFn: () => createFn(),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["ai_convs"] });
      setActiveId(c.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai_convs"] }); setActiveId(null); },
  });

  const renameMut = useMutation({
    mutationFn: (v: { id: string; title: string }) => renameFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_convs"] }),
  });

  const sendMut = useMutation({
    mutationFn: async (content: string) => {
      let convId = activeId;
      if (!convId) {
        const c = await createFn();
        convId = c.id;
        setActiveId(c.id);
        qc.invalidateQueries({ queryKey: ["ai_convs"] });
      }
      return sendFn({ data: { conversationId: convId, content } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai_conv", activeId] });
      qc.invalidateQueries({ queryKey: ["ai_convs"] });
      setInput("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit() {
    const v = input.trim();
    if (!v || sendMut.isPending) return;
    sendMut.mutate(v);
  }

  const messages = active.data?.messages ?? [];
  const optimistic = sendMut.isPending ? sendMut.variables : null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Assistant</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold"><Sparkles className="h-6 w-6 text-primary" /> CFO IA</h1>
          <p className="mt-1 text-xs text-muted-foreground">Cumule les rôles de DAF, contrôleur de gestion et expert-comptable. Contexte financier injecté à chaque question.</p>
        </div>
        <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
          <Plus className="mr-2 h-4 w-4" /> Nouvelle conversation
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Panel title="Historique">
          <div className="space-y-1">
            {(convs.data ?? []).map((c) => (
              <ConvRow
                key={c.id}
                conv={c}
                active={c.id === activeId}
                onClick={() => setActiveId(c.id)}
                onRename={(t) => renameMut.mutate({ id: c.id, title: t })}
                onDelete={() => confirm("Supprimer cette conversation ?") && deleteMut.mutate(c.id)}
              />
            ))}
            {(convs.data ?? []).length === 0 && (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">Aucune conversation.<br />Clique sur "Nouvelle conversation".</div>
            )}
          </div>
        </Panel>

        <Panel title={active.data?.conversation?.title ?? "Aucune conversation"}>
          <div ref={scrollRef} className="scroll-thin h-[52vh] overflow-y-auto pr-2">
            {messages.length === 0 && !optimistic && (
              <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
                <div>
                  <MessageSquare className="mx-auto mb-2 h-6 w-6" />
                  Pose une question sur ton budget, ta trésorerie, tes dettes, tes projets…
                  <div className="mt-4 space-y-1 text-xs">
                    <p className="text-muted-foreground/70">Suggestions:</p>
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => setInput(s)} className="block w-full rounded-sm border border-border px-3 py-1.5 text-left text-xs hover:bg-muted">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-4">
              {messages.map((m) => <MessageBubble key={m.id} role={m.role} content={m.content} />)}
              {optimistic && <MessageBubble role="user" content={optimistic.content} />}
              {sendMut.isPending && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyse en cours…
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-end gap-2 border-t border-border pt-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              placeholder="Ta question au CFO IA… (Entrée pour envoyer, Shift+Entrée pour un saut de ligne)"
              rows={2}
              className="resize-none"
              autoFocus
            />
            <Button onClick={submit} disabled={!input.trim() || sendMut.isPending}>
              {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  "Fais-moi un point sur ma santé financière ce mois.",
  "Où sont mes plus grosses dépenses ?",
  "Comment optimiser mon taux d'épargne ?",
  "Quelles dettes dois-je prioriser ?",
];

function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${isUser ? "bg-primary/10 text-foreground" : "bg-muted text-foreground"}`}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-p:my-2 prose-ul:my-2 prose-li:my-0">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function ConvRow({ conv, active, onClick, onRename, onDelete }: { conv: any; active: boolean; onClick: () => void; onRename: (t: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(conv.title);
  return (
    <div className={`group flex items-center gap-1 rounded-sm px-2 py-1.5 text-sm ${active ? "bg-muted" : "hover:bg-muted/50"}`}>
      {editing ? (
        <Input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => { setEditing(false); if (v && v !== conv.title) onRename(v); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(conv.title); setEditing(false); } }}
          className="h-7 text-xs"
        />
      ) : (
        <button onClick={onClick} className="flex-1 truncate text-left text-xs">{conv.title}</button>
      )}
      <button onClick={() => setEditing(true)} className="rounded-sm p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100">
        <Pencil className="h-3 w-3" />
      </button>
      <button onClick={onDelete} className="rounded-sm p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-negative group-hover:opacity-100">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
