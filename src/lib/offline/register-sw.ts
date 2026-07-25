import { registerSW } from "virtual:pwa-register";

function isLovablePreview() {
  if (typeof window === "undefined") return true;
  const hostname = window.location.hostname;
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

function shouldRegister() {
  if (typeof window === "undefined") return false;
  if (!import.meta.env.PROD) return false;
  if (window.self !== window.top) return false;
  if (isLovablePreview()) return false;
  if (window.location.search.includes("sw=off")) return false;
  return true;
}

async function unregisterExisting() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((r) => r.scope.includes(window.location.origin) && (r.scope.endsWith("/sw.js") || r.scope.endsWith("/")))
      .map((r) => r.unregister()),
  );
}

export function registerPWA() {
  if (!shouldRegister()) {
    unregisterExisting().catch(() => {});
    return;
  }

  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, r) {
      console.log("[PWA] Service worker registered", swUrl, r);
    },
    onRegisterError(error) {
      console.error("[PWA] Service worker registration error", error);
    },
  });
}
