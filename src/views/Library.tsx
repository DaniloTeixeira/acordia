// Biblioteca: músicas salvas, repertórios e medleys, com busca, filtros, exportar e importar.
import { useDeferredValue, useState } from "react";
import { isChordLine, sanitizeEntry, sanitizeItem, sanitizeOptions } from "../lib/core";
import { t, tn, locale } from "../lib/i18n";
import * as store from "../lib/store";
import { saveBlob } from "../lib/pdf";
import { ago, norm } from "../lib/util";
import { useData, toast, openDialog, confirmDialog, go } from "../state";
import { current, isMedley, openMedley, songItems, usage, songKey } from "../repertoire";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { openRef, shareMedley } from "./Repertoire";
import type { Medley, Song, Item } from "../lib/types";

const { data } = store;
const songsN = (n: number) => tn("song", n), medleysN = (n: number) => tn("medley", n);
type Tab = "songs" | "setlists" | "medleys";

function excerpt(s: Song){
  return s.text.split("\n").slice(1).map(l=>l.trim()).filter(l=>l && !isChordLine(l) && !/^\[.*\]$/.test(l)).slice(0, 2).join(" / ");
}
export function addSongToMedley(id: string){
  const m = current(); m.items.push(store.newItem(id)); store.saveMedley(m);
  toast(t("picker.addedTo", {title: data.songs.get(id)!.title, medley: m.name}), {label:t("common.see"), run:()=>go("medley")});
}
function deleteSong(s: Song){
  let n = 0;
  data.medleys.forEach(m => { const before = m.items.length; m.items = m.items.filter(i => i.type === "medley" || i.songId !== s.id); if(m.items.length !== before){ n++; store.saveMedley(m); } });
  store.deleteSong(s.id);
  toast(n ? t("lib.songDeletedUsed", {title:s.title, medleys: medleysN(n)}) : t("lib.songDeleted", {title:s.title}));
}
function deleteMedley(m: Medley){
  const wasCurrent = m.id === current().id;
  // Um medley excluído sai dos repertórios que o usavam.
  data.medleys.forEach(x => { const before = x.items.length; x.items = x.items.filter(i => !(i.type === "medley" && i.medleyId === m.id)); if(x.items.length !== before) store.saveMedley(x); });
  store.deleteMedley(m.id);
  if(wasCurrent){ const back = data.settings.returnTo as string; store.setSetting("currentMedley", back && data.medleys.has(back) ? back : ""); store.setSetting("returnTo", ""); }
  toast(t("lib.medleyDeleted", {name:m.name}));
}
function exportLibrary(){
  const all = [...data.songs.values()].filter(s=>s.title);
  if(!all.length) return toast(t("lib.emptyExport"));
  const json = JSON.stringify({app:"acordia", version:3, exportedAt:new Date().toISOString(),
    songs: all.map(({id,title,text,type,key,bpm,ref,arrangements,updatedAt})=>({id,title,text,type,key,bpm,ref,arrangements:arrangements||[],updatedAt})),
    medleys: [...data.medleys.values()].map(({id,kind,name,items,options,updatedAt})=>({id,kind:kind||"setlist",name,options,updatedAt,
      items:items.map(i => i.type === "medley" ? {type:"medley", medleyId:i.medleyId} : {songId:i.songId,arrangementId:i.arrangementId||"",target:i.target,capo:i.capo,singer:i.singer,notes:i.notes})}))}, null, 2);
  saveBlob(new Blob([json], {type:"application/json"}), "acordia-backup-" + new Date().toISOString().slice(0,10) + ".json");
  toast(t("lib.exported"));
}
async function importLibrary(file: File){
  try{
    const d = JSON.parse(await file.text());
    const rows = d && d.songs;
    if(!Array.isArray(rows)) throw 0;
    const idMap = new Map<string, string>(), medMap = new Map<string, string>(); let ns = 0, nm = 0;
    rows.forEach((raw: unknown) => {
      const e = sanitizeEntry(raw); if(!e) return;
      const fields = {text:e.text, title:e.title, type:e.type, key:e.key, bpm:e.bpm, ref:e.ref};
      let s = (e.id && data.songs.get(e.id)) || [...data.songs.values()].find(x => norm(x.title) === norm(e.title));
      if(s){ Object.assign(s, fields); }
      else s = store.createSong(Object.assign(fields, e.id ? {id:e.id} : {}));
      // Arranjos importados entram junto com os que já existem (o mesmo id substitui).
      const byId = new Map((s.arrangements || []).map(a => [a.id, a])); e.arrangements.forEach(a => byId.set(a.id, a));
      s.arrangements = [...byId.values()]; store.saveSong(s);
      if(e.id) idMap.set(e.id, s.id);
      ns++;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const medRows: any[] = (Array.isArray(d.medleys) ? d.medleys : []).filter((r: {items?: unknown}) => r && Array.isArray(r.items));
    // Primeiro os medleys (blocos), para os repertórios poderem apontar para eles.
    medRows.sort((a, b) => (a.kind === "medley" ? 0 : 1) - (b.kind === "medley" ? 0 : 1)).forEach(r => {
      const kind = r.kind === "medley" ? "medley" : "setlist";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = r.items.map((i: any): Item | null => {
        if(!i) return null;
        if(i.type === "medley") return kind === "setlist" && medMap.get(i.medleyId) ? store.newMedleyItem(medMap.get(i.medleyId)!) : null;
        return idMap.get(i.songId) ? store.newItem(idMap.get(i.songId)!, sanitizeItem(i)) : null;
      }).filter(Boolean) as Item[];
      const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0,80) : t("lib.importedMedley");
      const ex = typeof r.id === "string" ? data.medleys.get(r.id) : undefined;
      let target: Medley;
      if(ex){ Object.assign(ex, {name, items, kind, options: sanitizeOptions(r.options)}); store.saveMedley(ex); target = ex; }
      else { target = store.createMedley(name, items, r.options, kind); if(typeof r.id === "string" && r.id){ store.deleteMedley(target.id); target.id = r.id; store.saveMedley(target); } }
      if(typeof r.id === "string") medMap.set(r.id, target.id);
      nm++;
    });
    toast(nm ? t("lib.importedBoth", {songs: songsN(ns), medleys: medleysN(nm)}) : t("lib.imported", {songs: songsN(ns)}));
  }catch(err){ toast(t("lib.badFile")); }
}

// Clicar em qualquer parte do cartão faz a ação principal; botões e seleção de texto ficam de fora.
function cardClick(run: () => void){
  return (e: React.MouseEvent) => {
    if((e.target as Element).closest("button,a,input,select,label,textarea")) return;
    if(String(getSelection() || "").trim()) return;
    run();
  };
}
// "Nome (cópia)", depois "Nome (cópia 2)", "(cópia 3)"...: a cópia de uma cópia não empilha o sufixo.
function copyName(name: string){
  const base = name.replace(/\s*\((cópia|copy|copia)(\s+\d+)?\)$/i, "") || name;
  const names = new Set([...data.medleys.values()].map(x => x.name));
  for(let n = 1; ; n++){
    const c = n === 1 ? t("lib.copyName", {name: base}) : t("lib.copyNameN", {name: base, n});
    if(!names.has(c)) return c;
  }
}
function EmptyCard({icon, title, text}: {icon: string; title: string; text?: string}){
  return <li className="empty-state" style={{gridColumn: "1/-1"}}><Icon name={icon}/><strong>{title}</strong>{text && <span>{text}</span>}</li>;
}

export function Library(){
  useData();
  const [tab, setTab] = useState<Tab>("songs");
  const [filter, setFilter] = useState<"all" | "chords" | "letra">("all");
  const [sort, setSort] = useState("az");
  const [query, setQuery] = useState("");
  const q = norm(useDeferredValue(query));
  const all = [...data.songs.values()].filter(s=>s.title), meds = [...data.medleys.values()];
  const setlists = meds.filter(m => !isMedley(m)), blocks = meds.filter(isMedley);
  return <section className="view" id="view-library" data-view="library" aria-labelledby="lib-h">
    <div className="view-head">
      <div><h1 id="lib-h">{t("lib.title")}</h1><p className="sub" id="lib-sub">{t("lib.sub", {songs: songsN(all.length), medleys: medleysN(setlists.length)})}</p></div>
      <div className="actions">
        <button className="btn primary" id="lib-new" onClick={() => openDialog("song", {song: null})}><Icon name="plus"/><span>{t("lib.new")}</span></button>
        <button className="btn ghost" id="lib-export" data-tip-key="tip.export" onClick={exportLibrary}><Icon name="export"/><span className="label-lg">{t("lib.export")}</span></button>
        <label className="btn ghost" tabIndex={0} id="lib-import-btn" data-tip-key="tip.import"
          onKeyDown={e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); e.currentTarget.querySelector("input")?.click(); } }}>
          <Icon name="import"/><span className="label-lg">{t("lib.import")}</span>
          <input type="file" id="lib-import" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if(f) importLibrary(f); }}/></label>
      </div>
    </div>
    <Seg id="lib-tabs" aria={t("lib.tabsAria")} value={tab} onChange={setTab} options={[
      {v: "songs", label: t("lib.songs", {n: all.length})}, {v: "setlists", label: t("lib.setlists", {n: setlists.length})}, {v: "medleys", label: t("lib.mblocks", {n: blocks.length})}]}/>
    <div className="lib-toolbar">
      <div className="search"><Icon name="search" sm/><input type="search" className="input" id="lib-q" placeholder={t("lib.search")} aria-label={t("lib.searchAria")} value={query} onChange={e => setQuery(e.target.value)}/></div>
      {tab === "songs" && <Seg className="sm" id="lib-filter" aria={t("lib.filterAria")} value={filter} onChange={setFilter}
        options={[{v: "all", label: t("lib.all")}, {v: "chords", label: t("lib.withChords")}, {v: "letra", label: t("lib.lyricsOnly")}]}/>}
      {tab === "songs" && <Select id="lib-sort" style={{width: "auto"}} aria={t("lib.sortAria")} value={sort} onChange={setSort}
        options={[{value: "az", label: t("lib.az")}, {value: "recent", label: t("lib.recent")}]}/>}
    </div>
    <ul className="cards" id="lib-list">
      {tab === "songs" ? <SongCards all={all} q={q} filter={filter} sort={sort}/> : <MedleyCards rows={tab === "medleys" ? blocks : setlists} blocks={tab === "medleys"} setlists={setlists} q={q}/>}
    </ul>
  </section>;
}

function SongCards({all, q, filter, sort}: {all: Song[]; q: string; filter: string; sort: string}){
  const u = usage(), cur = new Set(current().items.map(i => i.type === "medley" ? "" : i.songId));
  const rows = all.filter(s => (!q || norm(s.title).includes(q) || norm(s.text).includes(q)) && (filter === "all" || (filter === "letra") === (s.type === "letra")))
    .sort(sort === "recent" ? (a,b)=>(b.updatedAt||0)-(a.updatedAt||0) : (a,b)=>a.title.localeCompare(b.title, locale()));
  if(!rows.length) return all.length ? <EmptyCard icon="search" title={t("lib.noResults")} text={t("lib.noResultsText")}/> : <EmptyCard icon="library" title={t("lib.empty")} text={t("lib.emptyText")}/>;
  return <>{rows.map((s, idx) => {
    const n = u.get(s.id) || 0, na = (s.arrangements || []).length;
    const key = s.type === "letra" ? "" : songKey(s);
    const del = async () => { if(await confirmDialog({title: t("confirm.songTitle"), message: t(n ? "confirm.songUsed" : "confirm.song", {title: s.title, medleys: medleysN(n)})})) deleteSong(s); };
    return <li key={s.id} className="lib-card" style={{animationDelay: Math.min(idx, 12) * 25 + "ms"}} onClick={cardClick(() => openDialog("song", {song: s}))}>
      <h3>{s.title}</h3>
      <div className="meta">{s.type === "letra" ? <span className="chip">{t("item.lyricsOnly")}</span> : key ? <span className="chip accent">{t("lib.key", {key})}</span> : null}
        {s.bpm && <span className="chip">{t("sheet.bpm", {n:s.bpm})}</span>}{na > 0 && <span className="chip">{tn("arr.count", na)}</span>}{n > 0 && <span className="chip">{medleysN(n)}</span>}</div>
      <p className="excerpt">{excerpt(s)}</p>
      <div className="foot">{cur.has(s.id) ? <><span className="chip accent"><Icon name="check" sm/> {t("lib.inCurrent")}</span><span style={{marginRight: "auto"}}/></>
        : <button className="btn soft sm" data-a="add" onClick={() => addSongToMedley(s.id)}><Icon name="plus" sm/> {t("common.add")}</button>}
        <span className="when">{ago(s.updatedAt)}</span>
        {s.ref && <button className="icon-btn sm ref-btn" data-a="ref" aria-label={t("ref.listen")} title={t("ref.listen")} onClick={() => openRef(s.ref!, s.title)}><Icon name="play" sm/></button>}
        <button className="icon-btn sm" data-a="edit" aria-label={t("common.edit")} title={t("common.edit")} onClick={() => openDialog("song", {song: s})}><Icon name="edit" sm/></button>
        <button className="icon-btn sm danger" data-a="del" aria-label={t("common.delete")} title={t("common.delete")} onClick={del}><Icon name="trash" sm/></button></div>
    </li>;
  })}</>;
}

function MedleyCards({rows: source, blocks, setlists, q}: {rows: Medley[]; blocks: boolean; setlists: Medley[]; q: string}){
  const curId = current().id;
  const titlesOf = (m: Medley) => songItems(m).map(x => (data.songs.get(x.it.songId) || {title: ""}).title).filter(Boolean);
  const rows = source.filter(m => !q || norm(m.name).includes(q) || titlesOf(m).some(x => norm(x).includes(q))).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  if(!rows.length) return blocks ? <EmptyCard icon="link" title={t("lib.noMedleyBlocks")} text={t("lib.noMedleyBlocksText")}/> : <EmptyCard icon="list" title={t("lib.noMedleys")}/>;
  return <>{rows.map((m, idx) => {
    const titles = titlesOf(m);
    const usedIn = blocks ? setlists.filter(x => x.items.some(i => i.type === "medley" && i.medleyId === m.id)).length : 0;
    // Duplica e já abre a cópia com o nome selecionado, pronto para renomear.
    const dup = () => {
      const copyItem = (i: Item) => i.type === "medley" ? store.newMedleyItem(i.medleyId) : store.newItem(i.songId, sanitizeItem(i));
      const c = store.createMedley(copyName(m.name), m.items.map(copyItem), m.options, m.kind);
      openMedley(c.id);
      const tr = go("medley");
      (tr ? tr.updateCallbackDone : Promise.resolve()).catch(()=>{}).then(() => requestAnimationFrame(() => { const n = document.querySelector<HTMLInputElement>("#medley-name"); n?.focus(); n?.select(); }));
      toast(t("lib.created", {name: c.name}));
    };
    const open = () => { openMedley(m.id); go("medley"); };
    const del = async () => { if(await confirmDialog({title: t(blocks ? "confirm.medleyTitle" : "confirm.setlistTitle"), message: t(usedIn ? "confirm.medleyUsed" : blocks ? "confirm.medley" : "confirm.setlist", {name: m.name, medleys: medleysN(usedIn)})})) deleteMedley(m); };
    return <li key={m.id} className="lib-card" style={{animationDelay: Math.min(idx, 12) * 25 + "ms"}} onClick={cardClick(open)}>
      <h3>{m.name}</h3>
      <div className="meta">{blocks && <span className="chip accent"><Icon name="link" sm/> {t("ctx.medley")}</span>}<span className="chip">{songsN(titles.length)}</span>
        {usedIn > 0 && <span className="chip">{medleysN(usedIn)}</span>}{m.id === curId && <span className="chip accent">{t("lib.open")}</span>}</div>
      <p className="excerpt">{titles.join(" · ") || t("lib.emptyMedley")}</p>
      <div className="foot"><button className="btn soft sm" data-a="open" onClick={open}>{t("common.open")}</button>
        <span className="when">{ago(m.updatedAt)}</span>
        {m.items.length > 0 && <button className="icon-btn sm" data-a="dup" aria-label={t("common.duplicate")} title={t("common.duplicate")} onClick={dup}><Icon name="copy" sm/></button>}
        <button className="icon-btn sm" data-a="share" aria-label={t("common.share")} title={t("common.share")} onClick={() => shareMedley(m)}><Icon name="share" sm/></button>
        <button className="icon-btn sm danger" data-a="del" aria-label={t("common.delete")} title={t("common.delete")} onClick={del}><Icon name="trash" sm/></button></div>
    </li>;
  })}</>;
}
