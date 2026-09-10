"use strict";

const CACHE_VERSION = "calypso-equipe-v30";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const APP_SHELL = [
  "./offline.html",
  "./index.html",
  "./connexion.html",
  "./agent.html",
  "./admin.html",
  "./experiences.html",
  "./contact.html",
  "./css/styles.css",
  "./css/app-v2.css",
  "./js/pwa.js",
  "./js/startup.js",
  "./js/appwrite-config.js",
  "./js/appwrite-client.js",
  "./js/auth-service.js",
  "./js/connexion.js",
  "./js/ticket-workflow.js",
  "./postes.html",
  "./js/postes.js",
  "./js/data-access.js",
  "./js/receipts.js",
  "./js/access-control.js",
  "./js/whatsapp-access.js",
  "./js/gallery.js",
  "./js/gallery-images.js",
  "./js/public-content.js",
  "./js/public-notifications.js",
  "./js/agent-appwrite.js",
  "./js/admin-appwrite.js",
  "./js/content-admin.js",
  "./js/resto-admin.js",
  "./manifest.webmanifest",
  "./manifest-public.webmanifest",
  "./assets/icons/calypso-officiel.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("calypso-") && ![STATIC_CACHE, PAGE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "./index.html#evenements", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windowClients) => {
      const existingClient = windowClients.find((client) => new URL(client.url).origin === self.location.origin);
      if (existingClient) {
        if ("navigate" in existingClient) await existingClient.navigate(targetUrl);
        return existingClient.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Appwrite, les CDN et toute API distante restent toujours hors cache.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match("./offline.html"))
    );
    return;
  }

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      return fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => cache.match(request, { ignoreSearch: true }));
    })
  );
});
