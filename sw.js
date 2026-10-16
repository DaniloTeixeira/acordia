// A versão é gerada por `node scripts/bump-cache.mjs` a partir do conteúdo dos arquivos abaixo.
const CACHE = "medley-generator-pwa-dc8481425a";
const FILES = ["./", "index.html", "manifest.webmanifest", "js/core.js", "vendor/jspdf.umd.min.js",
  "fonts/atkinson-mono-regular.ttf", "fonts/atkinson-mono-bold.ttf", "fonts/atkinson-regular.ttf",
  "fonts/atkinson-bold.ttf", "fonts/lexend-regular.ttf", "fonts/lexend-bold.ttf",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Rede primeiro para a página e o manifesto (pegam atualizações, como o nome do app),
// cache para o resto e para usar offline.
function networkFirst(e, key){
  e.respondWith(fetch(e.request)
    .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key, copy)); } return r; })
    .catch(() => caches.match(key)));
}
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (e.request.mode === "navigate") return networkFirst(e, "index.html");
  if (new URL(e.request.url).pathname.endsWith("/manifest.webmanifest")) return networkFirst(e, "manifest.webmanifest");
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
