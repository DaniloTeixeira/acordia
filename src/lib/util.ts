// Utilidades de interface sem React: busca sem acento, datas relativas, medida de texto e transições.
import { t, locale } from "./i18n";
import type { Font } from "./layout";

export const norm = (s: string | null | undefined) => (s||"").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ");
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export function slug(s: string){ return norm(s).replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"") || "medley"; }

export interface Debounced<A extends unknown[]> { (...a: A): void; flush(...a: A): void; cancel(): void }
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): Debounced<A> {
  let h: ReturnType<typeof setTimeout> | undefined;
  const d = ((...a: A) => { clearTimeout(h); h = setTimeout(()=>fn(...a), ms); }) as Debounced<A>;
  d.flush = (...a: A) => { clearTimeout(h); fn(...a); };
  d.cancel = () => clearTimeout(h);
  return d;
}

export function ago(ts?: number){
  if(!ts) return "";
  const rel = new Intl.RelativeTimeFormat(locale(), {numeric:"auto"});
  const s = (ts - Date.now())/1000, a = Math.abs(s);
  if(a < 60) return t("common.now");
  if(a < 3600) return rel.format(Math.round(s/60), "minute");
  if(a < 86400) return rel.format(Math.round(s/3600), "hour");
  if(a < 86400*30) return rel.format(Math.round(s/86400), "day");
  return new Date(ts).toLocaleDateString(locale());
}

// Medida de texto no canvas, com cache: o ajuste da folha mede os mesmos textos dezenas de vezes.
let mctx: CanvasRenderingContext2D | null = null;
const mcache = new Map<string, number>();
export function clearMeasureCache(){ mcache.clear(); }
export function measure(s: string, fs: number, font: Font){
  const k = font + "|" + s; let w = mcache.get(k);
  if(w === undefined){
    if(mcache.size > 20000) mcache.clear();
    mctx = mctx || document.createElement("canvas").getContext("2d")!;
    mctx.font = "100px " + (font === "lex" ? "Lexend, AHSans, sans-serif" : "AHSans, sans-serif");
    w = mctx.measureText(s).width / 100; mcache.set(k, w);
  }
  return w * fs;
}

// Transição animada entre estados; sem suporte, com movimento reduzido ou com a aba oculta, aplica direto.
export function vt(run: () => void){
  const d = document as Document & {startViewTransition?: (cb: () => void) => {ready: Promise<void>; finished: Promise<void>}};
  if(!d.startViewTransition || reduced() || document.hidden){ run(); return null; }
  const tr = d.startViewTransition(run);
  tr.ready.catch(()=>{}); tr.finished.catch(()=>{});
  return tr;
}
