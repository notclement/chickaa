/// <reference lib="webworker" />
/**
 * NoChickenCall service worker (ARCHITECTURE.md §3.3).
 *
 *  - Precaches the app shell + hashed static assets (revisioned by Workbox → cache versioning).
 *  - Every navigation is answered with the precached index.html, so any screen opens offline.
 *  - /api/* is deliberately NOT handled: user data never goes into Cache Storage.
 *    (The read-only offline view uses IndexedDB, per user, cleared on logout.)
 *  - A new version waits until the page sends SKIP_WAITING (user tapped "Refresh").
 */
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /\/[^/?]+\.[^/]+$/], // API calls and file-like URLs are never the SPA
  }),
);

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// First install only: take control immediately so the very first visit is already offline-ready.
// Later versions activate only after SKIP_WAITING, i.e. when the user chooses to update.
clientsClaim();
