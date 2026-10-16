// Funções puras: parser de cifras, graus, transposição, detecção de tom, teoria (escalas e campo
// harmônico) e geração de perguntas do treino. Sem DOM, para rodar no navegador e nos testes.
import { t, getLang, ordinal } from "./i18n.js";

export const NOTES = {C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11};
export const KEYS = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
export const MINOR_KEYS = ["Cm","C#m","Dm","Ebm","Em","Fm","F#m","Gm","G#m","Am","Bbm","Bm"];
export const ALL_KEYS = [...KEYS, ...MINOR_KEYS];
// Sufixo só com peças reais de acorde, para palavras como "Amo", "Dois" e "Dia" não virarem cifra.
export const CHORD_RE = /^[A-G][#b]?(?:m(?!aj))?(?:maj|M|dim|aug|sus|add|°|º|\+|-|[#b]?\d{1,2}|\(|\))*(?:\/[A-G][#b]?)?$/;

// ---------- tons ----------
export function parseKey(k){
  const m = /^([A-G][#b]?)(m?)$/.exec(k || "");
  if(!m || NOTES[m[1]] === undefined) return null;
  return {root: m[1], minor: m[2] === "m", pc: NOTES[m[1]]};
}
const FLAT_MAJOR = new Set(["F","Bb","Eb","Ab","Db","Gb"]);
const FLAT_MINOR = new Set(["D","G","C","F","Bb","Eb"]);
export function prefersFlats(key){
  const k = parseKey(key); if(!k) return false;
  return k.root.includes("b") || (k.minor ? FLAT_MINOR : FLAT_MAJOR).has(k.root);
}
const SHARP_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLAT_NAMES = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
export function noteName(pc, key){ return (prefersFlats(key) ? FLAT_NAMES : SHARP_NAMES)[((pc % 12) + 12) % 12]; }
export function keyShift(from, to){
  const a = parseKey(from), b = parseKey(to);
  return a && b ? (b.pc - a.pc + 12) % 12 : 0;
}

// ---------- parsing ----------
export function isChordLine(line){
  const toks = line.split(/\s+/).map(t=>t.replace(/[()|]/g,"")).filter(Boolean);
  return toks.length>0 && toks.every(t=>CHORD_RE.test(t));
}
function cleanLine(l){
  return l.replace(/\t/g,"    ").replace(/\(?\briff\s*\d*\)?/gi, m=>" ".repeat(m.length)).replace(/\s+$/,"");
}
function normInterlude(line){
  const toks = line.replace(/[()|]/g," ").split(/\s+/).filter(Boolean);
  return /^\s*\(/.test(line) ? "( " + toks.join("  ") + " )" : null;
}
export function parseSong(text, plain){
  const raw = text.replace(/\r/g,"").split("\n");
  let i = 0; while(i<raw.length && !raw[i].trim()) i++;
  const title = (raw[i]||"").trim(); i++;
  const lines = raw.slice(i).filter(l=>!/^\s*\[.*\]\s*$/.test(l) && !/^\s*[eEBGDA]\|/.test(l)).map(cleanLine);
  const blocks = []; let cur = [];
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
export function dedupeBlocks(songs){
  return songs.map(s=>{
    const seen = new Set();
    return Object.assign({}, s, {blocks:s.blocks.filter(b=>{
      const k = b.map(it=>(it.chord||"").replace(/\s+/g," ").trim()+"|"+(it.lyric||"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"")).join("/");
      if(seen.has(k)) return false; seen.add(k); return true;
    })});
  });
}
export function songTitle(t){ return ((t||"").split("\n").find(l=>l.trim())||"").trim(); }
export function chordsOf(song){
  const out = [];
  song.blocks.forEach(b=>b.forEach(it=>{ if(it.chord) it.chord.split(/[\s()|]+/).forEach(t=>{ if(CHORD_RE.test(t)) out.push(t); }); }));
  return out;
}

// ---------- graus ----------
// Intervalo em semitons -> [acidente, grau 1..7] em relação à escala maior.
const DEG = [["",1],["b",2],["",2],["b",3],["",3],["",4],["#",4],["",5],["b",6],["",6],["b",7],["",7]];
const DEG_DIM = {1:["#",1],3:["#",2],8:["#",5]};
const ROMANS = ["","I","II","III","IV","V","VI","VII"];
function degreeLabel([acc, n], lower, style){
  if(style === "arabic") return acc + n;
  const r = ROMANS[n]; return acc + (lower ? r.toLowerCase() : r);
}
export function chordToDegree(ch, key, style = "roman"){
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
export function transposeChord(ch, shift, target){
  const flats = prefersFlats(target);
  return ch.replace(/(^|\/)([A-G][#b]?)/g, (m, pre, n) => pre + (flats ? FLAT_NAMES : SHARP_NAMES)[(NOTES[n] + shift) % 12]);
}
export function lineToDegrees(line, key, style){ return mapLine(line, t => chordToDegree(t, key, style)); }
export function lineTranspose(line, shift, target){ return shift ? mapLine(line, t => transposeChord(t, shift, target)) : line; }
function mapLine(line, fn){ return mapLineTokens(line, fn).text; }
// Como mapLine, mas também diz onde cada acorde ficou na linha final (para tornar os acordes clicáveis).
export function mapLineTokens(line, fn){
  let out = "", end = 0; const tokens = [];
  const re = /[^\s()|]+|[()|]/g; let t;
  while((t = re.exec(line))){
    const chord = CHORD_RE.test(t[0]), tok = chord ? fn(t[0]) : t[0];
    const pos = Math.max(t.index, end ? end + 1 : 0);
    out += " ".repeat(Math.max(0,pos-out.length));
    if(chord) tokens.push({pos: out.length, len: tok.length, src: t[0]});
    out += tok; end = out.length;
  }
  return {text: out, tokens};
}

// ---------- detecção de tom ----------
const DIATONIC_MAJOR = {0:"M",2:"m",4:"m",5:"M",7:"M",9:"m",11:"d"};
// Menor natural, aceitando também o V maior da menor harmônica.
const DIATONIC_MINOR = {0:"m",2:"d",3:"M",5:"m",7:"mM",8:"M",10:"M"};
export function detectKey(song){
  const chords = chordsOf(song);
  if(!chords.length) return "E";
  const info = chords.map(c=>{ const m = c.match(/^([A-G][#b]?)(.*?)(?:\/|$)/); const suf = m[2];
    return {r:NOTES[m[1]], q: /°|º|dim/.test(suf) ? "d" : /^m(?!aj)/.test(suf) ? "m" : "M"}; });
  const f = info[0], l = info[info.length-1];
  let best = "E", bestScore = -1;
  const score = (pc, table, tonicQ) => {
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
export function transition(fromKey, toKey){
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
const ACC = {0:"",1:"#",2:"##",10:"bb",11:"b"};
export const SCALES = {
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
export function rootFor(pc, scaleId){ return ((SCALES[scaleId] && SCALES[scaleId].minor) ? ROOTS_MINOR : ROOTS_MAJOR)[((pc%12)+12)%12]; }

export function spellScale(root, scaleId){
  const sc = SCALES[scaleId], li = LETTERS.indexOf(root[0]), pc = NOTES[root];
  if(!sc || li < 0 || pc === undefined) return [];
  return sc.iv.map((iv, i)=>{
    const L = (li + sc.letters[i]) % 7, want = (pc + iv) % 12;
    return LETTERS[L] + (ACC[(want - LETTER_PC[L] + 12) % 12] ?? "?");
  });
}
// Rótulo de cada grau da escala em relação à maior (1, 2, b3...).
export function scaleDegrees(scaleId){
  const sc = SCALES[scaleId]; if(!sc) return [];
  const major = SCALES.maior.iv;
  return sc.iv.map((iv, i)=>{ const n = sc.letters[i]; const d = iv - major[n]; return (d<0?"b":d>0?"#":"") + (n+1); });
}
const TRIADS = {"4,7":"M","3,7":"m","3,6":"d","4,8":"a"};
const TRIAD_SUFFIX = {M:"", m:"m", d:"°", a:"+"};
const SEVENTH = {
  "M,11":["7M","7M"], "M,10":["7","7"], "m,10":["m7","7"], "m,11":["m(7M)","(7M)"],
  "d,10":["m7(b5)","ø"], "d,9":["°7","°7"], "a,11":["+7M","+7M"]
};
export function harmonicField(root, scaleId, sevenths = false, style = "roman"){
  const sc = SCALES[scaleId];
  if(!sc || sc.iv.length !== 7) return [];
  const names = spellScale(root, scaleId), degs = scaleDegrees(scaleId);
  return sc.iv.map((iv, i)=>{
    const at = j => sc.iv[(i + j) % 7] + (i + j >= 7 ? 12 : 0) - iv;
    const q = TRIADS[at(2) + "," + at(4)] || "M";
    let chordSuf = TRIAD_SUFFIX[q], degSuf = q === "d" ? "°" : q === "a" ? "+" : "";
    const notes = [names[i], names[(i+2)%7], names[(i+4)%7]];
    if(sevenths){
      const s = SEVENTH[q + "," + at(6)];
      // Notação brasileira (7M) em português; internacional (maj7) em inglês.
      const intl = v => getLang() === "en" ? v.replace("7M", "maj7") : v;
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
export function relativeKey(key){
  const k = parseKey(key); if(!k) return "";
  return k.minor ? noteName(k.pc + 3, k.root) : noteName(k.pc + 9, k.root + "m") + "m";
}

// ---------- treino ----------
export const QUIZ_KINDS = ["grau","qualGrau","nota","relativa","ouvido"];
const LEVEL_ROOTS = {facil:["C","G","D","F","A"], medio:KEYS, dificil:KEYS};
function pick(arr, rng){ return arr[Math.floor(rng() * arr.length)]; }
function shuffle(arr, rng){ const a = arr.slice(); for(let i=a.length-1;i>0;i--){ const j = Math.floor(rng()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; }
function options(answer, pool, rng, n = 4){
  const rest = shuffle([...new Set(pool)].filter(x=>x!==answer), rng).slice(0, n-1);
  return shuffle([answer, ...rest], rng);
}
// Respostas sem alternativas ("lista completa"): todas as notas escritas (com b e #), as qualidades
// de tríade para montar o acorde, todos os graus usuais e todos os tons.
export const NOTE_GRID = ["b", "", "#"].map(acc => LETTERS.map(l => l + acc));
export const CHORD_QUALITIES = ["", "m", "°", "+"];
export const DEGREE_LIST = ["I","i","II","ii","ii°","bIII","III","iii","IV","iv","V","v","bVI","VI","vi","bVII","VII","vii","vii°"];
// Gera uma pergunta { kind, prompt, options, answer, full, play? }. `full` descreve a resposta sem
// alternativas: {type:"notes"} (grade de notas), {type:"chord"} (fundamental + qualidade) ou
// {type:"list", options}. `rng` deixa os testes determinísticos.
export function makeQuestion(kind, level = "facil", rng = Math.random){
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
  // ouvido
  const qualities = level === "facil" ? ["major","minor"] : ["major","minor","dim"];
  const q = pick(qualities, rng), base = NOTES[pick(KEYS, rng)];
  const shape = {major:[0,4,7], minor:[0,3,7], dim:[0,3,6]}[q];
  const label = x => t("q." + x);
  return {kind:"ouvido", prompt:t(level === "facil" ? "q.ouvidoEasy" : "q.ouvido"), answer:label(q), options:qualities.map(label), full:{type:"list", options:qualities.map(label)}, play:shape.map(p=>p+base), autoplay:true};
}

// ---------- links de referência ----------
// Só http(s), para um link importado ou compartilhado nunca virar "javascript:".
export function sanitizeUrl(v){
  if(typeof v !== "string" || !v.trim() || v.length > 600) return "";
  let s = v.trim(); if(!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  try{ const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:" ? u.href : ""; }catch(e){ return ""; }
}
// ID de vídeo do YouTube (youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/), ou "".
export function youtubeId(url){
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
export function youtubeStart(url){
  try{ const v = new URL(url).searchParams.get("t") || ""; const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/); return m ? (+(m[1]||0))*3600 + (+(m[2]||0))*60 + (+(m[3]||0)) : 0; }catch(e){ return 0; }
}

// ---------- validação de dados importados ----------
const str = v => typeof v === "string" ? v : "";
export function sanitizeEntry(r){
  if(!r || typeof r.text !== "string" || !songTitle(r.text)) return null;
  return {
    id: typeof r.id === "string" && r.id ? r.id : "",
    title: str(r.title).trim() || songTitle(r.text),
    text: r.text,
    type: r.type === "letra" ? "letra" : "",
    key: ALL_KEYS.includes(r.key) ? r.key : "",
    // `target` só existia nas bibliotecas antigas, que guardavam o tom de execução na música.
    target: ALL_KEYS.includes(r.target) ? r.target : "",
    bpm: Number.isFinite(+r.bpm) && +r.bpm > 0 && +r.bpm < 400 ? String(Math.round(+r.bpm)) : "",
    ref: sanitizeUrl(r.ref),
    arrangements: sanitizeArrangements(r.arrangements),
    updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : Date.now()
  };
}
export const DEFAULT_OPTIONS = {dedupe:true, columns:"auto", maxPages:2, minFont:9, showKey:true, transitions:true, degreeStyle:"roman"};
export function sanitizeOptions(o){
  const d = DEFAULT_OPTIONS; o = o && typeof o === "object" ? o : {};
  return {
    dedupe: typeof o.dedupe === "boolean" ? o.dedupe : d.dedupe,
    columns: o.columns === 1 || o.columns === 2 ? o.columns : "auto",
    maxPages: o.maxPages === 1 ? 1 : 2,
    minFont: Number.isFinite(o.minFont) ? Math.min(14, Math.max(7, o.minFont)) : d.minFont,
    showKey: typeof o.showKey === "boolean" ? o.showKey : d.showKey,
    transitions: typeof o.transitions === "boolean" ? o.transitions : d.transitions,
    degreeStyle: o.degreeStyle === "arabic" ? "arabic" : "roman"
  };
}
// Item de medley: referência à música e o que muda só neste medley.
export function sanitizeItem(it){
  if(!it || typeof it !== "object") return null;
  const capo = Number.isInteger(+it.capo) && +it.capo > 0 && +it.capo < 12 ? String(+it.capo) : "";
  return {target: ALL_KEYS.includes(it.target) ? it.target : "", capo, singer: str(it.singer).slice(0, 80), notes: str(it.notes).slice(0, 300),
    arrangementId: str(it.arrangementId).slice(0, 40)};
}
// Arranjos de uma música: versões nomeadas (tom, capo, observações).
export function sanitizeArrangements(list){
  if(!Array.isArray(list)) return [];
  return list.slice(0, 30).map(a => {
    if(!a || typeof a !== "object" || typeof a.id !== "string" || !a.id) return null;
    const it = sanitizeItem(a);
    return {id: a.id.slice(0, 40), name: str(a.name).trim().slice(0, 60) || "—", target: it.target, capo: it.capo, notes: it.notes};
  }).filter(Boolean);
}
