const CACHE_NAME = "canvas-shell-v1.9.21";
const APP_VERSION = CACHE_NAME.replace("canvas-shell-v", "");

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./js/app.js",
  "./js/behaviors.js",
  "./js/gif-encoder.js",
  "./js/pwa.js",
  "./assets/icons/favicon.ico",
  "./assets/icons/favicon-16x16.png",
  "./assets/icons/favicon-32x32.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/android-chrome-192x192.png",
  "./assets/icons/android-chrome-512x512.png",
  "./assets/icons/site.webmanifest",
  "./static-pages.css",
  "./donate/",
  "./donate/index.html",
  "./thankyou/",
  "./thankyou/index.html"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Build the new app-shell cache from the origin, bypassing the browser's
    // ordinary HTTP cache. Otherwise a new service-worker cache can be seeded
    // with an older CSS/JS response that the browser or CDN still considers fresh.
    await Promise.all(APP_SHELL.map(async asset => {
      const request = new Request(asset, { cache: "reload" });
      const response = await fetch(request);
      if (!response.ok) throw new Error(`Failed to cache ${asset}: ${response.status}`);
      await cache.put(asset, response);
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(request, { cache: "no-store" }))
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match("./index.html"))
    );
    return;
  }

  // Network-first for same-origin app assets. This keeps deployed HTML, CSS, and
  // JavaScript on the same release while preserving the cache as an offline
  // fallback. A cache-first strategy can otherwise mix a newly fetched page
  // with stale CSS/JS from the previous service-worker cache.
  event.respondWith(
    fetch(new Request(request, { cache: "no-store" }))
      .then(response => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});


self.addEventListener("message", event => {
  if (event.data?.type !== "CANVAS_VERSION_REQUEST") return;
  const reply = { type: "CANVAS_VERSION", version: APP_VERSION };
  if (event.ports?.[0]) event.ports[0].postMessage(reply);
  else event.source?.postMessage(reply);
});
