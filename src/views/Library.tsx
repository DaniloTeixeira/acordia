// Músicas, repertórios e medleys do grupo, com busca e filtros. Aparecem nas abas Músicas e Repertórios do
// Grupo (LibraryList); quem não lidera o grupo só vê, abre e estuda, sem botões de mudar.
import { useDeferredValue, useState } from "react";
import { isChordLine, sanitizeItem } from "../lib/core";
import { t, tn, locale } from "../lib/i18n";
import * as store from "../lib/store";
import { ago, norm } from "../lib/util";
import { useData, toast, openDialog, confirmDialog, go } from "../state";
import { peekCurrent, isMedley, openMedley, songItems, usage, songKey, libTargets, libWhere, libTitle, inSetlist, addToSetlist, removeFromSetlist, type LibRef } from "../repertoire";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { openRef } from "./Repertoire";
import type { Medley, Song, Item } from "../lib/types";
import { isAutoSetlist } from "../lib/syncrules";

const { data } = store;
const songsN = (n: number) => tn("song", n), medleysN = (n: number) => tn("medley", n);
type Tab = "songs" | "setlists" | "medleys";

function excerpt(s: Song){
  return s.text.split("\n").slice(1).map(l=>l.trim()).filter(l=>l && !isChordLine(l) && !/^\[.*\]$/.test(l)).slice(0, 2).join(" / ");
}
// Botão de pôr nos repertórios: diz onde já está ("+ Adicionar", "✓ Nome do repertório" ou "✓ Em N repertórios").
// Com um repertório só, põe e tira direto (tirar avisa com Desfazer); com mais de um, abre a lista para escolher.
// Sem nenhum, cria um e põe nele.
function AddButton({r}: {r: LibRef}){
  const sets = libTargets(), where = libWhere(r), title = libTitle(r);
  const toggle = () => {
    if(sets.length > 1) return openDialog("addTo", r);
    const m = sets[0] || store.createMedley(t("medley.defaultName"));
    if(inSetlist(m, r)){
      const before = [...m.items]; removeFromSetlist(m, r);
      toast(t("addTo.removed", {title, medley: m.name}), {label: t("common.undo"), run: () => { m.items = before; store.saveMedley(m); }});
    } else {
      addToSetlist(m, r);
      toast(t("picker.addedTo", {title, medley: m.name}), {label: t("common.see"), run: () => { openMedley(m.id); go("medley"); }});
    }
  };
  const aria = sets.length > 1 ? t("addTo.chooseAria", {title}) : where.length ? t("addTo.removeAria", {title, medley: where[0].name}) : undefined;
  return where.length
    ? <button type="button" className="chip current chip-btn" data-a="add" aria-label={aria} onClick={toggle}><Icon name="check" sm/>
      <span>{where.length === 1 ? where[0].name : tn("addTo.inN", where.length)}</span></button>
    : <button type="button" className="btn soft sm" data-a="add" aria-label={aria} onClick={toggle}><Icon name="plus" sm/> {t("common.add")}</button>;
}
// Tira os itens que casam de cada repertório e guarda a lista de antes, para o Desfazer devolver.
function stripItems(match: (i: Item) => boolean){
  const before: [Medley, Item[]][] = [];
  data.medleys.forEach(m => { const items = m.items; if(items.some(match)){ before.push([m, items]); m.items = items.filter(i => !match(i)); store.saveMedley(m); } });
  return {n: before.length, restore: () => before.forEach(([m, items]) => { const x = data.medleys.get(m.id); if(x){ x.items = items; store.saveMedley(x); } })};
}
// Desfazer grava de novo com a hora de agora, para valer sobre a exclusão que já pode ter subido para a nuvem.
const undo = (run: () => void) => ({label: t("common.undo"), run});
function deleteSong(s: Song){
  const {n, restore} = stripItems(i => i.type !== "medley" && i.songId === s.id);
  store.deleteSong(s.id);
  toast(n ? t("lib.songDeletedUsed", {title:s.title, medleys: medleysN(n)}) : t("lib.songDeleted", {title:s.title}), undo(() => { store.saveSong(s); restore(); }));
}
function deleteMedley(m: Medley){
  const wasCurrent = m.id === peekCurrent()?.id, back = data.settings.returnTo as string;
  // Um medley excluído sai dos repertórios que o usavam.
  const {restore} = stripItems(i => i.type === "medley" && i.medleyId === m.id);
  store.deleteMedley(m.id);
  if(wasCurrent){ store.setSetting("currentMedley", back && data.medleys.has(back) ? back : ""); store.setSetting("returnTo", ""); }
  toast(t("lib.medleyDeleted", {name:m.name}), undo(() => {
    store.saveMedley(m); restore();
    if(wasCurrent){ store.setSetting("currentMedley", m.id); store.setSetting("returnTo", back || ""); }
  }));
}
// Desativar/ativar: o item fica na Biblioteca (no fim da lista, apagado), mas some das opções de adicionar.
function OnOffButton({x}: {x: Song | Medley}){
  const song = "title" in x, name = song ? x.title : x.name, sfx = song ? "Song" : "Set";
  const save = (v: boolean) => { if(v) x.disabled = true; else delete x.disabled; song ? store.saveSong(x) : store.saveMedley(x); };
  const flip = () => { const off = !x.disabled; save(off); toast(t((off ? "lib.disabled" : "lib.enabled") + sfx, {name}), undo(() => save(!off))); };
  const label = t(x.disabled ? "lib.enable" : "lib.disable");
  return <button className="icon-btn sm" data-a="onoff" aria-label={label} title={label} aria-pressed={!!x.disabled} onClick={flip}><Icon name={x.disabled ? "eye" : "eye-off"} sm/></button>;
}
const OffChip = ({song}: {song?: boolean}) => <span className="chip off-chip"><Icon name="eye-off" sm/> {t(song ? "lib.offSong" : "lib.offSet")}</span>;
// Desativados vão para o fim, na mesma ordem.
const activeFirst = <T extends {disabled?: boolean}>(rows: T[]) => [...rows.filter(x => !x.disabled), ...rows.filter(x => x.disabled)];
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

// Lista de músicas (tab "songs") ou de repertórios ("setlists", com os medleys numa seção logo abaixo, quando houver).
export function LibraryList({tab: base, canEdit}: {tab: "songs" | "setlists" | "medleys"; canEdit: boolean}){
  useData();
  // O repertório vazio que o app cria sozinho no aparelho de quem só lê não é do grupo: não aparece.
  const meds = [...data.medleys.values()].filter(m => canEdit || !isAutoSetlist(m)), setlists = meds.filter(m => !isMedley(m)), blocks = meds.filter(isMedley);
  const tab: Tab = base;
  // Ordem por aba: músicas e medleys de A a Z (procura pelo nome), repertórios pelos mais recentes (o próximo culto).
  const [sorts, setSorts] = useState<Record<Tab, string>>({songs: "az", setlists: "recent", medleys: "az"});
  const sort = sorts[tab], setSort = (v: string) => setSorts(x => ({...x, [tab]: v}));
  const view = data.settings.libView === "rows" ? "rows" : "cards";
  const [query, setQuery] = useState("");
  const q = norm(useDeferredValue(query));
  const all = [...data.songs.values()].filter(s=>s.title);
  return <div className="group-lib">
    <div className="lib-toolbar">
      <div className="search"><Icon name="search" sm/><input type="search" className="input" id="lib-q" placeholder={t("lib.search")} aria-label={t("lib.searchAria")} value={query} onChange={e => setQuery(e.target.value)}/></div>
      <Select id="lib-sort" style={{width: "auto"}} aria={t("lib.sortAria")} value={sort} onChange={setSort}
        options={[{value: "az", label: t("lib.az")}, {value: "recent", label: t("lib.recent")}, {value: "old", label: t("lib.old")}]}/>
      {/* Cards ou linhas: vale para as abas e fica guardado no aparelho. Na linha da ordem, também no celular. */}
      <Seg className="view-seg" id="lib-view" aria={t("lib.viewAria")} value={view} onChange={v => store.setSetting("libView", v)}
        options={[{v: "cards", label: <Icon name="grid" sm/>, aria: t("lib.viewCards"), tip: "lib.viewCards"}, {v: "rows", label: <Icon name="list" sm/>, aria: t("lib.viewRows"), tip: "lib.viewRows"}]}/>
    </div>
    <ul className={"cards" + (view === "rows" ? " rows" : "")} id="lib-list">
      {tab === "songs" ? <SongCards all={all} q={q} sort={sort} canEdit={canEdit}/> : <MedleyCards rows={tab === "medleys" ? blocks : setlists} blocks={tab === "medleys"} setlists={setlists} q={q} sort={sort} canEdit={canEdit}/>}
    </ul>
  </div>;
}
// Abre um repertório do grupo. Quem não lidera cai direto na folha.
export function openSetlist(id: string, canEdit: boolean){
  if(!canEdit) store.setSetting("pane", "sheet");
  openMedley(id);
  return go("medley");
}

function SongCards({all, q, sort, canEdit}: {all: Song[]; q: string; sort: string; canEdit: boolean}){
  const u = usage();
  const rows = activeFirst(all.filter(s => !q || norm(s.title).includes(q) || norm(s.text).includes(q))
    .sort(sort === "az" ? (a,b)=>a.title.localeCompare(b.title, locale()) : byDate(sort)));
  if(!rows.length) return all.length ? <EmptyCard icon="search" title={t("lib.noResults")} text={t("lib.noResultsText")}/> : <EmptyCard icon="library" title={t("lib.empty")} text={t(canEdit ? "lib.emptyText" : "lib.emptyMember")}/>;
  return <>{rows.map((s, idx) => {
    const n = u.get(s.id) || 0, na = (s.arrangements || []).length;
    const key = s.type === "letra" ? "" : songKey(s);
    const del = async () => { if(await confirmDialog({title: t("confirm.songTitle"), message: t(n ? "confirm.songUsed" : "confirm.song", {title: s.title, medleys: medleysN(n)})})) deleteSong(s); };
    return <li key={s.id} className={"lib-card" + (s.disabled ? " off" : "")} style={{animationDelay: Math.min(idx, 12) * 25 + "ms"}} onClick={canEdit ? cardClick(() => openDialog("song", {song: s})) : undefined}>
      <h3>{s.title}</h3>
      <div className="meta">{s.disabled && <OffChip song/>}{s.type === "letra" ? <span className="chip">{t("item.lyricsOnly")}</span> : key ? <span className="chip accent">{t("lib.key", {key})}</span> : null}
        {s.bpm && <span className="chip">{t("sheet.bpm", {n:s.bpm})}</span>}{na > 0 && <span className="chip">{tn("arr.count", na)}</span>}{n > 0 && <span className="chip">{medleysN(n)}</span>}
        <span className="when">{ago(s.updatedAt)}</span></div>
      <p className="excerpt">{excerpt(s)}</p>
      <div className="foot"><span className="when foot-when" aria-hidden="true">{ago(s.updatedAt)}</span>{s.disabled || !canEdit ? <span style={{marginRight: "auto"}}/> : <AddButton r={{kind: "song", id: s.id}}/>}
        {s.ref && <button className="icon-btn sm ref-btn" data-a="ref" aria-label={t("ref.listen")} title={t("ref.listen")} onClick={() => openRef(s.ref!, s.title)}><Icon name="play" sm/></button>}
        {canEdit && <><button className="icon-btn sm" data-a="edit" aria-label={t("common.edit")} title={t("common.edit")} onClick={() => openDialog("song", {song: s})}><Icon name="edit" sm/></button>
        <OnOffButton x={s}/>
        <button className="icon-btn sm danger" data-a="del" aria-label={t("common.delete")} title={t("common.delete")} onClick={del}><Icon name="trash" sm/></button></>}</div>
    </li>;
  })}</>;
}

function MedleyCards({rows: source, blocks, setlists, q, sort, canEdit}: {rows: Medley[]; blocks: boolean; setlists: Medley[]; q: string; sort: string; canEdit: boolean}){
  const curId = peekCurrent()?.id;
  const titlesOf = (m: Medley) => songItems(m).map(x => (data.songs.get(x.it.songId) || {title: ""}).title).filter(Boolean);
  const rows = activeFirst(withCopiesAfter(source.filter(m => !q || norm(m.name).includes(q) || titlesOf(m).some(x => norm(x).includes(q))).sort(sort === "az" ? (a,b)=>a.name.localeCompare(b.name, locale()) : byDate(sort))));
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
      const tr = openSetlist(c.id, true);
      (tr ? tr.updateCallbackDone : Promise.resolve()).catch(()=>{}).then(() => requestAnimationFrame(() => { const n = document.querySelector<HTMLInputElement>("#medley-name"); n?.focus(); n?.select(); }));
      toast(t("lib.created", {name: c.name}));
    };
    const open = () => openSetlist(m.id, canEdit);
    return <li key={m.id} className={"lib-card" + (m.disabled ? " off" : "")} style={{animationDelay: Math.min(idx, 12) * 25 + "ms"}} onClick={cardClick(open)}>
      <h3>{m.name}</h3>
      <div className="meta">{/* "Aberto": o repertório que a aba Repertório mostra. Medley: o botão Adicionar já diz em quais repertórios ele está
          (o chip com o repertório fica só para o desativado, que não tem o botão). */}
        {m.disabled && <OffChip/>}{canEdit && !blocks && m.id === curId && <span className="chip current">{t("lib.current")}</span>}
        {usedIn > 0 && m.disabled && <span className="chip accent owner-chip" data-tip={owners.map(x => x.name).join(" · ")}><Icon name="list" sm/><span>{owners[0].name}</span>{usedIn > 1 && <b>+{usedIn - 1}</b>}</span>}<span className="chip accent">{songsN(titles.length)}</span>
        <span className="when">{ago(m.updatedAt)}</span></div>
      <p className="excerpt">{titles.join(" · ") || t("lib.emptyMedley")}</p>
      <div className="foot"><span className="when foot-when" aria-hidden="true">{ago(m.updatedAt)}</span>
        {/* Medley: Adicionar ao repertório (como nas músicas) e Abrir. */}
        {canEdit && blocks && !m.disabled && <AddButton r={{kind: "medley", id: m.id}}/>}
        <button className={"btn sm " + (canEdit && blocks && !m.disabled ? "ghost" : "soft")} data-a="open" onClick={open}>{t("common.open")}</button>
        {canEdit && <>{m.items.length > 0 && <button className="icon-btn sm" data-a="dup" aria-label={t("common.duplicate")} title={t("common.duplicate")} onClick={dup}><Icon name="copy" sm/></button>}
        <OnOffButton x={m}/>
        <button className="icon-btn sm danger" data-a="del" aria-label={t("common.delete")} title={t("common.delete")} onClick={del}><Icon name="trash" sm/></button></>}</div>
    </li>;
  })}</>;
}
