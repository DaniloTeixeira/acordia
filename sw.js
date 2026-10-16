// No deploy, `npm run build` troca a versão abaixo por um hash do conteúdo dos arquivos da lista.
const CACHE = "acordia-dev";
const FILES = ["./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/core.js", "js/layout.js", "js/pdf.js", "js/share.js", "js/store.js", "js/study.js", "js/audio.js", "js/i18n.js", "js/hands.js", "js/metronome.js", "js/instruments.js", "js/chordview.js", "js/tuner.js", "js/keys.js", "js/dropdown.js",
  "vendor/jspdf.umd.min.js",
  "fonts/atkinson-mono-regular.ttf", "fonts/atkinson-mono-bold.ttf", "fonts/atkinson-regular.ttf",
  "fonts/atkinson-bold.ttf", "fonts/lexend-regular.ttf", "fonts/lexend-bold.ttf",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Rede primeiro para a página e o manifesto (pegam atualizações, como o nome do app),
// cache para o resto e para usar offline. Links de medley (#m=...) não mudam a URL buscada.
function networkFirst(e, key){
  e.respondWith(fetch(e.request)
    .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key, copy)); } return r; })
    .catch(() => caches.match(key)));
}
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (e.request.mode === "navigate") return networkFirst(e, "index.html");
  if (new URL(e.request.url).pathname.endsWith("/manifest.webmanifest")) return networkFirst(e, "manifest.webmanifest");
  // Código do app (JS e CSS) da rede primeiro, para uma atualização valer já no próximo carregamento;
  // fontes, ícones e jsPDF do cache, que quase nunca mudam.
  const url = new URL(e.request.url);
  if (url.origin === location.origin && /\.(js|css)$/.test(url.pathname) && !url.pathname.includes("/vendor/")) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request, {ignoreSearch: true})));
    return;
  }
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(r => r || fetch(e.request)));
});
