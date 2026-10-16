// Síntese simples com Web Audio para tocar notas, escalas e acordes no modo Estudo.
let ctx = null, master = null, volume = 0.8, muted = false;
// Saída comum de todos os sons do app, com o volume geral.
function out(ac){ if(!master){ master = ac.createGain(); master.connect(ac.destination); } master.gain.value = muted ? 0 : volume; return master; }
export function setVolume(v, m){ volume = Math.max(0, Math.min(1, v)); muted = !!m; if(master) master.gain.value = muted ? 0 : volume; }
function audio(){
  if(!ctx){ const C = window.AudioContext || window.webkitAudioContext; if(!C) return null; ctx = new C(); }
  if(ctx.state === "suspended") ctx.resume();
  return ctx;
}
const freq = midi => 440 * Math.pow(2, (midi - 69) / 12);

// ---------- timbres: só nós nativos do Web Audio, sem samples para baixar ----------
const osc = (ac, type, f, at, end) => {
  const o = ac.createOscillator();
  if(typeof type === "string") o.type = type; else o.setPeriodicWave(type);
  o.frequency.value = f; o.start(at); o.stop(end); return o;
};
const amp = (ac, v) => { const g = ac.createGain(); g.gain.value = v; return g; };
const lowpass = (ac, f, q = 0.7) => { const l = ac.createBiquadFilter(); l.type = "lowpass"; l.frequency.value = f; l.Q.value = q; return l; };
// Formas de onda por harmônicos, criadas uma vez só.
const waves = {};
function wave(ac, name, amps){
  return waves[name] || (waves[name] = ac.createPeriodicWave(new Float32Array(amps.length + 1), new Float32Array([0, ...amps])));
}
// Envelope percussivo: ataque curto, decaimento natural e soltura no fim da nota.
function strike(g, at, dur, peak, tau, attack = 0.004){
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setTargetAtTime(0, at + attack, tau);
  g.gain.setTargetAtTime(0, Math.max(at + attack, at + dur - 0.08), 0.025);
}
// Envelope sustentado (órgão, sintetizador).
function hold(g, at, dur, peak, attack){
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setTargetAtTime(0, Math.max(at + attack, at + dur - 0.06), 0.03);
}
// Notas graves soam por mais tempo.
const ring = (f, base, min, max) => Math.max(min, Math.min(max, base * Math.sqrt(261.6 / f)));

const VOICES = {
  // Duas cordas levemente desafinadas; harmônicos agudos fracos e brilho do ataque contido, para soar macio.
  piano(ac, f, at, dur, gain, dest, end){
    // 2º harmônico baixo: com ele forte, a nota parece uma oitava acima.
    const w = wave(ac, "piano3", [1, .25, .16, .08, .05, .03, .02, .01]);
    const g = amp(ac, 0), lp = lowpass(ac, 0, 0.5), half = amp(ac, 0.5);
    lp.frequency.setValueAtTime(Math.min(4500, f * 6), at);
    lp.frequency.setTargetAtTime(Math.max(400, f * 1.8), at, 0.25);
    osc(ac, w, f, at, end).connect(half);
    const b = osc(ac, w, f, at, end); b.detune.value = 3; b.connect(half);
    half.connect(lp); lp.connect(g); g.connect(dest);
    strike(g, at, dur, gain * 0.75, ring(f, 1.1, 0.35, 2.4), 0.006);
  },
  // Rhodes no esquema do E.Piano do DX7: um par FM 1:1 faz o corpo (com o "rosnado" do ataque, mais forte
  // nos graves) e um par com modulador 14× faz o "ding" da lâmina; decai em dois estágios, com tremolo de mala.
  rhodes(ac, f, at, dur, gain, dest, end){
    const k = Math.max(0.5, Math.min(1.6, Math.sqrt(261.6 / f)));
    const g = amp(ac, 0), trem = amp(ac, 1), lfo = amp(ac, 0.1);
    // corpo
    const body = osc(ac, "sine", f, at, end), bodyLvl = amp(ac, 0.75), bark = amp(ac, 0);
    bark.gain.setValueAtTime(f * 1.6 * k, at); bark.gain.setTargetAtTime(f * 0.22 * k, at, 0.3);
    osc(ac, "sine", f, at, end).connect(bark); bark.connect(body.frequency);
    body.connect(bodyLvl); bodyLvl.connect(g);
    // lâmina, levemente desafinada do corpo para dar vida
    const tine = osc(ac, "sine", f, at, end), tineLvl = amp(ac, 0.45), ding = amp(ac, 0);
    tine.detune.value = 4;
    ding.gain.setValueAtTime(f * 14 * 0.22, at); ding.gain.setTargetAtTime(0, at, 0.03);
    osc(ac, "sine", f * 14, at, end).connect(ding); ding.connect(tine.frequency);
    tine.connect(tineLvl); tineLvl.connect(g);
    // tremolo
    osc(ac, "sine", 4.8, at, end).connect(lfo); lfo.connect(trem.gain);
    g.connect(trem); trem.connect(dest);
    const peak = gain * 0.62, long = ring(f, 1.6, 0.6, 3);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.003);
    g.gain.setTargetAtTime(peak * 0.55, at + 0.003, 0.09);
    g.gain.setTargetAtTime(0, at + 0.3, long);
    g.gain.setTargetAtTime(0, Math.max(at + 0.31, at + dur - 0.08), 0.025);
  },
  // Drawbars 16' 8' 4' 2⅔' 2' e o clique de percussão no 3º harmônico.
  organ(ac, f, at, dur, gain, dest, end){
    const w = wave(ac, "organ", [1, .8, .55, .45, 0, .25, 0, .2]);
    const g = amp(ac, 0), sub = amp(ac, 0.45), perc = amp(ac, 0);
    osc(ac, w, f, at, end).connect(g);
    osc(ac, "sine", f / 2, at, end).connect(sub); sub.connect(g);
    perc.gain.setValueAtTime(0.5, at); perc.gain.setTargetAtTime(0, at, 0.12);
    osc(ac, "sine", f * 3, at, end).connect(perc); perc.connect(g);
    g.connect(dest);
    hold(g, at, dur, gain * 0.35, 0.008);
  },
  // Duas serras desafinadas num filtro que abre no ataque.
  synth(ac, f, at, dur, gain, dest, end){
    const g = amp(ac, 0), lp = lowpass(ac, 0, 3);
    lp.frequency.setValueAtTime(Math.min(10000, f * 9), at);
    lp.frequency.setTargetAtTime(Math.min(6000, f * 2.5), at, 0.25);
    [-8, 8].forEach(c => { const o = osc(ac, "sawtooth", f, at, end); o.detune.value = c; o.connect(lp); });
    lp.connect(g); g.connect(dest);
    hold(g, at, dur, gain * 0.32, 0.02);
  },
  // Lâmina de metal (parciais 1, 4 e 10) com o tremolo do motor.
  vibes(ac, f, at, dur, gain, dest, end){
    const g = amp(ac, 0), trem = amp(ac, 1), depth = amp(ac, 0.22), p4 = amp(ac, 0), p10 = amp(ac, 0);
    osc(ac, "sine", f, at, end).connect(g);
    p4.gain.setValueAtTime(0.3, at); p4.gain.setTargetAtTime(0, at, 0.12);
    osc(ac, "sine", f * 4, at, end).connect(p4); p4.connect(g);
    p10.gain.setValueAtTime(0.12, at); p10.gain.setTargetAtTime(0, at, 0.025);
    osc(ac, "sine", f * 10, at, end).connect(p10); p10.connect(g);
    osc(ac, "sine", 5.5, at, end).connect(depth); depth.connect(trem.gain);
    g.connect(trem); trem.connect(dest);
    strike(g, at, dur, gain * 0.65, ring(f, 1.4, 0.5, 2.5), 0.002);
  },
  // Colchão de cordas: três serras desafinadas num filtro fechado, ataque lento e cauda que se desfaz depois da nota.
  pad(ac, f, at, dur, gain, dest){
    const end = at + dur + 0.9, g = amp(ac, 0), lp = lowpass(ac, 0, 0.6);
    lp.frequency.setValueAtTime(Math.min(1200, f * 2), at);
    lp.frequency.linearRampToValueAtTime(Math.min(2600, f * 3.5), at + Math.max(0.3, dur));
    [-12, 0, 12].forEach(c => { const o = osc(ac, "sawtooth", f, at, end); o.detune.value = c; o.connect(lp); });
    lp.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain * 0.3, at + Math.min(0.3, dur * 0.5));
    g.gain.setTargetAtTime(0, at + dur, 0.18);
  }
};
export const TIMBRES = Object.keys(VOICES);
let timbre = "piano";
// Ids antigos salvos nas preferências: "keys" (Teclado, removido) e "epiano" (virou Rhodes).
const RENAMED = {keys: "piano", epiano: "rhodes"};
export function setTimbre(name){ name = RENAMED[name] || name; timbre = VOICES[name] ? name : "piano"; }
export const getTimbre = () => timbre;

function voice(ac, midi, at, dur, gain){
  VOICES[timbre](ac, freq(midi), at, dur, gain, out(ac), at + dur + 0.12);
}
// pcs: alturas relativas a C (podem passar de 12); base: oitava do C central.
export function playChord(pcs, {base = 60, strum = 0.025, dur = 1.6} = {}){
  const ac = audio(); if(!ac) return false;
  const t = ac.currentTime + 0.02, g = 0.22 / Math.sqrt(pcs.length);
  pcs.forEach((p, i)=>voice(ac, base + p, t + i*strum, dur, g));
  return true;
}
// ---------- ritmo: metrônomo e batidas das mãos, agendados no relógio do áudio ----------
// Garante o áudio rodando (alguns navegadores só liberam depois de um toque).
export async function audioReady(){
  const ac = audio(); if(!ac) return false;
  if(ac.state !== "running"){ try{ await Promise.race([ac.resume(), new Promise(r => setTimeout(r, 800))]); }catch(e){} }
  return ac.state === "running";
}
export function audioNow(){ const ac = audio(); return ac ? ac.currentTime : null; }
const CLICKS = {
  accent: {f:1760, type:"square", dur:0.045, gain:0.16},
  beat:   {f:1180, type:"square", dur:0.035, gain:0.10},
  mid:    {f:1440, type:"square", dur:0.04,  gain:0.13},
  sub:    {f:880,  type:"square", dur:0.025, gain:0.045},
  lh:     {f:165,  type:"triangle", dur:0.16, gain:0.45},
  rh:     {f:660,  type:"triangle", dur:0.10, gain:0.30}
};
// Agenda um som curto no tempo `at` (segundos do AudioContext). Sem `at`, toca agora.
export function click(kind, at){
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
export function playNotesAt(midis, at, dur = 0.8){
  const ac = audio(); if(!ac) return false;
  const g = 0.22 / Math.sqrt(midis.length || 1);
  midis.forEach(m => voice(ac, m, Math.max(at, ac.currentTime), dur, g));
  return true;
}
// Acordes em sequência (ex.: a cadência que firma o tom) a partir de `at`; devolve o instante em que acabam.
export function playProgression(chords, at, step = 0.6){
  const ac = audio(); if(!ac) return null;
  let t0 = Math.max(at ?? ac.currentTime + 0.05, ac.currentTime);
  chords.forEach(c => { playNotesAt(c, t0, step - 0.05); t0 += step; });
  return t0;
}
export function playSequence(pcs, {base = 60, step = 0.32} = {}){
  const ac = audio(); if(!ac) return false;
  const t = ac.currentTime + 0.02;
  pcs.forEach((p, i)=>voice(ac, base + p, t + i*step, 0.6, 0.2));
  return true;
}
