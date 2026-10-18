// Separar faixas: abre a música (arquivo ou link direto), manda para o worker separar e toca as 6 faixas
// juntas, cada uma com volume, mudo e solo. Fica fora dos componentes (como o pad), então a música
// separada continua aqui ao trocar de aba ou de página; some ao fechar o app.
import { create } from "zustand";
import { MODEL, STEM_ORDER, mixStems, encodeWav, linkKind, directLink, type StemName } from "./lib/stems";
import type { FromWorker } from "./stems.worker";

export type Phase = "idle" | "decoding" | "download" | "loading" | "separating" | "ready" | "error";
export type LoadError = "" | "youtube" | "badLink" | "fetch" | "decode" | "tooLong" | "model" | "memory";
interface StemState {
  phase: Phase; error: LoadError; detail: string; name: string; duration: number;
  progress: number; device: "gpu" | "cpu" | ""; startedAt: number; modelCached: boolean | null;
  // A placa de vídeo falhou nesta separação e ela recomeçou no processador.
  gpuFailed: boolean;
  gains: Record<StemName, number>; muted: Record<StemName, boolean>; solo: StemName | "";
  playing: boolean; pos: number;
}
const full = <T,>(v: T) => Object.fromEntries(MODEL.stems.map(s => [s, v])) as Record<StemName, T>;
export const useStems = create<StemState>(() => ({phase: "idle", error: "", detail: "", name: "", duration: 0, progress: 0, device: "", startedAt: 0, modelCached: null, gpuFailed: false,
  gains: full(1), muted: full(false), solo: "", playing: false, pos: 0}));

// Até 12 minutos: mais que isso não cabe na memória da maioria dos celulares.
export const MAX_SECONDS = 12 * 60;
let input: AudioBuffer | null = null, stems: AudioBuffer[] = [], worker: Worker | null = null;

// ---------- abrir a música ----------
let decodeCtx: AudioContext | null = null;
async function decode(bytes: ArrayBuffer, name: string){
  stopPlayback(); stems = []; input = null;
  useStems.setState({phase: "decoding", error: "", detail: "", name, progress: 0, pos: 0, duration: 0});
  try{
    decodeCtx = decodeCtx || new AudioContext();
    const raw = await decodeCtx.decodeAudioData(bytes);
    if(raw.duration > MAX_SECONDS) return fail("tooLong");
    // O modelo quer 44,1 kHz e estéreo: o navegador converte (e duplica o mono nos dois lados).
    const off = new OfflineAudioContext(2, Math.ceil(raw.duration * MODEL.rate), MODEL.rate);
    const src = off.createBufferSource(); src.buffer = raw; src.connect(off.destination); src.start();
    input = await off.startRendering();
    useStems.setState({phase: "idle", duration: input.duration});
  }catch(e){ fail("decode"); }
}
function fail(error: LoadError, detail = ""){ useStems.setState({phase: "error", error, detail}); }

export async function openFile(f: File){ await decode(await f.arrayBuffer(), f.name.replace(/\.[^.]+$/, "")); }
export async function openLink(url: string){
  const kind = linkKind(url);
  if(kind === "youtube") return fail("youtube");
  if(kind === "bad") return fail("badLink");
  useStems.setState({phase: "decoding", error: "", name: "", progress: 0});
  let res: Response;
  try{ res = await fetch(directLink(url)); if(!res.ok) throw new Error(String(res.status)); }
  catch(e){ return fail("fetch"); }
  // Uma página no lugar do arquivo (ex.: link de visualização): não é áudio.
  if(/text\/html/i.test(res.headers.get("content-type") || "")) return fail("fetch");
  const name = decodeURIComponent(new URL(res.url || url).pathname.split("/").pop() || "").replace(/\.[^.]+$/, "") || "audio";
  await decode(await res.arrayBuffer(), name);
}
export const hasInput = () => !!input;

// ---------- separar ----------
// A placa de vídeo já falhou neste aparelho: as próximas vezes vão direto para o processador.
const NO_GPU = "acordia-stems-nogpu";
const gpuOk = () => { try{ return !localStorage.getItem(NO_GPU); }catch(e){ return true; } };
// Placa travada nem sempre dá erro: sem notícia do worker por tempo demais, desiste dela.
let watchdog: ReturnType<typeof setTimeout> | undefined, onGpu = false;
function watch(ms: number){ clearTimeout(watchdog); if(onGpu) watchdog = setTimeout(gpuLost, ms); }
function gpuLost(){
  clearTimeout(watchdog);
  try{ localStorage.setItem(NO_GPU, "1"); }catch(e){ /* sem armazenamento */ }
  worker?.terminate(); worker = null;
  useStems.setState({gpuFailed: true});
  separate();
}
function spawn(){
  worker = new Worker(new URL("./stems.worker.ts", import.meta.url), {type: "module"});
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if(m.type === "has") useStems.setState({modelCached: m.cached});
    else if(m.type === "download") useStems.setState({phase: "download", progress: m.loaded / m.total});
    else if(m.type === "loading"){ onGpu = m.device === "gpu"; watch(180000); useStems.setState({phase: "loading", device: m.device, modelCached: true}); }
    else if(m.type === "progress"){ watch(90000); useStems.setState({phase: "separating", progress: m.done / m.total, startedAt: m.done === 0 ? Date.now() : useStems.getState().startedAt}); }
    else if(m.type === "gpuLost") gpuLost();
    else if(m.type === "done"){
      clearTimeout(watchdog);
      stems = m.stems.map(([l, r]) => { const b = new AudioBuffer({numberOfChannels: 2, length: l.length, sampleRate: MODEL.rate}); b.copyToChannel(l, 0); b.copyToChannel(r, 1); return b; });
      useStems.setState({phase: "ready", device: m.device, progress: 1, pos: 0});
    }
    else if(m.type === "error"){ clearTimeout(watchdog); fail(/memory|allocation|OOM|out of bounds/i.test(m.message) ? "memory" : "model", m.message); }
  };
  worker.onerror = e => { clearTimeout(watchdog); fail("model", e.message); };
}
export function checkModel(){ if(!worker) spawn(); worker!.postMessage({type: "has"}); }
export function separate(){
  if(!input) return;
  if(!worker) spawn();
  onGpu = false;
  const left = input.getChannelData(0).slice(), right = input.getChannelData(1).slice();
  useStems.setState({phase: useStems.getState().modelCached ? "loading" : "download", progress: 0, error: "", startedAt: Date.now()});
  worker!.postMessage({type: "run", left, right, gpu: gpuOk()}, [left.buffer, right.buffer]);
}
// Cancelar: encerra o worker (o modelo já baixado continua guardado).
export function cancel(){
  clearTimeout(watchdog);
  worker?.terminate(); worker = null;
  useStems.setState({phase: "idle", progress: 0});
}
export function reset(){ cancel(); stopPlayback(); stems = []; input = null; useStems.setState({phase: "idle", name: "", duration: 0, pos: 0, error: ""}); }

// ---------- tocar ----------
let ctx: AudioContext | null = null, sources: AudioBufferSourceNode[] = [], gainNodes: GainNode[] = [], t0 = 0, raf = 0;
// Volume que vale para cada faixa: solo cala as outras; mudo cala a faixa.
export function effectiveGains(s = useStems.getState()){
  return MODEL.stems.map(n => s.solo ? (s.solo === n ? s.gains[n] : 0) : s.muted[n] ? 0 : s.gains[n]);
}
function applyGains(){ const g = effectiveGains(); gainNodes.forEach((n, i) => n.gain.setTargetAtTime(g[i], ctx!.currentTime, 0.02)); }
useStems.subscribe((s, p) => { if(s.gains !== p.gains || s.muted !== p.muted || s.solo !== p.solo) applyGains(); });

export function play(from = useStems.getState().pos){
  if(!stems.length) return;
  stopPlayback(false);
  ctx = ctx || new AudioContext();
  ctx.resume();
  const g = effectiveGains(), start = Math.max(0, Math.min(from, stems[0].duration - 0.05));
  gainNodes = stems.map((_, i) => { const n = ctx!.createGain(); n.gain.value = g[i]; n.connect(ctx!.destination); return n; });
  const when = ctx.currentTime + 0.05;
  sources = stems.map((b, i) => { const s = ctx!.createBufferSource(); s.buffer = b; s.connect(gainNodes[i]); s.start(when, start); return s; });
  sources[0].onended = () => { if(useStems.getState().playing && posNow() >= stems[0].duration - 0.1){ stopPlayback(false); useStems.setState({playing: false, pos: 0}); } };
  t0 = when - start;
  useStems.setState({playing: true, pos: start});
  const tick = () => { useStems.setState({pos: posNow()}); raf = requestAnimationFrame(tick); };
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}
const posNow = () => ctx ? Math.max(0, ctx.currentTime - t0) : 0;
function stopPlayback(update = true){
  cancelAnimationFrame(raf);
  sources.forEach(s => { s.onended = null; try{ s.stop(); }catch(e){ /* já parou */ } s.disconnect(); });
  gainNodes.forEach(n => n.disconnect());
  sources = []; gainNodes = [];
  if(update) useStems.setState({playing: false});
}
export function pause(){ const p = posNow(); stopPlayback(); useStems.setState({pos: p}); }
export function seek(sec: number){ if(useStems.getState().playing) play(sec); else useStems.setState({pos: sec}); }
export function stopAll(){ if(useStems.getState().playing) pause(); }

// ---------- baixar ----------
const channels = (b: AudioBuffer) => [b.getChannelData(0), b.getChannelData(1)];
export function stemWav(name: StemName){ const i = MODEL.stems.indexOf(name); return new Blob([encodeWav(channels(stems[i]), MODEL.rate)], {type: "audio/wav"}); }
export function mixWav(){ return new Blob([encodeWav(mixStems(stems.map(channels), effectiveGains()), MODEL.rate)], {type: "audio/wav"}); }

// Atalhos de mistura comuns para quem toca junto.
export const PRESETS: {id: string; off: StemName[]}[] = [
  {id: "all", off: []}, {id: "noVocals", off: ["vocals"]}, {id: "noDrums", off: ["drums"]}, {id: "noBass", off: ["bass"]},
  {id: "noGuitar", off: ["guitar"]}, {id: "noPiano", off: ["piano"]}, {id: "onlyVocals", off: STEM_ORDER.filter(s => s !== "vocals")},
];
export function applyPreset(off: StemName[]){ useStems.setState({solo: "", muted: Object.fromEntries(MODEL.stems.map(s => [s, off.includes(s)])) as Record<StemName, boolean>}); }
