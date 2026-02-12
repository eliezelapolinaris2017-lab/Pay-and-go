const CACHE = "nexus-pos-v20"; // cambia versión cuando actualices
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./assets/bg.png",
  "./assets/icons/stripe.png",
  "./assets/icons/ath.png",
  "./assets/icons/tap.png",
  "./assets/icons/cash.png",
  "./assets/icons/checks.png",
  "./assets/qr-ath.png",
  "./assets/qr-stripe.png"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", (e)=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE && caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", (e)=>{
  e.respondWith(
    caches.match(e.request).then(r=> r || fetch(e.request).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(c=>c.put(e.request, copy));
      return res;
    }).catch(()=>caches.match("./index.html")))
  );
});
