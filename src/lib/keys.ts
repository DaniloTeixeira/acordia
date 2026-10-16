// Exercícios de teclado: técnica para as duas mãos, em qualquer tom, com dedilhado.
// Parte pura (exercícios, transposição, passos e avaliação): sem DOM, testada no Node.
import { spellScale, rootFor } from "./core";

const MAJOR = [0,2,4,5,7,9,11];
// Grau da escala maior (0 = tônica, pode passar de 7 ou ficar negativo) -> semitons.
export const degSemis = (d: number) => MAJOR[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);

// Cada evento: [tempo inicial, duração, graus, dedos]. Compasso 4/4; mão direita a partir do C4, esquerda do C3.
type Ev = [number, number, number[], number[]];
const seq = (degs: number[], fingers: number[], dur = 1, start = 0): Ev[] => degs.map((d, i) => [start + i * dur, dur, [d], [fingers[i]]]);
const blocks = (chords: number[][], fingers: number[][], dur: number, start = 0): Ev[] => chords.map((c, i) => [start + i * dur, dur, c, fingers[i] || fingers[0]]);
const hanonBar = (k: number) => [0,2,3,4,5,4,3,2].map(d => d + k);
export interface KeyExercise { id: string; level: number; bars: number; fingerKeys?: string[]; rh: Ev[]; lh: Ev[] }
export const KEY_EXERCISES: KeyExercise[] = [
  {id:"cinco", level:1, bars:2,
    rh: seq([0,1,2,3,4,3,2,1], [1,2,3,4,5,4,3,2]),
    lh: seq([0,1,2,3,4,3,2,1], [5,4,3,2,1,2,3,4])},
  {id:"contrario", level:1, bars:2,
    rh: seq([0,1,2,3,4,3,2,1], [1,2,3,4,5,4,3,2]),
    lh: seq([7,6,5,4,3,4,5,6].map(d => d - 7), [1,2,3,4,5,4,3,2])},
  {id:"escala", level:2, bars:4, fingerKeys:["C","G","D","A","E"],
    rh: seq([0,1,2,3,4,5,6,7,7,6,5,4,3,2,1,0], [1,2,3,1,2,3,4,5,5,4,3,2,1,3,2,1]),
    lh: seq([0,1,2,3,4,5,6,7,7,6,5,4,3,2,1,0], [5,4,3,2,1,3,2,1,1,2,3,1,2,3,4,5])},
  {id:"arpejo", level:2, bars:4,
    lh: seq([0,2,4,7], [5,3,2,1]).concat(seq([7,4,2,0], [1,2,3,5], 1, 12)),
    rh: seq([7,9,11,14], [1,2,3,5], 1, 4).concat(seq([14,11,9,7], [5,3,2,1], 1, 8))},
  {id:"acordes", level:2, bars:4,
    lh: blocks([[0,2,4],[0,3,5],[-1,1,4],[0,2,4]], [[5,3,1],[5,2,1],[5,3,1],[5,3,1]], 4),
    rh: seq([2,1,0,1, 5,4,3,4, 4,3,1,3], [3,2,1,2, 5,4,3,4, 4,3,1,3]).concat([[12, 2, [2], [3]], [14, 2, [0], [1]]] as Ev[])},
  {id:"alberti", level:2, bars:4,
    // Baixo de Alberti: grave–agudo–médio–agudo em colcheias, duas vezes por compasso (I, IV, V6, I).
    lh: seq([[0,4,2,4],[0,5,3,5],[-1,4,1,4],[0,4,2,4]].flatMap(p => p.concat(p)), [[5,1,3,1],[5,1,2,1],[5,1,3,1],[5,1,3,1]].flatMap(p => p.concat(p)), 0.5),
    rh: [[0,2,[4],[5]],[2,2,[2],[3]],[4,2,[5],[5]],[6,2,[3],[3]],[8,2,[4],[4]],[10,2,[1],[2]],[12,4,[0],[1]]]},
  {id:"hanon", level:3, bars:4,
    rh: [0,1,2,3].flatMap(k => seq(hanonBar(k), [1,2,3,4,5,4,3,2], 0.5, k * 4)),
    lh: [0,1,2,3].flatMap(k => seq(hanonBar(k), [5,4,3,2,1,2,3,4], 0.5, k * 4))},
  {id:"inversoes", level:3, bars:4,
    rh: blocks([[0,2,4],[2,4,7],[4,7,9],[7,9,11],[4,7,9],[2,4,7],[0,2,4]], [[1,3,5],[1,2,5],[1,3,5],[1,3,5],[1,3,5],[1,2,5],[1,3,5]], 2),
    lh: [[0,8,[0],[5]],[8,4,[-7],[5]],[12,2,[0],[1]]]},
  {id:"pop", level:3, bars:4,
    lh: blocks([[0],[-3],[-2],[-4]], [[5]], 1).flatMap(([, , c, f], i) => [0,1,2,3].map((b): Ev => [i * 4 + b, 1, c, f])),
    rh: [[0,2,4],[1,4,6],[0,2,5],[0,3,5]].flatMap((c, i) => [0.5,1.5,2.5,3.5].map((b): Ev => [i * 4 + b, 0.5, c, [1,3,5]]))}
];

// Base da mão direita perto do C4, sem subir demais nos tons agudos.
export const baseFor = (rootPc: number) => 60 + (rootPc <= 5 ? rootPc : rootPc - 12);

export type Hand = "rh" | "lh";
export type Hands = Hand | "both";
export interface KeyEvent { hand: Hand; t: number; dur: number; midis: number[]; names: string[]; fingers: number[] }
export interface KeyStep { t: number; rh: KeyEvent | null; lh: KeyEvent | null }
export interface BuiltExercise { events: KeyEvent[]; steps: KeyStep[]; beats: number; lo: number; hi: number; root: string; fingering: boolean }

// Eventos concretos em MIDI para um tom; as mãos que a pessoa não toca o app toca.
export function buildExercise(ex: KeyExercise, rootPc: number): BuiltExercise {
  const rb = baseFor(rootPc), lb = rb - 12, root = rootFor(rootPc, "maior"), names = spellScale(root, "maior");
  const nameOf = (d: number) => names[((d % 7) + 7) % 7];
  const events: KeyEvent[] = [];
  for(const hand of ["rh","lh"] as const) for(const [start, dur, degs, fingers] of ex[hand]){
    events.push({hand, t: start, dur, midis: degs.map(d => (hand === "rh" ? rb : lb) + degSemis(d)), names: degs.map(nameOf), fingers});
  }
  events.sort((a, b) => a.t - b.t || (a.hand === "lh" ? -1 : 1));
  const times = [...new Set(events.map(e => e.t))].sort((a, b) => a - b);
  const steps = times.map(time => ({t: time, rh: events.find(e => e.t === time && e.hand === "rh") || null, lh: events.find(e => e.t === time && e.hand === "lh") || null}));
  const all = events.flatMap(e => e.midis);
  const fingering = !ex.fingerKeys || ex.fingerKeys.includes(root);
  return {events, steps, beats: ex.bars * 4, lo: Math.min(...all), hi: Math.max(...all), root, fingering};
}

// Notas que a pessoa precisa tocar num passo, conforme as mãos escolhidas.
export function required(step: KeyStep, hands: Hands): number[] {
  const out: number[] = [];
  if(step.rh && hands !== "lh") out.push(...step.rh.midis);
  if(step.lh && hands !== "rh") out.push(...step.lh.midis);
  return out;
}
// Modo espera: com as notas já tocadas neste passo, diz se completou e se a última foi errada.
export function checkStep(req: number[], pressed: number[], last?: number){
  const need = new Set(req), got = new Set(pressed.filter(n => need.has(n)));
  return {done: need.size > 0 && got.size === need.size, wrong: last !== undefined && !need.has(last)};
}
// Modo no tempo: casa cada nota tocada com a esperada de mesma altura mais próxima, dentro da tolerância (s).
export interface TimedNote { midi: number; t: number }
export function scoreNotes(expected: TimedNote[], played: TimedNote[], tol: number){
  const used = new Set<number>(); let hits = 0; const offsets: number[] = [];
  for(const e of expected){
    let best = -1;
    played.forEach((p, i) => { if(!used.has(i) && p.midi === e.midi && Math.abs(p.t - e.t) <= tol && (best < 0 || Math.abs(p.t - e.t) < Math.abs(played[best].t - e.t))) best = i; });
    if(best >= 0){ used.add(best); hits++; offsets.push(played[best].t - e.t); }
  }
  const extras = played.length - used.size, total = expected.length + extras;
  return {hits, misses: expected.length - hits, extras, accuracy: total ? Math.round(hits / total * 100) : 0,
    meanOffset: offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : 0};
}
