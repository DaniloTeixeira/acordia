// Monta as folhas A4 como listas de operações de desenho (texto e linhas), usadas pelo SVG e pelo PDF.
// Não depende do DOM: a medição de texto vem de fora (`measure`), para poder testar no Node.
import { lineToDegrees, lineTranspose, transition, mapLineTokens, chordToDegree, transposeChord, type Block, type LineItem, type DegreeStyle } from "./core";
import { t } from "./i18n";
import type { Options } from "./types";

// Margem pequena (≈6 mm, o que a maioria das impressoras alcança) para aproveitar o A4.
export const PW = 595.28, PH = 841.89, M = 17, GAP = 18, CW = 0.632;
const TITLE_SIZE = 14, META_SIZE = 8.5, TRANS_SIZE = 9.5, TITLE_LH = TITLE_SIZE + 2, BOLD = 1.08;
type RGB = [number, number, number];
const INK: RGB = [17,17,17], CHORD: RGB = [176,32,26], ACCENT: RGB = [31,78,121], MUTED: RGB = [96,104,116], RULE: RGB = [205,205,205];
// Chip do momento ao lado do título: Louvor em verde, Pós-pregação em laranja (cores claras, boas para imprimir).
const CHIP_SIZE = 9.5, CHIP_PX = 6, CHIP_H = CHIP_SIZE + 4;
const CHIP_LOUVOR: [RGB, RGB] = [[220,252,231], [21,110,52]], CHIP_POS: [RGB, RGB] = [[255,237,213], [176,72,8]];
// Refrão: fundo azul bem claro (aparece na impressão sem gastar tinta) com o rótulo na cor dos títulos.
const CHORUS_BG: RGB = [234,241,251], CHORUS_PAD = 5, CHORUS_LBL = META_SIZE + 5;

export type Font = "mono" | "sans" | "lex";
export type Measure = (text: string, fs: number, font: Font) => number;
export interface ChordHit { pos: number; len: number; chord: string }
export interface TextOp { t: "text"; x: number; y: number; s: number; f: Font; b: boolean; c: RGB; txt: string; chords?: ChordHit[]; key?: string }
export interface LineOp { t: "line"; x1: number; x2: number; y?: number; y1?: number; y2?: number; c: RGB; w: number; v?: boolean }
// Retângulo de cantos redondos preenchido (o fundo do chip de Louvor / Pós-pregação).
export interface RectOp { t: "rect"; x: number; y: number; w: number; h: number; r: number; c: RGB }
export type Op = TextOp | LineOp | RectOp;
export type Page = Op[];

export type SheetMode = "cifras" | "graus" | "letra";
export interface SongMeta { bpm?: string; capo?: string; singer?: string; solo?: string; notes?: string; moment?: string }
// Música pronta para a folha: blocos, tom, tom de execução e deslocamento.
export interface SheetSong {
  title: string; blocks: Block[]; key: string; target: string; shift: number;
  // gpos: "Pós-pregação" quando o medley inteiro é pós-pregação (a folha põe junto do nome do medley).
  meta?: SongMeta; group?: string; gname?: string; gpos?: string;
  // chorus[i]: o bloco i é refrão (fundo claro e o rótulo REFRÃO em cima, para achar rápido).
  chorus?: boolean[];
}
export interface LayoutOpts extends Partial<Options> { mode: SheetMode; measure?: Measure }

// Medida aproximada, usada quando não há canvas (testes).
export const approxMeasure: Measure = (s, fs) => s.length * fs * 0.52;

function colWidth(columns: number){ return (PW - 2*M - GAP*(columns-1)) / columns; }

function wrapItem(it: LineItem, maxCols: number): LineItem[] {
  const len = Math.max((it.chord||"").length,(it.lyric||"").length);
  if(len <= maxCols) return [it];
  const lyr = it.lyric || "", ch = it.chord || "";
  let p = -1;
  for(let c = Math.min(maxCols, lyr.length-1); c > 4; c--){
    if(lyr[c-1]===" " && lyr[c]!==" " && (c>=ch.length || ch[c-1]===" ")) { p = c; break; }
  }
  if(p<0) return [it];
  const a: LineItem = {kind:it.kind, chord: ch.slice(0,p).replace(/\s+$/,""), lyric: lyr.slice(0,p).replace(/\s+$/,"")};
  const b: LineItem = {kind:it.kind, chord: ch.slice(p), lyric: lyr.slice(p)};
  if(!a.chord) a.kind = a.lyric ? "lyric" : a.kind;
  if(!b.chord!.trim()) { b.kind = "lyric"; delete b.chord; }
  return [a, ...wrapItem(b, maxCols)];
}
// Palco: quebra a cifra (linha de acordes + letra) em pedaços de até `max` colunas, cortando no começo
// de uma palavra onde as duas linhas têm espaço antes; o acorde segue em cima da sua sílaba.
// Devolve [início, fim) de cada pedaço. Sem lugar bom, corta a palavra (sem partir um acorde, se der):
// nunca sobra linha mais larga que a tela.
export function wrapCols(chord: string, lyric: string, max: number): [number, number][] {
  const len = Math.max(chord.length, lyric.length), out: [number, number][] = [];
  const gap = (s: string, c: number) => c >= s.length || s[c-1] === " ";
  const word = (s: string, c: number) => c < s.length && s[c] !== " ";
  max = Math.max(1, Math.floor(max));
  let at = 0;
  while(len - at > max){
    let p = -1;
    for(let c = at + max; c > at + 4; c--) if(gap(chord, c) && gap(lyric, c) && (word(chord, c) || word(lyric, c))){ p = c; break; }
    if(p < 0) for(let c = at + max; c > at; c--) if(gap(chord, c)){ p = c; break; }
    if(p < 0) p = at + max;
    out.push([at, p]); at = p;
  }
  out.push([at, len]);
  return out;
}
function wrapWords(text: string, max: number, fs: number, measure: Measure, font: Font){
  const words = text.split(" "), out: string[] = []; let cur = "";
  words.forEach(w=>{ const s = cur ? cur + " " + w : w; if(measure(s, fs, font) <= max || !cur) cur = s; else { out.push(cur); cur = w; } });
  if(cur) out.push(cur);
  return out;
}
export function lyricsOnly<T extends {blocks: Block[]}>(songs: T[]): T[] {
  return songs.map(s=>Object.assign({}, s, {blocks: s.blocks
    .map(b=>b.filter(it=>it.lyric!==undefined).map(it=>({kind:"lyric" as const, lyric: it.lyric!.replace(/_+/g,"").replace(/\s+/g," ").trim()})).filter(it=>it.lyric))
    .filter(b=>b.length)}));
}
type KeyedSong = Pick<SheetSong, "key" | "shift" | "target">;
export function chordText(line: string, s: KeyedSong, mode: SheetMode, style?: DegreeStyle){
  return mode==="graus" ? lineToDegrees(line, s.key, style) : lineTranspose(line, s.shift, s.target);
}
// Linha de cifra pronta para exibir e, para cada acorde, a posição e o acorde que de fato soa.
export function chordLine(line: string, s: KeyedSong, mode: SheetMode, style?: DegreeStyle): {text: string; chords: ChordHit[]} {
  const sound = (src: string) => s.shift ? transposeChord(src, s.shift, s.target) : src;
  const r = mapLineTokens(line, mode === "graus" ? tok => chordToDegree(tok, s.key, style) : sound);
  return {text: mode === "graus" || s.shift ? r.text : line, chords: r.tokens.map(k => ({pos:k.pos, len:k.len, chord: sound(k.src)}))};
}
function playKey(s: SheetSong){ return s.target || s.key; }
// Dica de transição para a próxima música: só entre músicas emendadas do mesmo medley (entre avulsas há
// pausa, fala ou pregação). Ex.: "Próxima em Am · acorde de passagem: E7".
export function transitionLine(s: SheetSong, next: SheetSong | undefined, mode: SheetMode){
  if(!next || mode === "letra" || !s.group || s.group !== next.group) return "";
  const tr = transition(playKey(s), playKey(next));
  if(!tr || tr.same) return "";
  return t("sheet.next", {key: playKey(next)}) + (tr.passing ? "  ·  " + t("sheet.passing", {chord: mode === "graus" ? "V7" : tr.passing}) : "");
}
function metaLine(s: SheetSong, mode: SheetMode){
  const m = s.meta || {}, parts: string[] = [];
  if(mode !== "letra"){ if(m.bpm) parts.push(t("sheet.bpm", {n:m.bpm})); if(m.capo) parts.push(t("sheet.capo", {n:m.capo})); }
  if(m.singer) parts.push(t("sheet.voice", {name:m.singer}));
  if(mode !== "letra" && m.solo) parts.push(t("sheet.solo", {name:m.solo}));
  if(m.notes) parts.push(m.notes);
  return parts.join("  ·  ");
}

export function layout(songs: SheetSong[], fs: number, k: number, opts: LayoutOpts): {pages: Page[]; tooWide: boolean} {
  const mode = opts.mode, L = mode === "letra", columns = opts.columns === 1 ? 1 : 2, measure = opts.measure || approxMeasure;
  const COLW = colWidth(columns), maxCols = Math.floor(COLW/(CW*fs));
  const CH = fs*1.05, LY = L ? fs*(1.15+0.25*k) : fs*1.32*k, CO = fs*1.5*k, BG = L ? fs*1.3*k : fs*0.95*k, TH = TITLE_SIZE + 13, SG = 12*k;
  const pages: Page[] = [[]]; let page = 0, col = 0, y = M, tooWide = false;
  const usedCols = [0];
  const x = () => M + col*(COLW+GAP);
  const bottom = PH - M;
  const push = (op: Op) => pages[page].push(op);
  function itemH(it: LineItem){ return it.kind==="pair" ? CH+LY : it.kind==="chord" ? CO : LY; }
  function nextCol(){
    col++; y = M;
    if(col >= columns){ col = 0; page++; pages[page] = []; usedCols[page] = 0; }
    usedCols[page] = Math.max(usedCols[page], col);
  }
  songs.forEach((s, si)=>{
    const blocks = s.blocks.map(b=>b.flatMap(it=>L
      ? wrapWords(it.lyric!, COLW*0.97, fs, measure, "lex").map(txt=>({kind:"lyric" as const, lyric:txt}))
      : wrapItem(it, maxCols)));
    if(!L) blocks.forEach(b=>b.forEach(it=>{ if(Math.max((it.chord||"").length,(it.lyric||"").length) > maxCols) tooWide = true; }));
    const meta = metaLine(s, mode);
    const metaLines = meta ? wrapWords(meta, COLW, META_SIZE, measure, "sans") : [];
    // Rótulo do medley e título quebram dentro da coluna (em negrito o texto é mais largo que a medida).
    const groupLines = s.group && (si === 0 || songs[si-1].group !== s.group)
      ? wrapWords((t("sheet.medleyLabel", {name: s.gname || ""}) + (s.gpos ? " · " + s.gpos : "")).toUpperCase(), COLW/BOLD, META_SIZE, measure, "sans") : [];
    const keyTag = opts.showKey && !L && playKey(s) ? "  (" + playKey(s) + ")" : "";
    // Momento como chip logo depois do nome: a última linha do título guarda espaço para ele.
    const moment = s.meta?.moment || "", chipW = moment ? measure(moment, CHIP_SIZE, "sans") * BOLD + CHIP_PX * 2 : 0;
    const titleFont: Font = L ? "lex" : "sans", titleText = s.title.toUpperCase() + keyTag;
    let titleLines = wrapWords(titleText, COLW/BOLD, TITLE_SIZE, measure, titleFont);
    const lastW = () => measure(titleLines[titleLines.length - 1], TITLE_SIZE, titleFont) * BOLD;
    const chipOwnLine = !!moment && lastW() + 8 + chipW > COLW;
    const groupH = groupLines.length ? groupLines.length * (META_SIZE + 3) + 2 : 0;
    const headH = groupH + TH + (titleLines.length - 1 + (chipOwnLine ? 1 : 0)) * TITLE_LH + metaLines.length * (META_SIZE + 3);
    const firstH = blocks.length ? blocks[0].reduce((h,it)=>h+itemH(it),0) : 0;
    if(si>0) y += SG;
    if(y + headH + firstH > bottom && y > M) nextCol();
    // Primeira música de um medley: rótulo com o nome do medley acima do título.
    groupLines.forEach(txt => { push({t:"text",x:x(),y:y+META_SIZE*0.8,s:META_SIZE,f:"sans",b:true,c:ACCENT,txt}); y += META_SIZE + 3; });
    if(groupLines.length) y += 2;
    titleLines.forEach((txt, ti) => { if(ti){ y += TITLE_LH; } push({t:"text",x:x(),y:y+TITLE_SIZE*0.85,s:TITLE_SIZE,f:titleFont,b:true,c:ACCENT,txt}); });
    if(moment){
      // Na mesma linha do fim do título; se não couber, na linha de baixo, à esquerda.
      if(chipOwnLine) y += TITLE_LH;
      const [bg, fg] = moment === t("item.momentPos") ? CHIP_POS : CHIP_LOUVOR;
      // Centrado na altura das maiúsculas do título (base em 0,85 e meio da maiúscula ≈ 0,36 acima dela), o que
      // deixa uns 6 pt até a linha embaixo do título.
      const cx = x() + (chipOwnLine ? 0 : lastW() + 8), cy = y + TITLE_SIZE * (0.85 - 0.36) - CHIP_H / 2;
      push({t:"rect",x:cx,y:cy,w:chipW,h:CHIP_H,r:CHIP_H/2,c:bg});
      push({t:"text",x:cx+CHIP_PX,y:cy+CHIP_H/2+CHIP_SIZE*0.35,s:CHIP_SIZE,f:"sans",b:true,c:fg,txt:moment});
    }
    push({t:"line",x1:x(),x2:x()+COLW,y:y+TITLE_SIZE+6,c:ACCENT,w:0.9});
    y += TH;
    metaLines.forEach(txt=>{ push({t:"text",x:x(),y:y+META_SIZE*0.8,s:META_SIZE,f:"sans",b:false,c:MUTED,txt}); y += META_SIZE + 3; });
    blocks.forEach((b, bi)=>{
      const ch = !!s.chorus?.[bi], body = b.reduce((h,it)=>h+itemH(it),0) + (ch ? CHORUS_LBL : 0);
      const h = body + (bi?BG:0);
      if(y + h > bottom && y > M + TH) nextCol(); else if(bi) y += BG;
      if(ch){
        // O fundo vem antes do texto (fica atrás); não passa do fim da coluna se o bloco for mais alto que ela.
        push({t:"rect",x:x()-CHORUS_PAD,y:y-CHORUS_PAD+1,w:COLW+CHORUS_PAD*2,h:Math.min(body, bottom - y)+CHORUS_PAD*2-2,r:4,c:CHORUS_BG});
        push({t:"text",x:x(),y:y+META_SIZE*0.8,s:META_SIZE,f:"sans",b:true,c:ACCENT,txt:t("sheet.chorus").toUpperCase()});
        y += CHORUS_LBL;
      }
      b.forEach(it=>{
        if(y + itemH(it) > bottom) nextCol();
        if(it.chord!==undefined && it.chord!==null){
          const cl = chordLine(it.chord, s, mode, opts.degreeStyle);
          push({t:"text",x:x(),y:y+fs*0.82,s:fs,f:"mono",b:true,c:CHORD,txt:cl.text, chords:cl.chords, key:playKey(s)});
          y += it.kind==="pair" ? CH : CO;
        }
        if(it.lyric!==undefined){
          push({t:"text",x:x(),y:y+fs*0.82,s:fs,f:L?"lex":"mono",b:false,c:INK,txt:it.lyric});
          y += LY;
        }
      });
    });
    const txt = opts.transitions ? transitionLine(s, songs[si+1], mode) : "";
    if(txt){
      {
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

export interface FitResult { pages: Page[]; fs: number; warn: string | null; columns?: 1 | 2 }
// Colunas "auto": usa 1 coluna quando o medley cabe numa página com letra confortável; senão, 2.
const AUTO_ONE_COLUMN_MIN = 12.5;
export function fit(songs: SheetSong[], opts: LayoutOpts): FitResult {
  if(opts.columns !== "auto") return fitColumns(songs, opts);
  const one = fitColumns(songs, Object.assign({}, opts, {columns:1 as const, maxPages:1 as const}));
  if(!one.warn && one.fs >= AUTO_ONE_COLUMN_MIN) return Object.assign(one, {columns:1 as const});
  return Object.assign(fitColumns(songs, Object.assign({}, opts, {columns:2 as const})), {columns:2 as const});
}
// Repertório: cada música avulsa começa numa folha própria e cada medley fica junto na sua folha.
// Músicas seguidas do mesmo medley (mesmo group) formam um bloco; cada bloco é ajustado sozinho.
export function fitSetlist(songs: SheetSong[], opts: LayoutOpts): FitResult {
  const units: SheetSong[][] = [];
  songs.forEach((s, i) => { if(i && s.group && s.group === songs[i-1].group) units[units.length-1].push(s); else units.push([s]); });
  if(units.length < 2) return fit(songs, opts);
  const parts = units.map(u => fit(u, opts));
  return {pages: parts.flatMap(r => r.pages), fs: Math.min(...parts.map(r => r.fs)), warn: parts.find(r => r.warn)?.warn || null};
}
// Escolhe o maior tamanho de letra que cabe em 1 página (ou 2, se permitido) e espalha o espaçamento.
function fitColumns(songs: SheetSong[], opts: LayoutOpts): FitResult {
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
  let best: {fs: number; p: number} | null = null;
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

function esc(s: string){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
export function toSVG(ops: Page, label?: string){
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW} ${PH}" role="img" aria-label="${esc(label||"Folha")}">`;
  ops.forEach(o=>{
    const col = `rgb(${o.c.join(",")})`;
    if(o.t==="rect"){
      s += `<rect x="${o.x.toFixed(2)}" y="${o.y.toFixed(2)}" width="${o.w.toFixed(2)}" height="${o.h.toFixed(2)}" rx="${o.r.toFixed(2)}" fill="${col}"/>`;
    } else if(o.t==="text"){
      const fam = o.f==="mono" ? `AHMono,'Courier New',monospace` : o.f==="lex" ? `Lexend,AHSans,sans-serif` : `AHSans,Helvetica,Arial,sans-serif`;
      s += `<text x="${o.x}" y="${o.y}" font-family="${fam}" font-size="${o.s}" font-weight="${o.b?700:400}" fill="${col}" style="white-space:pre">${esc(o.txt)}</text>`;
      // Áreas clicáveis sobre cada acorde (a fonte é monoespaçada).
      if(o.chords) o.chords.forEach(c => { s += `<rect class="hit" data-chord="${esc(c.chord)}" data-key="${esc(o.key || "")}" x="${(o.x + c.pos*CW*o.s).toFixed(2)}" y="${(o.y - o.s*0.9).toFixed(2)}" width="${(Math.max(c.len, 1)*CW*o.s).toFixed(2)}" height="${(o.s*1.15).toFixed(2)}" fill="transparent"/>`; });
    } else if(o.v){
      s += `<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${col}" stroke-width="${o.w}"/>`;
    } else {
      s += `<line x1="${o.x1}" y1="${o.y}" x2="${o.x2}" y2="${o.y}" stroke="${col}" stroke-width="${o.w}"/>`;
    }
  });
  return s + "</svg>";
}
