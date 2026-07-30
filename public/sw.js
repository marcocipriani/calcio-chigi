const CACHE_NAME = "real-chigi-cache-v4";

const STATIC_ASSETS = [
  "/manifest.json",
  "/site.webmanifest",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/icon.png",
  "/logo-circolo-chigi.webp",
  "/logo-circolo-chigi-mark.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Never cache auth, API, or Supabase requests
  if (
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/api") ||
    url.hostname.includes("supabase")
  ) {
    return;
  }

  // Cache-first for static assets
  if (STATIC_ASSETS.includes(url.pathname) || url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for everything else (pages, _next/static chunks)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && url.pathname.startsWith("/_next/static/")) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? new Response("Offline", { status: 503 })))
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? "" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Calcio Circolo Chigi", {
      body: payload.body || "Hai una nuova notifica.",
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      tag: payload.tag || undefined,
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => client.url === targetUrl);
      if (matchingClient) return matchingClient.focus();
      return self.clients.openWindow(targetUrl);
    }),
  );
});
