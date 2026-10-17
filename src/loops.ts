// Loops no tempo do metrônomo, contínuos como o pad: a caixa, o shaker (chocalho) e o grave (os sons dos drum
// pads), e os grooves, que tocam uma bateria inteira no padrão de um estilo. As notas são agendadas no relógio do
// áudio com uma janela curta de antecedência, como o metrônomo, então troca de BPM vale já na próxima nota.
import { audioOut, audioReady } from "./lib/audio";
import * as store from "./lib/store";
import { metro } from "./metro";
import { fxRoute, fxNoise, tumbHit, kickHit, subHit, snareHit, rimHit, hatHit } from "./padfx";
import { setLoopAnchor } from "./grid";

export interface Loop {
  readonly on: boolean; volume(): number;
  start(): Promise<boolean>; stop(): void; toggle(): Promise<boolean>; setVolume(v: number): void;
  onChange(f: (on: boolean) => void): () => void;
}

// Um relógio só para todos os loops, em semicolcheias: assim caixa, shaker e grave andam juntos, e começam
// alinhados com o metrônomo se ele já estiver tocando. Cada loop toca nas semicolcheias da sua divisão.
type Def = {perBeat: number; play: (ac: AudioContext, at: number, step: number, out: AudioNode) => void; gain: GainNode | null; on: boolean; starting: boolean};
const defs: Def[] = [];
let timer: ReturnType<typeof setInterval> | null = null, next = 0, tick = 0;
const dt16 = () => 60 / metro.state.bpm / 4;
function schedule(){
  const io = audioOut(); if(!io) return;
  const {ac} = io;
  // Voltou de uma pausa longa: pula as semicolcheias perdidas sem tocá-las, mantendo a grade.
  if(next < ac.currentTime){ const k = Math.ceil((ac.currentTime - next) / dt16()); next += k * dt16(); tick += k; }
  while(next < ac.currentTime + 0.15){
    for(const d of defs){ const stride = 4 / d.perBeat; if(d.on && tick % stride === 0) d.play(ac, next, tick / stride, d.gain!); }
    setLoopAnchor({at: next, dt: dt16()});
    tick++; next += dt16();
  }
}
function run(ac: AudioContext){
  if(timer) return;
  const g = metro.grid();
  if(g){ next = g.nextBeatAt; tick = g.beat * 4; } else { next = ac.currentTime + 0.05; tick = 0; }
  timer = setInterval(schedule, 25); schedule();
}
function idle(){ if(timer && !defs.some(d => d.on)){ clearInterval(timer); timer = null; setLoopAnchor(null); } }

// `perBeat` notas por tempo (1, 2 ou 4); `play` toca a nota número `step` em `at`, ligada em `out`.
function createLoop(key: string, perBeat: number, wet: number, play: Def["play"]): Loop {
  const d: Def = {perBeat, play, gain: null, on: false, starting: false};
  defs.push(d);
  const subs = new Set<(on: boolean) => void>();
  const volume = () => store.setting(key, 0.6), level = () => volume() * volume();
  const emit = () => subs.forEach(f => f(d.on));
  const loop: Loop = {
    get on(){ return d.on; },
    volume,
    async start(){
      // Um segundo toque enquanto o áudio ainda prepara não inicia o loop de novo.
      if(d.on || d.starting) return true;
      d.starting = true;
      const io = audioOut(), ready = !!io && await audioReady();
      d.starting = false;
      if(!io || !ready) return false;
      if(!d.gain){ d.gain = io.ac.createGain(); fxRoute(io.ac, d.gain, 1, wet, false); }
      d.gain.gain.value = level();
      d.on = true; run(io.ac); emit();
      return true;
    },
    stop(){ if(!d.on) return; d.on = false; idle(); emit(); },
    toggle(){ return d.on ? (loop.stop(), Promise.resolve(true)) : loop.start(); },
    setVolume(v){
      store.setSetting(key, Math.max(0, Math.min(1, v)));
      const io = audioOut(); if(io && d.gain) d.gain.gain.setTargetAtTime(level(), io.ac.currentTime, 0.05);
    },
    onChange(f){ subs.add(f); return () => { subs.delete(f); }; }
  };
  return loop;
}

// Os loops do ritmo tocam padrões de um compasso: 16 semicolcheias (os tempos caem em 0, 4, 8 e 12) com a
// intensidade de cada uma (0 = não toca). Cada loop tem vários padrões para escolher.
const at16 = (hits: Record<number, number>) => Array.from({length: 16}, (_, i) => hits[i] ?? 0);
const every = (vals: number[]) => Array.from({length: 16}, (_, i) => vals[i % vals.length]);
// Além dos prontos, cada loop tem o padrão "custom": as 16 casas editadas à mão (salvas), que começam como o padrão
// padrão do loop.
export interface Patterned { modes: string[]; mode(): string; setMode(m: string): void; custom(): number[]; setCustom(p: number[]): void }
function patterned(key: string, fallback: string, patterns: Record<string, number[]>): Patterned & {vel(step: number): number} {
  const customKey = key + "Custom", modes = [...Object.keys(patterns), "custom"];
  const custom = () => { const c = store.setting<number[] | null>(customKey, null); return Array.isArray(c) && c.length === 16 ? c : patterns[fallback]; };
  const mode = () => { const m = store.setting(key, fallback); return modes.includes(m) ? m : fallback; };
  return {
    modes, mode, custom,
    setMode: m => { if(modes.includes(m)) store.setSetting(key, m); },
    setCustom: p => store.setSetting(customKey, p.slice(0, 16)),
    vel: step => (mode() === "custom" ? custom() : patterns[mode()])[step % 16],
  };
}

// Tipo de som de cada loop (salvo): formas diferentes de tocar a mesma batida (mais aberto, mais fechado...).
type Hit = (ac: AudioContext, at: number, out: AudioNode, vel: number) => void;
export interface Toned { tones: string[]; tone(): string; setTone(t: string): void }
function toned(key: string, fallback: string, tones: Record<string, Hit>): Toned & {hit: Hit} {
  const tone = () => { const t = store.setting(key, fallback); return t in tones ? t : fallback; };
  return {tones: Object.keys(tones), tone, setTone: t => { if(t in tones) store.setSetting(key, t); }, hit: (ac, at, out, v) => tones[tone()](ac, at, out, v)};
}

// Caixa: o mesmo som do drum pad Caixa (a caixa de worship), ou seca, ou só o aro.
export const snareModes = patterned("snareMode", "24", {
  "24": at16({4: 0.9, 12: 0.9}),                                // backbeat do pop e do worship
  ghost: at16({4: 0.9, 7: 0.2, 10: 0.18, 12: 0.9, 15: 0.2}),    // backbeat com notas fantasma
  "3": at16({8: 0.9}),                                          // meio tempo
  four: at16({0: 0.55, 4: 0.9, 8: 0.55, 12: 0.9}),              // todo tempo
  off: every([0, 0, 0.6, 0]),                                   // contratempo
  fill: at16({4: 0.9, 12: 0.8, 13: 0.45, 14: 0.6, 15: 0.75}),   // backbeat com virada no fim
});
export const snareTones = toned("snareTone", "worship", {worship: snareHit, tight: (ac, at, out, v) => snareHit(ac, at, out, v, true), rim: rimHit});
export const snare = createLoop("snareVol", 4, 0.06, (ac, at, step, out) => { const v = snareModes.vel(step); if(v) snareTones.hit(ac, at, out, v); });

// Grave: o mesmo som do drum pad Tumb (um grave abafado, como um bumbo com feltro), um bumbo com ataque ou um sub.
export const bassModes = patterned("bassMode", "off", {
  off: every([0, 0, 1, 0]),                     // contratempo
  beat: every([1, 0, 0, 0]),                    // todo tempo
  half: at16({0: 1, 8: 1}),                     // 1 e 3
  one: at16({0: 1}),                            // só no 1
  pop: at16({0: 1, 7: 0.6, 8: 0.9, 10: 0.6}),   // pop, com antecipação
  dotted: at16({0: 1, 6: 0.7, 8: 0.9, 14: 0.7}),// pontuado (balanço de bossa)
});
export const bassTones = toned("bassTone", "tumb", {tumb: tumbHit, kick: kickHit, sub: subHit});
export const bass = createLoop("bassVol", 4, 0, (ac, at, step, out) => { const v = bassModes.vel(step); if(v) bassTones.hit(ac, at, out, v); });

// Shaker: um sopro de ruído bem agudo, fechado (curto), aberto (mais longo e encorpado) ou suave.
export const shakerModes = patterned("shakerMode", "16", {
  "16": every([0.55, 0.25, 0.85, 0.3]),   // semicolcheias, acento no contratempo
  "8": every([0.6, 0, 0.9, 0]),            // colcheias
  off: every([0, 0, 0.8, 0]),              // contratempo
  "4": every([0.8, 0, 0, 0]),              // semínimas
  gallop: every([0.8, 0, 0.5, 0.6]),       // galope (colcheia e duas semicolcheias)
  samba: every([0.55, 0.3, 0.45, 0.9]),    // ganzá de samba
});
export const shakerTones = toned("shakerTone", "closed", {
  closed: (ac, at, out, v) => shakerHit(ac, at, out, v),
  open: (ac, at, out, v) => shakerHit(ac, at, out, v * 0.9, 4200, 0.02, 0.18),
  soft: (ac, at, out, v) => shakerHit(ac, at, out, v * 0.6, 8000, 0.01, 0.05),
});
export const shaker = createLoop("shakerVol", 4, 0.1, (ac, at, step, out) => { const v = shakerModes.vel(step); if(v) shakerTones.hit(ac, at, out, v); });

// Um sopro de shaker: ruído acima de `cut` Hz, com intensidade `vel`, entrando em `rise` s e sumindo em `len` s.
function shakerHit(ac: AudioContext, at: number, out: AudioNode, vel: number, cut = 6500, rise = 0.012, len = 0.07){
  const n = fxNoise(ac), hp = ac.createBiquadFilter(), g = ac.createGain();
  hp.type = "highpass"; hp.frequency.value = cut;
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vel * 0.5, at + rise); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  n.connect(hp); hp.connect(g); g.connect(out); n.start(at, Math.random()); n.stop(at + len + 0.01);
}

// ---------- grooves: bumbo, caixa, aro, chimbal e shaker juntos, no padrão de cada estilo ----------
// Cada estilo tem um compasso de 16 semicolcheias (os tempos caem em 0, 4, 8 e 12) com a intensidade de cada
// instrumento em cada uma (0 = não toca). `swing` atrasa as colcheias do contratempo para o balanço de tercina do
// jazz; `bpm` é o andamento típico do estilo, mostrado como sugestão.
// bass é o bumbo (o som do tumb); rim é o aro da caixa; hat é o chimbal fechado.
type Pattern = {bass: number[]; snare?: number[]; rim?: number[]; hat?: number[]; shaker?: number[]; swing?: boolean; bpm: number};
export const GROOVES: Record<string, Pattern> = {
  worship: {bpm: 72, bass: at16({0: 1, 8: 0.8, 10: 0.45}), snare: at16({4: 0.85, 12: 0.85}), shaker: every([0.5, 0.15, 0.8, 0.15])},
  pop:     {bpm: 110, bass: at16({0: 1, 7: 0.6, 8: 0.9, 10: 0.6}), snare: at16({4: 0.9, 12: 0.9}), shaker: every([0.6, 0, 0.9, 0])},
  ballad:  {bpm: 66, bass: at16({0: 1, 10: 0.6}), snare: at16({8: 0.85}), shaker: every([0.45, 0, 0.7, 0])},
  // Bumbo em todos os tempos, chimbal nos contratempos e a caixa junto com o bumbo no 3.
  reggae:  {bpm: 76, bass: every([1, 0, 0, 0]), hat: every([0, 0, 0.7, 0]), snare: at16({8: 0.85})},
  samba:   {bpm: 100, bass: at16({0: 0.35, 4: 1, 8: 0.35, 12: 1}), snare: at16({0: 0.45, 3: 0.4, 6: 0.45, 10: 0.45, 13: 0.4}), shaker: every([0.55, 0.3, 0.45, 0.9])},
  bossa:   {bpm: 130, bass: at16({0: 0.9, 6: 0.6, 8: 0.9, 14: 0.6}), snare: at16({0: 0.35, 3: 0.35, 6: 0.35, 10: 0.35, 12: 0.35}), shaker: every([0.4, 0, 0.6, 0])},
  jazz:    {bpm: 120, swing: true, bass: every([0.55, 0, 0, 0]), snare: at16({4: 0.3, 12: 0.3, 14: 0.18}), shaker: at16({0: 0.6, 4: 0.85, 6: 0.5, 8: 0.6, 12: 0.85, 14: 0.5})},
  funk:    {bpm: 100, bass: at16({0: 1, 3: 0.55, 6: 0.8, 10: 0.8}), snare: at16({4: 0.9, 7: 0.22, 9: 0.22, 12: 0.9}), shaker: every([0.7, 0.3, 0.55, 0.3])},
};
export const GROOVE_STYLES = Object.keys(GROOVES);
export const grooveStyle = () => { const g = store.setting("groove", "worship"); return g in GROOVES ? g : "worship"; };
export const setGrooveStyle = (g: string) => { if(g in GROOVES) store.setSetting("groove", g); };
export const groove = createLoop("grooveVol", 4, 0.05, (ac, at, step, out) => {
  const p = GROOVES[grooveStyle()], pos = step % 16;
  // Swing: a colcheia do contratempo cai a 2/3 do tempo em vez de 1/2 (atraso de 2/3 de semicolcheia).
  const t = p.swing && pos % 4 === 2 ? at + (60 / metro.state.bpm / 4) * 2 / 3 : at;
  if(p.bass[pos]) tumbHit(ac, t, out, p.bass[pos]);
  if(p.snare?.[pos]) snareHit(ac, t, out, p.snare[pos]);
  if(p.rim?.[pos]) rimHit(ac, t, out, p.rim[pos]);
  if(p.hat?.[pos]) hatHit(ac, t, out, p.hat[pos]);
  if(p.shaker?.[pos]) shakerHit(ac, t, out, p.shaker[pos]);
});
