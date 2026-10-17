// Efeitos para soltar por cima do pad (palmas, caixa, swell, blop...), sintetizados na hora com Web Audio: nada para
// baixar. Os que têm nota seguem o tom do pad. Cada toque cria um som novo, então eles podem se sobrepor.
import { audioOut, audioReady } from "./lib/audio";
import * as store from "./lib/store";
import { pad } from "./pad";
import { metro } from "./metro";
import { quantize } from "./grid";

export const FX = ["clap", "hat", "tambourine", "snare", "tom", "tumb", "impact", "drop", "blop", "perc", "swell", "reverse"] as const;
export type FxKind = typeof FX[number];
// Duração de cada efeito (s), também usada para o botão acender enquanto ele soa.
export const FX_DUR: Record<FxKind, number> = {clap: 0.6, hat: 0.3, reverse: 3, impact: 1.2, drop: 2.8, tom: 0.9, tambourine: 0.4, snare: 0.4, tumb: 0.5, blop: 1.4, perc: 1.2, swell: 2.6};

let bus: GainNode | null = null, verb: GainNode | null = null, echoIn: GainNode | null = null, echoDl: DelayNode | null = null, noiseBuf: AudioBuffer | null = null;
// Volume dos efeitos, salvo (lido na hora: as configurações carregam depois deste módulo).
export const fxVolume = () => store.setting("padFx", 0.7);
export function setFxVolume(v: number){
  const vol = Math.max(0, Math.min(1, v)); store.setSetting("padFx", vol);
  const io = audioOut(); if(io && bus) bus.gain.setTargetAtTime(vol * vol, io.ac.currentTime, 0.05);
}

// Ambiência: quanto de sala vai para todos os efeitos (0 = secos; no meio, como cada um foi pensado; no máximo, o dobro).
export const fxAmbience = () => store.setting("padFxAmb", 0.5);
const ambienceGain = () => fxAmbience() * 2;
export function setFxAmbience(v: number){
  store.setSetting("padFxAmb", Math.max(0, Math.min(1, v)));
  const io = audioOut(); if(io && verb) verb.gain.setTargetAtTime(ambienceGain(), io.ac.currentTime, 0.05);
}

// Eco no tempo: repete os efeitos em colcheia pontuada no BPM do metrônomo (0 = desligado).
export const fxEcho = () => store.setting("padFxEcho", 0);
const echoTime = () => 0.75 * 60 / metro.state.bpm;
export function setFxEcho(v: number){
  store.setSetting("padFxEcho", Math.max(0, Math.min(1, v)));
  const io = audioOut(); if(io && echoIn) echoIn.gain.setTargetAtTime(fxEcho() * 0.8, io.ac.currentTime, 0.05);
}
metro.onChange(s => { const io = audioOut(); if(io && echoDl) echoDl.delayTime.setTargetAtTime(0.75 * 60 / s.bpm, io.ac.currentTime, 0.05); });

// Salão longo, como o do pad: ruído estéreo que decai e escurece.
function hall(ac: BaseAudioContext, secs: number){
  const sr = ac.sampleRate, len = Math.floor(sr * secs), buf = ac.createBuffer(2, len, sr);
  for(let c = 0; c < 2; c++){
    const d = buf.getChannelData(c); let lp = 0;
    for(let i = 0; i < len; i++){ const t = i / len; lp += (0.6 - 0.5 * t) * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - t, 2.5) * 1.4; }
  }
  return buf;
}
// Saída dos efeitos: seco + reverb → volume dos efeitos → volume geral. Devolve onde ligar o som e o envio ao reverb.
function outs(ac: AudioContext, out: AudioNode){
  if(!bus){
    bus = ac.createGain(); bus.gain.value = fxVolume() * fxVolume(); bus.connect(out);
    const c = ac.createConvolver(); c.buffer = hall(ac, 5); c.connect(bus);
    verb = ac.createGain(); verb.gain.value = ambienceGain(); verb.connect(c);
    // Eco: atraso que realimenta a si mesmo (0,38 por volta); as repetições também ganham um pouco de sala.
    const fb = ac.createGain(), toVerb = ac.createGain(); fb.gain.value = 0.38; toVerb.gain.value = 0.3;
    echoIn = ac.createGain(); echoIn.gain.value = fxEcho() * 0.8; echoDl = ac.createDelay(2); echoDl.delayTime.value = echoTime();
    echoIn.connect(echoDl); echoDl.connect(fb); fb.connect(echoDl); echoDl.connect(bus); echoDl.connect(toVerb); toVerb.connect(verb);
  }
  return {dry: bus, wet: verb!};
}
function noise(ac: AudioContext){
  if(!noiseBuf){
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
}
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
// Tônica do pad numa oitava confortável (Dó3 a Si3).
const root = () => 48 + pad.state.pc;

// Liga `node` no seco e no reverb, com as proporções dadas; o seco também alimenta o eco no tempo, a não ser que `echo` seja falso.
function send(ac: AudioContext, node: AudioNode, dry: number, wet: number, echo = true){
  const {dry: d, wet: w} = outs(ac, audioOut()!.out);
  const a = ac.createGain(), b = ac.createGain(); a.gain.value = dry; b.gain.value = wet;
  node.connect(a); a.connect(d); node.connect(b); b.connect(w);
  if(echo) a.connect(echoIn!);
}
// Para os loops do ritmo usarem a mesma saída e sala dos efeitos.
export const fxRoute = send;
// Eco: devolve uma entrada que soa direto e repete a cada `time` s, perdendo `fb` por volta (morre sozinho).
function echo(ac: AudioContext, time: number, fb: number, dry: number, wet: number, life: number){
  const inp = ac.createGain(), mix = ac.createGain(), dl = ac.createDelay(1), g = ac.createGain();
  dl.delayTime.value = time; g.gain.value = fb;
  inp.connect(mix); inp.connect(dl); dl.connect(g); g.connect(dl); dl.connect(mix);
  send(ac, mix, dry, wet);
  setTimeout(() => mix.disconnect(), (life + 1) * 1000);
  return inp;
}
function env(ac: AudioContext){ const g = ac.createGain(); g.gain.value = 0; return g; }
// Saturação leve: gera harmônicos do grave para ele aparecer também em alto-falante pequeno (celular), que não
// reproduz as frequências mais baixas.
let warmCurve: Float32Array | null = null;
function warm(ac: AudioContext){
  if(!warmCurve) warmCurve = Float32Array.from({length: 1024}, (_, i) => { const x = i / 511.5 - 1; return Math.tanh(2.2 * x) / Math.tanh(2.2); });
  const w = ac.createWaveShaper(); w.curve = warmCurve; w.oversample = "2x"; return w;
}

// Acorde curto do tom (tônica, quinta e oitava acima de Dó4), tocado em `at` e entregue a `to`.
function chordHit(ac: BaseAudioContext, at: number, to: (node: AudioNode, dry: number) => void){
  const r = root() + 12, g = ac.createGain(), lp = ac.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.setValueAtTime(5000, at); lp.frequency.exponentialRampToValueAtTime(900, at + 0.5);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.3, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
  [r, r + 7, r + 12].forEach(m => { const o = ac.createOscillator(); o.type = "triangle"; o.frequency.value = hz(m); o.connect(lp); o.start(at); o.stop(at + 1); });
  lp.connect(g); to(g, 1);
}
const tails = new Map<number, Promise<AudioBuffer>>();
function revTail(ac: AudioContext){
  const pc = pad.state.pc;
  let p = tails.get(pc);
  if(!p){
    const sr = ac.sampleRate, off = new OfflineAudioContext(2, Math.floor(sr * FX_DUR.reverse), sr), c = off.createConvolver();
    c.buffer = hall(off, FX_DUR.reverse - 0.2); c.connect(off.destination);
    chordHit(off, 0, node => node.connect(c));
    p = off.startRendering().then(buf => { for(let ch = 0; ch < buf.numberOfChannels; ch++) buf.getChannelData(ch).reverse(); return buf; });
    p.catch(() => tails.delete(pc));
    tails.set(pc, p);
  }
  return p;
}
export const fxNoise = (ac: AudioContext) => noise(ac);
// O som da caixa de worship, ligado em `dest` com intensidade `vel`: corpo grave e gordo (dois tons que caem devagar)
// e esteira longa, para soar como a caixa grande de worship; a sala vem de quem a usa. Com `tight`, a caixa seca:
// corpo mais agudo e esteira curta. O drum pad Caixa, o loop e os grooves usam este mesmo som.
export function snareHit(ac: AudioContext, t: number, dest: AudioNode, vel = 1, tight = false){
  const body = tight ? 0.1 : 0.18, wires = tight ? 0.13 : 0.25;
  [[180, 0.55], [260, 0.3]].forEach(([f, peak]) => {
    const o = ac.createOscillator(), g = env(ac), fr = tight ? f * 1.25 : f;
    o.type = "triangle"; o.frequency.setValueAtTime(fr * 1.1, t); o.frequency.exponentialRampToValueAtTime(fr * 0.85, t + body * 0.7);
    g.gain.setValueAtTime(peak * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + body);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + body + 0.02);
  });
  const n = noise(ac), hp = ac.createBiquadFilter(), pk = ac.createBiquadFilter(), g = env(ac);
  hp.type = "highpass"; hp.frequency.value = tight ? 1500 : 900; pk.type = "peaking"; pk.frequency.value = 3000; pk.gain.value = 4;
  g.gain.setValueAtTime(0.75 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + wires);
  n.connect(hp); hp.connect(pk); pk.connect(g); g.connect(dest); n.start(t); n.stop(t + wires + 0.03);
}
// O som do chimbal, ligado em `dest`: seis ondas quadradas em razões não harmônicas (o metal) e ruído, num passa-alta
// bem agudo; `len` é quanto ele soa (curto = fechado, mais longo = aberto).
export function hatHit(ac: AudioContext, t: number, dest: AudioNode, vel = 1, len = 0.05){
  const hp = ac.createBiquadFilter(), g = env(ac);
  hp.type = "highpass"; hp.frequency.value = 7000;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * vel, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  [1, 1.48, 1.8, 2.55, 2.63, 3.9].forEach(r => { const o = ac.createOscillator(); o.type = "square"; o.frequency.value = 330 * r; o.connect(hp); o.start(t); o.stop(t + len + 0.02); });
  const n = noise(ac), ng = ac.createGain(); ng.gain.value = 0.6; n.connect(ng); ng.connect(hp); n.start(t, Math.random()); n.stop(t + len + 0.02);
  hp.connect(g); g.connect(dest);
}
// O som do aro (a baqueta atravessada batendo no aro da caixa): um "toc" de madeira curto, sem a esteira.
export function rimHit(ac: AudioContext, t: number, dest: AudioNode, vel = 1){
  [[520, "triangle", 0.5], [1650, "square", 0.12]].forEach(([f, type, peak]) => {
    const o = ac.createOscillator(), g = env(ac);
    o.type = type as OscillatorType; o.frequency.value = f as number;
    g.gain.setValueAtTime((peak as number) * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.06);
  });
  const n = noise(ac), bp = ac.createBiquadFilter(), g = env(ac);
  bp.type = "bandpass"; bp.frequency.value = 3000; bp.Q.value = 1.5;
  g.gain.setValueAtTime(0.5 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  n.connect(bp); bp.connect(g); g.connect(dest); n.start(t); n.stop(t + 0.04);
}
// Bumbo com ataque: seno que despenca rápido de 160 a 48 Hz, sem o filtro que abafa o tumb, e um clique de batedor.
export function kickHit(ac: AudioContext, t: number, dest: AudioNode, vel = 1){
  const o = ac.createOscillator(), g = env(ac);
  o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.07);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.1 * vel, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.32);
  const n = noise(ac), nl = ac.createBiquadFilter(), ng = env(ac);
  nl.type = "lowpass"; nl.frequency.value = 2500;
  ng.gain.setValueAtTime(0.45 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
  n.connect(nl); nl.connect(ng); ng.connect(dest); n.start(t); n.stop(t + 0.02);
}
// Sub: seno bem grave (65 a 38 Hz) que dura mais, só o fundo, quase sem ataque.
export function subHit(ac: AudioContext, t: number, dest: AudioNode, vel = 1){
  const o = ac.createOscillator(), g = env(ac), lp = ac.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 120;
  o.frequency.setValueAtTime(65, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.3 * vel, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  o.connect(lp); lp.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.72);
}
// O som do tumb, ligado em `dest`: seno que cai de 95 a 50 Hz num passa-baixa fechado e um clique grave no ataque.
// O drum pad e o grave do ritmo usam este mesmo som.
export function tumbHit(ac: AudioContext, t: number, dest: AudioNode, vel = 1){
  const o = ac.createOscillator(), g = env(ac), lp = ac.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 180;
  o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.09);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.2 * vel, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  o.connect(lp); lp.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.45);
  const n = noise(ac), nl = ac.createBiquadFilter(), ng = env(ac);
  nl.type = "lowpass"; nl.frequency.value = 400;
  ng.gain.setValueAtTime(0.3 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  n.connect(nl); nl.connect(ng); ng.connect(dest); n.start(t); n.stop(t + 0.05);
}

const SYNTH: Record<FxKind, (ac: AudioContext, t: number) => void> = {
  // Palmas: três estalos de ruído quase juntos (várias mãos) e uma cauda curta, num passa-banda na região do clap; seco.
  clap(ac, t){
    const n = noise(ac), bp = ac.createBiquadFilter(), hp = ac.createBiquadFilter(), g = env(ac);
    bp.type = "bandpass"; bp.frequency.value = 1300; bp.Q.value = 1.2; hp.type = "highpass"; hp.frequency.value = 500;
    g.gain.setValueAtTime(0, t);
    [0, 0.011, 0.023].forEach(d => { g.gain.setValueAtTime(0.9, t + d); g.gain.exponentialRampToValueAtTime(0.08, t + d + 0.009); });
    g.gain.setValueAtTime(0.7, t + 0.032); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.032 + 0.22);
    n.connect(bp); bp.connect(hp); hp.connect(g); send(ac, g, 1, 0.08); n.start(t); n.stop(t + 0.3);
  },
  // Chimbal de worship: meio aberto, um "tss" curto com um pouco de sala.
  hat(ac, t){ const g = ac.createGain(); hatHit(ac, t, g, 0.9, 0.22); send(ac, g, 1, 0.15); },
  // Reverse reverb: a cauda de sala de um acorde do tom tocada ao contrário, crescendo até o próprio acorde, que
  // entra no fim. A cauda é renderizada uma vez por tom (OfflineAudioContext) e guardada.
  reverse(ac, t){
    revTail(ac).then(buf => {
      const at = Math.max(t, ac.currentTime + 0.01), src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = buf; g.gain.value = 0.9; src.connect(g); send(ac, g, 1, 0, false); src.start(at);
      const hit = at + buf.duration - 0.02;
      chordHit(ac, hit, (node, dry) => send(ac, node, dry, 0.25));
    }).catch(() => {});
  },

  // Boom seco: seno bem grave que despenca rápido e some em ~1s, com um clique no ataque; sem sala (a ambiência
  // não mexe nele), para soar curto e marcado. O grave longo fica com o sub drop.
  impact(ac, t){
    // Super grave: começa em 55 Hz e afunda até 26; um passa-baixa depois da saturação deixa só o fundo.
    const o = ac.createOscillator(), g = env(ac), sat = warm(ac), sub = ac.createBiquadFilter();
    sub.type = "lowpass"; sub.frequency.value = 110; sub.Q.value = 0.7;
    o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(26, t + 0.35);
    g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + FX_DUR.impact);
    o.connect(sat); sat.connect(sub); sub.connect(g); send(ac, g, 1.3, 0); o.start(t); o.stop(t + FX_DUR.impact + 0.05);
    const n = noise(ac), lp = ac.createBiquadFilter(), ng = env(ac);
    lp.type = "lowpass"; lp.frequency.value = 250;
    ng.gain.setValueAtTime(0.35, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(lp); lp.connect(ng); send(ac, ng, 0.8, 0); n.start(t); n.stop(t + 0.15);
  },
  // Sub que desce bem fundo, devagar, até sumir.
  drop(ac, t){
    const d = FX_DUR.drop, o = ac.createOscillator(), g = env(ac), sat = warm(ac);
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(22, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(sat); sat.connect(g); send(ac, g, 1, 0.05); o.start(t); o.stop(t + d + 0.05);
  },
  // Tom de chão (o tom grave das viradas de worship): pele que cai de afinação, um parcial acima dando o corpo
  // e o toque da baqueta no ataque; quase seco. Afinado na tônica do pad (entre Dó2 e Si2, 65 a 123 Hz).
  tom(ac, t){
    const d = FX_DUR.tom, f0 = hz(root() - 12);
    [[f0, 1, 0.9], [f0 * 1.6, 0.35, 0.45]].forEach(([f, peak, len]) => {
      const o = ac.createOscillator(), g = env(ac);
      o.frequency.setValueAtTime(f * 1.25, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); o.frequency.exponentialRampToValueAtTime(f * 0.85, t + len);
      g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(len, d));
      o.connect(g); send(ac, g, 1, 0.12); o.start(t); o.stop(t + d + 0.05);
    });
    const n = noise(ac), bp = ac.createBiquadFilter(), ng = env(ac);
    bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 1;
    ng.gain.setValueAtTime(0.35, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(bp); bp.connect(ng); send(ac, ng, 1, 0.05); n.start(t); n.stop(t + 0.05);
  },
  // Pandeirola: as platinelas batendo umas nas outras, em três chacoalhadas rápidas de ruído bem agudo com
  // ressonâncias metálicas, cada uma um pouco mais fraca; quase seca.
  tambourine(ac, t){
    const n = noise(ac), hp = ac.createBiquadFilter(), g = env(ac);
    hp.type = "highpass"; hp.frequency.value = 5000;
    const rings = [6800, 8900, 11200].map(f => { const b = ac.createBiquadFilter(); b.type = "peaking"; b.frequency.value = f; b.Q.value = 8; b.gain.value = 9; return b; });
    g.gain.setValueAtTime(0, t);
    [[0, 0.7], [0.028, 0.45], [0.06, 0.3]].forEach(([d, peak]) => {
      g.gain.setValueAtTime(peak, t + d); g.gain.exponentialRampToValueAtTime(peak * 0.15, t + d + 0.025);
    });
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    n.connect(hp); rings.reduce<AudioNode>((a, b) => (a.connect(b), b), hp).connect(g);
    send(ac, g, 1, 0.1); n.start(t); n.stop(t + 0.35);
  },
  // Caixa: o corpo (dois tons que caem rápido) e a esteira (ruído agudo que some em ~0,2s); seca.
  snare(ac, t){ const g = ac.createGain(); snareHit(ac, t, g); send(ac, g, 1, 0.25); },
  // Tum: grave abafado e curto, como um bumbo com feltro; mais "corpo" que o impacto e sem sala.
  tumb(ac, t){ const g = ac.createGain(); tumbHit(ac, t, g); send(ac, g, 1, 0); },
  // Blop: uma gota redonda na tônica (Dó4 a Si4) que cai de afinação num instante, com eco de colcheia pontuada.
  blop(ac, t){
    const f = hz(root() + 12), o = ac.createOscillator(), g = env(ac), lp = ac.createBiquadFilter();
    o.type = "sine"; o.frequency.setValueAtTime(f * 2.2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    lp.type = "lowpass"; lp.frequency.setValueAtTime(4000, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(lp); lp.connect(g); g.connect(echo(ac, 0.27, 0.38, 0.9, 0.35, FX_DUR.blop)); o.start(t); o.stop(t + 0.3);
  },
  // Perc FX: estalo com um "zap" de filtro que desce e um toque metálico curto, repetido em ecos rápidos.
  perc(ac, t){
    const out = echo(ac, 0.16, 0.45, 0.9, 0.25, FX_DUR.perc);
    const n = noise(ac), bp = ac.createBiquadFilter(), g = env(ac);
    bp.type = "bandpass"; bp.Q.value = 9; bp.frequency.setValueAtTime(3500, t); bp.frequency.exponentialRampToValueAtTime(260, t + 0.12);
    g.gain.setValueAtTime(1.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    n.connect(bp); bp.connect(g); g.connect(out); n.start(t); n.stop(t + 0.15);
    const car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain(), og = env(ac);
    car.frequency.value = 820; mod.frequency.value = 1230; mg.gain.value = 900; mod.connect(mg); mg.connect(car.frequency);
    og.gain.setValueAtTime(0.18, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    car.connect(og); og.connect(out); [car, mod].forEach(o => { o.start(t); o.stop(t + 0.1); });
  },
  // Swell: o acorde do tom (tônica, quinta, oitava) crescendo com o filtro abrindo e um chiado junto, que corta seco
  // no fim, como um som tocado ao contrário; serve para entrar no tempo forte.
  swell(ac, t){
    const d = FX_DUR.swell, r = root(), lp = ac.createBiquadFilter(), g = env(ac);
    lp.type = "lowpass"; lp.Q.value = 2; lp.frequency.setValueAtTime(250, t); lp.frequency.exponentialRampToValueAtTime(5000, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + d - 0.02); g.gain.linearRampToValueAtTime(0, t + d);
    [r, r + 7, r + 12, r + 19].forEach(m => [-8, 8].forEach(c => {
      const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = hz(m); o.detune.value = c; o.connect(lp); o.start(t); o.stop(t + d + 0.05);
    }));
    lp.connect(g); send(ac, g, 0.9, 0.3);
    const n = noise(ac), hp = ac.createBiquadFilter(), ng = env(ac);
    hp.type = "highpass"; hp.frequency.value = 3000;
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.18, t + d - 0.02); ng.gain.linearRampToValueAtTime(0, t + d);
    n.connect(hp); hp.connect(ng); send(ac, ng, 0.9, 0.2); n.start(t); n.stop(t + d + 0.05);
  },
};

export async function fire(kind: FxKind){
  const io = audioOut(); if(!io) return false;
  await audioReady();
  // Com loops ou metrônomo tocando, entra na próxima semicolcheia; sem nada, na hora.
  SYNTH[kind](io.ac, quantize(io.ac.currentTime + 0.01));
  return true;
}
