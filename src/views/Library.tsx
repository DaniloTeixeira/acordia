// Biblioteca: músicas salvas, repertórios e medleys, com busca e filtros.
import { useDeferredValue, useState } from "react";
import { isChordLine, sanitizeItem } from "../lib/core";
import { t, tn, locale } from "../lib/i18n";
import * as store from "../lib/store";
import { ago, norm } from "../lib/util";
import { useData, toast, openDialog, confirmDialog, go } from "../state";
import { current, peekCurrent, isMedley, openMedley, songItems, usage, songKey } from "../repertoire";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { openRef } from "./Repertoire";
import type { Medley, Song, Item } from "../lib/types";

const { data } = store;
const songsN = (n: number) => tn("song", n), medleysN = (n: number) => tn("medley", n);
type Tab = "songs" | "setlists" | "medleys";
// Aba com que a Biblioteca abre da próxima vez: a última escolhida, para o voltar cair onde a pessoa estava
// (o "voltar" do repertório abre nos repertórios).
let nextTab: Tab = "songs";
export function openLibrary(tab: Tab){ nextTab = tab; go("library"); }

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
  const wasCurrent = m.id === peekCurrent()?.id;
  // Um medley excluído sai dos repertórios que o usavam.
  data.medleys.forEach(x => { const before = x.items.length; x.items = x.items.filter(i => !(i.type === "medley" && i.medleyId === m.id)); if(x.items.length !== before) store.saveMedley(x); });
  store.deleteMedley(m.id);
  if(wasCurrent){ const back = data.settings.returnTo as string; store.setSetting("currentMedley", back && data.medleys.has(back) ? back : ""); store.setSetting("returnTo", ""); }
  toast(t("lib.medleyDeleted", {name:m.name}));
}
// Pede confirmação e exclui; diz quantos repertórios usam o medley. Devolve se excluiu.
export async function confirmDeleteMedley(m: Medley){
  const blocks = isMedley(m);
  const usedIn = blocks ? [...data.medleys.values()].filter(x => !isMedley(x) && x.items.some(i => i.type === "medley" && i.medleyId === m.id)).length : 0;
  if(!await confirmDialog({title: t(blocks ? "confirm.medleyTitle" : "confirm.setlistTitle"), message: t(usedIn ? "confirm.medleyUsed" : blocks ? "confirm.medley" : "confirm.setlist", {name: m.name, medleys: medleysN(usedIn)})})) return false;
  deleteMedley(m); return true;
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
const COPY = /\s*\((cópia|copy|copia)(\s+(\d+))?\)$/i;
// Nome sem o "(cópia N)" e o número da cópia (0 = o original, 1 = "(cópia)", 2 = "(cópia 2)"...).
function copyOf(name: string){
  const m = name.match(COPY);
  return {base: m ? name.slice(0, m.index) : name, n: m ? +(m[3] || 1) : 0};
}
// Na lista por data, cada cópia vem logo depois do original (o grupo fica onde está o mais recente dele).
function withCopiesAfter(rows: Medley[]){
  const groups = new Map<string, Medley[]>();
  rows.forEach(m => { const b = copyOf(m.name).base; groups.set(b, [...(groups.get(b) || []), m]); });
  return [...groups.values()].flatMap(g => g.sort((a, b) => copyOf(a.name).n - copyOf(b.name).n));
}
// Por data de alteração: "recent" do mais novo para o mais antigo, "old" ao contrário.
const byDate = (sort: string) => (a: {updatedAt?: number}, b: {updatedAt?: number}) => ((b.updatedAt || 0) - (a.updatedAt || 0)) * (sort === "old" ? -1 : 1);
export function copyName(name: string){
  const base = copyOf(name).base || name;
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
  const [tab, setTabState] = useState<Tab>(nextTab);
  const setTab = (v: Tab) => { nextTab = v; setTabState(v); };
  // Ordem por aba: músicas e medleys de A a Z (procura pelo nome), repertórios pelos mais recentes (o próximo culto).
  const [sorts, setSorts] = useState<Record<Tab, string>>({songs: "az", setlists: "recent", medleys: "az"});
  const sort = sorts[tab], setSort = (v: string) => setSorts(x => ({...x, [tab]: v}));
  const view = data.settings.libView === "rows" ? "rows" : "cards";
  const [query, setQuery] = useState("");
  const q = norm(useDeferredValue(query));
  const all = [...data.songs.values()].filter(s=>s.title), meds = [...data.medleys.values()];
  const setlists = meds.filter(m => !isMedley(m)), blocks = meds.filter(isMedley);
  return <section className="view" id="view-library" data-view="library" aria-labelledby="lib-h">
    <div className="view-head">
      <div><h1 id="lib-h">{t("lib.title")}</h1><p className="sub" id="lib-sub">{t("lib.sub", {songs: songsN(all.length), medleys: medleysN(setlists.length)})}</p></div>
      <div className="actions">
        <button className="btn primary" id="lib-new" onClick={() => openDialog("song", {song: null})}><Icon name="plus"/><span>{t("lib.new")}</span></button>
      </div>
    </div>
    <div className="lib-tabs-row">
      <Seg id="lib-tabs" aria={t("lib.tabsAria")} value={tab} onChange={setTab} options={[
        {v: "songs", label: t("lib.songs", {n: all.length})}, {v: "setlists", label: t("lib.setlists", {n: setlists.length})}, {v: "medleys", label: t("lib.mblocks", {n: blocks.length})}]}/>
      {/* Cards ou linhas: vale para as três abas e fica guardado no aparelho. */}
      <Seg className="view-seg" id="lib-view" aria={t("lib.viewAria")} value={view} onChange={v => store.setSetting("libView", v)}
        options={[{v: "cards", label: <Icon name="grid" sm/>, aria: t("lib.viewCards"), tip: "lib.viewCards"}, {v: "rows", label: <Icon name="list" sm/>, aria: t("lib.viewRows"), tip: "lib.viewRows"}]}/>
    </div>
    <div className="lib-toolbar">
      <div className="search"><Icon name="search" sm/><input type="search" className="input" id="lib-q" placeholder={t("lib.search")} aria-label={t("lib.searchAria")} value={query} onChange={e => setQuery(e.target.value)}/></div>
      <Select id="lib-sort" style={{width: "auto"}} aria={t("lib.sortAria")} value={sort} onChange={setSort}
        options={[{value: "az", label: t("lib.az")}, {value: "recent", label: t("lib.recent")}, {value: "old", label: t("lib.old")}]}/>
</div>
    <ul className={"cards" + (view === "rows" ? " rows" : "")} id="lib-list">
      {tab === "songs" ? <SongCards all={all} q={q} sort={sort}/> : <MedleyCards rows={tab === "medleys" ? blocks : setlists} blocks={tab === "medleys"} setlists={setlists} q={q} sort={sort}/>}
    </ul>
  </section>;
}

function SongCards({all, q, sort}: {all: Song[]; q: string; sort: string}){
  const u = usage(), cur = new Set((peekCurrent()?.items || []).map(i => i.type === "medley" ? "" : i.songId));
  const rows = all.filter(s => !q || norm(s.title).includes(q) || norm(s.text).includes(q))
    .sort(sort === "az" ? (a,b)=>a.title.localeCompare(b.title, locale()) : byDate(sort));
  if(!rows.length) return all.length ? <EmptyCard icon="search" title={t("lib.noResults")} text={t("lib.noResultsText")}/> : <EmptyCard icon="library" title={t("lib.empty")} text={t("lib.emptyText")}/>;
  return <>{rows.map((s, idx) => {
    const n = u.get(s.id) || 0, na = (s.arrangements || []).length;
    const key = s.type === "letra" ? "" : songKey(s);
    const del = async () => { if(await confirmDialog({title: t("confirm.songTitle"), message: t(n ? "confirm.songUsed" : "confirm.song", {title: s.title, medleys: medleysN(n)})})) deleteSong(s); };
    return <li key={s.id} className="lib-card" style={{animationDelay: Math.min(idx, 12) * 25 + "ms"}} onClick={cardClick(() => openDialog("song", {song: s}))}>
      <h3>{s.title}</h3>
      <div className="meta">{s.type === "letra" ? <span className="chip">{t("item.lyricsOnly")}</span> : key ? <span className="chip accent">{t("lib.key", {key})}</span> : null}
        {s.bpm && <span className="chip">{t("sheet.bpm", {n:s.bpm})}</span>}{na > 0 && <span className="chip">{tn("arr.count", na)}</span>}{n > 0 && <span className="chip">{medleysN(n)}</span>}
        <span className="when">{ago(s.updatedAt)}</span></div>
      <p className="excerpt">{excerpt(s)}</p>
      <div className="foot"><span className="when foot-when" aria-hidden="true">{ago(s.updatedAt)}</span>{cur.has(s.id) ? <><span className="chip current"><Icon name="check" sm/> {t("lib.inCurrent")}</span><span style={{marginRight: "auto"}}/></>
        : <button className="btn soft sm" data-a="add" onClick={() => addSongToMedley(s.id)}><Icon name="plus" sm/> {t("common.add")}</button>}
        {s.ref && <button className="icon-btn sm ref-btn" data-a="ref" aria-label={t("ref.listen")} title={t("ref.listen")} onClick={() => openRef(s.ref!, s.title)}><Icon name="play" sm/></button>}
        <button className="icon-btn sm" data-a="edit" aria-label={t("common.edit")} title={t("common.edit")} onClick={() => openDialog("song", {song: s})}><Icon name="edit" sm/></button>
        <button className="icon-btn sm danger" data-a="del" aria-label={t("common.delete")} title={t("common.delete")} onClick={del}><Icon name="trash" sm/></button></div>
    </li>;
  })}</>;
}

function MedleyCards({rows: source, blocks, setlists, q, sort}: {rows: Medley[]; blocks: boolean; setlists: Medley[]; q: string; sort: string}){
  const curId = peekCurrent()?.id;
  const titlesOf = (m: Medley) => songItems(m).map(x => (data.songs.get(x.it.songId) || {title: ""}).title).filter(Boolean);
  const rows = withCopiesAfter(source.filter(m => !q || norm(m.name).includes(q) || titlesOf(m).some(x => norm(x).includes(q))).sort(sort === "az" ? (a,b)=>a.name.localeCompare(b.name, locale()) : byDate(sort)));
  if(!rows.length) return blocks ? <EmptyCard icon="link" title={t("lib.noMedleyBlocks")} text={t("lib.noMedleyBlocksText")}/> : <EmptyCard icon="list" title={t("lib.noMedleys")}/>;
  return <>{rows.map((m, idx) => {
    const titles = titlesOf(m);
    // Repertórios que usam este medley: o chip mostra o nome (e "+N" se houver mais; a lista toda na dica).
    const owners = blocks ? setlists.filter(x => x.items.some(i => i.type === "medley" && i.medleyId === m.id)) : [];
    const usedIn = owners.length;
    const del = () => confirmDeleteMedley(m);
    // Duplica e já abre a cópia com o nome selecionado, pronto para renomear.
    const dup = () => {
      const copyItem = (i: Item) => i.type === "medley" ? Object.assign(store.newMedleyItem(i.medleyId), {moment: i.moment || ""}) : store.newItem(i.songId, sanitizeItem(i));
      const c = store.createMedley(copyName(m.name), m.items.map(copyItem), m.options, m.kind);
      openMedley(c.id);
      const tr = go("medley");
      (tr ? tr.updateCallbackDone : Promise.resolve()).catch(()=>{}).then(() => requestAnimationFrame(() => { const n = document.querySelector<HTMLInputElement>("#medley-name"); n?.focus(); n?.select(); }));
      toast(t("lib.created", {name: c.name}));
    };
    const open = () => { openMedley(m.id); go("medley"); };
    return <li key={m.id} className="lib-card" style={{animationDelay: Math.min(idx, 12) * 25 + "ms"}} onClick={cardClick(open)}>
      <h3>{m.name}</h3>
      <div className="meta">{/* "Atual": o repertório aberto (onde o Adicionar põe as músicas). No medley não aparece: o chip do repertório já diz onde ele está. */}
        {!blocks && m.id === curId && <span className="chip current">{t("lib.current")}</span>}
        {usedIn > 0 && <span className="chip accent owner-chip" data-tip={owners.map(x => x.name).join(" · ")}><Icon name="list" sm/><span>{owners[0].name}</span>{usedIn > 1 && <b>+{usedIn - 1}</b>}</span>}<span className="chip accent">{songsN(titles.length)}</span>
        <span className="when">{ago(m.updatedAt)}</span></div>
      <p className="excerpt">{titles.join(" · ") || t("lib.emptyMedley")}</p>
      <div className="foot"><span className="when foot-when" aria-hidden="true">{ago(m.updatedAt)}</span><button className="btn soft sm" data-a="open" onClick={open}>{t("common.open")}</button>
        {m.items.length > 0 && <button className="icon-btn sm" data-a="dup" aria-label={t("common.duplicate")} title={t("common.duplicate")} onClick={dup}><Icon name="copy" sm/></button>}
        <button className="icon-btn sm danger" data-a="del" aria-label={t("common.delete")} title={t("common.delete")} onClick={del}><Icon name="trash" sm/></button></div>
    </li>;
  })}</>;
}
