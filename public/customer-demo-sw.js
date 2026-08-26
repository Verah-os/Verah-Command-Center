const CACHE_NAME = "verah-customer-demo-shell-v1";
const DEMO_PATH = "/demo/cliente/piloto";
const STATIC_SHELL = [DEMO_PATH, "/manifest.webmanifest", "/customer-demo-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("verah-customer-demo-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })),
    );
    return;
  }

  if (url.pathname !== DEMO_PATH && !STATIC_SHELL.includes(url.pathname)) return;
  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(DEMO_PATH))),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_CUSTOMER_DEMO_CACHE") {
    event.waitUntil(caches.delete(CACHE_NAME));
  }
});
