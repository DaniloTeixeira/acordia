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
