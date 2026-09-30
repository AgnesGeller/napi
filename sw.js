const CACHE_NAME = "diszkertek-napi-v108";
const APP_FILES = [
  "./", "index.html", "css/style.css?v=20260930g", "js/customer-directory.js?v=20260927c", "js/napi-domain.js?v=20260930g", "js/napi-sync.js?v=20260930", "js/pdf-share.js?v=20260930f", "js/app.js?v=20260930h", "manifest.webmanifest?v=20260929",
  "assets/favicon.svg?v=3", "assets/app-icon-180.png?v=20260929", "assets/app-icon-192.png?v=20260929", "assets/app-icon-512.png?v=20260929", "assets/app-icon-maskable-512.png?v=20260929", "assets/diszkertek-logo.png", "assets/botanical.svg",
  "assets/vendor/bootstrap.min.css", "assets/vendor/bootstrap.bundle.min.js", "assets/vendor/html2pdf.bundle.min.js", "assets/vendor/html2pdf.bundle.min.js.LICENSE.txt"
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
  // A Cache Storage csak az alkalmazás saját statikus fájljaihoz használható.
  // A Supabase-válaszok eszközönként eltérő, elavult pillanatképet okoznának.
  if (new URL(event.request.url).origin !== self.location.origin) return;
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

self.addEventListener("push", event => {
  let message = {};
  try { message = event.data?.json?.() || {}; } catch (_) { message = { body: event.data?.text?.() || "" }; }
  event.waitUntil(self.registration.showNotification(message.title || "Díszkertek – Napi feladatok", {
    body: message.body || "Emlékeztető érkezett.",
    icon: "assets/app-icon-192.png",
    badge: "assets/app-icon-192.png",
    tag: message.tag || "napi-emlekezteto",
    data: { url: message.url || "./" },
    vibrate: [180, 80, 180]
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
    const existing = windows.find(client => client.url.startsWith(self.registration.scope));
    if (existing) { existing.navigate(target); return existing.focus(); }
    return clients.openWindow(target);
  }));
});
