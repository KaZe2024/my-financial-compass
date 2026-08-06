import { useEffect, useState, useCallback } from "react";

export function getNetworkStatus() {
  if (typeof navigator === "undefined") return { online: true, type: "unknown" };
  return {
    online: navigator.onLine,
    type: (navigator as any).connection?.effectiveType ?? "unknown",
  };
}

export function useNetworkStatus() {
  const [online, setOnline] = useState(() => getNetworkStatus().online);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { online, setOnline };
}

// Historique : un HEAD "/" avant chaque écriture. Problème : ce ping passe par le
// service worker et peut échouer/mettre en cache un faux « hors ligne », si bien que
// les saisies partaient en file d'attente alors que le réseau était disponible (il
// fallait cliquer sur « synchroniser » pour les voir). On se fie désormais à
// navigator.onLine : si la requête réelle échoue, le client bascule tout seul en local.
let lastFailureAt = 0;
const FAILURE_TTL = 3000;

/** À appeler quand une vraie requête réseau échoue : évite de réessayer en boucle. */
export function markNetworkFailure() {
  lastFailureAt = Date.now();
}

export async function checkOnlineWithHeartbeat(): Promise<boolean> {
  if (typeof navigator === "undefined") return true;
  if (navigator.onLine === false) return false;
  if (lastFailureAt && Date.now() - lastFailureAt < FAILURE_TTL) return false;
  return true;
}


export function useDebouncedOnline(delay = 1000) {
  const [online, setOnline] = useState(() => getNetworkStatus().online);

  const update = useCallback(async () => {
    const isUp = await checkOnlineWithHeartbeat();
    setOnline(isUp);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timer);
      if (navigator.onLine) {
        timer = setTimeout(update, delay);
      } else {
        setOnline(false);
      }
    };
    window.addEventListener("online", handler);
    window.addEventListener("offline", handler);
    return () => {
      window.removeEventListener("online", handler);
      window.removeEventListener("offline", handler);
      clearTimeout(timer);
    };
  }, [delay, update]);

  return online;
}
