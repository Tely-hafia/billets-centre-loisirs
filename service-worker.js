"use strict";

const CACHE_VERSION = "calypso-equipe-v7";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const APP_SHELL = [
  "./offline.html",
  "./agent.html",
  "./admin.html",
  "./experiences.html",
  "./contact.html",
  "./css/styles.css",
  "./css/app-v2.css",
  "./js/pwa.js",
  "./js/appwrite-config.js",
  "./js/appwrite-client.js",
  "./js/auth-service.js",
  "./js/ticket-workflow.js",
  "./js/agent-appwrite.js",
  "./js/admin-appwrite.js",
  "./manifest.webmanifest",
  "./assets/icons/calypso-192.png",
  "./assets/icons/calypso-512.png",
  "./assets/icons/calypso-maskable-512.png",
  "./assets/icons/calypso.svg"
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
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
