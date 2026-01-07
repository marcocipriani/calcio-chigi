const CACHE_NAME = "real-chigi-cache-v1";

const ASSETS_TO_CACHE = [
  "/",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
  // Aggiungi qui eventuali font o asset statici critici
];

// 1. Installazione: Scarica e salva nella cache i file statici
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Attivazione: Pulisce le vecchie cache se cambia la versione
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch: Intercetta le richieste di rete
// Strategia: Stale-While-Revalidate (Mostra subito la cache, poi aggiorna da rete)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Se la risposta è valida, aggiorniamo la cache per la prossima volta
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Se siamo offline e non abbiamo cache, qui potremmo gestire errori
        // Ma per ora lasciamo fallire se non c'è cache
      });

      // Restituisci la cache se c'è, altrimenti aspetta la rete
      return cachedResponse || fetchPromise;
    })
  );
});