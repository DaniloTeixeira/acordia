// Síntese simples com Web Audio para tocar notas, escalas e acordes no modo Estudo.
let ctx: AudioContext | null = null, master: GainNode | null = null, volume = 0.8, muted = false;
// Saída comum de todos os sons do app, com o volume geral.
function out(ac: AudioContext){ if(!master){ master = ac.createGain(); master.connect(ac.destination); } master.gain.value = muted ? 0 : volume; return master; }
export function setVolume(v: number, m?: boolean){ volume = Math.max(0, Math.min(1, v)); muted = !!m; if(master) master.gain.value = muted ? 0 : volume; }
function audio(){
  if(!ctx){
    const C = window.AudioContext || (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if(!C) return null; ctx = new C();
  }
  if(ctx.state === "suspended") ctx.resume();
  return ctx;
}
const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// ---------- timbres: só nós nativos do Web Audio, sem samples para baixar ----------
// Enquanto uma nota é montada, guarda as fontes e a saída dela, para poder soltá-la antes do fim (tecla segurada).
type Held = {src: AudioScheduledSourceNode[]; gates: GainNode[]};
let held: Held | null = null;
const track = <T extends AudioScheduledSourceNode>(s: T) => { if(held) held.src.push(s); return s; };
// Saída da nota para `dest`, passando por um registro que a tecla solta.
const note = (ac: AudioContext, dest: AudioNode) => { const g = amp(ac, 1); g.connect(dest); if(held) held.gates.push(g); return g; };
const osc = (ac: AudioContext, type: OscillatorType | PeriodicWave, f: number, at: number, end: number) => {
  const o = track(ac.createOscillator());
  if(typeof type === "string") o.type = type as OscillatorType; else o.setPeriodicWave(type);
  o.frequency.value = f; o.start(at); o.stop(end); return o;
};
const amp = (ac: AudioContext, v: number) => { const g = ac.createGain(); g.gain.value = v; return g; };
const filter = (ac: AudioContext, type: BiquadFilterType, f: number, q = 0.7) => { const l = ac.createBiquadFilter(); l.type = type; l.frequency.value = f; l.Q.value = q; return l; };
const lowpass = (ac: AudioContext, f: number, q = 0.7) => filter(ac, "lowpass", f, q);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
// Formas de onda por harmônicos, criadas uma vez só.
const waves: Record<string, PeriodicWave> = {};
function wave(ac: AudioContext, name: string, amps: number[]){
  return waves[name] || (waves[name] = ac.createPeriodicWave(new Float32Array(amps.length + 1), new Float32Array([0, ...amps])));
}
// Ruído branco (martelo, baqueta, clique das teclas), criado uma vez só.
let noiseBuf: AudioBuffer | null = null;
function noise(ac: AudioContext, at: number, len: number){
  if(!noiseBuf){
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = track(ac.createBufferSource()); s.buffer = noiseBuf;
  s.start(at, rand(0, 0.8)); s.stop(at + len); return s;
}
// Rajada curta de ruído filtrado, somada ao ataque da nota.
function burst(ac: AudioContext, at: number, dest: AudioNode, type: BiquadFilterType, f: number, q: number, peak: number, tau: number){
  const fl = filter(ac, type, f, q), g = amp(ac, 0);
  g.gain.setValueAtTime(peak, at); g.gain.setTargetAtTime(0, at, tau);
  noise(ac, at, tau * 8 + 0.01).connect(fl); fl.connect(g); g.connect(dest);
}

// ---------- ambiente: sala (reverb), compressor e os efeitos que são do instrumento inteiro ----------

let fxBus: Fx | null = null;
// Resposta de uma sala pequena: ruído que decai e escurece com o tempo, um pouco diferente em cada lado.
function room(ac: AudioContext){
  const sr = ac.sampleRate, len = Math.floor(sr * 2.2), pre = Math.floor(sr * 0.012), buf = ac.createBuffer(2, len, sr);
  for(let c = 0; c < 2; c++){
    const d = buf.getChannelData(c); let y = 0;
    for(let i = pre; i < len; i++){
      const t = (i - pre) / sr, k = 0.08 + 0.8 * Math.exp(-t * 2.5);
      y += k * ((Math.random() * 2 - 1) - y);
      d[i] = y * Math.exp(-t / 0.3);
    }
  }
  return buf;
}
// Sala de concerto para o piano: as primeiras reflexões das paredes (a ambiência, que dá a sensação de espaço)
// e depois uma cauda longa e escura, diferente em cada lado.
function hall(ac: AudioContext){
  const sr = ac.sampleRate, len = Math.floor(sr * 3.2), buf = ac.createBuffer(2, len, sr);
  const taps = [0.011, 0.017, 0.023, 0.031, 0.037, 0.046, 0.053, 0.064, 0.072, 0.085];
  for(let c = 0; c < 2; c++){
    const d = buf.getChannelData(c), pre = Math.floor(sr * 0.028); let y = 0;
    taps.forEach((t, i) => { d[Math.floor(sr * (t + c * 0.0013 * (i % 3)))] += (Math.random() < 0.5 ? -1 : 1) * 0.9 * Math.exp(-i * 0.22); });
    for(let i = pre; i < len; i++){
      const t = (i - pre) / sr, k = 0.05 + 0.6 * Math.exp(-t * 2), swell = Math.min(1, t / 0.06);
      y += k * ((Math.random() * 2 - 1) - y);
      d[i] += y * swell * 0.55 * Math.exp(-t / 0.45);
    }
  }
  return buf;
}
type Fx = {dry: GainNode; rev: GainNode; hall: GainNode};
function fx(ac: AudioContext): Fx {
  if(!fxBus){
    // O compressor dá peso e junta as notas; o ganho depois dele traz o som para um volume normal de app de
    // música, e o limitador no fim impede que acordes cheios distorçam.
    const comp = ac.createDynamicsCompressor(), makeup = amp(ac, 3), limit = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.1;
    comp.connect(makeup); makeup.connect(limit); limit.connect(out(ac));
    const dry = amp(ac, 1), rev = amp(ac, 1), hallIn = amp(ac, 1), conv = ac.createConvolver(), conv2 = ac.createConvolver();
    conv.buffer = room(ac); conv2.buffer = hall(ac);
    dry.connect(comp); rev.connect(conv); conv.connect(comp); hallIn.connect(conv2); conv2.connect(comp);
    fxBus = {dry, rev, hall: hallIn};
  }
  out(ac); return fxBus;
}
// Entrada que vai seca para a saída e, na dose `wet`, para a sala (e, com `hallWet`, para a sala de concerto).
function send(ac: AudioContext, wet: number, hallWet = 0){
  const f = fx(ac), n = amp(ac, 1), w = amp(ac, wet);
  n.connect(f.dry); n.connect(w); w.connect(f.rev);
  if(hallWet){ const h = amp(ac, hallWet); n.connect(h); h.connect(f.hall); }
  return n;
}
const lfo = (ac: AudioContext, rate: number, depth: number, target: AudioParam) => {
  const o = ac.createOscillator(), d = amp(ac, depth); o.frequency.value = rate; o.connect(d); d.connect(target); o.start(); return o;
};
const panner = (ac: AudioContext) => ac.createStereoPanner ? ac.createStereoPanner() : null;
// Tremolo, Leslie e o pan da mala do Rhodes são um motor só para todas as notas, como no instrumento.
const buses: Record<string, AudioNode> = {};
function bus(ac: AudioContext, name: string, make: (ac: AudioContext) => AudioNode){ return buses[name] || (buses[name] = make(ac)); }
// Rotor do Leslie: Doppler (atraso que oscila), volume e lado mudando com a rotação.
function rotor(ac: AudioContext, input: AudioNode, dest: AudioNode, rate: number, doppler: number, depth: number, pan: number){
  const d = ac.createDelay(0.02), g = amp(ac, 1 - depth), p = panner(ac);
  d.delayTime.value = 0.005;
  lfo(ac, rate, doppler, d.delayTime); lfo(ac, rate, depth, g.gain);
  input.connect(d); d.connect(g);
  if(p){ lfo(ac, rate, pan, p.pan); g.connect(p); p.connect(dest); } else g.connect(dest);
}
// Corneta (agudos) e tambor (graves), separados em 800 Hz, girando devagar para o vibrato ficar discreto.
const leslie = (ac: AudioContext) => {
  const input = amp(ac, 1), dest = send(ac, 0.2), lo = lowpass(ac, 800), hi = filter(ac, "highpass", 800);
  input.connect(lo); input.connect(hi);
  rotor(ac, hi, dest, 5.2, 0.00012, 0.1, 0.3);
  rotor(ac, lo, dest, 4.6, 0.00008, 0.05, 0.2);
  return input;
};
// Tremolo da mala Suitcase: o som passeia de leve de um lado para o outro.
const suitcase = (ac: AudioContext) => {
  const input = amp(ac, 1), g = amp(ac, 0.98), p = panner(ac), dest = send(ac, 0.16);
  lfo(ac, 4.2, 0.02, g.gain); input.connect(g);
  if(p){ lfo(ac, 4.2, 0.22, p.pan); g.connect(p); p.connect(dest); } else g.connect(dest);
  return input;
};
// Motor do vibrafone: as tampas dos ressonadores abrem e fecham.
const vibesMotor = (ac: AudioContext) => {
  const input = amp(ac, 0.8), dest = send(ac, 0.3);
  lfo(ac, 5.5, 0.2, input.gain); input.connect(dest);
  return input;
};
// Distorção leve e assimétrica do captador do Rhodes: mais "rosnado" quanto mais forte a nota.
let pickupCurve: Float32Array | null = null;
function pickup(){
  if(!pickupCurve){
    pickupCurve = new Float32Array(1024);
    const norm = Math.tanh(1.4 * 1.25);
    for(let i = 0; i < 1024; i++){ const x = i / 511.5 - 1; pickupCurve[i] = Math.tanh(1.4 * (x + 0.25 * x * x)) / norm; }
  }
  return pickupCurve;
}

// Envelope sustentado (órgão, sintetizador).
function hold(g: GainNode, at: number, dur: number, peak: number, attack: number){
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setTargetAtTime(0, Math.max(at + attack, at + dur - 0.06), 0.03);
}
// Abafador: segura a nota em `peak` e solta no fim, com a cauda `tau`.
function damper(g: GainNode, at: number, dur: number, peak: number, tau: number){
  g.gain.setValueAtTime(peak, at);
  g.gain.setTargetAtTime(0, Math.max(at + 0.02, at + dur - 0.04), tau);
}
// Decaimento em dois estágios das cordas e lâminas: cai rápido até `knee` e depois some devagar.
function decay(g: GainNode, at: number, peak: number, slow: number, knee: number, attack = 0.002){
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setTargetAtTime(peak * knee, at + attack, slow * 0.12);
  g.gain.setTargetAtTime(0, at + attack + slow * 0.3, slow);
}
// Notas graves soam por mais tempo.
const ring = (f: number, base: number, min: number, max: number) => Math.max(min, Math.min(max, base * Math.sqrt(261.6 / f)));

type Voice = (ac: AudioContext, f: number, at: number, dur: number, gain: number, end: number) => void;
const VOICES: Record<string, Voice> = {
  // Piano acústico de cauda. Cada parcial é uma senoide com o seu decaimento: os agudos morrem antes, então o
  // ataque é brilhante e a cauda escurece. O espectro é cheio (os harmônicos caem devagar, como numa corda de
  // verdade) e só perde brilho acima de uns 4,5 kHz; o martelo nas 1/7,5 da corda apaga a 7ª/8ª. As parciais
  // ficam um pouco acima dos harmônicos (inarmonicidade), e as primeiras têm três cordas (duas nos graves) que
  // batem entre si. O tampo reforça os graves, o ataque leva o ruído do martelo e o baque da madeira, e a nota
  // fica no lugar dela no palco: graves à esquerda, agudos à direita.
  piano(ac, f, at, dur, gain, end){
    const g = amp(ac, 0), shelf = filter(ac, "lowshelf", 220), weight = filter(ac, "peaking", 130, 0.9), soft = filter(ac, "highshelf", 5000);
    shelf.gain.value = 4; weight.gain.value = 3; soft.gain.value = -3;
    const dest = note(ac, send(ac, 0.06, 0.32)), p = panner(ac);
    g.connect(shelf); shelf.connect(weight); weight.connect(soft);
    if(p){ p.pan.value = Math.max(-0.5, Math.min(0.5, Math.log2(f / 261.6) * 0.15)); soft.connect(p); p.connect(dest); } else soft.connect(dest);
    const B = Math.max(0.00008, Math.min(0.004, 0.0003 * Math.pow(f / 261.6, 1.6)));
    const T = ring(f, 3, 0.8, 6), n = Math.max(3, Math.min(20, Math.floor(7000 / f)));
    const amps: number[] = [];
    for(let k = 1; k <= n; k++) amps.push((0.35 + 0.65 * Math.abs(Math.sin(Math.PI * k / 7.5))) / Math.pow(k, 1.1) * Math.exp(-k * f / 4500));
    // Nos graves o fundamental é um pouco mais fraco que o 2º harmônico.
    if(f < 110) amps[0] *= 0.75 + 0.25 * f / 110;
    // Normaliza pela energia (e não pela soma), para o espectro cheio não deixar a nota mais baixa.
    const norm = Math.sqrt(amps.reduce((a, b) => a + b * b, 0));
    amps.forEach((a, i) => {
      const k = i + 1, fk = k * f * Math.sqrt(1 + B * k * k);
      if(fk > 12000) return;
      const pg = amp(ac, 0), strings = k <= 4 ? (f < 90 ? 2 : 3) : k <= 8 ? 2 : 1, d = rand(0.5, 1.5);
      for(let s = 0; s < strings; s++){
        const o = osc(ac, "sine", fk, at, end);
        o.detune.value = strings === 3 ? (s - 1) * d : strings === 2 ? (s ? 1 : -1) * d * 0.7 : 0;
        o.connect(pg);
      }
      pg.connect(g);
      decay(pg, at, a / norm / strings, T / (1 + 0.3 * i), 0.45);
    });
    burst(ac, at, g, "bandpass", Math.min(6000, 1200 + f * 3), 0.9, 0.25, 0.008);
    burst(ac, at, g, "lowpass", 180, 0.7, 0.9, 0.03);
    damper(g, at, dur, gain * 0.7, 0.07);
  },
  // Rhodes no esquema do E.Piano do DX7: um par FM 1:1 faz o corpo (com o "rosnado" do ataque, mais forte
  // nos graves) e um par com modulador 14× faz o "ding" da lâmina; passa pelo captador e pela mala estéreo.
  rhodes(ac, f, at, dur, gain, end){
    const k = Math.max(0.5, Math.min(1.6, Math.sqrt(261.6 / f)));
    const g = amp(ac, 0), sh = ac.createWaveShaper(), hp = filter(ac, "highpass", 35), post = amp(ac, 0);
    sh.curve = pickup();
    // corpo
    const body = osc(ac, "sine", f, at, end), bodyLvl = amp(ac, 0.62), bark = amp(ac, 0);
    bark.gain.setValueAtTime(f * 1.6 * k, at); bark.gain.setTargetAtTime(f * 0.22 * k, at, 0.3);
    osc(ac, "sine", f, at, end).connect(bark); bark.connect(body.frequency);
    body.connect(bodyLvl); bodyLvl.connect(g);
    // lâmina, levemente desafinada do corpo para dar vida
    const tine = osc(ac, "sine", f, at, end), tineLvl = amp(ac, 0.36), ding = amp(ac, 0);
    tine.detune.value = 1.5;
    ding.gain.setValueAtTime(f * 14 * 0.22, at); ding.gain.setTargetAtTime(0, at, 0.03);
    osc(ac, "sine", f * 14, at, end).connect(ding); ding.connect(tine.frequency);
    tine.connect(tineLvl); tineLvl.connect(g);
    g.connect(sh); sh.connect(hp); hp.connect(post); post.connect(note(ac, bus(ac, "suitcase", suitcase)));
    const long = ring(f, 1.8, 0.7, 3.5), v = rand(0.92, 1.05);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(v, at + 0.003);
    g.gain.setTargetAtTime(v * 0.55, at + 0.003, 0.09);
    g.gain.setTargetAtTime(0, at + 0.3, long);
    damper(post, at, dur, gain * 0.62, 0.05);
  },
  // Drawbars 16' 8' 4' 2⅔' 2' 1⅓' 1', o clique da tecla, a percussão no 3º harmônico e o Leslie.
  organ(ac, f, at, dur, gain, end){
    const w = wave(ac, "organ", [1, .8, .55, .45, 0, .25, 0, .2]);
    const dest = note(ac, bus(ac, "leslie", leslie)), g = amp(ac, 0), sub = amp(ac, 0.45), perc = amp(ac, 0);
    osc(ac, w, f, at, end).connect(g);
    osc(ac, "sine", f / 2, at, end).connect(sub); sub.connect(g);
    perc.gain.setValueAtTime(0.35, at); perc.gain.setTargetAtTime(0, at, 0.15);
    osc(ac, "sine", f * 3, at, end).connect(perc); perc.connect(g);
    g.connect(dest);
    hold(g, at, dur, gain * 0.48, 0.006);
    burst(ac, at, dest, "bandpass", 2800, 0.6, gain * 0.25, 0.004);
  },
  // Duas serras desafinadas e uma oitava abaixo num filtro que abre no ataque.
  synth(ac, f, at, dur, gain, end){
    const g = amp(ac, 0), lp = lowpass(ac, 0, 3), sub = amp(ac, 0.3);
    lp.frequency.setValueAtTime(Math.min(10000, f * 9), at);
    lp.frequency.setTargetAtTime(Math.min(6000, f * 2.5), at, 0.25);
    [-8, 8].forEach(c => { const o = osc(ac, "sawtooth", f, at, end); o.detune.value = c; o.connect(lp); });
    osc(ac, "square", f / 2, at, end).connect(sub); sub.connect(lp);
    lp.connect(g); g.connect(note(ac, send(ac, 0.2)));
    hold(g, at, dur, gain * 0.3, 0.02);
  },
  // Lâmina de metal (parciais 1, 4 e 10, cada uma com o seu decaimento), a batida da baqueta e o motor.
  vibes(ac, f, at, dur, gain, end){
    const g = amp(ac, 0), T = ring(f, 2.2, 0.8, 4);
    [[1, 1, T], [4, 0.28, 0.25], [10, 0.1, 0.04]].forEach(([m, a, tau]) => {
      if(f * m > 14000) return;
      const pg = amp(ac, 0); osc(ac, "sine", f * m, at, end).connect(pg); pg.connect(g);
      decay(pg, at, a, tau, 0.6, 0.0015);
    });
    burst(ac, at, g, "lowpass", 3000, 0.7, 0.25, 0.004);
    g.connect(note(ac, bus(ac, "vibes", vibesMotor)));
    damper(g, at, dur, gain * 0.6 * rand(0.92, 1.05), 0.08);
  },
  // Naipe de cordas: quatro serras desafinadas, cada uma com um vibrato leve, em dois filtros seguidos que
  // tiram a aspereza e abrem devagar; o ataque é lento e a cauda se desfaz depois da nota.
  pad(ac, f, at, dur, gain){
    const end = at + dur + 1.4, g = amp(ac, 0), lp = lowpass(ac, 0, 0.5), lp2 = lowpass(ac, 0, 0.5), hp = filter(ac, "highpass", 120);
    [lp, lp2].forEach(l => {
      l.frequency.setValueAtTime(Math.min(550, f * 1.2), at);
      l.frequency.linearRampToValueAtTime(Math.min(950, f * 1.7), at + Math.max(0.4, dur));
    });
    [-10, -4, 4, 10].forEach(c => {
      const o = osc(ac, "sawtooth", f, at, end), vib = track(ac.createOscillator()), depth = amp(ac, 0);
      o.detune.value = c + rand(-1.5, 1.5);
      vib.frequency.value = rand(4.5, 5.5); vib.start(at); vib.stop(end);
      depth.gain.setValueAtTime(0, at); depth.gain.linearRampToValueAtTime(rand(2, 4), at + 0.7);
      vib.connect(depth); depth.connect(o.detune);
      o.connect(lp);
    });
    lp.connect(lp2); lp2.connect(hp); hp.connect(g); g.connect(note(ac, send(ac, 0.3)));
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain * 0.28, at + Math.min(0.5, dur * 0.6));
    g.gain.setTargetAtTime(0, at + dur, 0.3);
  }
};
export const TIMBRES = Object.keys(VOICES);
let timbre = "piano";
// Ids antigos salvos nas preferências: "keys" (Teclado, removido) e "epiano" (virou Rhodes).
const RENAMED: Record<string, string> = {keys: "piano", epiano: "rhodes"};
export function setTimbre(name: string){ name = RENAMED[name] || name; timbre = VOICES[name] ? name : "piano"; }
export const getTimbre = () => timbre;

function voice(ac: AudioContext, midi: number, at: number, dur: number, gain: number){
  VOICES[timbre](ac, freq(midi), at, dur, gain, at + dur + 0.3);
}
// Tecla segurada: a nota soa até a função devolvida ser chamada (ou até HOLD segundos) e então solta com a
// cauda de cada timbre. O piano e o Rhodes continuam decaindo sozinhos enquanto a tecla está apertada.
const HOLD = 30, RELEASE: Record<string, number> = {piano: 0.07, rhodes: 0.05, organ: 0.03, synth: 0.04, vibes: 0.08, pad: 0.3};
export function noteOn(midi: number, gain = 0.22): (() => void) | null {
  const ac = audio(); if(!ac) return null;
  const at = ac.currentTime + 0.005, tau = RELEASE[timbre] ?? 0.05, h: Held = held = {src: [], gates: []};
  try{ voice(ac, midi, at, HOLD, gain); } finally { held = null; }
  let done = false;
  return () => {
    if(done) return; done = true;
    // Um toque rápido ainda deixa a nota ser ouvida.
    const t = Math.max(ac.currentTime, at + 0.08);
    h.gates.forEach(g => g.gain.setTargetAtTime(0, t, tau));
    h.src.forEach(s => s.stop(t + tau * 8));
  };
}
// pcs: alturas relativas a C (podem passar de 12); base: oitava do C central.
export function playChord(pcs: number[], {base = 60, strum = 0.025, dur = 1.6} = {}){
  const ac = audio(); if(!ac) return false;
  const t = ac.currentTime + 0.02, g = 0.22 / Math.sqrt(pcs.length);
  pcs.forEach((p, i)=>voice(ac, base + p, t + i*strum, dur, g));
  return true;
}
// ---------- ritmo: metrônomo e batidas das mãos, agendados no relógio do áudio ----------
// Garante o áudio rodando (alguns navegadores só liberam depois de um toque).
export async function audioReady(){
  const ac = audio(); if(!ac) return false;
  if(ac.state !== "running"){ try{ await Promise.race([ac.resume(), new Promise(r => setTimeout(r, 800))]); }catch(e){ /* sem áudio */ } }
  return ac.state === "running";
}
export function audioNow(): number | null { const ac = audio(); return ac ? ac.currentTime : null; }
export type ClickKind = "accent" | "beat" | "mid" | "sub" | "lh" | "rh";
const CLICKS: Record<ClickKind, {f: number; type: OscillatorType; dur: number; gain: number}> = {
  accent: {f:1760, type:"square", dur:0.045, gain:0.16},
  beat:   {f:1180, type:"square", dur:0.035, gain:0.10},
  mid:    {f:1440, type:"square", dur:0.04,  gain:0.13},
  sub:    {f:880,  type:"square", dur:0.025, gain:0.045},
  lh:     {f:165,  type:"triangle", dur:0.16, gain:0.45},
  rh:     {f:660,  type:"triangle", dur:0.10, gain:0.30}
};
// Agenda um som curto no tempo `at` (segundos do AudioContext). Sem `at`, toca agora.
export function click(kind: ClickKind, at?: number){
  const ac = audio(); if(!ac) return false;
  const c = CLICKS[kind], t0 = Math.max(at ?? ac.currentTime, ac.currentTime);
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = c.type; o.frequency.setValueAtTime(c.f, t0);
  if(kind === "lh" || kind === "rh") o.frequency.exponentialRampToValueAtTime(c.f * 0.6, t0 + c.dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(c.gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + c.dur);
  o.connect(g); g.connect(out(ac));
  o.start(t0); o.stop(t0 + c.dur + 0.02);
  return true;
}
// Toca notas (MIDI) num instante agendado do relógio do áudio; usado nas demonstrações do teclado.
export function playNotesAt(midis: number[], at: number, dur = 0.8){
  const ac = audio(); if(!ac) return false;
  const g = 0.22 / Math.sqrt(midis.length || 1);
  midis.forEach(m => voice(ac, m, Math.max(at, ac.currentTime), dur, g));
  return true;
}
// Acordes em sequência (ex.: a cadência que firma o tom) a partir de `at`; devolve o instante em que acabam.
export function playProgression(chords: number[][], at?: number | null, step = 0.6): number | null {
  const ac = audio(); if(!ac) return null;
  let t0 = Math.max(at ?? ac.currentTime + 0.05, ac.currentTime);
  chords.forEach(c => { playNotesAt(c, t0, step - 0.05); t0 += step; });
  return t0;
}
export function playSequence(pcs: number[], {base = 60, step = 0.32} = {}){
  const ac = audio(); if(!ac) return false;
  const t = ac.currentTime + 0.02;
  pcs.forEach((p, i)=>voice(ac, base + p, t + i*step, 0.6, 0.2));
  return true;
}
