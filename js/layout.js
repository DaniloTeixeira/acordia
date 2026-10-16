// Monta as folhas A4 como listas de operações de desenho (texto e linhas), usadas pelo SVG e pelo PDF.
// Não depende do DOM: a medição de texto vem de fora (`measure`), para poder testar no Node.
import { lineToDegrees, lineTranspose, transition } from "./core.js";
import { t } from "./i18n.js";

export const PW = 595.28, PH = 841.89, M = 32, GAP = 22, CW = 0.632;
const TITLE_SIZE = 14, META_SIZE = 8.5, TRANS_SIZE = 9.5;
const INK = [17,17,17], CHORD = [176,32,26], ACCENT = [31,78,121], MUTED = [96,104,116], RULE = [205,205,205];

// Medida aproximada, usada quando não há canvas (testes).
export const approxMeasure = (t, fs) => t.length * fs * 0.52;

function colWidth(columns){ return (PW - 2*M - GAP*(columns-1)) / columns; }

function wrapItem(it, maxCols){
  const len = Math.max((it.chord||"").length,(it.lyric||"").length);
  if(len <= maxCols) return [it];
  const lyr = it.lyric || "", ch = it.chord || "";
  let p = -1;
  for(let c = Math.min(maxCols, lyr.length-1); c > 4; c--){
    if(lyr[c-1]===" " && lyr[c]!==" " && (c>=ch.length || ch[c-1]===" ")) { p = c; break; }
  }
  if(p<0) return [it];
  const a = {kind:it.kind, chord: ch.slice(0,p).replace(/\s+$/,""), lyric: lyr.slice(0,p).replace(/\s+$/,"")};
  const b = {kind:it.kind, chord: ch.slice(p), lyric: lyr.slice(p)};
  if(!a.chord) a.kind = a.lyric ? "lyric" : a.kind;
  if(!b.chord.trim()) { b.kind = "lyric"; delete b.chord; }
  return [a, ...wrapItem(b, maxCols)];
}
function wrapWords(text, max, fs, measure, font){
  const words = text.split(" "), out = []; let cur = "";
  words.forEach(w=>{ const t = cur ? cur + " " + w : w; if(measure(t, fs, font) <= max || !cur) cur = t; else { out.push(cur); cur = w; } });
  if(cur) out.push(cur);
  return out;
}
export function lyricsOnly(songs){
  return songs.map(s=>Object.assign({}, s, {blocks: s.blocks
    .map(b=>b.filter(it=>it.lyric!==undefined).map(it=>({kind:"lyric", lyric: it.lyric.replace(/_+/g,"").replace(/\s+/g," ").trim()})).filter(it=>it.lyric))
    .filter(b=>b.length)}));
}
export function chordText(line, s, mode, style){
  return mode==="graus" ? lineToDegrees(line, s.key, style) : lineTranspose(line, s.shift, s.target);
}
function playKey(s){ return s.target || s.key; }
function metaLine(s, mode){
  const m = s.meta || {}, parts = [];
  if(mode !== "letra"){ if(m.bpm) parts.push(t("sheet.bpm", {n:m.bpm})); if(m.capo) parts.push(t("sheet.capo", {n:m.capo})); }
  if(m.singer) parts.push(t("sheet.voice", {name:m.singer}));
  if(m.notes) parts.push(m.notes);
  return parts.join("  ·  ");
}

// songs: [{title, blocks, key, target, shift, meta}]
// opts: {mode, columns, showKey, transitions, degreeStyle, measure}
export function layout(songs, fs, k, opts){
  const mode = opts.mode, L = mode === "letra", columns = opts.columns === 1 ? 1 : 2, measure = opts.measure || approxMeasure;
  const COLW = colWidth(columns), maxCols = Math.floor(COLW/(CW*fs));
  const CH = fs*1.05, LY = L ? fs*(1.15+0.25*k) : fs*1.32*k, CO = fs*1.5*k, BG = L ? fs*1.3*k : fs*0.95*k, TH = TITLE_SIZE + 10, SG = 12*k;
  const pages = [[]]; let page = 0, col = 0, y = M, tooWide = false;
  const usedCols = [0];
  const x = () => M + col*(COLW+GAP);
  const bottom = PH - M;
  const push = op => pages[page].push(op);
  function itemH(it){ return it.kind==="pair" ? CH+LY : it.kind==="chord" ? CO : LY; }
  function nextCol(){
    col++; y = M;
    if(col >= columns){ col = 0; page++; pages[page] = []; usedCols[page] = 0; }
    usedCols[page] = Math.max(usedCols[page], col);
  }
  songs.forEach((s, si)=>{
    const blocks = s.blocks.map(b=>b.flatMap(it=>L
      ? wrapWords(it.lyric, COLW*0.97, fs, measure, "lex").map(t=>({kind:"lyric", lyric:t}))
      : wrapItem(it, maxCols)));
    if(!L) blocks.forEach(b=>b.forEach(it=>{ if(Math.max((it.chord||"").length,(it.lyric||"").length) > maxCols) tooWide = true; }));
    const meta = metaLine(s, mode);
    const metaLines = meta ? wrapWords(meta, COLW, META_SIZE, measure, "sans") : [];
    const headH = TH + metaLines.length * (META_SIZE + 3);
    const firstH = blocks.length ? blocks[0].reduce((h,it)=>h+itemH(it),0) : 0;
    if(si>0) y += SG;
    if(y + headH + firstH > bottom && y > M) nextCol();
    const keyTag = opts.showKey && !L && playKey(s) ? "  (" + playKey(s) + ")" : "";
    push({t:"text",x:x(),y:y+TITLE_SIZE*0.85,s:TITLE_SIZE,f:L?"lex":"sans",b:true,c:ACCENT,txt:s.title.toUpperCase() + keyTag});
    push({t:"line",x1:x(),x2:x()+COLW,y:y+TITLE_SIZE+3,c:ACCENT,w:0.9});
    y += TH;
    metaLines.forEach(t=>{ push({t:"text",x:x(),y:y+META_SIZE*0.8,s:META_SIZE,f:"sans",b:false,c:MUTED,txt:t}); y += META_SIZE + 3; });
    blocks.forEach((b, bi)=>{
      const h = b.reduce((h,it)=>h+itemH(it),0) + (bi?BG:0);
      if(y + h > bottom && y > M + TH) nextCol(); else if(bi) y += BG;
      b.forEach(it=>{
        if(y + itemH(it) > bottom) nextCol();
        if(it.chord!==undefined && it.chord!==null){
          push({t:"text",x:x(),y:y+fs*0.82,s:fs,f:"mono",b:true,c:CHORD,txt:chordText(it.chord, s, mode, opts.degreeStyle)});
          y += it.kind==="pair" ? CH : CO;
        }
        if(it.lyric!==undefined){
          push({t:"text",x:x(),y:y+fs*0.82,s:fs,f:L?"lex":"mono",b:false,c:INK,txt:it.lyric});
          y += LY;
        }
      });
    });
    const next = songs[si+1];
    if(opts.transitions && !L && next){
      const tr = transition(playKey(s), playKey(next));
      if(tr && !tr.same){
        const txt = `→ ${playKey(next)}: ${tr.text}` + (tr.passing ? "  ·  " + t("sheet.passing", {chord: mode==="graus" ? "V7" : tr.passing}) : "");
        const h = TRANS_SIZE + 8;
        if(y + h > bottom) nextCol();
        y += 4;
        push({t:"text",x:x(),y:y+TRANS_SIZE*0.85,s:TRANS_SIZE,f:"sans",b:true,c:ACCENT,txt:txt});
        y += TRANS_SIZE + 4;
      }
    }
  });
  pages.forEach((p, i)=>{
    for(let c = 1; c <= usedCols[i]; c++){
      const lx = M + c*(COLW+GAP) - GAP/2;
      p.push({t:"line",x1:lx,x2:lx,y1:M,y2:PH-M,c:RULE,w:0.5,v:true});
    }
  });
  return {pages, tooWide};
}

// Colunas "auto": usa 1 coluna quando o medley cabe numa página com letra confortável; senão, 2.
const AUTO_ONE_COLUMN_MIN = 12.5;
export function fit(songs, opts){
  if(opts.columns !== "auto") return fitColumns(songs, opts);
  const one = fitColumns(songs, Object.assign({}, opts, {columns:1, maxPages:1}));
  if(!one.warn && one.fs >= AUTO_ONE_COLUMN_MIN) return Object.assign(one, {columns:1});
  return Object.assign(fitColumns(songs, Object.assign({}, opts, {columns:2})), {columns:2});
}
// Escolhe o maior tamanho de letra que cabe em 1 página (ou 2, se permitido) e espalha o espaçamento.
function fitColumns(songs, opts){
  const mode = opts.mode, columns = opts.columns === 1 ? 1 : 2, COLW = colWidth(columns), measure = opts.measure || approxMeasure;
  const minFont = opts.minFont || 9, maxPages = opts.maxPages || 1;
  let maxLen = 1;
  songs.forEach(s=>s.blocks.forEach(b=>b.forEach(it=>{
    const ch = it.chord ? chordText(it.chord, s, mode, opts.degreeStyle) : "";
    maxLen = Math.max(maxLen, ch.length, (it.lyric||"").length);
  })));
  const widest = mode==="letra" ? Math.max(1e-6, ...songs.flatMap(s=>s.blocks.flatMap(b=>b.map(it=>measure(it.lyric||"", 1, "lex"))))) : 0;
  const noWrap = mode==="letra" ? COLW*0.97/widest : COLW/(CW*maxLen);
  const top = (mode==="letra" ? 18 : 15) * (columns === 1 ? 1.25 : 1);
  const start = Math.max(minFont, noWrap >= 11 ? Math.min(top, Math.floor(noWrap*4)/4) : top);
  let best = null;
  for(let p = 1; p <= maxPages && !best; p++){
    for(let fs = start; fs >= minFont; fs -= 0.25){
      const r = layout(songs, fs, 1, opts);
      if(r.pages.length <= p){ best = {fs, p}; break; }
    }
  }
  if(!best){
    const res = layout(songs, minFont, 1, opts);
    return {pages: res.pages, fs: minFont, warn: t(maxPages === 1 ? "sheet.warnFit1" : "sheet.warnFit2")};
  }
  let lo = 1, hi = 2.2;
  for(let i=0;i<18;i++){ const mid=(lo+hi)/2; if(layout(songs,best.fs,mid,opts).pages.length > best.p) hi=mid; else lo=mid; }
  const res = layout(songs, best.fs, lo, opts);
  return {pages: res.pages, fs: best.fs, warn: res.tooWide ? t("sheet.warnWide") : null};
}

function esc(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
export function toSVG(ops, label){
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW} ${PH}" role="img" aria-label="${esc(label||"Folha")}">`;
  ops.forEach(o=>{
    const col = `rgb(${o.c.join(",")})`;
    if(o.t==="text"){
      const fam = o.f==="mono" ? `AHMono,'Courier New',monospace` : o.f==="lex" ? `Lexend,AHSans,sans-serif` : `AHSans,Helvetica,Arial,sans-serif`;
      s += `<text x="${o.x}" y="${o.y}" font-family="${fam}" font-size="${o.s}" font-weight="${o.b?700:400}" fill="${col}" style="white-space:pre">${esc(o.txt)}</text>`;
    } else if(o.v){
      s += `<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${col}" stroke-width="${o.w}"/>`;
    } else {
      s += `<line x1="${o.x1}" y1="${o.y}" x2="${o.x2}" y2="${o.y}" stroke="${col}" stroke-width="${o.w}"/>`;
    }
  });
  return s + "</svg>";
}
