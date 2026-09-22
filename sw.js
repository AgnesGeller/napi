const CACHE_NAME = "diszkertek-napi-v22";
const APP_FILES = [
  "./", "index.html", "css/style.css?v=20260922g", "js/customer-directory.js?v=20260922e", "js/app.js?v=20260922j", "manifest.webmanifest",
  "assets/favicon.svg", "assets/app-icon-180.png", "assets/app-icon-192.png", "assets/app-icon-512.png", "assets/app-icon-maskable-512.png", "assets/diszkertek-logo.png", "assets/botanical.svg",
  "assets/vendor/bootstrap.min.css", "assets/vendor/bootstrap.bundle.min.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put("index.html", copy));
      return response;
    }).catch(() => caches.match("index.html")));
    return;
  }
  if (["script", "style"].includes(event.request.destination)) {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match("index.html"))));
});
