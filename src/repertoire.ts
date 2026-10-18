// Regras do repertório aberto, fora dos componentes: qual está aberto, músicas na ordem em que
// tocam (abrindo os medleys), tom/capo efetivos e as músicas prontas para a folha.
import { KEYS, MINOR_KEYS, parseSong, dedupeBlocks, detectKey, keyShift, parseKey, sanitizeOptions, transposeKey } from "./lib/core";
import { chordLine, type SheetSong } from "./lib/layout";
import { t } from "./lib/i18n";
import * as store from "./lib/store";
import { useUI } from "./state";
import type { Medley, Song, SongItem, Item, Moment } from "./lib/types";

const { data } = store;
export const isMedley = (m: Medley | null | undefined) => !!m && m.kind === "medley";

// Repertório (ou medley) aberto na página Repertório.
export function current(): Medley {
  let m = peekCurrent();
  if(!m || m.id !== data.settings.currentMedley){
    m = m || store.createMedley(t("medley.defaultName"));
    store.setSetting("currentMedley", m.id);
  }
  m.kind = isMedley(m) ? "medley" : "setlist";
  m.options = sanitizeOptions(m.options);
  return m;
}
// O mesmo repertório que current() abriria, mas sem criar um quando não há nenhum: a Biblioteca só
// consulta, e criar ali trazia de volta um "Meu repertório" logo depois de excluir o último.
export function peekCurrent(): Medley | null {
  return data.medleys.get(data.settings.currentMedley as string)
    || [...data.medleys.values()].filter(x => !isMedley(x)).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0] || null;
}
export function openMedley(id: string, {from = ""} = {}){
  store.setSetting("currentMedley", id);
  store.setSetting("returnTo", from);
  current();
  // As músicas abrem todas fechadas.
  useUI.setState({expanded: new Set()});
}

// moment: o do item no repertório (num medley, o do medley inteiro).
export interface PlayItem { it: SongItem; group: string; gname: string; moment: Moment }
// Músicas na ordem em que tocam, abrindo os medleys de um repertório.
export function songItems(m: Medley): PlayItem[] {
  const out: PlayItem[] = [];
  m.items.forEach(it => {
    if(it.type === "medley"){
      const md = data.medleys.get(it.medleyId); if(!md) return;
      md.items.forEach(x => { if(x.type !== "medley") out.push({it: x, group: it.id, gname: md.name, moment: it.moment || ""}); });
    } else out.push({it, group: isMedley(m) ? m.id : "", gname: isMedley(m) ? m.name : "", moment: it.moment || ""});
  });
  return out;
}
export const songCount = (m: Medley) => songItems(m).length;

// Arranjo: versão nomeada de uma música (tom, capo, observações), reaproveitável entre repertórios.
export function arrangementOf(s: Song, it: SongItem){ return (it.arrangementId && (s.arrangements || []).find(a => a.id === it.arrangementId)) || null; }
export function eff(s: Song, it: SongItem){
  const a = arrangementOf(s, it);
  return a ? {target: a.target || "", capo: a.capo || "", notes: a.notes || ""} : {target: it.target || "", capo: it.capo || "", notes: it.notes || ""};
}
// Tom da música: o escolhido ou o detectado pela cifra.
export const songKey = (s: Song) => s.key || (s.text.trim() ? detectKey(parseSong(s.text)) : "");
// Tom em que a última música com cifra do medley toca: a próxima entra nele por padrão.
export function lastPlayKey(m: Medley){
  for(let i = m.items.length - 1; i >= 0; i--){
    const it = m.items[i]; if(it.type === "medley") continue;
    const s = data.songs.get(it.songId); if(!s || s.type === "letra") continue;
    const k = eff(s, it).target || songKey(s); if(k) return k;
  }
  return "";
}

export interface SheetEntry extends SheetSong { auto: string; itemId: string; ref: string; meta: {bpm: string; capo: string; singer: string; solo: string; notes: string; moment: string} }
export function sheetSongs(m: Medley): SheetEntry[] {
  let list = songItems(m).map(({it, group, gname, moment}): SheetEntry | null => {
    const s = data.songs.get(it.songId); if(!s || !s.text.trim()) return null;
    const letra = s.type === "letra", p = parseSong(s.text, letra);
    if(!p.title) return null;
    const e = eff(s, it);
    const auto = letra ? "" : detectKey(p), key = letra ? "" : (s.key || auto);
    let target = letra ? "" : (e.target || ""), capo = letra ? "" : e.capo;
    const keyName = (k: {minor: boolean; pc: number}, d: number) => (k.minor ? MINOR_KEYS : KEYS)[((k.pc + d) % 12 + 12) % 12];
    // Transpor tudo: desloca o tom de cada música só na folha deste repertório.
    const off = m.options.transpose || 0;
    if(off && key){ const k = parseKey(target || key); if(k) target = keyName(k, off); }
    // Desenhos do capo: a cifra mostra o desenho tocado com capotraste e avisa o tom que soa.
    if(m.options.capoShapes && capo && key){ const real = target || key, k = parseKey(real); if(k){ target = keyName(k, -(+capo)); capo = t("sheet.capoSounds", {n: capo, key: real}); } }
    if(target === key) target = "";
    // Pós-pregação: no medley vai junto do nome do medley (uma vez só); na música avulsa, na linha de detalhes.
    const pos = moment === "pos" ? t("item.momentPos") : "";
    return Object.assign(p, {key, target, shift: target ? keyShift(key, target) : 0, auto, itemId: it.id, ref: s.ref || "", group,
      gname, gpos: group && !isMedley(m) ? pos : "",
      meta: {bpm: letra ? "" : s.bpm, capo, singer: it.singer, solo: it.solo || "", notes: e.notes, moment: group ? "" : pos}});
  }).filter((x): x is SheetEntry => !!x);
  if(m.options.dedupe) list = dedupeBlocks(list);
  return list;
}
// Acordes que soam em cada música do repertório aberto (para o treino "Do meu repertório").
export function repertoireEntries(){
  return sheetSongs(current()).filter(s => s.key).map(s => ({title: s.title, key: s.target || s.key,
    chords: s.blocks.flatMap(b => b.flatMap(it => it.chord ? chordLine(it.chord, s, "cifras").chords.map(c => c.chord) : []))}));
}
// Em quantos repertórios cada música aparece.
export function usage(){
  const u = new Map<string, number>();
  data.medleys.forEach(m => new Set(m.items.filter((i): i is SongItem => i.type !== "medley").map(i=>i.songId)).forEach(id => u.set(id, (u.get(id)||0) + 1)));
  return u;
}
export const itemSongId = (i: Item) => i.type === "medley" ? "" : i.songId;

// O link leva as músicas na ordem; as que estão num medley levam o índice do grupo (g) e o nome (groups).
export function medleyPayload(m: Medley){
  const groups: string[] = [], gi = new Map<string, number>();
  const list = songItems(m).map(({it, group, gname, moment}) => {
    const s = data.songs.get(it.songId); if(!s || !s.text.trim()) return null;
    const e = eff(s, it), o: {text: string; type: string; key: string; bpm: string; ref?: string; target: string; capo: string; singer: string; solo: string; notes: string; moment: string; g?: number} =
      {text:s.text, type:s.type, key:s.key, bpm:s.bpm, ref:s.ref, target:e.target, capo:e.capo, singer:it.singer, solo:it.solo || "", notes:e.notes, moment};
    if(group && !isMedley(m)){ if(!gi.has(group)){ gi.set(group, groups.length); groups.push(gname); } o.g = gi.get(group); }
    return o;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  return {name: m.name, options: m.options, kind: m.kind, groups, songs: list, sourceId: m.sourceId || m.id};
}

// ---------- aba Voz ----------
export interface VoiceSong { itemId: string; songId: string; title: string; key: string; target: string; singer: string; high?: number }
// Músicas com cifra do repertório aberto, para a sugestão de tom por cantor.
export function voiceSongs(): VoiceSong[] {
  return songItems(current()).map(({it}): VoiceSong | null => {
    const s = data.songs.get(it.songId); if(!s || s.type === "letra" || !s.text.trim()) return null;
    return {itemId: it.id, songId: s.id, title: s.title || "—", key: songKey(s), target: eff(s, it).target, singer: it.singer || "", high: s.high};
  }).filter((x): x is VoiceSong => !!x);
}
// Aplica o tom sugerido e o cantor no item; com arranjo escolhido, o tom vai para o arranjo (como no editor).
export function applyVoiceKey(itemId: string, target: string, singer: string){
  const found = songItems(current()).find(x => x.it.id === itemId); if(!found) return;
  const it = found.it, s = data.songs.get(it.songId), owner = [...data.medleys.values()].find(m => m.items.includes(it));
  const a = s && arrangementOf(s, it);
  if(a && s){ a.target = target; store.saveSong(s); } else it.target = target;
  it.singer = singer;
  if(owner) store.saveMedley(owner);
}
// Meio tom acima ou abaixo no tom de execução (modo palco); com arranjo escolhido, muda o arranjo.
export function shiftItemKey(itemId: string, d: number){
  const found = songItems(current()).find(x => x.it.id === itemId); if(!found) return;
  const it = found.it, s = data.songs.get(it.songId); if(!s || s.type === "letra") return;
  const key = songKey(s); if(!key) return;
  let target = transposeKey(eff(s, it).target || key, d); if(target === key) target = "";
  const a = arrangementOf(s, it);
  if(a){ a.target = target; store.saveSong(s); return; }
  it.target = target;
  const owner = [...data.medleys.values()].find(m => m.items.includes(it)); if(owner) store.saveMedley(owner);
}
// Nota mais aguda da melodia no tom original (MIDI), guardada na música.
export function setSongHigh(songId: string, v: number | undefined){
  const s = data.songs.get(songId); if(!s) return;
  if(v) s.high = v; else delete s.high;
  store.saveSong(s);
}
