// Loops no tempo do metrônomo, contínuos como o pad: a caixa, o shaker (chocalho) e o grave (os sons dos drum
// pads), e os grooves, que tocam uma bateria inteira no padrão de um estilo. As notas são agendadas no relógio do
// áudio com uma janela curta de antecedência, como o metrônomo, então troca de BPM vale já na próxima nota.
import { audioOut, audioReady } from "./lib/audio";
import * as store from "./lib/store";
import { metro } from "./metro";
import { fxRoute, fxNoise, tumbHit, kickHit, subHit, snareHit, rimHit, hatHit, rideHit, snapHit } from "./padfx";
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

// ---------- grooves: bumbo, caixa, aro, chimbal, prato e shaker juntos, no padrão de cada estilo ----------
// Cada estilo tem dois compassos de 16 semicolcheias (32 casas; os tempos caem a cada 4), com a intensidade de cada
// instrumento em cada uma (0 = não toca): o segundo compasso varia um pouco o primeiro, como um baterista faz.
// Os padrões seguem as levadas de referência de cada estilo (o "one drop" do reggae, a clave da bossa, o teleco-teco
// do samba, as notas fantasma do funk de James Brown, o ride do jazz, o boom bap do hip-hop).
// kick é o bumbo (`kit` "tumb" = abafado, de feltro; "kick" = com ataque); rim é o aro (baqueta atravessada); hat é o
// chimbal fechado, open o chimbal aberto (abafado pelo próximo toque de chimbal); ride é o prato de condução.
// `swing` é onde cai a colcheia do contratempo dentro do tempo (0,5 = reta; 0,67 = tercina, do jazz e do shuffle);
// `swing16` faz o mesmo com as semicolcheias (o balanço "torto" do hip-hop e do funk). Com `trip`, cada tempo é uma
// tercina: as casas 0, 1 e 2 de cada tempo caem em 0, 1/3 e 2/3 dele (a casa 3 não toca). `rimPitch` afina o aro.
// `bpm` é o andamento típico.
type Pattern = {bpm: number; kit?: "tumb" | "kick"; kick: number[]; snare?: number[]; rim?: number[]; hat?: number[]; open?: number[]; ride?: number[]; snap?: number[]; shaker?: number[]; swing?: number; swing16?: number; trip?: boolean; rimPitch?: number};
// Dois compassos: o segundo é o primeiro com as mudanças de `b` (0 apaga uma nota).
const bars = (a: Record<number, number>, b: Record<number, number> = {}) => { const one = at16(a); return [...one, ...one.map((v, i) => b[i] ?? v)]; };
const twice = (vals: number[]) => Array.from({length: 32}, (_, i) => vals[i % vals.length]);
export const GROOVES: Record<string, Pattern> = {
  // Worship: bumbo redondo no 1 e no 3 com antecipação, caixa grande no 2 e no 4, chimbal em colcheias e o shaker
  // em semicolcheias por baixo; no fim do segundo compasso, um bumbo puxando a volta.
  worship: {bpm: 72, kit: "tumb",
    kick: bars({0: 1, 8: 0.85, 10: 0.5}, {14: 0.45}), snare: bars({4: 0.85, 12: 0.85}),
    hat: twice([0.5, 0, 0.32, 0]), shaker: twice([0.3, 0.12, 0.45, 0.12])},
  // Pop / rock: a levada básica (bumbo 1, 3 e "e" do 3; caixa 2 e 4; chimbal em colcheias com o tempo mais forte) e
  // um chimbal aberto no "e" do 4 do segundo compasso.
  pop: {bpm: 110, kit: "kick",
    kick: bars({0: 1, 8: 0.95, 10: 0.7}, {7: 0.55}), snare: bars({4: 0.95, 12: 0.95}),
    hat: bars({0: 0.7, 2: 0.42, 4: 0.6, 6: 0.42, 8: 0.7, 10: 0.42, 12: 0.6, 14: 0.42}, {14: 0}), open: bars({}, {14: 0.6})},
  // Balada: meio tempo (caixa só no 3), com o aro no lugar da caixa no primeiro compasso, como nos versos.
  ballad: {bpm: 66, kit: "tumb",
    kick: bars({0: 1, 10: 0.5}, {10: 0.5, 14: 0.35}), rim: bars({8: 0.8}, {8: 0}), snare: bars({}, {8: 0.85}),
    hat: twice([0.45, 0, 0.28, 0])},
  // Reggae "one drop" no jeito de Carlton Barrett (Bob Marley & The Wailers), em tercinas: o 1 fica vazio, bumbo e
  // aro agudo caem juntos no 3. O chimbal é o shuffle "quebrado" dele: o tempo fraco e o contratempo forte, às vezes
  // só a semínima, às vezes a tercina inteira, e um chimbal aberto na última colcheia puxando o compasso seguinte;
  // no segundo compasso o aro também responde no contratempo do 4.
  reggae: {bpm: 76, kit: "kick", trip: true, rimPitch: 1.45,
    kick: bars({8: 1}), rim: bars({8: 0.95}, {14: 0.4}),
    hat: bars({0: 0.3, 2: 0.6, 4: 0.4, 8: 0.28, 10: 0.62, 12: 0.32, 13: 0.22, 14: 0.58},
              {4: 0.35, 5: 0.2, 6: 0.55, 14: 0}),
    open: bars({}, {14: 0.6})},
  // Reggae leve, no clima de "Don't Worry Be Happy" (Bobby McFerrin, a cappella): batida de peito grave e abafada no
  // 1 e no 3 com uma puxada antes do 3, estalo de dedo no 2 e no 4 e um "ts" de boca em semicolcheias, tudo com o
  // balanço de semicolcheia em tercina.
  happy: {bpm: 69, kit: "tumb", swing16: 0.64,
    kick: bars({0: 0.9, 7: 0.4, 8: 0.75}, {15: 0.4}), snap: bars({4: 0.85, 12: 0.85}, {14: 0.3}),
    shaker: twice([0.32, 0.18, 0.48, 0.22])},
  // Samba (em 2/4, dois compassos de 2/4 a cada 16 casas): bumbo "tum . . tum TUM" com o acento no 2, como o surdo;
  // o aro faz o teleco-teco do tamborim; o shaker é o ganzá em semicolcheias, acentuando a última de cada tempo.
  samba: {bpm: 100, kit: "kick",
    kick: twice([0.45, 0, 0, 0.55, 1, 0, 0, 0.55]),
    rim: twice([0.7, 0, 0.55, 0.65, 0, 0.6, 0, 0.6, 0, 0.6, 0.55, 0, 0.6, 0, 0.6, 0]),
    shaker: twice([0.5, 0.25, 0.35, 0.8]), hat: twice([0, 0, 0, 0, 0.3, 0, 0, 0])},
  // Bossa nova: bumbo suave "tum . . tum" (semínima pontuada e colcheia) no 1 e no 3, aro na clave da bossa (três
  // no primeiro compasso e dois no segundo), chimbal leve em colcheias e o pé do chimbal no 2 e no 4.
  bossa: {bpm: 130, kit: "tumb",
    kick: twice([0.6, 0, 0, 0, 0, 0, 0.45, 0, 0.6, 0, 0, 0, 0, 0, 0.45, 0]),
    rim: bars({0: 0.6, 6: 0.6, 12: 0.6}, {0: 0, 6: 0, 12: 0, 4: 0.6, 10: 0.6}),
    hat: twice([0.28, 0, 0.2, 0, 0.4, 0, 0.2, 0])},
  // Jazz: o ride "ding, ding-da, ding, ding-da" em tercina, o pé do chimbal no 2 e no 4, o bumbo bem leve em todos os
  // tempos ("feathering") e a caixa comentando de leve.
  jazz: {bpm: 120, kit: "tumb", swing: 0.66,
    kick: twice([0.22, 0, 0, 0]), snare: bars({14: 0.22}, {14: 0, 6: 0.2, 10: 0.28}),
    ride: twice([0.75, 0, 0, 0, 0.9, 0, 0.5, 0]), hat: twice([0, 0, 0, 0, 0.45, 0, 0, 0])},
  // Funk (no estilo de "Funky Drummer"): chimbal em semicolcheias, bumbo forte nas duas primeiras colcheias, caixa
  // no 2 e no 4 cercada de notas fantasma e um chimbal aberto no fim do segundo compasso; semicolcheias levemente tortas.
  funk: {bpm: 100, kit: "kick", swing16: 0.54,
    kick: bars({0: 1, 2: 0.85, 10: 0.8, 13: 0.6}, {13: 0, 11: 0.65}),
    snare: bars({4: 0.95, 7: 0.18, 9: 0.2, 12: 0.95, 15: 0.18}, {15: 0, 14: 0.2}),
    hat: bars({0: 0.6, 1: 0.25, 2: 0.45, 3: 0.25, 4: 0.6, 5: 0.25, 6: 0.45, 7: 0.25, 8: 0.6, 9: 0.25, 10: 0.45, 11: 0.25, 12: 0.6, 13: 0.25, 14: 0.45, 15: 0.25}, {14: 0, 15: 0}),
    open: bars({}, {14: 0.55})},
  // Hip-hop boom bap: bumbo pesado e sincopado, caixa forte no 2 e no 4, chimbal em colcheias e o balanço "torto"
  // das baterias eletrônicas (MPC) nas semicolcheias.
  hiphop: {bpm: 90, kit: "kick", swing16: 0.58,
    kick: bars({0: 1, 7: 0.6, 10: 0.9}, {7: 0, 3: 0.55, 11: 0.6}), snare: bars({4: 1, 12: 1}, {15: 0.3}),
    hat: twice([0.65, 0, 0.4, 0, 0.55, 0, 0.4, 0])},
  // Shuffle (blues): tudo em tercina; chimbal "tá . tá" no swing, bumbo no 1 e no 3 e caixa no 2 e no 4.
  shuffle: {bpm: 96, kit: "kick", swing: 0.67,
    kick: bars({0: 1, 8: 0.85}, {10: 0.5}), snare: bars({4: 0.9, 12: 0.9}, {14: 0.3}),
    hat: twice([0.65, 0, 0.45, 0, 0.55, 0, 0.45, 0])},
};
export const GROOVE_STYLES = Object.keys(GROOVES);
export const grooveStyle = () => { const g = store.setting("groove", "worship"); return g in GROOVES ? g : "worship"; };
export const setGrooveStyle = (g: string) => { if(g in GROOVES) store.setSetting("groove", g); };
// O chimbal aberto que ainda está soando: o próximo toque de chimbal o fecha, como o pé faz na bateria.
let ringing: GainNode | null = null;
function choke(ac: AudioContext, t: number){
  if(!ringing) return;
  const p = ringing.gain; ringing = null;
  if(t < ac.currentTime) return;
  if(p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
  p.setTargetAtTime(0, t, 0.012);
}
// Um baterista nunca toca duas notas iguais: cada nota varia um pouco de força (±7%) e de tempo (até ±4 ms).
const human = (v: number) => v * (0.93 + Math.random() * 0.14);
const nudge = () => (Math.random() - 0.5) * 0.008;
export const groove = createLoop("grooveVol", 4, 0.05, (ac, at, step, out) => {
  const p = GROOVES[grooveStyle()], pos = step % p.kick.length, dt = 60 / metro.state.bpm / 4;
  // Swing: a colcheia do contratempo (casa 2 de cada tempo) cai em `swing` do tempo em vez da metade; com `swing16`,
  // as semicolcheias pares (casas ímpares) também atrasam.
  let t = at;
  if(p.trip){ const k = pos % 4; if(k === 3) return; t += k * dt / 3; }
  if(p.swing && pos % 4 === 2) t += (p.swing - 0.5) * 4 * dt;
  if(p.swing16 && pos % 2 === 1) t += (p.swing16 * 2 - 1) * dt;
  const hit = (vals: number[] | undefined, play: (at: number, v: number) => void, loose = 1) => {
    const v = vals?.[pos]; if(v) play(Math.max(ac.currentTime, t + nudge() * loose), human(v));
  };
  hit(p.kick, (t, v) => (p.kit === "kick" ? kickHit : tumbHit)(ac, t, out, v), 0.5);
  hit(p.snare, (t, v) => snareHit(ac, t, out, v));
  hit(p.rim, (t, v) => rimHit(ac, t, out, v, p.rimPitch));
  hit(p.ride, (t, v) => rideHit(ac, t, out, v));
  hit(p.hat, (t, v) => { choke(ac, t); hatHit(ac, t, out, v); });
  hit(p.open, (t, v) => { choke(ac, t); ringing = hatHit(ac, t, out, v, 0.35); });
  hit(p.snap, (t, v) => snapHit(ac, t, out, v));
  hit(p.shaker, (t, v) => shakerHit(ac, t, out, v));
});
