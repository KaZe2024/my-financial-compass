/// <reference types="vite-plugin-pwa/client" />
// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      mcpPlugin(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        manifest: false,
        devOptions: { enabled: false },
        includeAssets: ["offline.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"],
        workbox: {
          // The client build is emitted under `client/`, but the deployed site serves those
          // files from the root (`/assets/...`). Without this rewrite every precache URL 404s
          // and the whole service worker install fails, so nothing works offline.
          manifestTransforms: [
            (entries) => ({
              manifest: entries.map((entry) => ({
                ...entry,
                url: entry.url.replace(/^client\//, ""),
              })),
              warnings: [],
            }),
          ],
          // Do not use Workbox's navigateFallback here: it is registered before
          // runtimeCaching and would therefore serve offline.html for every page.
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: ({ url, request }) =>
                request.mode === "navigate" &&
                !/^\/(~oauth|api\/|mcp(?:\/|$)|\.mcp(?:\/|$)|\.well-known(?:\/|$))/.test(url.pathname),
              handler: "NetworkFirst",
              options: {
                cacheName: "optis-pages-v2",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 60 },
                plugins: [
                  {
                    // A visited page is returned first by NetworkFirst. This is
                    // only the terminal fallback for a route never cached before.
                    handlerDidError: async () =>
                      (await caches.match("/offline.html")) ?? Response.error(),
                  },
                ],
              },
            },
            {
              urlPattern: ({ url, request }) =>
                url.origin === self.location.origin &&
                (request.destination === "script" ||
                  request.destination === "style" ||
                  request.destination === "worker"),
              handler: "CacheFirst",
              options: {
                cacheName: "assets",
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              urlPattern: ({ url }) =>
                url.origin === self.location.origin &&
                /\.(png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/i.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "images",
                expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
  },
});
