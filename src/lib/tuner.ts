// Afinador: detecção de altura por autocorrelação (com refinamento parabólico).
import { INSTRUMENTS, isInstrument } from "./instruments";

const NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
// Frequência fundamental de um trecho de áudio (Float32Array), ou null se for silêncio ou ruído.
export function detectPitch(buf: Float32Array, sampleRate: number, {minHz = 35, maxHz = 1500} = {}): number | null {
  const n = buf.length;
  let rms = 0; for(let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n); if(rms < 0.008) return null;
  const minLag = Math.floor(sampleRate / maxHz), maxLag = Math.min(Math.floor(sampleRate / minHz), n >> 1);
  // Diferença normalizada acumulada (YIN simplificado).
  const d = new Float32Array(maxLag + 1);
  for(let lag = 1; lag <= maxLag; lag++){
    let s = 0; for(let i = 0; i + lag < n; i++){ const x = buf[i] - buf[i + lag]; s += x * x; }
    d[lag] = s;
  }
  const cmnd = new Float32Array(maxLag + 1); cmnd[0] = 1; let run = 0;
  for(let lag = 1; lag <= maxLag; lag++){ run += d[lag]; cmnd[lag] = run ? d[lag] * lag / run : 1; }
  let lag = -1;
  for(let l = Math.max(2, minLag); l < maxLag; l++){
    if(cmnd[l] < 0.15){ while(l + 1 < maxLag && cmnd[l + 1] < cmnd[l]) l++; lag = l; break; }
  }
  if(lag < 0){ // sem vale claro: usa o menor valor, se for razoável
    let best = 1; for(let l = Math.max(2, minLag); l < maxLag; l++) if(cmnd[l] < best){ best = cmnd[l]; lag = l; }
    if(best > 0.35) return null;
  }
  const a = cmnd[lag - 1] ?? cmnd[lag], b = cmnd[lag], c = cmnd[lag + 1] ?? cmnd[lag];
  const shift = (a - 2 * b + c) ? (a - c) / (2 * (a - 2 * b + c)) : 0;
  return sampleRate / (lag + shift);
}
// Motivo da falha ao abrir o microfone, para a mensagem dizer o que fazer (getUserMedia rejeita com nomes
// diferentes). Sem mediaDevices (página não segura, janela embutida de outro app) é "unsupported".
export type MicError = "denied" | "nomic" | "busy" | "unsupported";
export function micErrorKind(e: unknown): MicError {
  const n = (e as {name?: string} | null)?.name;
  if(n === "NotAllowedError" || n === "PermissionDeniedError" || n === "SecurityError") return "denied";
  if(n === "NotFoundError" || n === "OverconstrainedError" || n === "DevicesNotFoundError") return "nomic";
  if(n === "NotReadableError" || n === "AbortError" || n === "TrackStartError") return "busy";
  return "unsupported";
}
// Microfone com detecção contínua, para os exercícios de voz: chama onPitch(Hz ou null) a cada ~60 ms.
// O cancelamento de eco evita que o som do próprio app (cadência, nota de ajuda) conte como canto.
// Devolve uma função que para tudo; rejeita se o microfone for negado.
export async function listenPitch(onPitch: (f: number | null) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:false, autoGainControl:false}});
  const C = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext, ctx = new C();
  const an = ctx.createAnalyser(); an.fftSize = 4096; ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  let raf = 0, last = 0, on = true;
  const loop = () => {
    if(!on) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now(); if(now - last < 60) return; last = now;
    an.getFloatTimeDomainData(buf);
    onPitch(detectPitch(buf, ctx.sampleRate, {minHz:60, maxHz:1200}));
  };
  loop();
  return () => { on = false; cancelAnimationFrame(raf); stream.getTracks().forEach(tr => tr.stop()); ctx.close().catch(()=>{}); };
}

// Nota mais próxima: {name, octave, midi, cents, target}.
export function noteFromFreq(f: number, a4 = 440){
  const midiF = 69 + 12 * Math.log2(f / a4), midi = Math.round(midiF);
  return {name: NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1, midi, cents: Math.round((midiF - midi) * 100), target: a4 * Math.pow(2, (midi - 69) / 12)};
}
export const midiName = (m: number) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
// Corda do instrumento mais próxima da frequência tocada.
export function nearestString(f: number, instId: string, a4 = 440){
  const inst = isInstrument(instId) ? INSTRUMENTS[instId] : null; if(!inst || inst.kind !== "strings") return null;
  const midiF = 69 + 12 * Math.log2(f / a4);
  let best = 0; inst.strings.forEach((m, i) => { if(Math.abs(m - midiF) < Math.abs(inst.strings[best] - midiF)) best = i; });
  const m = inst.strings[best];
  return {index: best, midi: m, name: midiName(m), cents: Math.round((midiF - m) * 100)};
}
