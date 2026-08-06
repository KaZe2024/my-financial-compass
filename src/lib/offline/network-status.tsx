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

// Un HEAD réseau par mutation ralentissait chaque saisie : on met le résultat
// en cache quelques secondes (et on partage la requête en cours).
let hbCache: { at: number; value: boolean } | null = null;
let hbInflight: Promise<boolean> | null = null;
const HB_TTL = 5000;

export async function checkOnlineWithHeartbeat(): Promise<boolean> {
  if (typeof navigator === "undefined" || navigator.onLine === false) {
    hbCache = null;
    return false;
  }
  if (hbCache && Date.now() - hbCache.at < HB_TTL) return hbCache.value;
  if (hbInflight) return hbInflight;
  hbInflight = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      await fetch("/", { method: "HEAD", signal: controller.signal, cache: "no-store" });
      clearTimeout(timeout);
      return true;
    } catch {
      return false;
    }
  })().then((value) => {
    hbCache = { at: Date.now(), value };
    hbInflight = null;
    return value;
  });
  return hbInflight;
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
