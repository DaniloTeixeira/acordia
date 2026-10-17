// Pad infinito: um trecho gravado de cada tom (public/pads), emendado sem fim. Cada volta entra antes da anterior
// acabar e as duas se cruzam devagar, então não há costura audível nem dependência de o MP3 fechar o loop certinho.
// Um só pad para o app: continua tocando ao trocar de página, com o tom, o volume e o estilo salvos.
// O estilo muda o som em tempo real: filtro (escuro/brilhante), camadas uma oitava acima e abaixo (a mesma gravação
// tocada no dobro e na metade da velocidade), reverb e um movimento lento do filtro.
import { audioOut, audioReady } from "./lib/audio";
import * as store from "./lib/store";
import { metro } from "./metro";
import { SIGNATURES } from "./lib/metronome";
import { quantize } from "./grid";

// Nomes dos arquivos, por classe de altura (0 = Dó).
const FILES = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const SKIP = 0.15;   // pula o começo do arquivo (atraso do codificador MP3)
const CROSS = 6;     // cruzamento entre uma volta e a seguinte, em segundos
const SWITCH = 2.5;  // troca de tom: o novo entra enquanto o antigo sai
const START = 1.5;   // entrada ao começar a tocar
const STOP = 1.5;    // saída ao parar
const FADE_IN = 10, FADE_OUT = 12; // entrada e saída lentas (começo e fim do culto)

export const PAD_STYLES = ["original", "subtle", "warm", "bright", "ethereal", "deep"] as const;
export type PadStyle = typeof PAD_STYLES[number];
// up/down: volume das camadas uma oitava acima e abaixo; cutoff e lfo: filtro e quanto ele oscila (Hz);
// shelf: realce dos agudos (dB); rev: quanto vai para o reverb; level: volume do estilo (o discreto fica bem baixo).
const STYLES: Record<PadStyle, {up: number; down: number; cutoff: number; lfo: number; shelf: number; rev: number; level?: number}> = {
  original: {up: 0,   down: 0,   cutoff: 18000, lfo: 0,    shelf: 0,  rev: 0},
  // Quase imperceptível: bem fechado (só o corpo grave), sem agudos e baixo, para ficar por baixo de tudo.
  subtle:   {up: 0,   down: .15, cutoff: 650,   lfo: 0,    shelf: -12, rev: .15, level: .35},
  warm:     {up: 0,   down: .3,  cutoff: 2200,  lfo: 0,    shelf: -2, rev: .2},
  bright:   {up: .35, down: 0,   cutoff: 18000, lfo: 0,    shelf: 5,  rev: .25},
  ethereal: {up: .6,  down: 0,   cutoff: 7000,  lfo: 3000, shelf: 2,  rev: .7},
  deep:     {up: 0,   down: .6,  cutoff: 1400,  lfo: 500,  shelf: -4, rev: .4},
};
const isStyle = (v: unknown): v is PadStyle => PAD_STYLES.includes(v as PadStyle);
// Camadas: velocidade de leitura (1 = original, 2 = oitava acima, 0,5 = oitava abaixo).
const RATES = [1, 2, 0.5];

// filter: o filtro de build, de 0 (abafado) a 1 (aberto); swelling: compassos do swell automático em andamento (0 = nenhum); fading: entrando ou saindo devagar.
export interface PadState { pc: number; volume: number; style: PadStyle; filter: number; swelling: number; fading: boolean; playing: boolean; loading: boolean }
type Voice = {gain: GainNode; layers: GainNode[]; srcs: AudioBufferSourceNode[]; timers: number[]};
type Fx = {input: GainNode; build: BiquadFilterNode; filter: BiquadFilterNode; shelf: BiquadFilterNode; lfo: GainNode; dry: GainNode; send: GainNode};

const saved = () => (store.data.settings.pad || {}) as Partial<PadState>;
const state: PadState = {pc: 0, volume: 0.8, style: "original", filter: 1, swelling: 0, fading: false, playing: false, loading: false};
let swellTimer = 0, fadeTimer = 0;
// Corte do filtro de build: de 250 Hz (abafado, como um rádio distante) a 20 kHz (aberto), numa escala que soa por igual.
const cut = (v: number) => 250 * Math.pow(80, v);
let ready = false, bus: GainNode | null = null, fx: Fx | null = null, voice: Voice | null = null, token = 0;
const buffers = new Map<number, Promise<AudioBuffer>>();
const subs = new Set<(s: PadState) => void>();

function init(){
  if(ready) return; ready = true;
  const s = saved();
  if(typeof s.pc === "number") state.pc = ((s.pc % 12) + 12) % 12;
  if(typeof s.volume === "number") state.volume = Math.max(0, Math.min(1, s.volume));
  if(isStyle(s.style)) state.style = s.style;
}
function emit(){ const s = {...state}; subs.forEach(f => f(s)); }
function save(){ store.setSetting("pad", {pc: state.pc, volume: state.volume, style: state.style}); }

function load(ac: AudioContext, pc: number){
  let p = buffers.get(pc);
  if(!p){
    p = fetch(import.meta.env.BASE_URL + "pads/" + FILES[pc] + ".mp3")
      .then(r => { if(!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then(b => ac.decodeAudioData(b));
    p.catch(() => buffers.delete(pc));
    buffers.set(pc, p);
  }
  return p;
}
// Curvas de potência constante: somadas no cruzamento, o volume não afunda no meio.
const curve = (up: boolean) => Float32Array.from({length: 64}, (_, i) => { const x = i / 63 * Math.PI / 2; return up ? Math.sin(x) : Math.cos(x); });
const UP = curve(true), DOWN = curve(false);

// Uma volta do trecho numa camada a partir de `at`; a próxima é agendada perto da hora de entrar.
function cycle(ac: AudioContext, v: Voice, i: number, buf: AudioBuffer, at: number, fadeIn: number){
  const rate = RATES[i], period = (buf.duration - SKIP) / rate - CROSS;
  const src = ac.createBufferSource(), env = ac.createGain();
  src.buffer = buf; src.playbackRate.value = rate; src.connect(env); env.connect(v.layers[i]);
  env.gain.setValueAtTime(0, at);
  env.gain.setValueCurveAtTime(UP, at, fadeIn);
  env.gain.setValueCurveAtTime(DOWN, at + period, CROSS);
  src.start(at, SKIP); src.stop(at + period + CROSS + 0.05);
  v.srcs.push(src);
  src.onended = () => { v.srcs = v.srcs.filter(s => s !== src); };
  v.timers[i] = window.setTimeout(() => cycle(ac, v, i, buf, at + period, CROSS), Math.max(0, (at + period - ac.currentTime - 8) * 1000));
}
function release(ac: AudioContext, v: Voice, dur: number){
  v.timers.forEach(clearTimeout);
  const now = ac.currentTime;
  v.gain.gain.cancelScheduledValues(now); v.gain.gain.setValueAtTime(v.gain.gain.value, now);
  v.gain.gain.setValueCurveAtTime(DOWN.map(x => x * v.gain.gain.value), now, dur);
  v.srcs.forEach(s => { try{ s.stop(now + dur + 0.05); }catch(e){ /* já parou */ } });
  setTimeout(() => v.gain.disconnect(), (dur + 0.2) * 1000);
}
// Resposta de um salão: ruído estéreo que decai em ~4s e escurece com o tempo.
function hall(ac: AudioContext){
  const sr = ac.sampleRate, len = Math.floor(sr * 4.5), buf = ac.createBuffer(2, len, sr);
  for(let c = 0; c < 2; c++){
    const d = buf.getChannelData(c); let lp = 0;
    for(let i = 0; i < len; i++){
      const t = i / len, k = 0.5 - 0.45 * t; // filtro de um polo que fecha com o tempo
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - t, 3) * 1.6;
    }
  }
  return buf;
}
// Cadeia do pad, criada uma vez: filtro (com o movimento lento) → realce de agudos → seco + reverb → volume do pad.
function chain(ac: AudioContext, out: AudioNode): Fx {
  if(fx) return fx;
  bus = ac.createGain(); bus.gain.value = state.volume * state.volume; bus.connect(out);
  const input = ac.createGain(), build = ac.createBiquadFilter(), filter = ac.createBiquadFilter(), shelf = ac.createBiquadFilter();
  build.type = "lowpass"; build.Q.value = 0.9; build.frequency.value = cut(state.filter);
  filter.type = "lowpass"; filter.Q.value = 0.5; shelf.type = "highshelf"; shelf.frequency.value = 3000;
  const osc = ac.createOscillator(), lfo = ac.createGain(); osc.frequency.value = 0.06; lfo.gain.value = 0;
  osc.connect(lfo); lfo.connect(filter.frequency); osc.start();
  const dry = ac.createGain(), send = ac.createGain(), verb = ac.createConvolver(); verb.buffer = hall(ac);
  input.connect(build); build.connect(filter); filter.connect(shelf); shelf.connect(dry); dry.connect(bus); shelf.connect(send); send.connect(verb); verb.connect(bus);
  fx = {input, build, filter, shelf, lfo, dry, send};
  applyStyle(ac, 0.01);
  return fx;
}
// Leva o som ao estilo atual; `tau` é a constante de tempo da transição (segundos).
function applyStyle(ac: AudioContext, tau: number){
  const st = STYLES[state.style], now = ac.currentTime, to = (p: AudioParam, v: number) => p.setTargetAtTime(v, now, tau);
  if(fx){
    to(fx.filter.frequency, st.cutoff); to(fx.lfo.gain, st.lfo); to(fx.shelf.gain, st.shelf);
    // Camadas e reverb somam volume: o seco cai na mesma proporção para o total ficar parecido.
    const level = st.level ?? 1;
    to(fx.dry.gain, level / Math.sqrt(1 + st.up * st.up + st.down * st.down + st.rev * st.rev)); to(fx.send.gain, level * st.rev * 0.6);
  }
  if(voice){ to(voice.layers[1].gain, st.up); to(voice.layers[2].gain, st.down); }
}
// Toca o tom atual (do zero ou trocando o que já toca).
async function play(fadeIn: number){
  const io = audioOut(); if(!io) return false;
  const {ac, out} = io, my = ++token;
  state.loading = true; emit();
  let buf: AudioBuffer;
  try{ [buf] = await Promise.all([load(ac, state.pc), audioReady()]); }
  catch(e){ if(my === token){ state.loading = false; emit(); } return false; }
  if(my !== token) return true; // outra troca chegou antes
  const st = STYLES[state.style], v: Voice = {gain: ac.createGain(), layers: [], srcs: [], timers: []};
  v.gain.connect(chain(ac, out).input);
  v.layers = [1, st.up, st.down].map(g => { const l = ac.createGain(); l.gain.value = g; l.connect(v.gain); return l; });
  if(voice) release(ac, voice, fadeIn);
  voice = v;
  const at = ac.currentTime + 0.05;
  RATES.forEach((_, i) => cycle(ac, v, i, buf, at, fadeIn));
  state.loading = false; state.playing = true; emit();
  return true;
}

export const pad = {
  get state(): PadState { init(); return {...state}; },
  onChange(f: (s: PadState) => void){ init(); subs.add(f); return () => { subs.delete(f); }; },
  start(fade = START){ init(); clearTimeout(fadeTimer); state.fading = false; return play(fade); },
  stop(fade = STOP){
    token++; clearTimeout(fadeTimer);
    const io = audioOut();
    if(io && voice) release(io.ac, voice, fade);
    voice = null; state.playing = false; state.loading = false; state.fading = false; emit();
  },
  // Entra devagar (parado) ou sai devagar (tocando); o botão mostra o fade enquanto ele dura.
  async fade(){
    init();
    const out = state.playing || state.loading, secs = out ? FADE_OUT : FADE_IN;
    const ok = out ? (pad.stop(secs), true) : await play(secs);
    if(ok){ state.fading = true; emit(); clearTimeout(fadeTimer); fadeTimer = window.setTimeout(() => { state.fading = false; emit(); }, secs * 1000); }
    return ok;
  },
  // Filtro de build, à mão: para o swell automático se estiver rodando.
  setFilter(v: number){
    init(); state.filter = Math.max(0, Math.min(1, v));
    if(state.swelling){ clearInterval(swellTimer); state.swelling = 0; }
    const io = audioOut();
    if(io && fx){ fx.build.frequency.cancelScheduledValues(io.ac.currentTime); fx.build.frequency.setTargetAtTime(cut(state.filter), io.ac.currentTime, 0.05); }
    emit();
  },
  // Swell automático: fecha o filtro e o abre por inteiro em `bars` compassos do metrônomo (tocado no tempo forte,
  // termina aberto no tempo forte). O controle acompanha a subida.
  swell(bars: number){
    init();
    const io = audioOut(); if(!io) return;
    const {ac, out} = io, f = chain(ac, out).build.frequency, st = metro.state;
    const secs = bars * (SIGNATURES[st.sig] || SIGNATURES["4/4"]).beats * 60 / st.bpm, t0 = quantize(ac.currentTime + 0.01);
    f.cancelScheduledValues(t0); f.setValueAtTime(cut(0), t0); f.exponentialRampToValueAtTime(cut(1), t0 + secs);
    clearInterval(swellTimer); state.swelling = bars; state.filter = 0; emit();
    swellTimer = window.setInterval(() => {
      const k = Math.max(0, Math.min(1, (ac.currentTime - t0) / secs));
      state.filter = k; if(k >= 1){ clearInterval(swellTimer); state.swelling = 0; }
      emit();
    }, 100);
  },
  toggle(){ return state.playing || state.loading ? (pad.stop(), Promise.resolve(true)) : pad.start(); },
  setKey(pc: number){
    init(); pc = ((pc % 12) + 12) % 12;
    if(pc === state.pc && (state.playing || state.loading)) return Promise.resolve(true);
    state.pc = pc; save(); emit();
    return state.playing || state.loading ? play(SWITCH) : Promise.resolve(true);
  },
  setStyle(style: PadStyle){
    init(); if(!isStyle(style) || style === state.style) return;
    state.style = style; save();
    const io = audioOut(); if(io) applyStyle(io.ac, 0.6);
    emit();
  },
  setVolume(v: number){
    init(); state.volume = Math.max(0, Math.min(1, v)); save();
    const io = audioOut();
    if(io && bus) bus.gain.setTargetAtTime(state.volume * state.volume, io.ac.currentTime, 0.05);
    emit();
  },
  // Baixa o arquivo do tom antes de tocar, para o primeiro toque não esperar a rede.
  preload(){ init(); const io = audioOut(); if(io) load(io.ac, state.pc).catch(() => {}); }
};
