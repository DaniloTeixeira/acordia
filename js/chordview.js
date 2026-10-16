// Visualização de acordes e escalas no instrumento escolhido: diagrama de acorde (cordas),
// braço com as notas, mini teclado e a janela de detalhes de um acorde.
import { INSTRUMENTS, INSTRUMENT_IDS, voicings, parseChord } from "./instruments.js";
import { NOTES, noteName, parseKey, chordToDegree, harmonicField, rootFor } from "./core.js";
import { t, degLabel } from "./i18n.js";
import { TIMBRES, getTimbre } from "./audio.js";

const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

export function instrumentSelect(current){
  return `<label class="field inst-field"><span>${esc(t("inst.label"))}</span><select class="input" data-instrument>${INSTRUMENT_IDS.map(id => `<option value="${id}" ${id === current ? "selected" : ""}>${esc(t("inst." + id))}</option>`).join("")}</select></label>`;
}
// Timbre do som, ao lado do instrumento; o app mantém todas as listas iguais.
export function timbreSelect(){
  const cur = getTimbre();
  return `<label class="field inst-field"><span>${esc(t("timbre.title"))}</span><select class="input" data-timbre>${TIMBRES.map(id => `<option value="${id}" ${id === cur ? "selected" : ""}>${esc(t("timbre." + id))}</option>`).join("")}</select></label>`;
}
export const voicingMidis = (v, instId) => v.frets.map((f, i) => f < 0 ? null : INSTRUMENTS[instId].strings[i] + f).filter(n => n !== null);

// Diagrama de acorde: cordas na vertical (grave à esquerda), 4 casas.
export function diagramSVG(v, instId, {small = false} = {}){
  const inst = INSTRUMENTS[instId], n = inst.strings.length, rows = 4;
  const fretted = v.frets.filter(f => f > 0), max = fretted.length ? Math.max(...fretted) : 0;
  const base = max <= rows ? 1 : Math.min(...fretted);
  const gap = small ? 16 : 24, rowH = small ? 18 : 26, left = small ? 16 : 26, top = small ? 16 : 26;
  const W = left * 2 + gap * (n - 1), H = top + rowH * rows + (small ? 6 : 26);
  const x = i => left + i * gap, y = r => top + r * rowH;
  let s = `<svg class="diagram${small ? " sm" : ""}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(v.frets.map(f => f < 0 ? "x" : f).join(" "))}">`;
  for(let r = 0; r <= rows; r++) s += `<line x1="${x(0)}" x2="${x(n - 1)}" y1="${y(r)}" y2="${y(r)}" class="fret${r === 0 && base === 1 ? " nut" : ""}"/>`;
  for(let i = 0; i < n; i++) s += `<line x1="${x(i)}" x2="${x(i)}" y1="${y(0)}" y2="${y(rows)}" class="str"/>`;
  if(base > 1) s += `<text x="${x(n - 1) + (small ? 6 : 9)}" y="${y(0.5) + 4}" class="base">${base}</text>`;
  if(v.barre){
    const min = Math.min(...fretted), i0 = v.frets.indexOf(min), i1 = v.frets.lastIndexOf(min);
    s += `<rect x="${x(i0) - (small ? 5 : 8)}" y="${y(min - base + 0.5) - (small ? 5 : 8)}" width="${x(i1) - x(i0) + (small ? 10 : 16)}" height="${small ? 10 : 16}" rx="${small ? 5 : 8}" class="dot"/>`;
  }
  v.frets.forEach((f, i) => {
    if(f < 0) s += `<text x="${x(i)}" y="${top - (small ? 5 : 8)}" class="mark">×</text>`;
    else if(f === 0) s += `<circle cx="${x(i)}" cy="${top - (small ? 8 : 12)}" r="${small ? 3.5 : 5}" class="open"/>`;
    else s += `<circle cx="${x(i)}" cy="${y(f - base + 0.5)}" r="${small ? 5.5 : 9}" class="dot"/>`;
  });
  if(!small) inst.names.forEach((nm, i) => { s += `<text x="${x(i)}" y="${H - 6}" class="sname">${nm}</text>`; });
  return s + "</svg>";
}

// Braço com as notas marcadas: marks[pc] = {label, root}. Corda mais aguda em cima, como na tablatura.
export function fretboardSVG(instId, marks, frets = 12){
  const inst = INSTRUMENTS[instId], n = inst.strings.length;
  const fw = 44, sh = 26, left = 36, top = 18, W = left + fw * (frets + 0.6) + 8, H = top * 2 + sh * (n - 1) + 14;
  const fx = f => f === 0 ? left - 16 : left + fw * (f - 0.5), sy = i => top + sh * (n - 1 - i);
  let s = `<svg class="fretboard" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("inst.boardAria"))}">`;
  s += `<rect x="${left}" y="${top - 6}" width="${fw * frets}" height="${sh * (n - 1) + 12}" class="wood"/>`;
  [3,5,7,9].filter(f => f <= frets).forEach(f => { s += `<circle cx="${left + fw * (f - 0.5)}" cy="${top + sh * (n - 1) / 2}" r="5" class="inlay"/>`; });
  if(frets >= 12) [-1, 1].forEach(d => { s += `<circle cx="${left + fw * 11.5}" cy="${top + sh * (n - 1) / 2 + d * sh * 0.9}" r="5" class="inlay"/>`; });
  for(let f = 0; f <= frets; f++) s += `<line x1="${left + fw * f}" x2="${left + fw * f}" y1="${top - 6}" y2="${top + sh * (n - 1) + 6}" class="${f ? "fret" : "nut"}"/>`;
  for(let i = 0; i < n; i++) s += `<line x1="${left - 26}" x2="${left + fw * frets}" y1="${sy(i)}" y2="${sy(i)}" class="str" style="stroke-width:${1 + (n - 1 - i) * 0.35}"/>`;
  [3,5,7,9,12].filter(f => f <= frets).forEach(f => { s += `<text x="${left + fw * (f - 0.5)}" y="${H - 2}" class="fnum">${f}</text>`; });
  for(let i = 0; i < n; i++) for(let f = 0; f <= frets; f++){
    const midi = inst.strings[i] + f, m = marks[midi % 12];
    if(!m) continue;
    s += `<g class="pos${m.root ? " root" : ""}" data-midi="${midi}"><circle cx="${fx(f)}" cy="${sy(i)}" r="10.5"/><text x="${fx(f)}" y="${sy(i) + 3.5}">${esc(m.label)}</text></g>`;
  }
  return s + "</svg>";
}

// Mini teclado de 2 oitavas com as notas do acorde.
export function pianoSVG(midis, rootPc){
  const lo = Math.min(...midis), start = lo - (lo % 12) - (lo % 12 > 4 ? 0 : 0);
  const W = 24, H = 84, BW = 15, BH = 52; let whites = "", blacks = "", x = 0;
  const on = new Set(midis);
  for(let k = 0; k < 24; k++){
    const midi = start + k, pc = midi % 12, cls = on.has(midi) ? (pc === rootPc ? " root" : " in") : "";
    // Todas as notas do acorde no mesmo azul; a fundamental leva um pontinho branco embaixo.
    const dot = (cx, cy, r) => cls === " root" ? `<circle class="root-dot" cx="${cx}" cy="${cy}" r="${r}"/>` : "";
    if([0,2,4,5,7,9,11].includes(pc)){ whites += `<rect class="w${cls}" data-midi="${midi}" x="${x + 0.5}" y="0.5" width="${W - 1}" height="${H - 1}" rx="3"/>` + dot(x + W/2, H - 10, 3); x += W; }
    else blacks += `<rect class="b${cls}" data-midi="${midi}" x="${x - BW/2}" y="0" width="${BW}" height="${BH}" rx="2"/>` + dot(x, BH - 8, 2.5);
  }
  return `<svg class="keyboard mini" viewBox="-1 -1 ${x + 2} ${H + 2}" role="img">${whites}${blacks}</svg>`;
}

// Grau e função de um acorde no tom (quando é diatônico).
export function chordInKey(symbol, key){
  const c = parseChord(symbol), k = parseKey(key);
  if(!c || !k) return null;
  const degree = chordToDegree(symbol, key);
  const root = rootFor(k.pc, k.minor ? "menor" : "maior");
  const field = harmonicField(root, k.minor ? "menor" : "maior");
  const third = c.tones.find(x => x.role === "3"), fifth = c.tones.find(x => x.role === "5");
  const q = !third ? "" : third.iv === 3 ? (fifth && fifth.iv === 6 ? "d" : "m") : (fifth && fifth.iv === 8 ? "a" : "M");
  const hit = field.find(f => NOTES[f.name.replace(/[^A-G#b].*$/, "")] === c.rootPc && f.quality === q);
  return {degree, fn: hit ? hit.fn : "", diatonic: !!hit};
}

// Janela de detalhes do acorde. `getInstrument`/`setInstrument` ligam à preferência global.
export function createChordDialog({dlg, audio, getInstrument, setInstrument, icon}){
  let state = null;
  function render(){
    const {symbol, key, idx} = state, inst = getInstrument(), c = parseChord(symbol);
    const body = dlg.querySelector(".dlg-body"), info = key ? chordInKey(symbol, key) : null;
    dlg.querySelector("#chord-h").textContent = symbol;
    if(!c){ body.innerHTML = `<p>${esc(t("chord.unknown"))}</p>`; return; }
    const notes = c.tones.map(x => noteName(c.rootPc + x.iv, key || c.root));
    const roles = c.tones.map(x => x.role);
    const fnName = {T:t("study.fnT"), SD:t("study.fnSD"), D:t("study.fnD")};
    let visual = "", nav = "", vs = [];
    const I = INSTRUMENTS[inst];
    if(I.kind === "keys"){
      const base = 48 + c.rootPc + (c.rootPc > 6 ? -12 : 0) + 12;
      state.midis = c.tones.map(x => base + x.iv);
      if(c.bassPc !== c.rootPc) state.midis.unshift(base - 12 + ((c.bassPc - c.rootPc + 12) % 12));
      visual = pianoSVG(state.midis, c.rootPc);
    } else if(I.arpeggio){
      const marks = {}; c.tones.forEach((x, i) => { marks[(c.rootPc + x.iv) % 12] = {label: roles[i], root: i === 0}; });
      visual = fretboardSVG(inst, marks, 12);
      state.midis = c.tones.slice(0, 4).map(x => I.strings[0] + ((c.rootPc - I.strings[0] % 12 + 12) % 12) + x.iv);
    } else {
      vs = voicings(c, inst, 6);
      if(vs.length){
        const v = vs[Math.min(idx, vs.length - 1)];
        state.midis = voicingMidis(v, inst);
        visual = diagramSVG(v, inst);
        nav = vs.length > 1 ? `<div class="voicing-nav"><button type="button" class="icon-btn sm" data-v="-1" aria-label="${esc(t("chord.prev"))}" ${idx === 0 ? "disabled" : ""}>‹</button><span>${esc(t("chord.shape", {n: idx + 1, total: vs.length}))}</span><button type="button" class="icon-btn sm" data-v="1" aria-label="${esc(t("chord.next"))}" ${idx >= vs.length - 1 ? "disabled" : ""}>›</button></div>` : "";
      } else { visual = `<p class="sub">${esc(t("chord.noShape"))}</p>`; state.midis = c.tones.map(x => 60 + c.rootPc + x.iv); }
    }
    body.innerHTML = `
      <div class="chord-info">
        ${info ? `<span class="chip accent">${esc(t("chord.degreeIn", {degree: info.degree, key}))}</span>${info.fn ? `<span class="fn ${info.fn}">${esc(fnName[info.fn])}</span>` : `<span class="chip">${esc(t("chord.borrowed"))}</span>`}` : ""}
        <span class="chord-notes">${notes.map((nm, i) => `<span><b>${esc(nm)}</b><small>${esc(degLabel(roles[i]))}</small></span>`).join("")}</span>
      </div>
      <div class="chord-visual">${visual}${nav}</div>
      <div class="study-row chord-actions">${instrumentSelect(inst)}${timbreSelect()}<button type="button" class="btn primary" data-play>${icon("play","sm")} ${esc(t("chord.play"))}</button></div>`;
    body.querySelector("[data-play]").onclick = play;
    body.querySelectorAll(".voicing-nav [data-v]").forEach(b => b.onclick = () => { state.idx += +b.dataset.v; render(); play(); });
    body.querySelectorAll("[data-midi]").forEach(el => el.addEventListener("pointerdown", () => audio.playChord([+el.dataset.midi], {base:0, dur:1})));
  }
  function play(){ if(state && state.midis) audio.playChord(state.midis.slice().sort((a, b) => a - b), {base:0, strum:0.035}); }
  return {
    open(symbol, key){ state = {symbol, key, idx:0}; render(); if(!dlg.open) dlg.showModal(); play(); },
    refresh(){ if(state && dlg.open) render(); }
  };
}
