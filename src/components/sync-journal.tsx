import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNetworkStatus } from "@/lib/offline/network-status";
import {
  deletePendingMutation,
  isStuckMutation,
  listPendingMutations,
  listSyncAcks,
  type PendingMutation,
  type SyncAck,
} from "@/lib/offline/db";
import { flushPendingMutations } from "@/lib/offline/sync";

const OP_LABEL: Record<string, string> = {
  insert: "Création",
  update: "Modification",
  delete: "Suppression",
};

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Diagnostic de la synchronisation hors ligne : file d'attente locale et
 * accusés de réception confirmés par le serveur (avec horodatage exact).
 */
export function SyncJournal() {
  const { online } = useNetworkStatus();
  const [pending, setPending] = useState<PendingMutation[]>([]);
  const [acks, setAcks] = useState<SyncAck[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const [p, a] = await Promise.all([listPendingMutations(), listSyncAcks(50)]);
    setPending(p);
    setAcks(a);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleRetry = async () => {
    if (!online || syncing) return;
    setSyncing(true);
    try {
      const result = await flushPendingMutations();
      if (result.failed > 0) {
        toast.warning(`${result.applied} envoyée(s), ${result.failed} en échec.`);
      } else {
        toast.success(`Synchronisation terminée : ${result.applied} modification(s) confirmée(s).`);
      }
    } catch (e: any) {
      toast.error(`Synchronisation échouée : ${e.message}`);
    } finally {
      setSyncing(false);
      refresh();
    }
  };

  const handleDrop = async (id: string) => {
    await deletePendingMutation(id);
    toast.success("Modification retirée de la file locale.");
    refresh();
  };

  const now = Date.now();
  const stuck = pending.filter((m) => isStuckMutation(m, now)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {pending.length === 0
            ? "Aucune modification en attente."
            : `${pending.length} modification(s) en attente d'envoi.`}
        </span>
        {stuck > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5" /> {stuck} coincée(s)
          </span>
        )}
        <Button size="sm" variant="outline" onClick={handleRetry} disabled={!online || syncing || pending.length === 0}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          Réessayer maintenant
        </Button>
        {!online && <span className="text-xs text-muted-foreground">Connexion requise pour synchroniser.</span>}
      </div>

      {pending.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">Module</th>
                <th className="px-2 py-1.5 font-medium">Opération</th>
                <th className="px-2 py-1.5 font-medium">En file depuis</th>
                <th className="px-2 py-1.5 font-medium">Tentatives</th>
                <th className="px-2 py-1.5 font-medium">Erreur</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {pending.map((m) => {
                const isStuckRow = isStuckMutation(m, now);
                return (
                  <tr key={m.id} className={isStuckRow ? "bg-amber-500/5" : undefined}>
                    <td className="px-2 py-1.5 font-mono">{m.table}</td>
                    <td className="px-2 py-1.5">{OP_LABEL[m.op] ?? m.op}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{fmtTime(m.createdAt)}</td>
                    <td className="px-2 py-1.5">
                      <span className={isStuckRow ? "font-semibold text-amber-500" : undefined}>{m.retryCount}</span>
                    </td>
                    <td className="max-w-[18rem] truncate px-2 py-1.5 text-muted-foreground" title={m.error ?? ""}>
                      {m.error ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => handleDrop(m.id)} title="Retirer de la file">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Accusés de réception récents
        </p>
        {acks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun accusé enregistré pour le moment.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {acks.map((a) => (
              <li key={a.mutationId} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                {a.status === "applied" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                )}
                <span className="font-mono">{a.table}</span>
                <span className="text-muted-foreground">{OP_LABEL[a.op] ?? a.op}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">{fmtTime(a.ackedAt)}</span>
                <span className="shrink-0 text-muted-foreground">· {a.attempts} tentative(s)</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
