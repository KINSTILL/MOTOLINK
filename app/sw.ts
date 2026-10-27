/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Pages et ressources critiques à pré-cacher à l'installation
const customPrecache: PrecacheEntry[] = [
  { url: "/", revision: "v1" },
  { url: "/login", revision: "v1" },
  { url: "/verify", revision: "v1" },
  { url: "/dashboard/vendor", revision: "v1" },
  { url: "/dashboard/driver", revision: "v1" },
  { url: "/manifest.json", revision: "v1" },
  { url: "/icons/icon-192x192.png", revision: "v1" },
  { url: "/icons/icon-512x512.png", revision: "v1" },
];

const serwist = new Serwist({
  precacheEntries: [...(self.__SW_MANIFEST || []), ...customPrecache],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // 1. Runtime cache : Images d'articles et uploads (Cache-First, 7 jours)
    {
      matcher: ({ request, url }) =>
        url.pathname.startsWith("/uploads/") ||
        request.destination === "image" ||
        /\.(?:png|jpg|jpeg|svg|webp|gif|ico)$/i.test(url.pathname),
      handler: new CacheFirst({
        cacheName: "motolink-images-cache",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries: 150,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 jours
          }),
        ],
      }),
    },

    // 2. Runtime cache : Données API (Network-First, cache 1 heure)
    {
      matcher: ({ url }) =>
        url.pathname.startsWith("/api/missions") ||
        url.pathname.startsWith("/api/checkpoint") ||
        url.pathname.startsWith("/api/public/missions"),
      handler: new NetworkFirst({
        cacheName: "motolink-api-cache",
        networkTimeoutSeconds: 3,
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 60 * 60, // 1 heure
          }),
        ],
      }),
    },

    // 3. Runtime cache : Pages publiques (/suivi, /verify, /s/) (Stale-While-Revalidate, cache 24h)
    {
      matcher: ({ url }) =>
        url.pathname.startsWith("/suivi") ||
        url.pathname.startsWith("/verify") ||
        url.pathname.startsWith("/s/"),
      handler: new StaleWhileRevalidate({
        cacheName: "motolink-public-pages-cache",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries: 80,
            maxAgeSeconds: 24 * 60 * 60, // 24 heures
          }),
        ],
      }),
    },

    // 4. Assets statiques (JS, CSS, Polices Web) : Cache-First
    {
      matcher: ({ request }) =>
        request.destination === "style" ||
        request.destination === "script" ||
        request.destination === "font",
      handler: new CacheFirst({
        cacheName: "motolink-static-assets",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 jours
          }),
        ],
      }),
    },

    // Règles par défaut fournies par Next.js Serwist
    ...defaultCache,
  ],
});

// Écouteur Background Sync pour les actions en attente
self.addEventListener("sync", (event: any) => {
  if (
    event.tag === "motolink-sync" ||
    event.tag === "sync-pending-actions" ||
    event.tag === "offline-queue-sync"
  ) {
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: "MOTOLINK_BACKGROUND_SYNC_TRIGGER",
          });
        });
      })
    );
  }
});

serwist.addEventListeners();
