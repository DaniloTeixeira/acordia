// Independência das mãos: exercícios rítmicos em duas mãos com metrônomo e avaliação de precisão.
// Parte pura (padrões, linha do tempo, pontuação): sem DOM, testada no Node.
import type { Hand } from "./keys";

// Posições em tempos (semínimas) dentro de um compasso 4/4.
const range = (step: number, n = 4) => Array.from({length: Math.round(n / step)}, (_, i) => +(i * step).toFixed(4));
export interface Pattern { id: string; level: number; lh: number[]; rh: number[] }
export const PATTERNS: Pattern[] = [
  {id:"juntas",      level:1, lh:range(1),           rh:range(1)},
  {id:"alternadas",  level:1, lh:[0, 2],             rh:[1, 3]},
  {id:"minimas",     level:1, lh:[0, 2],             rh:range(1)},
  {id:"colcheias",   level:2, lh:range(1),           rh:range(0.5)},
  {id:"contratempo", level:2, lh:range(1),           rh:[0.5, 1.5, 2.5, 3.5]},
  {id:"baixo",       level:2, lh:[0, 1.5, 2, 3.5],   rh:range(1)},
  {id:"tresillo",    level:3, lh:range(1),           rh:[0, 1.5, 3]},
  {id:"tercinas",    level:3, lh:range(1),           rh:[0, 2/3, 4/3, 2, 8/3, 10/3].map(x => +x.toFixed(4))},
  {id:"tresContra4", level:3, lh:[0, 4/3, 8/3].map(x => +x.toFixed(4)), rh:range(1)},
  {id:"semis",       level:3, lh:range(1),           rh:range(0.25)}
];
export const BARS = 4, COUNT_IN = 4;

export interface Expected { hand: Hand; bar: number; beat: number; t: number }
// Notas esperadas (em segundos a partir de `start`) para `bars` compassos depois da contagem.
export function timeline(p: Pattern, bpm: number, bars = BARS, start = 0): Expected[] {
  const spb = 60 / bpm, out: Expected[] = [];
  for(let b = 0; b < bars; b++) for(const hand of ["lh","rh"] as const) for(const beat of p[hand])
    out.push({hand, bar:b, beat, t: start + (COUNT_IN + b*4 + beat) * spb});
  return out.sort((a, b) => a.t - b.t);
}
// Tolerância de acerto: 90 ms, ou menos quando as notas ficam muito próximas.
export function tolerance(p: Pattern, bpm: number){
  const spb = 60 / bpm;
  const gaps = (["lh","rh"] as const).flatMap(h => p[h].map((x, i, a) => ((a[i+1] ?? (a[0] + 4)) - x) * spb));
  return Math.min(0.09, Math.min(...gaps) * 0.4);
}
export interface TapResult {
  hits: number; misses: number; extras: number; offsets: number[];
  perHand: Record<Hand, {hits: number; total: number}>;
  notes: (Expected & {hit: boolean; off?: number})[];
  accuracy: number; meanOffset: number; newBest?: boolean;
}
// Casa cada toque com a nota esperada mais próxima da mesma mão, dentro da tolerância.
export function scoreTaps(expected: Expected[], taps: {hand: Hand; t: number}[], tol: number): TapResult {
  const result: TapResult = {hits:0, misses:0, extras:0, offsets:[], perHand:{lh:{hits:0,total:0}, rh:{hits:0,total:0}}, notes:[], accuracy:0, meanOffset:0};
  for(const hand of ["lh","rh"] as const){
    const exp = expected.filter(e => e.hand === hand), tp = taps.filter(x => x.hand === hand).map(x => ({t:x.t, used:false}));
    result.perHand[hand].total = exp.length;
    for(const e of exp){
      let best: {t: number; used: boolean} | null = null;
      for(const x of tp) if(!x.used && Math.abs(x.t - e.t) <= tol && (!best || Math.abs(x.t - e.t) < Math.abs(best.t - e.t))) best = x;
      if(best){ best.used = true; result.hits++; result.perHand[hand].hits++; result.offsets.push(best.t - e.t); result.notes.push(Object.assign({hit:true, off:best.t - e.t}, e)); }
      else { result.misses++; result.notes.push(Object.assign({hit:false}, e)); }
    }
    result.extras += tp.filter(x => !x.used).length;
  }
  const total = expected.length + result.extras;
  result.accuracy = total ? Math.round(result.hits / total * 100) : 0;
  result.meanOffset = result.offsets.length ? result.offsets.reduce((a, b) => a + b, 0) / result.offsets.length : 0;
  return result;
}
