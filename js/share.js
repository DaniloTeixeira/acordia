// Compartilhar medley por link: o medley inteiro vai compactado no próprio endereço (#m=...),
// sem servidor. Formato: "z" + base64url(deflate-raw(JSON)), ou "j" + base64url(JSON) sem compressão.
import { sanitizeEntry, sanitizeItem, sanitizeOptions } from "./core.js";
import { t } from "./i18n.js";

function toB64url(bytes){
  let s = ""; for(let i=0;i<bytes.length;i+=0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i+0x8000));
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromB64url(t){
  const s = atob(t.replace(/-/g,"+").replace(/_/g,"/") + "===".slice((t.length + 3) % 4));
  const u = new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i] = s.charCodeAt(i); return u;
}
async function pipe(bytes, stream){
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

// medley: {name, options, songs:[{text, type, key, bpm, target, capo, singer, notes}]}
export async function encodeMedley(medley){
  const compact = {v:1, i: medley.sourceId || undefined, n:medley.name, o:medley.options, k: medley.kind === "medley" ? "m" : undefined, gn: medley.groups && medley.groups.length ? medley.groups : undefined, s:medley.songs.map(s=>{
    const o = {t:s.text}; ["type","key","bpm","ref","target","capo","singer","notes"].forEach(k=>{ if(s[k]) o[k] = s[k]; }); if(Number.isInteger(s.g)) o.g = s.g; return o;
  })};
  const json = new TextEncoder().encode(JSON.stringify(compact));
  if(typeof CompressionStream === "function") return "z" + toB64url(await pipe(json, new CompressionStream("deflate-raw")));
  return "j" + toB64url(json);
}

export async function decodeMedley(code){
  if(!code || code.length > 200000) return null;
  try{
    let bytes = fromB64url(code.slice(1));
    if(code[0] === "z") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    else if(code[0] !== "j") return null;
    const d = JSON.parse(new TextDecoder().decode(bytes));
    if(!d || !Array.isArray(d.s)) return null;
    const groups = Array.isArray(d.gn) ? d.gn.slice(0, 50).map(x => typeof x === "string" && x.trim() ? x.trim().slice(0, 80) : t("ctx.medley")) : [];
    const songs = d.s.map(s=>{
      const e = s && sanitizeEntry({text:s.t, type:s.type, key:s.key, bpm:s.bpm, ref:s.ref});
      if(!e) return null;
      Object.assign(e, sanitizeItem(s));
      if(Number.isInteger(s.g) && s.g >= 0 && s.g < groups.length) e.g = s.g;
      return e;
    }).filter(Boolean);
    if(!songs.length) return null;
    return {name: typeof d.n === "string" && d.n.trim() ? d.n.trim().slice(0, 80) : t("incoming.defaultName"), sourceId: typeof d.i === "string" ? d.i.slice(0, 40) : "", options: sanitizeOptions(d.o), kind: d.k === "m" ? "medley" : "setlist", groups, songs};
  }catch(e){ return null; }
}
