const CACHE = "nexus-pos-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./assets/bg.png",
  "./assets/icons/ath.png",
  "./assets/icons/cash.png",
  "./assets/icons/checks.png",
  "./assets/icons/stripe.png",
  "./assets/icons/tap.png",
  "./assets/icons/ath-qr.png",
  "./assets/icons/stripe-qr.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-192.png",
  "./assets/icons/maskable-512.png"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).catch(()=>{})));
});
self.addEventListener("activate", (e)=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null))));
});
self.addEventListener("fetch", (e)=>{
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(()=>caches.match("./index.html")))
  );
});
