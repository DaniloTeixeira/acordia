// Afinador: detecção de altura por autocorrelação (com refinamento parabólico) e interface.
import { t } from "./i18n.js";
import { INSTRUMENTS } from "./instruments.js";

const NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
// Frequência fundamental de um trecho de áudio (Float32Array), ou null se for silêncio ou ruído.
export function detectPitch(buf, sampleRate, {minHz = 35, maxHz = 1500} = {}){
  const n = buf.length;
  let rms = 0; for(let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n); if(rms < 0.008) return null;
  const minLag = Math.floor(sampleRate / maxHz), maxLag = Math.min(Math.floor(sampleRate / minHz), n >> 1);
  // Diferença normalizada acumulada (YIN simplificado).
  const d = new Float32Array(maxLag + 1);
  for(let lag = 1; lag <= maxLag; lag++){
    let s = 0; for(let i = 0; i + lag < n; i++){ const x = buf[i] - buf[i + lag]; s += x * x; }
    d[lag] = s;
  }
  const cmnd = new Float32Array(maxLag + 1); cmnd[0] = 1; let run = 0;
  for(let lag = 1; lag <= maxLag; lag++){ run += d[lag]; cmnd[lag] = run ? d[lag] * lag / run : 1; }
  let lag = -1;
  for(let l = Math.max(2, minLag); l < maxLag; l++){
    if(cmnd[l] < 0.15){ while(l + 1 < maxLag && cmnd[l + 1] < cmnd[l]) l++; lag = l; break; }
  }
  if(lag < 0){ // sem vale claro: usa o menor valor, se for razoável
    let best = 1; for(let l = Math.max(2, minLag); l < maxLag; l++) if(cmnd[l] < best){ best = cmnd[l]; lag = l; }
    if(best > 0.35) return null;
  }
  const a = cmnd[lag - 1] ?? cmnd[lag], b = cmnd[lag], c = cmnd[lag + 1] ?? cmnd[lag];
  const shift = (a - 2 * b + c) ? (a - c) / (2 * (a - 2 * b + c)) : 0;
  return sampleRate / (lag + shift);
}
// Nota mais próxima: {name, octave, midi, cents, target}.
export function noteFromFreq(f, a4 = 440){
  const midiF = 69 + 12 * Math.log2(f / a4), midi = Math.round(midiF);
  return {name: NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1, midi, cents: Math.round((midiF - midi) * 100), target: a4 * Math.pow(2, (midi - 69) / 12)};
}
export const midiName = m => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
// Corda do instrumento mais próxima da frequência tocada.
export function nearestString(f, instId, a4 = 440){
  const inst = INSTRUMENTS[instId]; if(!inst || inst.kind !== "strings") return null;
  const midiF = 69 + 12 * Math.log2(f / a4);
  let best = 0; inst.strings.forEach((m, i) => { if(Math.abs(m - midiF) < Math.abs(inst.strings[best] - midiF)) best = i; });
  const m = inst.strings[best];
  return {index: best, midi: m, name: midiName(m), cents: Math.round((midiF - m) * 100)};
}

export function mountTuner(root, {icon, esc, toast, data, store, instrumentSelect}){
  let stream = null, ctx = null, raf = 0, an = null, buf = null, smooth = [];
  const a4 = () => data.settings.a4 || 440;
  const inst = () => data.settings.instrument || "guitar";
  function render(){
    const I = INSTRUMENTS[inst()];
    root.innerHTML = `
      <div class="card tuner">
        <div class="tuner-top">${instrumentSelect()}<label class="field a4">A4<select class="input" id="tu-a4">${[432,436,438,440,442,444,446].map(v => `<option ${v === a4() ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
        <div class="tuner-dial" aria-live="polite">
          <div class="tuner-note"><b id="tu-note">—</b><small id="tu-oct"></small></div>
          <div class="tuner-meter"><div class="tuner-scale">${[-50,-25,0,25,50].map(v => `<span style="left:${50 + v * 0.9}%">${v > 0 ? "+" + v : v}</span>`).join("")}</div><div class="tuner-needle" id="tu-needle"></div><div class="tuner-zone"></div></div>
          <p class="tuner-cents" id="tu-cents">${esc(t("tuner.idle"))}</p>
        </div>
        ${I.kind === "strings" ? `<div class="tuner-strings">${I.strings.map((m, i) => `<span class="tstring" data-i="${i}"><b>${esc(midiName(m).replace(/\d/, ""))}</b><small>${midiName(m).replace(/\D/g, "")}</small></span>`).join("")}</div>` : ""}
        <button class="btn primary metro-go" id="tu-toggle">${icon("sound","sm")} ${esc(t("tuner.start"))}</button>
        <p class="sub">${esc(t("tuner.hint"))}</p>
      </div>`;
    root.querySelector("#tu-a4").onchange = e => store.setSetting("a4", +e.target.value);
    root.querySelector("#tu-toggle").onclick = () => stream ? stop() : start();
  }
  async function start(){
    try{
      stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}});
    }catch(e){ stream = null; return toast(t("tuner.denied")); }
    const C = window.AudioContext || window.webkitAudioContext; ctx = new C();
    const src = ctx.createMediaStreamSource(stream); an = ctx.createAnalyser(); an.fftSize = 4096; src.connect(an);
    buf = new Float32Array(an.fftSize); smooth = [];
    const b = root.querySelector("#tu-toggle"); b.innerHTML = `${icon("x","sm")} ${esc(t("tuner.stop"))}`; b.classList.add("running");
    loop();
  }
  let last = 0;
  function loop(){
    raf = requestAnimationFrame(loop);
    const now = performance.now(); if(now - last < 60) return; last = now;
    an.getFloatTimeDomainData(buf);
    const f = detectPitch(buf, ctx.sampleRate);
    const note = root.querySelector("#tu-note"); if(!note) return stop();
    if(!f){ root.querySelector(".tuner-dial").classList.add("quiet"); return; }
    smooth.push(f); if(smooth.length > 5) smooth.shift();
    const fm = [...smooth].sort((x, y) => x - y)[smooth.length >> 1];
    const n = noteFromFreq(fm, a4()), s = nearestString(fm, inst(), a4());
    const cents = s && Math.abs(s.cents) <= 150 ? s.cents : n.cents, label = s && Math.abs(s.cents) <= 150 ? s.name : n.name + n.octave;
    root.querySelector(".tuner-dial").classList.remove("quiet");
    note.textContent = label.replace(/-?\d+$/, ""); root.querySelector("#tu-oct").textContent = label.match(/-?\d+$/)?.[0] || "";
    const clamped = Math.max(-50, Math.min(50, cents));
    root.querySelector("#tu-needle").style.left = (50 + clamped * 0.9) + "%";
    const ok = Math.abs(cents) <= 5;
    root.querySelector(".tuner-dial").classList.toggle("ok", ok);
    root.querySelector("#tu-cents").textContent = ok ? t("tuner.inTune") : t(cents < 0 ? "tuner.low" : "tuner.high", {c: Math.abs(cents)}) + ` · ${fm.toFixed(1)} Hz`;
    root.querySelectorAll(".tstring").forEach(el => el.classList.toggle("on", s && Math.abs(s.cents) <= 150 && +el.dataset.i === s.index));
  }
  function stop(){
    cancelAnimationFrame(raf);
    if(stream) stream.getTracks().forEach(tr => tr.stop());
    if(ctx) ctx.close().catch(()=>{});
    stream = null; ctx = null;
    const b = root.querySelector("#tu-toggle"); if(b){ b.innerHTML = `${icon("sound","sm")} ${esc(t("tuner.start"))}`; b.classList.remove("running"); }
  }
  render();
  return {stop, render: () => { stop(); render(); }};
}
