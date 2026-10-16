// Funções puras: parser de cifras, remoção de repetições, graus, transposição e detecção de tom.
// Funciona no navegador (window.Cifras) e no Node (require), para os testes.
(function(root){
"use strict";
const NOTES = {C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11};
const KEYS = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const ROMAN = ["I","bII","II","bIII","III","IV","#IV","V","bVI","VI","bVII","VII"];
const ROMAN_DIM = {1:"#I",3:"#II",8:"#V"};
// Sufixo só com peças reais de acorde, para palavras como "Amo", "Dois" e "Dia" não virarem cifra.
const CHORD_RE = /^[A-G][#b]?(?:m(?!aj))?(?:maj|M|dim|aug|sus|add|°|º|\+|-|[#b]?\d{1,2}|\(|\))*(?:\/[A-G][#b]?)?$/;

// ---------- parsing ----------
function isChordLine(line){
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
function parseSong(text, plain){
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
function dedupeBlocks(songs){
  return songs.map(s=>{
    const seen = new Set();
    return Object.assign({}, s, {blocks:s.blocks.filter(b=>{
      const k = b.map(it=>(it.chord||"").replace(/\s+/g," ").trim()+"|"+(it.lyric||"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"")).join("/");
      if(seen.has(k)) return false; seen.add(k); return true;
    })});
  });
}

// ---------- degrees ----------
function chordToDegree(ch, key){
  const m = ch.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
  if(!m || NOTES[m[1]]===undefined) return ch;
  const k = NOTES[key];
  let suf = m[2], iv = (NOTES[m[1]]-k+12)%12, num;
  const dim = /°|º|dim/.test(suf);
  const minor = !dim && /^m(?!aj)/.test(suf);
  if(dim){ num = (ROMAN_DIM[iv]||ROMAN[iv]).toLowerCase(); suf = suf.replace(/dim|º/g,"°"); if(!suf.includes("°")) suf = "°"+suf; }
  else if(minor){ num = ROMAN[iv].toLowerCase(); suf = suf.slice(1); }
  else num = ROMAN[iv];
  let out = num + suf;
  if(m[3] && NOTES[m[3]]!==undefined){
    // Baixo na própria fundamental do diminuto mantém a grafia sustenida (#V, não bVI).
    const bi = (NOTES[m[3]]-k+12)%12;
    out += "/" + ((dim && bi===iv && ROMAN_DIM[bi]) || ROMAN[bi]);
  }
  return out;
}
const SHARP_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLAT_NAMES = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const FLAT_KEYS = new Set(["F","Bb","Eb","Ab","Db"]);
function transposeChord(ch, shift, target){
  const names = FLAT_KEYS.has(target) ? FLAT_NAMES : SHARP_NAMES;
  return ch.replace(/(^|\/)([A-G][#b]?)/g, (m, pre, n) => pre + names[(NOTES[n] + shift) % 12]);
}
function lineToDegrees(line, key){ return mapLine(line, t => chordToDegree(t, key)); }
function lineTranspose(line, shift, target){ return shift ? mapLine(line, t => transposeChord(t, shift, target)) : line; }
function mapLine(line, fn){
  let out = "", end = 0;
  const re = /[^\s()|]+|[()|]/g; let t;
  while((t = re.exec(line))){
    const tok = CHORD_RE.test(t[0]) ? fn(t[0]) : t[0];
    const pos = Math.max(t.index, end ? end + 1 : 0);
    out += " ".repeat(Math.max(0,pos-out.length)) + tok; end = out.length;
  }
  return out;
}

// ---------- key detection ----------
const DIATONIC = {0:"M",2:"m",4:"m",5:"M",7:"M",9:"m",11:"d"};
function detectKey(song){
  const chords = [];
  song.blocks.forEach(b=>b.forEach(it=>{ if(it.chord) it.chord.split(/[\s()|]+/).forEach(t=>{ if(CHORD_RE.test(t)) chords.push(t); }); }));
  if(!chords.length) return "E";
  const info = chords.map(c=>{ const m = c.match(/^([A-G][#b]?)(.*?)(?:\/|$)/); const suf = m[2];
    return {r:NOTES[m[1]], q: /°|º|dim/.test(suf) ? "d" : /^m(?!aj)/.test(suf) ? "m" : "M"}; });
  let best = "E", bestScore = -1;
  KEYS.forEach(k=>{
    const kn = NOTES[k]; let sc = 0;
    info.forEach(c=>{ const iv = (c.r-kn+12)%12; if(DIATONIC[iv]!==undefined) sc += DIATONIC[iv]===c.q ? 1 : 0.4; });
    const f = info[0], l = info[info.length-1];
    if(f.r===kn && f.q==="M") sc += 1.5;
    if(l.r===kn && l.q==="M") sc += 1;
    if(sc > bestScore){ bestScore = sc; best = k; }
  });
  return best;
}

// ---------- library ----------
function songTitle(t){ return ((t||"").split("\n").find(l=>l.trim())||"").trim(); }
// Normaliza uma linha de biblioteca importada; devolve null se não der para usar.
function sanitizeEntry(r){
  if(!r || typeof r.text !== "string" || !songTitle(r.text)) return null;
  const str = v => typeof v === "string" ? v : "";
  const key = v => KEYS.includes(v) ? v : "";
  return {
    id: typeof r.id === "string" && r.id ? r.id : "",
    title: str(r.title).trim() || songTitle(r.text),
    text: r.text,
    type: r.type === "letra" ? "letra" : "",
    key: key(r.key),
    target: key(r.target),
    updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : Date.now()
  };
}

const api = {NOTES, KEYS, CHORD_RE, isChordLine, parseSong, dedupeBlocks, chordToDegree, transposeChord,
  lineToDegrees, lineTranspose, detectKey, songTitle, sanitizeEntry};
if(typeof module !== "undefined" && module.exports) module.exports = api; else root.Cifras = api;
})(this);
