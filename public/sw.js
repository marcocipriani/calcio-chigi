const CACHE_NAME = "real-chigi-cache-v8";
// Immagini viste in navigazione (loghi Enjore, ecc.): cache a parte, con un tetto.
const IMAGE_CACHE = "real-chigi-images-v1";
const IMAGE_CACHE_MAX = 150;

const STATIC_ASSETS = [
  "/manifest.json",
  "/site.webmanifest",
  "/brand/icons/icon-192x192.png?v=2",
  "/brand/icons/icon-512x512.png?v=2",
  "/brand/icons/icon-maskable-512x512.png?v=3",
  "/apple-touch-icon.png?v=2",
  "/favicon.ico?v=2",
  "/brand/logos/logo-circolo-chigi.webp?v=2",
  "/brand/logos/logo-circolo-chigi-light.webp?v=2",
  "/brand/logos/logo-circolo-chigi-mark.webp?v=2",
  "/teams/chigi.png",
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
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== IMAGE_CACHE).map((k) => caches.delete(k)))
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

  // Cache-first for static assets (le voci precaricate hanno il ?v= nel path)
  const isPrecached = STATIC_ASSETS.includes(url.pathname + url.search);
  if (isPrecached || url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            const cacheName = isPrecached ? CACHE_NAME : IMAGE_CACHE;
            caches.open(cacheName).then(async (cache) => {
              await cache.put(event.request, clone);
              if (!isPrecached) await trimCache(cache, IMAGE_CACHE_MAX);
            });
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

// keys() restituisce le voci in ordine di inserimento: si tolgono le più vecchie.
async function trimCache(cache, max) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((key) => cache.delete(key)));
}

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
      icon: "/brand/icons/icon-192x192.png?v=2",
      badge: "/brand/icons/icon-192x192.png?v=2",
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
