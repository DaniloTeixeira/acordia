// Service worker: guarda o app inteiro na instalação para funcionar offline.
// A página vem da rede primeiro (uma atualização vale já no próximo carregamento); os arquivos do
// build têm hash no nome e nunca mudam, então vêm do cache. A lista é preenchida pelo build.
/* eslint-disable @typescript-eslint/no-explicit-any */
const sw = self as any;
// @ts-expect-error o build troca self.__WB_MANIFEST pela lista de arquivos.
const MANIFEST: {url: string; revision: string | null}[] = self.__WB_MANIFEST;
const FILES = MANIFEST.map(e => e.url);
// Versão do cache: muda quando qualquer arquivo muda.
// Os pads (áudio grande, fora da lista) ficam num cache próprio, guardados no primeiro uso e mantidos entre versões.
const PADS = "acordia-pads";
// O motor da separação de faixas (.wasm, ~20 MB) só é baixado por quem usa; fica num cache próprio.
const ML = "acordia-ml";
const CACHE = "acordia-" + MANIFEST.map(e => e.url + (e.revision || "")).join("|").split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);

sw.addEventListener("install", (e: any) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => sw.skipWaiting()));
});
sw.addEventListener("activate", (e: any) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== PADS && k !== ML).map(k => caches.delete(k))))
    .then(() => sw.clients.claim()));
});
// `no-cache` revalida com o servidor: sem ele o cache HTTP do navegador pode devolver uma página antiga.
function networkFirst(e: any, key: string){
  e.respondWith(fetch(e.request.url, {cache: "no-cache", credentials: "same-origin"})
    .then(r => { if(r.ok){ const copy = r.clone(); caches.open(CACHE).then(c => c.put(key, copy)); } return r; })
    .catch(() => caches.match(key).then(r => r || Response.error())));
}
sw.addEventListener("fetch", (e: any) => {
  const req: Request = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return;
  // Links de repertório (#m=...) e parâmetros não mudam a página guardada.
  if(req.mode === "navigate") return networkFirst(e, "index.html");
  if(url.pathname.endsWith("/manifest.webmanifest")) return networkFirst(e, "manifest.webmanifest");
  if(url.pathname.endsWith(".wasm")) return e.respondWith(caches.open(ML).then(c => c.match(req).then(r => r || fetch(req).then(res => { if(res.ok) c.put(req, res.clone()); return res; }))));
  if(url.pathname.includes("/pads/")) return e.respondWith(caches.open(PADS).then(c => c.match(req).then(r => r || fetch(req).then(res => { if(res.ok) c.put(req, res.clone()); return res; }))));
  e.respondWith(caches.match(req, {ignoreSearch: true}).then(r => r || fetch(req)));
});
