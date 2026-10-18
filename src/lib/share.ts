// Repertório compactado num texto, para compartilhar com o grupo (fica em group_setlists.code).
// Formato: "z" + base64url(deflate-raw(JSON)), ou "j" + base64url(JSON) sem compressão.
import { sanitizeEntry, sanitizeItem, sanitizeOptions } from "./core";
import { t } from "./i18n";
import type { Options, SongEntry, ItemFields } from "./types";

function toB64url(bytes: Uint8Array){
  let s = ""; for(let i=0;i<bytes.length;i+=0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i+0x8000)));
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromB64url(s: string){
  const b = atob(s.replace(/-/g,"+").replace(/_/g,"/") + "===".slice((s.length + 3) % 4));
  const u = new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i] = b.charCodeAt(i); return u;
}
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream){
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export interface SharedSong { text: string; type?: string; key?: string; bpm?: string; ref?: string; target?: string; capo?: string; singer?: string; solo?: string; notes?: string; moment?: string; g?: number }
export interface SharedMedley { name: string; options: Options; kind?: "setlist" | "medley"; groups?: string[]; songs: SharedSong[]; sourceId?: string }
export type IncomingSong = SongEntry & ItemFields & {g?: number};
export interface IncomingMedley { name: string; sourceId: string; options: Options; kind: "setlist" | "medley"; groups: string[]; songs: IncomingSong[] }

export async function encodeMedley(medley: SharedMedley){
  const compact = {v:1, i: medley.sourceId || undefined, n:medley.name, o:medley.options, k: medley.kind === "medley" ? "m" : undefined, gn: medley.groups && medley.groups.length ? medley.groups : undefined, s:medley.songs.map(s=>{
    const o: Record<string, unknown> = {t:s.text};
    (["type","key","bpm","ref","target","capo","singer","solo","notes","moment"] as const).forEach(k=>{ if(s[k]) o[k] = s[k]; });
    if(Number.isInteger(s.g)) o.g = s.g; return o;
  })};
  const json = new TextEncoder().encode(JSON.stringify(compact));
  if(typeof CompressionStream === "function") return "z" + toB64url(await pipe(json, new CompressionStream("deflate-raw")));
  return "j" + toB64url(json);
}

export async function decodeMedley(code: string): Promise<IncomingMedley | null> {
  if(!code || code.length > 200000) return null;
  try{
    let bytes = fromB64url(code.slice(1));
    if(code[0] === "z") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    else if(code[0] !== "j") return null;
    const d = JSON.parse(new TextDecoder().decode(bytes));
    if(!d || !Array.isArray(d.s)) return null;
    const groups: string[] = Array.isArray(d.gn) ? d.gn.slice(0, 50).map((x: unknown) => typeof x === "string" && x.trim() ? x.trim().slice(0, 80) : t("ctx.medley")) : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const songs = d.s.map((s: any): IncomingSong | null => {
      const e = s && sanitizeEntry({text:s.t, type:s.type, key:s.key, bpm:s.bpm, ref:s.ref});
      if(!e) return null;
      const out: IncomingSong = Object.assign(e, sanitizeItem(s));
      if(Number.isInteger(s.g) && s.g >= 0 && s.g < groups.length) out.g = s.g;
      return out;
    }).filter(Boolean) as IncomingSong[];
    if(!songs.length) return null;
    return {name: typeof d.n === "string" && d.n.trim() ? d.n.trim().slice(0, 80) : t("incoming.defaultName"), sourceId: typeof d.i === "string" ? d.i.slice(0, 40) : "", options: sanitizeOptions(d.o), kind: d.k === "m" ? "medley" : "setlist", groups, songs};
  }catch(e){ return null; }
}
