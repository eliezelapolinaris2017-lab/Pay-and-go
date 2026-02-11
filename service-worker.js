const CACHE_NAME = "nexus-pos-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./favicon.ico",
  "./assets/bg.png",
  "./assets/qr-ath.png",
  "./assets/qr-stripe.png",
  "./assets/icons/ath.png",
  "./assets/icons/stripe.png",
  "./assets/icons/tap.png",
  "./assets/icons/cash.png",
  "./assets/icons/checks.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/maskable-192.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(()=>{});
        return res;
      })
      .catch(() => caches.match(req).then(c => c || caches.match("./index.html")))
  );
});
