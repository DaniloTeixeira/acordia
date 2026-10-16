// Instrumentos: afinações, leitura de acordes e geração de posições (diagramas) para cordas.
// Tudo puro, sem DOM, para testar no Node.
import { NOTES, noteName } from "./core";

export interface Instrument {
  kind: "keys" | "strings"; strings: number[]; frets: number; names: string[];
  arpeggio?: boolean; inversion?: number; mute?: number;
}
export type InstrumentId = "keys" | "guitar" | "bass" | "ukulele" | "cavaco";
// Cordas da mais grave para a mais aguda, em MIDI. Ukulele é reentrante (G4 acima do C4).
export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  keys:    {kind:"keys", strings:[], frets:0, names:[]},
  guitar:  {kind:"strings", strings:[40,45,50,55,59,64], frets:15, names:["E","A","D","G","B","E"]},
  bass:    {kind:"strings", strings:[28,33,38,43],       frets:15, names:["E","A","D","G"], arpeggio:true},
  ukulele: {kind:"strings", strings:[67,60,64,69],       frets:12, names:["G","C","E","A"], inversion:0.5, mute:4},
  cavaco:  {kind:"strings", strings:[62,67,71,74],       frets:12, names:["D","G","B","D"], inversion:1, mute:4}
};
export const INSTRUMENT_IDS = Object.keys(INSTRUMENTS) as InstrumentId[];
export const isInstrument = (v: unknown): v is InstrumentId => typeof v === "string" && v in INSTRUMENTS;

// ---------- leitura de acordes ----------
export interface Tone { iv: number; role: string; required: boolean }
export interface Chord { root: string; rootPc: number; bassPc: number; tones: Tone[]; name: string; power: boolean }
// Devolve {root, rootPc, bassPc, tones:[{iv, role, required}], name} ou null.
export function parseChord(symbol: string): Chord | null {
  const m = /^([A-G](?:##|bb|#|b)?)(.*?)(?:\/([A-G](?:##|bb|#|b)?))?$/.exec((symbol || "").trim());
  if(!m || NOTES[m[1]] === undefined) return null;
  const root = m[1], rootPc = NOTES[root];
  const s = m[2].replace(/[()]/g, "");
  const has = (re: RegExp) => re.test(s);
  const dim = has(/dim|°|º/), halfDim = has(/ø|m7b5|m7\(?b5/), aug = has(/aug|\+(?!\d)|#5/);
  const minor = !dim && (has(/^m(?!aj)/) || has(/^-/));
  const power = /^5$/.test(s);
  const tones: Tone[] = [{iv:0, role:"1", required:true}];
  if(!power){
    if(has(/sus2/)) tones.push({iv:2, role:"2", required:true});
    else if(has(/sus4?/)) tones.push({iv:5, role:"4", required:true});
    else tones.push({iv: minor || dim || halfDim ? 3 : 4, role:"3", required:true});
  }
  const fifth = dim || halfDim || has(/b5/) ? 6 : aug ? 8 : 7;
  tones.push({iv:fifth, role:"5", required: fifth !== 7});
  // Sétima: 7M/maj7 -> maior; °7 -> diminuta; 7 -> menor. 6 é sexta.
  const body = s.replace(/^m(?!aj)/, "");
  if(/7M|maj7|M7|Δ/.test(s)) tones.push({iv:11, role:"7", required:true});
  else if(dim && /7/.test(s)) tones.push({iv:9, role:"7", required:true});
  else if(halfDim || /7/.test(body) || /9|11|13/.test(body) && !/add/.test(body) && !/6/.test(body)) tones.push({iv:10, role:"7", required:true});
  if(/6/.test(body) && !/b6/.test(body)) tones.push({iv:9, role:"6", required:true});
  if(/9/.test(body)) tones.push({iv: /b9/.test(body) ? 13 : /#9/.test(body) ? 15 : 14, role:"9", required:false});
  if(/11/.test(body)) tones.push({iv: /#11/.test(body) ? 18 : 17, role:"11", required:false});
  if(/13/.test(body)) tones.push({iv:21, role:"13", required:false});
  const bassPc = m[3] && NOTES[m[3]] !== undefined ? NOTES[m[3]] : rootPc;
  return {root, rootPc, bassPc, tones, name: symbol.trim(), power};
}
export function chordNotes(c: Chord, key?: string): string[] {
  return c.tones.map(x => noteName(c.rootPc + x.iv, key || c.root + (c.tones[1] && c.tones[1].iv === 3 ? "m" : "")));
}

// ---------- posições em instrumentos de corda ----------
// Uma posição: frets[i] = casa (0 = solta, -1 = abafada), da corda mais grave para a mais aguda.
export interface Voicing { frets: number[]; score: number; barre: boolean; base: number }
function evalShape(frets: number[], inst: Instrument, chord: Chord): Voicing | null {
  const sounding = frets.map((f, i) => f < 0 ? null : inst.strings[i] + f);
  const notes = sounding.filter((n): n is number => n !== null);
  if(notes.length < Math.min(3, inst.strings.length - 1)) return null;
  const pcs = new Set(notes.map(n => n % 12));
  const rel = new Set([...pcs].map(p => (p - chord.rootPc + 12) % 12));
  for(const tn of chord.tones) if(tn.required && !rel.has(tn.iv % 12)) return null;
  for(const p of rel) if(!chord.tones.some(tn => tn.iv % 12 === p)) return null;
  const fretted = frets.filter(f => f > 0);
  const min = fretted.length ? Math.min(...fretted) : 0, max = fretted.length ? Math.max(...fretted) : 0;
  if(max - min > 3) return null;
  // Dedos: com pestana na casa mais baixa, as cordas nela contam como um dedo.
  const atMin = frets.filter(f => f === min && f > 0).length;
  let fingers = fretted.length, barre = false;
  if(fingers > 4){
    if(atMin < 2 || fingers - atMin + 1 > 4) return null;
    // A pestana cobre da primeira à última corda na casa mais baixa: nenhuma corda solta ou abafada no meio.
    const first = frets.indexOf(min), last = frets.lastIndexOf(min);
    if(frets.slice(first, last + 1).some(f => f < min)) return null;
    fingers = fingers - atMin + 1; barre = true;
  }
  // Pestana que não começa na corda mais grave tocada é desconfortável.
  const barrePenalty = barre && frets.slice(0, frets.indexOf(min)).some(f => f > min) ? 3 : 0;
  let score = 0;
  const lowest = Math.min(...notes) % 12;
  if(lowest !== chord.bassPc) score += inst.inversion ?? 7;
  let seenSound = false;
  frets.forEach(f => { if(f < 0){ score += seenSound ? 9 : (inst.mute ?? 1); } else seenSound = true; });
  score += barrePenalty;
  const missing = chord.tones.filter(tn => !tn.required && !rel.has(tn.iv % 12)).length;
  score += missing * 1.2 + (max - min) * 1.1 + min * 0.6 + (barre ? 1.6 : 0);
  // Cordas soltas ajudam só em posições baixas (acordes "abertos").
  if(max <= 4) score -= frets.filter(f => f === 0).length * 0.45;
  return {frets, score, barre, base: min};
}
export function voicings(symbol: string | Chord, instId: string = "guitar", limit = 3): Voicing[] {
  const inst = isInstrument(instId) ? INSTRUMENTS[instId] : null, chord = typeof symbol === "string" ? parseChord(symbol) : symbol;
  if(!inst || inst.kind !== "strings" || !chord) return [];
  const pcsOk = (n: number) => chord.tones.some(tn => (n - chord.rootPc - tn.iv) % 12 === 0);
  const found = new Map<string, Voicing>();
  for(let start = 0; start <= inst.frets - 3; start++){
    const options = inst.strings.map(open => {
      const o = [-1];
      if(pcsOk(open)) o.push(0);
      for(let f = Math.max(1, start); f <= start + 3; f++) if(pcsOk(open + f)) o.push(f);
      return o;
    });
    const rec = (i: number, acc: number[]) => {
      if(i === options.length){
        const r = evalShape(acc, inst, chord);
        if(r){ const k = acc.join(","); if(!found.has(k) || found.get(k)!.score > r.score) found.set(k, r); }
        return;
      }
      for(const f of options[i]) rec(i + 1, acc.concat(f));
    };
    rec(0, []);
  }
  return [...found.values()].sort((a, b) => a.score - b.score).slice(0, limit);
}
export function shapeText(v: Voicing): string { return v.frets.map(f => f < 0 ? "x" : String(f)).join(v.frets.some(f => f > 9) ? "-" : ""); }

// ---------- capotraste ----------
const EASY_MAJOR: Record<string, string[]> = {guitar:["C","G","D","A","E"], ukulele:["C","G","F","D","A"], cavaco:["D","G","C","A","E"]};
const EASY_MINOR: Record<string, string[]> = {guitar:["Am","Em","Dm"], ukulele:["Am","Dm","Em"], cavaco:["Em","Am","Bm"]};
// Sugere capo para tocar `key` com desenhos fáceis no instrumento. Devolve {capo, shapeKey} ou null.
export function suggestCapo(key: string, instId = "guitar"): {capo: number; shapeKey: string} | null {
  const easyM = EASY_MAJOR[instId], easym = EASY_MINOR[instId];
  if(!easyM) return null;
  const m = /^([A-G][#b]?)(m?)$/.exec(key || ""); if(!m) return null;
  const minor = m[2] === "m", pc = NOTES[m[1]], list = minor ? easym : easyM;
  for(let capo = 0; capo <= 7; capo++){
    const shape = list.find(k => (NOTES[k.replace("m", "")] + capo) % 12 === pc);
    if(shape) return capo ? {capo, shapeKey: shape} : null;
  }
  return null;
}
