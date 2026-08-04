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
          navigateFallback: "/offline.html",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/mcp/, /^\/\.mcp/, /^\/\.well-known/],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "pages",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 60 },
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
