// Funções puras: parser de cifras, graus, transposição, detecção de tom, teoria (escalas e campo
// harmônico) e geração de perguntas do treino. Sem DOM, para rodar no navegador e nos testes.
import { t, getLang, ordinal } from "./i18n";
import type { Arrangement, Options, SongEntry, ItemFields } from "./types";

export const NOTES: Record<string, number> = {C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11};
// Grafias teóricas que o campo harmônico gera (E#, B#, Fb, Cb, F##, Bbb…): mesma altura, nome certo.
([["C",0],["D",2],["E",4],["F",5],["G",7],["A",9],["B",11]] as const).forEach(([l, pc]) => {
  for(const [acc, d] of [["#",1],["##",2],["b",-1],["bb",-2]] as const) if(NOTES[l + acc] === undefined) NOTES[l + acc] = (pc + d + 12) % 12;
});
export const KEYS = ["C","Db","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
export const MINOR_KEYS = ["Cm","C#m","Dm","Ebm","Em","Fm","F#m","Gm","G#m","Am","Bbm","Bm"];
export const ALL_KEYS = [...KEYS, ...MINOR_KEYS];
// Tom vindo de dados salvos: "C#" é de antes de Dó sustenido maior virar Ré bemol (mesma altura).
export function validKey(k: unknown): string {
  const n = k === "C#" ? "Db" : k;
  return typeof n === "string" && ALL_KEYS.includes(n) ? n : "";
}
// Sufixo só com peças reais de acorde, para palavras como "Amo", "Dois" e "Dia" não virarem cifra.
export const CHORD_RE = /^[A-G][#b]?(?:m(?!aj))?(?:maj|M|dim|aug|sus|add|°|º|\+|-|[#b]?\d{1,2}|\(|\))*(?:\/[A-G][#b]?)?$/;

// ---------- tons ----------
export interface Key { root: string; minor: boolean; pc: number }
export function parseKey(k: string | null | undefined): Key | null {
  const m = /^([A-G][#b]?)(m?)$/.exec(k || "");
  if(!m || NOTES[m[1]] === undefined) return null;
  return {root: m[1], minor: m[2] === "m", pc: NOTES[m[1]]};
}
const FLAT_MAJOR = new Set(["F","Bb","Eb","Ab","Db","Gb"]);
const FLAT_MINOR = new Set(["D","G","C","F","Bb","Eb"]);
export function prefersFlats(key: string): boolean {
  const k = parseKey(key); if(!k) return false;
  return k.root.includes("b") || (k.minor ? FLAT_MINOR : FLAT_MAJOR).has(k.root);
}
const SHARP_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLAT_NAMES = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
export function noteName(pc: number, key: string): string { return (prefersFlats(key) ? FLAT_NAMES : SHARP_NAMES)[((pc % 12) + 12) % 12]; }
export function keyShift(from: string, to: string): number {
  const a = parseKey(from), b = parseKey(to);
  return a && b ? (b.pc - a.pc + 12) % 12 : 0;
}

// ---------- parsing ----------
export interface LineItem { kind: "pair" | "chord" | "lyric"; chord?: string; lyric?: string }
export type Block = LineItem[];
export interface ParsedSong { title: string; blocks: Block[] }

export function isChordLine(line: string): boolean {
  const toks = line.split(/\s+/).map(x=>x.replace(/[()|]/g,"")).filter(Boolean);
  return toks.length>0 && toks.every(x=>CHORD_RE.test(x));
}
function cleanLine(l: string){
  return l.replace(/\t/g,"    ").replace(/\(?\briff\s*\d*\)?/gi, m=>" ".repeat(m.length)).replace(/\s+$/,"");
}
function normInterlude(line: string){
  const toks = line.replace(/[()|]/g," ").split(/\s+/).filter(Boolean);
  return /^\s*\(/.test(line) ? "( " + toks.join("  ") + " )" : null;
}
export function parseSong(text: string, plain?: boolean): ParsedSong {
  const raw = text.replace(/\r/g,"").split("\n");
  let i = 0; while(i<raw.length && !raw[i].trim()) i++;
  const title = (raw[i]||"").trim(); i++;
  const lines = raw.slice(i).filter(l=>!/^\s*\[.*\]\s*$/.test(l) && !/^\s*[eEBGDA]\|/.test(l)).map(cleanLine);
  const blocks: Block[] = []; let cur: Block = [];
  for(let j=0;j<lines.length;j++){
    const l = lines[j];
    if(!l.trim()){ if(cur.length){blocks.push(cur);cur=[];} continue; }
    if(!plain && isChordLine(l)){
      const next = lines[j+1];
      const interlude = normInterlude(l);
      if(!interlude && next && next.trim() && !isChordLine(next)){ cur.push({kind:"pair",chord:l,lyric:next}); j++; }
      else cur.push({kind:"chord",chord:interlude||l});
    } else cur.push({kind:"lyric",lyric:l});
  }
  if(cur.length) blocks.push(cur);
  return {title, blocks};
}
export function dedupeBlocks<T extends {blocks: Block[]}>(songs: T[]): T[] {
  return songs.map(s=>{
    const seen = new Set<string>();
    return Object.assign({}, s, {blocks:s.blocks.filter(b=>{
      const k = b.map(it=>(it.chord||"").replace(/\s+/g," ").trim()+"|"+(it.lyric||"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"")).join("/");
      if(seen.has(k)) return false; seen.add(k); return true;
    })});
  });
}
export function songTitle(text: string | null | undefined): string { return ((text||"").split("\n").find(l=>l.trim())||"").trim(); }
export function chordsOf(song: {blocks: Block[]}): string[] {
  const out: string[] = [];
  song.blocks.forEach(b=>b.forEach(it=>{ if(it.chord) it.chord.split(/[\s()|]+/).forEach(x=>{ if(CHORD_RE.test(x)) out.push(x); }); }));
  return out;
}

// ---------- graus ----------
export type DegreeStyle = "roman" | "arabic";
// Intervalo em semitons -> [acidente, grau 1..7] em relação à escala maior.
type Deg = [string, number];
const DEG: Deg[] = [["",1],["b",2],["",2],["b",3],["",3],["",4],["#",4],["",5],["b",6],["",6],["b",7],["",7]];
const DEG_DIM: Record<number, Deg> = {1:["#",1],3:["#",2],8:["#",5]};
const ROMANS = ["","I","II","III","IV","V","VI","VII"];
function degreeLabel([acc, n]: Deg, lower: boolean, style: DegreeStyle){
  if(style === "arabic") return acc + n;
  const r = ROMANS[n]; return acc + (lower ? r.toLowerCase() : r);
}
export function chordToDegree(ch: string, key: string, style: DegreeStyle = "roman"): string {
  const m = ch.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
  const k = parseKey(key);
  if(!m || NOTES[m[1]]===undefined || !k) return ch;
  let suf = m[2]; const iv = (NOTES[m[1]]-k.pc+12)%12;
  const dim = /°|º|dim/.test(suf);
  const minor = !dim && /^m(?!aj)/.test(suf);
  let out;
  if(dim){
    suf = suf.replace(/dim|º/g,"°"); if(!suf.includes("°")) suf = "°"+suf;
    out = degreeLabel(DEG_DIM[iv]||DEG[iv], true, style) + suf;
  } else if(minor){
    suf = suf.slice(1);
    out = degreeLabel(DEG[iv], true, style) + (style === "arabic" ? "m" : "") + suf;
  } else out = degreeLabel(DEG[iv], false, style) + suf;
  if(m[3] && NOTES[m[3]]!==undefined){
    // Baixo na própria fundamental do diminuto mantém a grafia sustenida (#V, não bVI).
    const bi = (NOTES[m[3]]-k.pc+12)%12;
    out += "/" + degreeLabel((dim && bi===iv && DEG_DIM[bi]) || DEG[bi], false, style);
  }
  return out;
}
export function transposeChord(ch: string, shift: number, target: string): string {
  const flats = prefersFlats(target);
  return ch.replace(/(^|\/)([A-G][#b]?)/g, (_m, pre: string, n: string) => pre + (flats ? FLAT_NAMES : SHARP_NAMES)[(NOTES[n] + shift) % 12]);
}
export function lineToDegrees(line: string, key: string, style?: DegreeStyle){ return mapLine(line, x => chordToDegree(x, key, style)); }
export function lineTranspose(line: string, shift: number, target: string){ return shift ? mapLine(line, x => transposeChord(x, shift, target)) : line; }
function mapLine(line: string, fn: (tok: string) => string){ return mapLineTokens(line, fn).text; }
export interface LineToken { pos: number; len: number; src: string }
// Como mapLine, mas também diz onde cada acorde ficou na linha final (para tornar os acordes clicáveis).
export function mapLineTokens(line: string, fn: (tok: string) => string): {text: string; tokens: LineToken[]} {
  let out = "", end = 0; const tokens: LineToken[] = [];
  const re = /[^\s()|]+|[()|]/g; let m;
  while((m = re.exec(line))){
    const chord = CHORD_RE.test(m[0]), tok = chord ? fn(m[0]) : m[0];
    const pos = Math.max(m.index, end ? end + 1 : 0);
    out += " ".repeat(Math.max(0,pos-out.length));
    if(chord) tokens.push({pos: out.length, len: tok.length, src: m[0]});
    out += tok; end = out.length;
  }
  return {text: out, tokens};
}

// ---------- detecção de tom ----------
const DIATONIC_MAJOR: Record<number, string> = {0:"M",2:"m",4:"m",5:"M",7:"M",9:"m",11:"d"};
// Menor natural, aceitando também o V maior da menor harmônica.
const DIATONIC_MINOR: Record<number, string> = {0:"m",2:"d",3:"M",5:"m",7:"mM",8:"M",10:"M"};
export function detectKey(song: {blocks: Block[]}): string {
  const chords = chordsOf(song);
  if(!chords.length) return "E";
  const info = chords.map(c=>{ const m = c.match(/^([A-G][#b]?)(.*?)(?:\/|$)/)!; const suf = m[2];
    return {r:NOTES[m[1]], q: /°|º|dim/.test(suf) ? "d" : /^m(?!aj)/.test(suf) ? "m" : "M"}; });
  const f = info[0], l = info[info.length-1];
  let best = "E", bestScore = -1;
  const score = (pc: number, table: Record<number, string>, tonicQ: string) => {
    let sc = 0;
    info.forEach(c=>{ const want = table[(c.r-pc+12)%12]; if(want!==undefined) sc += want.includes(c.q) ? 1 : 0.4; });
    if(f.r===pc && f.q===tonicQ) sc += 1.5;
    if(l.r===pc && l.q===tonicQ) sc += 1;
    return sc;
  };
  KEYS.forEach((k, i)=>{
    const pc = NOTES[k];
    const maj = score(pc, DIATONIC_MAJOR, "M"); if(maj > bestScore){ bestScore = maj; best = k; }
    const min = score(pc, DIATONIC_MINOR, "m"); if(min > bestScore){ bestScore = min; best = MINOR_KEYS[i]; }
  });
  return best;
}

// ---------- transições entre músicas do medley ----------
// same: mesmo tom (não precisa de aviso); text já vem traduzido.
export interface Transition { semitones: number; same: boolean; text: string; passing: string | null }
export function transition(fromKey: string, toKey: string): Transition | null {
  const a = parseKey(fromKey), b = parseKey(toKey);
  if(!a || !b) return null;
  const up = (b.pc - a.pc + 12) % 12;
  if(!up && a.minor === b.minor) return {semitones:0, same:true, text:t("tr.same"), passing:null};
  const semitones = up > 6 ? up - 12 : up;
  const text = !semitones ? t("tr.tonic") : t(semitones > 0 ? "tr.up" : "tr.down", {step: t("tr.step" + Math.abs(semitones))});
  return {semitones, same:false, text, passing: noteName(b.pc + 7, toKey) + "7"};
}

// ---------- teoria: escalas e campo harmônico ----------
const LETTERS = ["C","D","E","F","G","A","B"];
const LETTER_PC = [0,2,4,5,7,9,11];
const ACC: Record<number, string> = {0:"",1:"#",2:"##",10:"bb",11:"b"};
export type Fn = "T" | "SD" | "D";
export interface Scale { iv: number[]; letters: number[]; minor: boolean; fn?: Fn[] }
export type ScaleId = "maior" | "menor" | "harmonica" | "melodica" | "pentaMaior" | "pentaMenor";
export const SCALES: Record<ScaleId, Scale> = {
  maior:      {iv:[0,2,4,5,7,9,11], letters:[0,1,2,3,4,5,6], minor:false,
               fn:["T","SD","T","SD","D","T","D"]},
  menor:      {iv:[0,2,3,5,7,8,10], letters:[0,1,2,3,4,5,6], minor:true,
               fn:["T","SD","T","SD","D","SD","D"]},
  harmonica:  {iv:[0,2,3,5,7,8,11], letters:[0,1,2,3,4,5,6], minor:true,
               fn:["T","SD","T","SD","D","SD","D"]},
  melodica:   {iv:[0,2,3,5,7,9,11], letters:[0,1,2,3,4,5,6], minor:true},
  pentaMaior: {iv:[0,2,4,7,9],      letters:[0,1,2,4,5],     minor:false},
  pentaMenor: {iv:[0,3,5,7,10],     letters:[0,2,3,4,6],     minor:true}
};
// Nomes de tônica preferidos para cada uma das 12 alturas.
export const ROOTS_MAJOR = KEYS;
export const ROOTS_MINOR = ["C","C#","D","Eb","E","F","F#","G","G#","A","Bb","B"];
const scaleOf = (id: string): Scale | undefined => SCALES[id as ScaleId];
export function rootFor(pc: number, scaleId: string): string { return (scaleOf(scaleId)?.minor ? ROOTS_MINOR : ROOTS_MAJOR)[((pc%12)+12)%12]; }

export function spellScale(root: string, scaleId: string): string[] {
  const sc = scaleOf(scaleId), li = LETTERS.indexOf(root[0]), pc = NOTES[root];
  if(!sc || li < 0 || pc === undefined) return [];
  return sc.iv.map((iv, i)=>{
    const L = (li + sc.letters[i]) % 7, want = (pc + iv) % 12;
    return LETTERS[L] + (ACC[(want - LETTER_PC[L] + 12) % 12] ?? "?");
  });
}
// Rótulo de cada grau da escala em relação à maior (1, 2, b3...).
export function scaleDegrees(scaleId: string): string[] {
  const sc = scaleOf(scaleId); if(!sc) return [];
  const major = SCALES.maior.iv;
  return sc.iv.map((iv, i)=>{ const n = sc.letters[i]; const d = iv - major[n]; return (d<0?"b":d>0?"#":"") + (n+1); });
}
const TRIADS: Record<string, string> = {"4,7":"M","3,7":"m","3,6":"d","4,8":"a"};
const TRIAD_SUFFIX: Record<string, string> = {M:"", m:"m", d:"°", a:"+"};
const SEVENTH: Record<string, [string, string]> = {
  "M,11":["7M","7M"], "M,10":["7","7"], "m,10":["m7","7"], "m,11":["m(7M)","(7M)"],
  "d,10":["m7(b5)","ø"], "d,9":["°7","°7"], "a,11":["+7M","+7M"]
};
export interface FieldChord { degree: string; name: string; notes: string[]; quality: string; fn: Fn | ""; pcs: number[] }
export function harmonicField(root: string, scaleId: string, sevenths = false, style: DegreeStyle = "roman"): FieldChord[] {
  const sc = scaleOf(scaleId);
  if(!sc || sc.iv.length !== 7) return [];
  const names = spellScale(root, scaleId), degs = scaleDegrees(scaleId);
  return sc.iv.map((iv, i)=>{
    const at = (j: number) => sc.iv[(i + j) % 7] + (i + j >= 7 ? 12 : 0) - iv;
    const q = TRIADS[at(2) + "," + at(4)] || "M";
    let chordSuf = TRIAD_SUFFIX[q], degSuf = q === "d" ? "°" : q === "a" ? "+" : "";
    const notes = [names[i], names[(i+2)%7], names[(i+4)%7]];
    if(sevenths){
      const s = SEVENTH[q + "," + at(6)];
      // Notação brasileira (7M) em português; internacional (maj7) em inglês.
      const intl = (v: string) => getLang() !== "pt" ? v.replace("7M", "maj7") : v;
      if(s){ chordSuf = intl(s[0]); degSuf = intl(s[1]); }
      notes.push(names[(i+6)%7]);
    }
    const acc = degs[i].replace(/\d/, ""), n = +degs[i].replace(/\D/g, "");
    const lower = q === "m" || q === "d";
    const degree = style === "arabic"
      ? acc + n + (q === "m" ? "m" : "") + (sevenths ? degSuf.replace(/^m/, "") : degSuf)
      : acc + (lower ? ROMANS[n].toLowerCase() : ROMANS[n]) + degSuf;
    return {degree, name: names[i] + chordSuf, notes, quality:q, fn: sc.fn ? sc.fn[i] : "",
      pcs: [0,2,4].concat(sevenths ? [6] : []).map(j => iv + at(j))};
  });
}
// ---------- montar cifra de ouvido: graus digitados ----------
// Arábico (1–7) segue a escala do tom e, sem sufixo, vira o acorde do campo harmônico ("2" em C = Dm,
// "57" = G7, "2M" = D). Romano segue a escala maior como chordToDegree, e a caixa diz a qualidade (ii = menor).
const MAJOR_STEPS = [0,2,4,5,7,9,11], MINOR_STEPS = [0,2,3,5,7,8,10];
const DEGREE_RE = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i|[1-7])/;
function keyScale(k: Key){ return k.minor ? {steps: MINOR_STEPS, names: spellScale(k.root, "menor")} : {steps: MAJOR_STEPS, names: spellScale(k.root, "maior")}; }
function triadAt(steps: number[], i: number){
  const at = (j: number) => (steps[(i + j) % 7] - steps[i] + 12) % 12;
  return at(2) === 4 ? "M" : at(4) === 6 ? "d" : "m";
}
function degreeRoot(acc: string, num: string, k: Key){
  const arabic = /\d/.test(num), n = arabic ? +num : ROMANS.indexOf(num.toUpperCase()), sc = keyScale(k);
  // Com acidente ("b7", "#4"), o número conta da escala maior, como no costume.
  const pc = (k.pc + (arabic && !acc ? sc.steps : MAJOR_STEPS)[n - 1] +(acc === "#" ? 1 : acc === "b" ? -1 : 0) + 12) % 12;
  const i = sc.steps.findIndex(s => (k.pc + s) % 12 === pc);
  const name = i >= 0 ? sc.names[i] : (acc === "b" ? FLAT_NAMES : acc === "#" ? SHARP_NAMES : prefersFlats(k.root + (k.minor ? "m" : "")) ? FLAT_NAMES : SHARP_NAMES)[pc];
  return {arabic, name, i: acc ? -1 : i};
}
export function degreeToChord(tok: string, key: string): string | null {
  const k = parseKey(key); if(!k) return null;
  const [head, bass, extra] = tok.split("/");
  const m = DEGREE_RE.exec(head); if(!m || extra !== undefined) return null;
  const r = degreeRoot(m[1], m[2], k), rest = head.slice(m[0].length);
  const explicit = /^(m(?!aj)|°|º|dim|ø|\+|aug)/.test(rest);
  let suf = rest;
  if(r.arabic){
    const q = r.i >= 0 ? triadAt(keyScale(k).steps, r.i) : "M";
    if(rest === "M") suf = "";
    else if(!explicit) suf = q === "m" ? "m" + rest : q === "d" ? (rest[0] === "7" ? "m7(b5)" + rest.slice(1) : "°" + rest) : rest;
  } else if(m[2] === m[2].toLowerCase() && !explicit) suf = "m" + rest;
  suf = suf.replace(/^ø/, "m7(b5)");
  let out = r.name + suf;
  if(bass !== undefined){
    const b = DEGREE_RE.exec(bass); if(!b || b[0] !== bass) return null;
    out += "/" + degreeRoot(b[1], b[2], k).name;
  }
  return CHORD_RE.test(out) ? out : null;
}
// O contrário, para mostrar como grau o que já está escrito: campo harmônico em arábico, o resto em romano.
export function chordToEarDegree(ch: string, key: string): string {
  const k = parseKey(key), m = ch.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
  if(!k || !m || NOTES[m[1]] === undefined) return ch;
  const sc = keyScale(k), idx = (pc: number) => sc.steps.findIndex(s => (k.pc + s) % 12 === pc);
  const i = idx(NOTES[m[1]]), suf = m[2];
  const half = /^(m7\(?b5\)?|ø)/.exec(suf), dim = /^(°|º|dim)(?!7)/.exec(suf);
  const q = half || dim ? "d" : /^m(?!aj)/.test(suf) ? "m" : /^(\+|aug)/.test(suf) ? "a" : "M";
  if(i < 0 || triadAt(sc.steps, i) !== q) return chordToDegree(ch, key, "roman");
  const rest = half ? "7" + suf.slice(half[0].length) : dim ? suf.slice(dim[0].length) : q === "m" ? suf.slice(1) : suf;
  let out = (i + 1) + rest;
  if(m[3] && NOTES[m[3]] !== undefined){ const bi = idx(NOTES[m[3]]); out += "/" + (bi >= 0 ? bi + 1 : degreeLabel(DEG[(NOTES[m[3]] - k.pc + 12) % 12], false, "roman")); }
  return out;
}
// Um acorde ou grau digitado, já como acorde no tom (null se não for nenhum dos dois).
export function resolveEarToken(tok: string, key: string): string | null {
  return CHORD_RE.test(tok) ? tok : degreeToChord(tok, key);
}

// Cada linha da letra ganha uma fileira de quadradinhos acima; cada quadradinho cobre EAR_CELL colunas.
export const EAR_CELL = 4;
// src: a linha de acordes original, devolvida igual enquanto ninguém mexer na fileira (sem regrafar A# como Bb).
export interface EarRow { cells: string[]; lyric: string | null; src?: string }
// Texto: linha mantida como está (título, linha vazia, [Refrão]).
export type EarLine = EarRow | string;
const isTag = (l: string) => /^\s*\[.*\]\s*$/.test(l) || /^\s*[eEBGDA]\|/.test(l);
export function earCellCount(lyric: string | null, used = 0){ return Math.max(lyric === null ? 8 : Math.ceil(lyric.length / EAR_CELL) + 2, used + 1, 8); }
export function chordLineToCells(line: string, lyric: string | null): string[] {
  const out: string[] = [], re = /\S+/g; let m;
  while((m = re.exec(line))){ let c = Math.floor(m.index / EAR_CELL); while(out[c]) c++; out[c] = m[0]; }
  const n = earCellCount(lyric, out.length);
  return Array.from({length: n}, (_, i) => out[i] || "");
}
export function earRows(text: string): EarLine[] {
  const raw = text.replace(/\r/g, "").split("\n"), out: EarLine[] = [];
  const ti = raw.findIndex(l => l.trim());
  for(let j = 0; j < raw.length; j++){
    const l = raw[j];
    if(j <= ti || !l.trim() || isTag(l)){ out.push(l); continue; }
    if(isChordLine(l)){
      const next = raw[j+1], lyric = next && next.trim() && !isTag(next) && !isChordLine(next) ? next : null;
      out.push({cells: chordLineToCells(l, lyric), lyric, src: l}); if(lyric !== null) j++;
    } else out.push({cells: chordLineToCells("", l), lyric: l});
  }
  return out;
}
const earTokens = (cell: string) => cell.trim().split(/\s+/).filter(Boolean);
// Um quadradinho: acorde ou grau, inteiro ("Cmaj7(#11)") ou com "(", ")" e "|" de uma passagem colados ("(C", "G)").
function earTok(tok: string, key: string, fn: (chord: string) => string): string | null {
  if(/^[()|]+$/.test(tok)) return tok;
  const c = resolveEarToken(tok, key); if(c) return fn(c);
  const m = /^([(|]*)(.*?)([)|]*)$/.exec(tok)!, inner = m[2] && resolveEarToken(m[2], key);
  return inner ? m[1] + fn(inner) + m[3] : null;
}
export function earBad(cell: string, key: string){ return earTokens(cell).some(x => earTok(x, key, c => c) === null); }
export function earCellAs(cell: string, key: string, mode: "cifras" | "graus"){
  return earTokens(cell).map(x => earTok(x, key, c => mode === "graus" ? chordToEarDegree(c, key) : c) ?? x).join(" ");
}
export function cellsToLine(cells: string[], key: string): string {
  let out = "";
  cells.forEach((cell, i) => earTokens(cell).forEach(x => {
    const tok = earTok(x, key, c => c) ?? x;
    out += " ".repeat(Math.max(i * EAR_CELL, out ? out.length + 1 : 0) - out.length) + tok;
  }));
  return out;
}
export function earText(lines: EarLine[], key: string): string {
  const out: string[] = [], chordsOf = (r: EarRow) => r.src ?? cellsToLine(r.cells, key);
  lines.forEach((l, i) => {
    if(typeof l === "string"){ out.push(l); return; }
    const c = chordsOf(l);
    if(c) out.push(c);
    if(l.lyric !== null){ out.push(l.lyric); return; }
    // Linha só de acordes logo antes de uma letra ainda sem acordes: uma linha vazia separa, senão os
    // acordes passariam a ser os daquela letra.
    const next = lines[i + 1];
    if(c && next && typeof next !== "string" && next.lyric !== null && !chordsOf(next).trim()) out.push("");
  });
  return out.join("\n");
}
// Reescreve os acordes do texto em outro tom (o título e a letra ficam iguais).
export function transposeText(text: string, shift: number, target: string): string {
  const s = ((shift % 12) + 12) % 12; if(!s) return text;
  const lines = text.split("\n"), ti = lines.findIndex(l => l.trim());
  return lines.map((l, i) => i > ti && !isTag(l) && isChordLine(l) ? lineTranspose(l, s, target) : l).join("\n");
}

export function relativeKey(key: string): string {
  const k = parseKey(key); if(!k) return "";
  return k.minor ? noteName(k.pc + 3, k.root) : noteName(k.pc + 9, k.root + "m") + "m";
}

// ---------- treino ----------
export const QUIZ_KINDS = ["grau","qualGrau","nota","relativa","ouvido","grauOuvido"];
// Graus da escala em semitons a partir da tônica.
export const DEGREE_STEPS: Record<"maior" | "menor", number[]> = {maior:[0,2,4,5,7,9,11], menor:[0,2,3,5,7,8,10]};
// Cadência I–IV–V–I (i–iv–V–i no menor) em posição fechada, em semitons a partir da tônica;
// o primeiro número de cada acorde é o baixo. Firma o tom antes de um exercício de ouvido ou de voz.
export function cadence(minor: boolean): number[][] {
  const third = minor ? 3 : 4, sixth = minor ? 8 : 9;
  return [[-12, 0, third, 7], [-7, 0, 5, sixth], [-5, -1, 2, 7], [-12, 0, third, 7]];
}
export type Level = "facil" | "medio" | "dificil";
const LEVEL_ROOTS: Record<Level, string[]> = {facil:["C","G","D","F","A"], medio:KEYS, dificil:KEYS};
type Rng = () => number;
function pick<T>(arr: T[], rng: Rng): T { return arr[Math.floor(rng() * arr.length)]; }
function shuffle<T>(arr: T[], rng: Rng): T[] { const a = arr.slice(); for(let i=a.length-1;i>0;i--){ const j = Math.floor(rng()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; }
function options(answer: string, pool: string[], rng: Rng, n = 4){
  const rest = shuffle([...new Set(pool)].filter(x=>x!==answer), rng).slice(0, n-1);
  return shuffle([answer, ...rest], rng);
}
// Respostas sem alternativas ("lista completa"): todas as notas escritas (com b e #), as qualidades
// de tríade para montar o acorde, todos os graus usuais e todos os tons.
export const NOTE_GRID = ["b", "", "#"].map(acc => LETTERS.map(l => l + acc));
export const CHORD_QUALITIES = ["", "m", "°", "+"];
export const DEGREE_LIST = ["I","i","II","ii","ii°","bIII","III","iii","IV","iv","V","v","bVI","VI","vi","bVII","VII","vii","vii°"];
export type FullAnswer = {type: "notes"} | {type: "chord"} | {type: "list"; options: string[]};
// ear: grau pelo ouvido (a cadência firma o tom da tônica e depois soa a nota pedida).
export interface Question { kind: string; prompt: string; options: string[]; answer: string; full: FullAnswer; play?: number[]; autoplay?: boolean; ear?: {tonic: number; minor: boolean; note: number} }
// Gera uma pergunta { kind, prompt, options, answer, full, play? }. `full` descreve a resposta sem
// alternativas: {type:"notes"} (grade de notas), {type:"chord"} (fundamental + qualidade) ou
// {type:"list", options}. `rng` deixa os testes determinísticos.
export function makeQuestion(kind: string, level: Level = "facil", rng: Rng = Math.random): Question {
  if(kind === "misto") kind = pick(QUIZ_KINDS, rng);
  const minorOk = level === "dificil";
  const scaleId = minorOk && rng() < 0.4 ? "menor" : "maior";
  const root = scaleId === "menor" ? rootFor(NOTES[pick(LEVEL_ROOTS[level], rng)], "menor") : pick(LEVEL_ROOTS[level], rng);
  const keyLabel = root + (scaleId === "menor" ? "m" : "");
  const field = harmonicField(root, scaleId);
  if(kind === "grau"){
    const i = Math.floor(rng()*7), c = field[i];
    const pool = field.map(x=>x.name).concat(harmonicField(rootFor(NOTES[root]+7, scaleId), scaleId).map(x=>x.name));
    return {kind, prompt:t("q.grau", {key:keyLabel, degree:c.degree}), answer:c.name, options:options(c.name, pool, rng), full:{type:"chord"}, play:c.pcs.map(p=>p+NOTES[root])};
  }
  if(kind === "qualGrau"){
    const i = Math.floor(rng()*7), c = field[i];
    return {kind, prompt:t("q.qualGrau", {key:keyLabel, chord:c.name}), answer:c.degree, options:options(c.degree, field.map(x=>x.degree), rng), full:{type:"list", options:DEGREE_LIST}, play:c.pcs.map(p=>p+NOTES[root])};
  }
  if(kind === "nota"){
    const notes = spellScale(root, scaleId), i = 1 + Math.floor(rng()*6);
    const pool = notes.concat(spellScale(rootFor(NOTES[root]+5, scaleId), scaleId));
    return {kind, prompt:t("q.nota", {ord:ordinal(i+1), root, scale:t("scale." + scaleId).toLowerCase()}), answer:notes[i], options:options(notes[i], pool, rng), full:{type:"notes"}};
  }
  if(kind === "relativa"){
    const askMinor = rng() < 0.5;
    const k = askMinor ? pick(LEVEL_ROOTS[level], rng) : rootFor(NOTES[pick(LEVEL_ROOTS[level], rng)], "menor") + "m";
    const ans = relativeKey(k);
    // Todas as respostas possíveis, com a mesma grafia que relativeKey usa.
    const all = askMinor ? KEYS.map(relativeKey) : ROOTS_MINOR.map(r => relativeKey(r + "m"));
    return {kind, prompt:t(askMinor ? "q.relMinor" : "q.relMajor", {key:k}), answer:ans, options:options(ans, all, rng), full:{type:"list", options:all}};
  }
  if(kind === "grauOuvido"){
    // A cadência firma o tom e depois soa uma nota; no fácil só 1, 3 e 5, no difícil também em tom menor.
    const minor = level === "dificil" && rng() < 0.4;
    const pool = level === "facil" ? [1, 3, 5] : [1, 2, 3, 4, 5, 6, 7];
    const n = pick(pool, rng), tonic = NOTES[pick(KEYS, rng)];
    const up = level !== "facil" && n < 5 && rng() < 0.3 ? 12 : 0;
    const labels = pool.map(String);
    return {kind, prompt:t(minor ? "q.grauOuvidoMinor" : "q.grauOuvido"), answer:String(n),
      options: level === "facil" ? labels : options(String(n), labels, rng), full:{type:"list", options:labels},
      ear:{tonic, minor, note: DEGREE_STEPS[minor ? "menor" : "maior"][n - 1] + up}, autoplay:true};
  }
  // ouvido
  const qualities = level === "facil" ? ["major","minor"] : ["major","minor","dim"];
  const q = pick(qualities, rng), base = NOTES[pick(KEYS, rng)];
  const shape = ({major:[0,4,7], minor:[0,3,7], dim:[0,3,6]} as Record<string, number[]>)[q];
  const label = (x: string) => t("q." + x);
  return {kind:"ouvido", prompt:t(level === "facil" ? "q.ouvidoEasy" : "q.ouvido"), answer:label(q), options:qualities.map(label), full:{type:"list", options:qualities.map(label)}, play:shape.map(p=>p+base), autoplay:true};
}

// ---------- voz ----------
// Classificação aproximada pela extensão (MIDI): a faixa típica mais próxima da medida.
const VOICE_TYPES: [string, number, number][] = [["baixo",40,64],["baritono",43,67],["tenor",48,72],["contralto",53,77],["mezzo",57,81],["soprano",60,84]];
export function voiceType(low: number, high: number): string {
  let best = "", dist = Infinity;
  for(const [id, lo, hi] of VOICE_TYPES){ const d = Math.abs(low - lo) + Math.abs(high - hi); if(d < dist){ dist = d; best = id; } }
  return best;
}
// Semitons para a nota mais aguda da melodia (no tom original) cair no agudo confortável do cantor.
// Fica entre -6 e +5: o cantor canta na oitava que lhe serve (ex.: homem cantando música gravada por mulher).
export function voiceShift(songHigh: number, voiceHigh: number): number { return ((voiceHigh - songHigh) % 12 + 18) % 12 - 6; }
// Tom transposto, com a grafia usual (ex.: "G" +3 → "Bb", "Em" -2 → "Dm").
export function transposeKey(key: string, shift: number): string {
  const k = parseKey(key); if(!k) return "";
  const pc = ((k.pc + shift) % 12 + 12) % 12;
  return k.minor ? rootFor(pc, "menor") + "m" : rootFor(pc, "maior");
}

// ---------- links de referência ----------
// Só http(s), para um link importado ou compartilhado nunca virar "javascript:".
export function sanitizeUrl(v: unknown): string {
  if(typeof v !== "string" || !v.trim() || v.length > 600) return "";
  let s = v.trim(); if(!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  try{ const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:" ? u.href : ""; }catch(e){ return ""; }
}
// ID de vídeo do YouTube (youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/), ou "".
export function youtubeId(url: string): string {
  try{
    const u = new URL(url), host = u.hostname.replace(/^(www|m|music)\./, "");
    let id = "";
    if(host === "youtu.be") id = u.pathname.slice(1);
    else if(host === "youtube.com" || host === "youtube-nocookie.com"){
      id = u.searchParams.get("v") || (u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/) || [])[1] || "";
    }
    return /^[\w-]{11}$/.test(id) ? id : "";
  }catch(e){ return ""; }
}
export function youtubeStart(url: string): number {
  try{ const v = new URL(url).searchParams.get("t") || ""; const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/); return m ? (+(m[1]||0))*3600 + (+(m[2]||0))*60 + (+(m[3]||0)) : 0; }catch(e){ return 0; }
}

// Treino com as músicas do repertório: entries = [{title, key (tom tocado), chords:[acordes que soam]}].
export interface RepertoireEntry { title: string; key: string; chords: string[] }
function triadOf(ch: string){
  const m = /^([A-G][#b]?)(m(?!aj)|dim|°|º|aug|\+)?/.exec(ch || "");
  if(!m) return null;
  const q = m[2] ? (m[2] === "m" ? "m" : /dim|°|º/.test(m[2]) ? "°" : "+") : "";
  return m[1] + q;
}
export function makeRepertoireQuestion(entries: RepertoireEntry[] | null | undefined, rng: Rng = Math.random): Question | null {
  const usable = (entries || []).map(e => ({...e, triads: [...new Set((e.chords || []).map(triadOf).filter((x): x is string => !!x))]})).filter(e => parseKey(e.key) && e.triads.length);
  if(!usable.length) return null;
  const e = pick(usable, rng), chord = pick(e.triads, rng), degree = chordToDegree(chord, e.key);
  const k = parseKey(e.key)!, field = harmonicField(rootFor(k.pc, k.minor ? "menor" : "maior"), k.minor ? "menor" : "maior");
  if(rng() < 0.5){
    const pool = e.triads.map(c => chordToDegree(c, e.key)).concat(field.map(f => f.degree));
    return {kind:"repertorio", prompt:t("q.repGrau", {song:e.title, key:e.key, chord}), answer:degree, options:options(degree, pool, rng),
      full:{type:"list", options: DEGREE_LIST.includes(degree) ? DEGREE_LIST : DEGREE_LIST.concat(degree)}};
  }
  const pool = e.triads.concat(field.map(f => f.name));
  return {kind:"repertorio", prompt:t("q.repAcorde", {song:e.title, key:e.key, degree}), answer:chord, options:options(chord, pool, rng), full:{type:"chord"}};
}

// ---------- validação de dados importados ----------
// Dados de fora (arquivo importado, link) chegam sem tipo; estas funções devolvem valores confiáveis.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;
const str = (v: unknown) => typeof v === "string" ? v : "";
export function sanitizeEntry(r: Raw): SongEntry | null {
  if(!r || typeof r.text !== "string" || !songTitle(r.text)) return null;
  return {
    id: typeof r.id === "string" && r.id ? r.id : "",
    title: str(r.title).trim() || songTitle(r.text),
    text: r.text,
    type: r.type === "letra" ? "letra" : "",
    key: validKey(r.key),
    bpm: Number.isFinite(+r.bpm) && +r.bpm > 0 && +r.bpm < 400 ? String(Math.round(+r.bpm)) : "",
    ref: sanitizeUrl(r.ref),
    arrangements: sanitizeArrangements(r.arrangements),
    ...(Number.isInteger(r.high) && r.high >= 36 && r.high <= 96 ? {high: r.high} : {}),
    updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : Date.now()
  };
}
export const DEFAULT_OPTIONS: Options = {dedupe:true, columns:"auto", maxPages:2, minFont:9, showKey:true, transitions:true, degreeStyle:"roman", transpose:0, capoShapes:false};
export function sanitizeOptions(o: Raw): Options {
  const d = DEFAULT_OPTIONS; o = o && typeof o === "object" ? o : {};
  return {
    dedupe: typeof o.dedupe === "boolean" ? o.dedupe : d.dedupe,
    columns: o.columns === 1 || o.columns === 2 ? o.columns : "auto",
    maxPages: o.maxPages === 1 ? 1 : 2,
    minFont: Number.isFinite(o.minFont) ? Math.min(14, Math.max(7, o.minFont)) : d.minFont,
    showKey: typeof o.showKey === "boolean" ? o.showKey : d.showKey,
    transitions: typeof o.transitions === "boolean" ? o.transitions : d.transitions,
    degreeStyle: o.degreeStyle === "arabic" ? "arabic" : "roman",
    transpose: Number.isInteger(o.transpose) && Math.abs(o.transpose) < 12 ? o.transpose : 0,
    capoShapes: o.capoShapes === true
  };
}
// Item de medley: referência à música e o que muda só neste medley.
export function sanitizeItem(it: Raw): ItemFields | null {
  if(!it || typeof it !== "object") return null;
  const capo = Number.isInteger(+it.capo) && +it.capo > 0 && +it.capo < 12 ? String(+it.capo) : "";
  return {target: validKey(it.target), capo, singer: str(it.singer).slice(0, 80), notes: str(it.notes).slice(0, 300),
    arrangementId: str(it.arrangementId).slice(0, 40)};
}
// Arranjos de uma música: versões nomeadas (tom, capo, observações).
export function sanitizeArrangements(list: Raw): Arrangement[] {
  if(!Array.isArray(list)) return [];
  return list.slice(0, 30).map((a: Raw) => {
    if(!a || typeof a !== "object" || typeof a.id !== "string" || !a.id) return null;
    const it = sanitizeItem(a)!;
    return {id: a.id.slice(0, 40), name: str(a.name).trim().slice(0, 60) || "—", target: it.target, capo: it.capo, notes: it.notes};
  }).filter((x): x is Arrangement => !!x);
}
