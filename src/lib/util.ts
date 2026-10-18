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

// Campo que salva ao sair dele: a borda fica verde e aparece "✓ Salvo" no rótulo por um instante.
const savedTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
export function flashSaved(input: Element){
  const f = input.closest(".field"); if(!f) return;
  clearTimeout(savedTimers.get(f));
  f.removeAttribute("data-saved"); void (f as HTMLElement).offsetWidth; // reinicia a animação se salvar de novo logo
  f.setAttribute("data-saved", t("common.saved"));
  savedTimers.set(f, setTimeout(() => f.removeAttribute("data-saved"), 1800));
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
// "slide" (troca de página) entra subindo um pouco; o resto (tema, idioma, ordem) só faz fade, porque o
// conteúdo continua no mesmo lugar e o deslize parecia um pulo.
export type VtKind = "fade" | "slide" | "theme";
export interface ViewTransitionLike { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> }
export function vt(run: () => void, kind: VtKind = "fade"): ViewTransitionLike | null {
  const d = document as Document & {startViewTransition?: (cb: () => void) => ViewTransitionLike};
  if(!d.startViewTransition || reduced() || document.hidden){ run(); return null; }
  const root = document.documentElement; root.dataset.vt = kind;
  const tr = d.startViewTransition(run);
  tr.ready.catch(()=>{}); tr.finished.catch(()=>{}).finally(() => { if(root.dataset.vt === kind) delete root.dataset.vt; });
  return tr;
}

// Como impedir que outros apps e notificações apareçam por cima depende do sistema.
export function focusPlatform(ua: string, touchPoints = 0): "ios" | "android" | "other" {
  if(/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return "ios";
  if(/Android/.test(ua)) return "android";
  return "other";
}
