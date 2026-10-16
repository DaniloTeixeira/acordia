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
export function playSequence(pcs, {base = 60, step = 0.32} = {}){
  const ac = audio(); if(!ac) return false;
  const t = ac.currentTime + 0.02;
  pcs.forEach((p, i)=>voice(ac, base + p, t + i*step, 0.6, 0.2));
  return true;
}
