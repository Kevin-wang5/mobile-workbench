"use strict";

// 按部署路径隔离缓存，避免影响同一 GitHub 用户下的其他项目。
const BASE = new URL("./", self.location.href);
const CACHE_PREFIX = `buer-mobile-workbench:${BASE.pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const SHELL = ["./", "./index.html", "./style.css", "./app.js", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"].map((path) => new URL(path, BASE).href);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") { self.skipWaiting(); return; }
  if (event.data?.type !== "CHECK_OFFLINE" || !event.ports[0]) return;
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    const matches = await Promise.all(SHELL.map((url) => cache.match(url)));
    event.ports[0].postMessage({ ready: matches.every(Boolean) });
  }).catch(() => event.ports[0].postMessage({ ready: false })));
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    if (event.request.mode === "navigate") {
      try {
        const response = await fetch(event.request);
        if (response.ok) return response;
      } catch { /* 离线时回到应用外壳。 */ }
      return (await cache.match(new URL("./index.html", BASE).href)) || Response.error();
    }
    return (await cache.match(event.request)) || fetch(event.request);
  }));
});
