// Separação de faixas fora da tela principal (a interface não trava enquanto o modelo trabalha).
// Baixa o modelo uma vez (guardado no aparelho), tenta a placa de vídeo (WebGPU) e, sem ela ou quando
// ela falha, usa o processador (WASM). Recebe a música em 44,1 kHz estéreo e devolve as 6 faixas.
import * as ort from "onnxruntime-web/webgpu";
import { MODEL, chunkPlan, chunkWindow, chunkInput, overlapAdd } from "./lib/stems";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ctx = self as any;
// gpu: tentar a placa de vídeo (false depois que ela falhou neste aparelho).
export type ToWorker = {type: "run"; left: Float32Array; right: Float32Array; gpu: boolean} | {type: "has"};
export type FromWorker =
  | {type: "has"; cached: boolean}
  | {type: "download"; loaded: number; total: number}
  | {type: "loading"; device: "gpu" | "cpu"}
  | {type: "progress"; done: number; total: number}
  | {type: "done"; stems: Float32Array[][]; device: "gpu" | "cpu"}
  | {type: "gpuLost"}
  | {type: "error"; message: string};

const CACHE = "acordia-ml";
const post = (m: FromWorker, transfer: Transferable[] = []) => ctx.postMessage(m, transfer);

async function cached(): Promise<Response | undefined> {
  try{ return await (await caches.open(CACHE)).match(MODEL.url); }catch(e){ return undefined; }
}
// Baixa mostrando o progresso e guarda; da próxima vez vem do aparelho.
async function modelBytes(): Promise<Uint8Array> {
  const hit = await cached();
  if(hit) return new Uint8Array(await hit.arrayBuffer());
  const res = await fetch(MODEL.url);
  if(!res.ok || !res.body) throw new Error("download " + res.status);
  const total = +(res.headers.get("content-length") || 0) || MODEL.mb * 1024 * 1024;
  const reader = res.body.getReader(), parts: Uint8Array[] = [];
  let loaded = 0, last = 0;
  for(;;){
    const {done, value} = await reader.read(); if(done) break;
    parts.push(value); loaded += value.length;
    if(Date.now() - last > 200){ last = Date.now(); post({type: "download", loaded, total}); }
  }
  const bytes = new Uint8Array(loaded); let o = 0; parts.forEach(p => { bytes.set(p, o); o += p.length; });
  try{ await (await caches.open(CACHE)).put(MODEL.url, new Response(bytes, {headers: {"content-type": "application/octet-stream"}})); }catch(e){ /* sem espaço: baixa de novo da próxima vez */ }
  return bytes;
}

let session: ort.InferenceSession | null = null;
async function open(bytes: Uint8Array, gpu: boolean){
  ort.env.wasm.numThreads = (self as any).crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  post({type: "loading", device: gpu ? "gpu" : "cpu"});
  session = await ort.InferenceSession.create(bytes, {executionProviders: gpu ? ["webgpu"] : ["wasm"], graphOptimizationLevel: "all"});
  // Placa de vídeo fraca pode travar no meio (o sistema reinicia a placa): avisa a tela, que recomeça
  // a separação no processador num worker novo (este fica com o motor quebrado).
  if(gpu) (ort.env.webgpu as any).device?.lost?.then(() => post({type: "gpuLost"}));
}
async function runChunk(x: Float32Array){
  const out = await session!.run({mix: new ort.Tensor("float32", x, [1, 2, MODEL.segment])});
  const t = out.stems || out[Object.keys(out)[0]];
  const data = await t.getData() as Float32Array;
  t.dispose?.();
  return data;
}

async function separate(left: Float32Array, right: Float32Array, wantGpu: boolean){
  const bytes = await modelBytes();
  const gpu = wantGpu && !!(navigator as any).gpu && !!(await (navigator as any).gpu.requestAdapter().catch(() => null));
  try{ await open(bytes, gpu); }
  catch(e){ if(!gpu) throw e; post({type: "gpuLost"}); return; }
  const device = gpu ? "gpu" : "cpu";
  const total = left.length, seg = MODEL.segment, {chunks, overlap} = chunkPlan(total, seg);
  const out = MODEL.stems.map(() => [new Float32Array(total), new Float32Array(total)]);
  post({type: "progress", done: 0, total: chunks.length});
  for(let i = 0; i < chunks.length; i++){
    const c = chunks[i];
    let piece: Float32Array;
    try{ piece = await runChunk(chunkInput(left, right, c, seg)); }
    catch(e){ if(gpu){ post({type: "gpuLost"}); return; } throw e; }
    overlapAdd(out, piece, c, chunkWindow(seg, overlap, i === 0, i === chunks.length - 1), seg);
    post({type: "progress", done: i + 1, total: chunks.length});
  }
  post({type: "done", stems: out, device}, out.flatMap(s => s.map(c => c.buffer)));
}

ctx.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if(m.type === "has"){ post({type: "has", cached: !!(await cached())}); return; }
  try{ await separate(m.left, m.right, m.gpu); }
  catch(err){ post({type: "error", message: String((err as Error)?.message || err)}); }
};
