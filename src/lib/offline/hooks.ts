import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNetworkStatus, checkOnlineWithHeartbeat } from "./network-status";
import { fullSync, flushPendingMutations, performPull } from "./sync";
import { offlineDb } from "./db";

export function useOfflineSync() {
  const { online } = useNetworkStatus();
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const qc = useQueryClient();

  const refreshMeta = useCallback(async () => {
    const meta = await offlineDb.syncMeta.get("global");
    setLastSyncAt(meta?.lastSyncAt ?? null);
    const count = await offlineDb.pendingMutations.count();
    setPendingCount(count);
  }, []);

  const sync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const reallyOnline = await checkOnlineWithHeartbeat();
      if (!reallyOnline) return;
      await fullSync();
      await refreshMeta();
      qc.invalidateQueries();
    } catch (e) {
      console.error("[offline sync] failed", e);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, qc, refreshMeta]);

  useEffect(() => {
    refreshMeta();
    const interval = setInterval(refreshMeta, 2000);
    return () => clearInterval(interval);
  }, [refreshMeta]);

  useEffect(() => {
    if (!online) return;
    const timer = setTimeout(sync, 1000);
    return () => clearTimeout(timer);
  }, [online, sync]);

  return { online, lastSyncAt, pendingCount, isSyncing, sync };
}

export function useIsOffline() {
  const { online } = useNetworkStatus();
  return !online;
}

export function useOnlineStatus() {
  const { online } = useNetworkStatus();
  return online;
}
