// Síntese simples com Web Audio para tocar notas, escalas e acordes no modo Estudo.
let ctx = null;
function audio(){
  if(!ctx){ const C = window.AudioContext || window.webkitAudioContext; if(!C) return null; ctx = new C(); }
  if(ctx.state === "suspended") ctx.resume();
  return ctx;
}
const freq = midi => 440 * Math.pow(2, (midi - 69) / 12);

function voice(ac, midi, at, dur, gain){
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
  o1.type = "triangle"; o2.type = "sine";
  o1.frequency.value = freq(midi); o2.frequency.value = freq(midi + 12);
  f.type = "lowpass"; f.frequency.value = 2400;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.015);
  g.gain.exponentialRampToValueAtTime(gain * 0.35, at + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  const g2 = ac.createGain(); g2.gain.value = 0.25;
  o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(f); f.connect(ac.destination);
  o1.start(at); o2.start(at); o1.stop(at + dur + 0.05); o2.stop(at + dur + 0.05);
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
  o.connect(g); g.connect(ac.destination);
  o.start(t0); o.stop(t0 + c.dur + 0.02);
  return true;
}
export function playSequence(pcs, {base = 60, step = 0.32} = {}){
  const ac = audio(); if(!ac) return false;
  const t = ac.currentTime + 0.02;
  pcs.forEach((p, i)=>voice(ac, base + p, t + i*step, 0.6, 0.2));
  return true;
}
