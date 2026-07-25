import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useNetworkStatus } from "@/lib/offline/network-status";
import { offlineDb } from "@/lib/offline/db";
import { flushPendingMutations } from "@/lib/offline/sync";
import { toast } from "sonner";

export function OfflineIndicator() {
  const { online } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const count = await offlineDb.pendingMutations.count();
      if (mounted) setPendingCount(count);
    };
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!online) {
      toast.info("Mode offline activé", {
        description: "Vos modifications sont enregistrées localement et synchronisées dès le retour du réseau.",
      });
    }
  }, [online]);

  const handleSync = async () => {
    if (!online || syncing) return;
    setSyncing(true);
    try {
      const result = await flushPendingMutations();
      toast.success(`Synchronisation terminée : ${result.applied} modification(s) envoyée(s).`);
    } catch (e: any) {
      toast.error(`Synchronisation échouée : ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        online ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
      }`}
      title={online ? "Cliquez pour forcer la synchronisation" : "Mode offline — modifications en attente"}
    >
      {online ? <Cloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
      <span>{online ? "En ligne" : "Hors ligne"}</span>
      {pendingCount > 0 && (
        <span className="ml-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground">
          {pendingCount}
        </span>
      )}
      {syncing && <RefreshCw className="h-3 w-3 animate-spin" />}
    </button>
  );
}
