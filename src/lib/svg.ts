// Desenhos em SVG (como texto, com tudo escapado): diagrama de acorde, braço do instrumento,
// teclados e o grau/função de um acorde no tom.
import { INSTRUMENTS, parseChord, isInstrument, type Voicing } from "./instruments";
import { NOTES, parseKey, chordToDegree, harmonicField, rootFor, type Fn } from "./core";
import { t } from "./i18n";

export const esc = (s: unknown) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const inst = (id: string) => INSTRUMENTS[isInstrument(id) ? id : "guitar"];

export const voicingMidis = (v: Voicing, instId: string) => v.frets.map((f, i) => f < 0 ? null : inst(instId).strings[i] + f).filter((n): n is number => n !== null);

// Diagrama de acorde: cordas na vertical (grave à esquerda), 4 casas.
export function diagramSVG(v: Voicing, instId: string, {small = false} = {}){
  const I = inst(instId), n = I.strings.length, rows = 4;
  const fretted = v.frets.filter(f => f > 0), max = fretted.length ? Math.max(...fretted) : 0;
  const base = max <= rows ? 1 : Math.min(...fretted);
  const gap = small ? 16 : 24, rowH = small ? 18 : 26, left = small ? 16 : 26, top = small ? 16 : 26;
  const W = left * 2 + gap * (n - 1), H = top + rowH * rows + (small ? 6 : 26);
  const x = (i: number) => left + i * gap, y = (r: number) => top + r * rowH;
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
  if(!small) I.names.forEach((nm, i) => { s += `<text x="${x(i)}" y="${H - 6}" class="sname">${nm}</text>`; });
  return s + "</svg>";
}

// Braço com as notas marcadas: marks[pc] = {label, root}. Corda mais aguda em cima, como na tablatura.
export type Marks = Record<number, {label: string; root: boolean}>;
export function fretboardSVG(instId: string, marks: Marks, frets = 12){
  const I = inst(instId), n = I.strings.length;
  const fw = 44, sh = 26, left = 36, top = 18, W = left + fw * (frets + 0.6) + 8, H = top * 2 + sh * (n - 1) + 14;
  const fx = (f: number) => f === 0 ? left - 16 : left + fw * (f - 0.5), sy = (i: number) => top + sh * (n - 1 - i);
  let s = `<svg class="fretboard" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("inst.boardAria"))}">`;
  s += `<rect x="${left}" y="${top - 6}" width="${fw * frets}" height="${sh * (n - 1) + 12}" class="wood"/>`;
  [3,5,7,9].filter(f => f <= frets).forEach(f => { s += `<circle cx="${left + fw * (f - 0.5)}" cy="${top + sh * (n - 1) / 2}" r="5" class="inlay"/>`; });
  if(frets >= 12) [-1, 1].forEach(d => { s += `<circle cx="${left + fw * 11.5}" cy="${top + sh * (n - 1) / 2 + d * sh * 0.9}" r="5" class="inlay"/>`; });
  for(let f = 0; f <= frets; f++) s += `<line x1="${left + fw * f}" x2="${left + fw * f}" y1="${top - 6}" y2="${top + sh * (n - 1) + 6}" class="${f ? "fret" : "nut"}"/>`;
  for(let i = 0; i < n; i++) s += `<line x1="${left - 26}" x2="${left + fw * frets}" y1="${sy(i)}" y2="${sy(i)}" class="str" style="stroke-width:${1 + (n - 1 - i) * 0.35}"/>`;
  [3,5,7,9,12].filter(f => f <= frets).forEach(f => { s += `<text x="${left + fw * (f - 0.5)}" y="${H - 2}" class="fnum">${f}</text>`; });
  for(let i = 0; i < n; i++) for(let f = 0; f <= frets; f++){
    const midi = I.strings[i] + f, m = marks[midi % 12];
    if(!m) continue;
    s += `<g class="pos${m.root ? " root" : ""}" data-midi="${midi}"><circle cx="${fx(f)}" cy="${sy(i)}" r="10.5"/><text x="${fx(f)}" y="${sy(i) + 3.5}">${esc(m.label)}</text></g>`;
  }
  return s + "</svg>";
}

// Mini teclado de 2 oitavas com as notas do acorde.
export function pianoSVG(midis: number[], rootPc: number){
  const lo = Math.min(...midis), start = lo - (lo % 12);
  const W = 24, H = 84, BW = 15, BH = 52; let whites = "", blacks = "", x = 0;
  const on = new Set(midis);
  for(let k = 0; k < 24; k++){
    const midi = start + k, pc = midi % 12, cls = on.has(midi) ? (pc === rootPc ? " root" : " in") : "";
    // Todas as notas do acorde no mesmo azul; a fundamental leva um pontinho branco embaixo.
    const dot = (cx: number, cy: number, r: number) => cls === " root" ? `<circle class="root-dot" cx="${cx}" cy="${cy}" r="${r}"/>` : "";
    if([0,2,4,5,7,9,11].includes(pc)){ whites += `<rect class="w${cls}" data-midi="${midi}" x="${x + 0.5}" y="0.5" width="${W - 1}" height="${H - 1}" rx="3"/>` + dot(x + W/2, H - 10, 3); x += W; }
    else blacks += `<rect class="b${cls}" data-midi="${midi}" x="${x - BW/2}" y="0" width="${BW}" height="${BH}" rx="2"/>` + dot(x, BH - 8, 2.5);
  }
  return `<svg class="keyboard mini" viewBox="-1 -1 ${x + 2} ${H + 2}" role="img">${whites}${blacks}</svg>`;
}

const WHITE = [0,2,4,5,7,9,11];

// Painel decorativo de teclado acima das teclas (y negativo, as teclas não mudam de lugar): rodas de
// pitch bend e modulação, knobs, uma telinha com o nome do app, botões e o feltro no gradiente do logo.
const PANEL = 34;
function keyboardPanel(w: number){
  const knob = (cx: number, a: number) => {
    const r = 6.5, rad = (a - 90) * Math.PI / 180;
    return `<circle class="knob" cx="${cx}" cy="-17" r="${r}"/><line class="knob-tick" x1="${cx}" y1="-17" x2="${(cx + Math.cos(rad) * (r - 1.5)).toFixed(2)}" y2="${(-17 + Math.sin(rad) * (r - 1.5)).toFixed(2)}"/>`;
  };
  // A fenda termina antes da faixa em gradiente, deixando um respiro entre as rodas e as teclas.
  const wheel = (x: number, mid: number) => `<rect class="wheel-slot" x="${x}" y="-30" width="8" height="21" rx="2.5"/><rect class="wheel" x="${x + 1.5}" y="${mid - 4}" width="5" height="8" rx="1.5"/>`;
  const sx = w / 2 - 46, bx = w - 66;
  const buttons = [0,1,2,3].map(i => `<rect class="kb-btn${i === 0 ? " lit" : ""}" x="${bx + i * 15}" y="-22" width="11" height="7" rx="2"/>`).join("");
  return `<g class="kb-panel" aria-hidden="true">
    <defs><linearGradient id="kb-grad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3BD5FA"/><stop offset=".55" stop-color="#4C82F5"/><stop offset="1" stop-color="#9A5CF8"/></linearGradient></defs>
    ${wheel(6, -19.5)}${wheel(17, -15)}
    ${knob(40, -120)}${knob(58, 30)}${knob(76, 100)}
    <rect class="kb-screen" x="${sx}" y="-29" width="92" height="20" rx="3"/>
    <text class="kb-screen-text" x="${w / 2}" y="-15.5" text-anchor="middle">ACORDIA</text>
    <circle class="kb-led-glow" cx="${sx - 12}" cy="-19" r="4.5"/><circle class="kb-led" cx="${sx - 12}" cy="-19" r="2"/>
    <text class="kb-label" x="${sx - 12}" y="-9" text-anchor="middle">ON</text>
    ${buttons}
    <text class="kb-label" x="${bx}" y="-27">MODE</text>
    <rect x="0" y="-4" width="${w}" height="3" rx="1.5" fill="url(#kb-grad)"/>
  </g>`;
}
// Teclado de 2 oitavas do explorador. Os nomes ficam escondidos (aparecem no toque, na caixa ao lado),
// para associar posição e som; só a tônica tem uma marca fixa: um "T" com o gradiente do logo.
export function scaleKeyboardSVG(startMidi: number, rootPc: number, notesByPc: Record<number, string>){
  const kbStart = startMidi - rootPc, W = 24, H = 96, BW = 15, BH = 58;
  let whites = "", blacks = "", x = 0;
  for(let o = 0; o < 2; o++) for(let pc = 0; pc < 12; pc++){
    const midi = kbStart + o*12 + pc, name = notesByPc[pc], root = pc === rootPc;
    const cls = (name ? " in" : "") + (root ? " root" : "");
    if(WHITE.includes(pc)){
      // Meio ponto para dentro de cada lado: o contorno não fica embaixo da tecla vizinha.
      whites += `<rect class="w${cls}" data-midi="${midi}" x="${x + 0.5}" y="0.5" width="${W - 1}" height="${H - 1}" rx="3"/>` + (root ? `<text class="tonic" x="${x + W/2}" y="${H-7}" text-anchor="middle" fill="url(#tonic-grad)">T</text>` : "");
      x += W;
    } else {
      blacks += `<rect class="b${cls}" data-midi="${midi}" x="${x - BW/2}" y="0" width="${BW}" height="${BH}" rx="2"/>` + (root ? `<text class="tonic sm" x="${x}" y="${BH-5}" text-anchor="middle" fill="url(#tonic-grad)">T</text>` : "");
    }
  }
  return `<svg class="keyboard scale has-panel" viewBox="-1 ${-PANEL - 1} ${x + 2} ${H + PANEL + 2}" role="img" aria-label="${esc(t("study.keyboardAria"))}">${keyboardPanel(x)}<defs><linearGradient id="tonic-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3BD5FA"/><stop offset=".5" stop-color="#4C82F5"/><stop offset="1" stop-color="#9A5CF8"/></linearGradient></defs>${whites}${blacks}</svg>`;
}

// Teclado dos exercícios: cobre de lo a hi (em oitavas inteiras), com espaço para o número do dedo.
export function practiceKeyboardSVG(lo: number, hi: number){
  const start = lo - (((lo % 12) + 12) % 12), end = hi + (11 - hi % 12);
  const W = 26, H = 110, BW = 16, BH = 66; let whites = "", blacks = "", x = 0;
  for(let m = start; m <= end; m++){
    const pc = m % 12;
    if(WHITE.includes(pc)){ whites += `<rect class="w" data-midi="${m}" x="${x + 0.5}" y="0.5" width="${W - 1}" height="${H - 1}" rx="3"/>${pc === 0 ? `<text class="oct" x="${x + W/2}" y="${H - 6}">C${Math.floor(m / 12) - 1}</text>` : ""}<text class="fing" data-f="${m}" x="${x + W/2}" y="${H - 22}"></text>`; x += W; }
    else blacks += `<rect class="b" data-midi="${m}" x="${x - BW/2}" y="0" width="${BW}" height="${BH}" rx="2"/><text class="fing light" data-f="${m}" x="${x}" y="${BH - 10}"></text>`;
  }
  // Largura mínima pelo número de teclas (cada branca com pelo menos 22px): até duas oitavas cabem
  // num celular em pé; mais que isso, o teclado rola e acompanha as notas.
  return `<svg class="keyboard practice has-panel" style="min-width:${Math.round(x / W * 22)}px" viewBox="-1 ${-PANEL - 1} ${x + 2} ${H + PANEL + 2}" role="img" aria-label="${esc(t("study.keyboardAria"))}">${keyboardPanel(x)}${whites}${blacks}</svg>`;
}

// Grau e função de um acorde no tom (quando é diatônico).
export function chordInKey(symbol: string, key: string): {degree: string; fn: Fn | ""; diatonic: boolean} | null {
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
