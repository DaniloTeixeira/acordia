// Página Repertório: o repertório (ou medley) aberto, com a edição das músicas e a folha A4.
import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { KEYS, MINOR_KEYS, songTitle, sanitizeUrl, youtubeId, parseSong, detectKey } from "../lib/core";
import { t, tn, locale } from "../lib/i18n";
import * as store from "../lib/store";
import { reduced, vt, flashSaved, reveal } from "../lib/util";
import { useUI, useData, toast, openDialog, toggleExpanded, go, goBack, confirmDialog } from "../state";
import { current, isMedley, openMedley, songItems, arrangementOf, eff, songKey, isLyricsOnly, lastPlayKey, sheetSongs, markOpened, usage } from "../repertoire";
import { Icon } from "../ui/Icon";
import { AddButton } from "../ui/AddButton";
import { Seg } from "../ui/Seg";
import { Select, type Options } from "../ui/Select";
import { useSynced } from "../ui/hooks";
import { useDragSort } from "../ui/dragSort";
import { useGroups, loadGroups, useCanEdit } from "../lib/groups";
import { Sheet, SheetPane, copySheet, sheetMode } from "./Sheet";
import { confirmDeleteMedley, deleteSong } from "./Library";
import type { Medley, MedleyItem, SongItem, Song, Moment } from "../lib/types";

const { data } = store;
const songsN = (n: number) => tn("song", n);
export const instrument = () => (data.settings.instrument as string) || "keys";

export function keyOptions(first: string): Options {
  return [{value: "", label: first},
    {group: t("keys.major"), options: KEYS.map(k => ({value: k, label: k}))},
    {group: t("keys.minor"), options: MINOR_KEYS.map(k => ({value: k, label: k}))}];
}

export function setPane(v: "edit" | "sheet"){ store.setSetting("pane", v); }

// Repertório/medley recém-criado que ainda ninguém mexeu: se sair sem escrever nome nem adicionar música, é apagado.
// O registro fica no aparelho: um refresh na tela de criação também apaga o rascunho vazio (ver store.dropStaleDrafts).
const drafts = {add: store.markDraft, has: store.isDraft, delete: store.clearDraft};
function dropDraft(id: string){
  const m = data.medleys.get(id);
  drafts.delete(id);
  if(m && !m.items.length) store.deleteMedley(id);
}

export function newMedley(){
  const m = store.createMedley(t("medley.newName", {date: new Date().toLocaleDateString(locale(), {day:"2-digit", month:"2-digit"})}));
  drafts.add(m.id);
  store.setSetting("currentMedley", m.id); store.setSetting("returnTo", "");
  useUI.setState({expanded: new Set()});
  go("medley");
  setTimeout(() => { const name = document.querySelector<HTMLInputElement>("#medley-name"); name?.focus(); name?.select(); }, 50);
}
// Medley novo avulso (aba Medleys da Biblioteca): abre na edição com o nome selecionado; depois entra em repertórios pelo "Adicionar".
export function newMedleyBlock(){
  const n = [...data.medleys.values()].filter(isMedley).length + 1;
  const m = store.createMedley(t("mblock.newName", {n}), [], undefined, "medley");
  drafts.add(m.id);
  openMedley(m.id); setPane("edit"); go("medley");
  setTimeout(() => { const name = document.querySelector<HTMLInputElement>("#medley-name"); name?.focus(); name?.select(); }, 50);
}
// Página da música (o mesmo cartão do repertório, sem o que é do repertório). Grava sozinha.
export function openSong(id: string){
  markOpened("song", id);
  store.setSetting("songId", id);
  go("song");
}
// Música nova avulsa: como o repertório novo, é rascunho até ter conteúdo; se sair sem escrever nada, é apagada na hora
// (antes ficava vazia na Biblioteca e na nuvem até a próxima abertura do app).
export function newSong(){ const s = store.createSong({}); drafts.add(s.id); openSong(s.id); }
function dropSongDraft(id: string){
  const s = data.songs.get(id);
  drafts.delete(id);
  if(s && !s.text.trim() && !s.title.trim() && !(usage().get(id) || 0)) store.deleteSong(id);
}
function focusItem(id: string){
  requestAnimationFrame(() => {
    const li = document.querySelector<HTMLElement>(`.item[data-id="${id}"]`); if(!li) return;
    li.scrollIntoView({behavior: reduced() ? "auto" : "smooth", block:"center"});
    li.querySelector("textarea")?.focus({preventScroll:true});
  });
}
function addItem(type: "" | "letra"){
  const m = current(), s = store.createSong({type});
  const it = store.newItem(s.id);
  if(isMedley(m) && type !== "letra") it.target = lastPlayKey(m);
  m.items.push(it);
  // No medley, só a música nova fica aberta; as anteriores fecham.
  if(isMedley(m)) useUI.setState({expanded: new Set([it.id])}); else toggleExpanded(it.id, true);
  store.saveMedley(m); setPane("edit");
  focusItem(it.id);
}
function addMedleyBlock(){
  const m = current(); if(isMedley(m)) return;
  const n = [...data.medleys.values()].filter(isMedley).length + 1;
  const md = store.createMedley(t("mblock.newName", {n}), [], m.options, "medley");
  m.items.push(store.newMedleyItem(md.id)); store.saveMedley(m);
  openMedley(md.id, {from: m.id}); setPane("edit");
  toast(t("mblock.created", {name: m.name}));
  setTimeout(() => { const name = document.querySelector<HTMLInputElement>("#medley-name"); name?.focus(); name?.select(); }, 50);
}
function moveItem(id: string, dir: number){
  const m = current(), i = m.items.findIndex(x=>x.id===id), j = i + dir;
  if(i < 0 || j < 0 || j >= m.items.length) return;
  const items = () => [...document.querySelectorAll<HTMLElement>("#items .item")];
  // Só os itens da lista ganham nome de transição, para animarem a troca de lugar.
  items().forEach(el => el.style.viewTransitionName = "it-" + el.dataset.id);
  const tr = vt(() => {
    [m.items[i], m.items[j]] = [m.items[j], m.items[i]];
    store.saveMedley(m);
    flushSync(() => store.touchNow());
  }, "move");
  const after = () => {
    items().forEach(el => el.style.viewTransitionName = "");
    const li = document.querySelector<HTMLElement>(`.item[data-id="${id}"]`); if(!li) return;
    li.classList.add("moved");
    li.querySelector<HTMLButtonElement>("[data-drag]")?.focus();
  };
  if(tr) tr.finished.finally(after); else setTimeout(after);
}
function removeItem(id: string, li: HTMLElement | null){
  const m = current(), i = m.items.findIndex(x=>x.id===id); if(i < 0) return;
  li?.classList.add("leaving");
  setTimeout(() => {
    const [it] = m.items.splice(i, 1); store.saveMedley(m);
    toggleExpanded(id, false);
    const undo = {label:t("common.undo"), run:()=>{ m.items.splice(i, 0, it); store.saveMedley(m); }};
    if(it.type === "medley"){ const md = data.medleys.get(it.medleyId); return toast(t("item.removed", {title: md ? md.name : t("ctx.medley")}), undo); }
    const s = data.songs.get(it.songId);
    if(s && !s.text.trim()){ store.deleteSong(s.id); return; }
    toast(t("item.removed", {title: (s && s.title) || t("item.song")}), undo);
  }, reduced() ? 0 : 220);
}

export function NewSong(){ return <Repertoire song/>; }

// song: página de uma música avulsa (nova ou da Biblioteca). É a mesma tela, só com o cartão da música: sem folha, palco, excluir, novo nem adicionar.
export function Repertoire({song}: {song?: boolean} = {}){
  useData();
  const sg = song ? data.songs.get(data.settings.songId as string) : undefined, sit = useRef<SongItem>(), draft = useRef<Medley>();
  // A música avulsa ganha um repertório só na memória (a folha precisa dele); nunca é gravado.
  if(sg && sit.current?.songId !== sg.id){ sit.current = store.newItem(sg.id); draft.current = {id: store.SONG_DRAFT, kind: "setlist", name: "", items: [sit.current], options: {...current().options}}; }
  if(sg && draft.current) draft.current.name = sg.title || t("song.newTitle");
  // Música que sumiu (excluída aqui ou na nuvem) volta uma vez só, para a aba de onde veio; chamar o Voltar também no excluir pulava duas telas.
  useEffect(() => { if(song && !sg) goBack("group"); }, [song, sg]);
  // Membros do grupo para a lista de quem faz o solo (usa a cópia do aparelho se já houver).
  useEffect(() => { if(!useGroups.getState().loaded) loadGroups(); }, []);
  // Quem não lidera o grupo só lê: fica na folha, sem editar, excluir ou criar.
  const canEdit = useCanEdit();
  const pane = canEdit && data.settings.pane !== "sheet" ? "edit" : "sheet";
  const m = song && draft.current ? draft.current : current(), back = data.medleys.get(data.settings.returnTo as string);
  // Ao sair (ou trocar de repertório), apaga o rascunho que ficou vazio. Adiado um tick para o StrictMode não apagar à toa.
  useEffect(() => () => { setTimeout(() => {
    if(drafts.has(m.id) && (useUI.getState().view !== "medley" || data.settings.currentMedley !== m.id)) dropDraft(m.id);
  }); }, [m.id]);
  // Música nova avulsa que ficou vazia: mesma regra do rascunho de repertório.
  const sgId = sg?.id;
  useEffect(() => () => { if(!sgId) return; setTimeout(() => {
    if(drafts.has(sgId) && (useUI.getState().view !== "song" || data.settings.songId !== sgId)) dropSongDraft(sgId);
  }); }, [sgId]);
  // Volta pelo histórico (a aba da Biblioteca de onde a pessoa veio) e tira o passo dele; abrir o grupo de novo empilhava a tela e o Voltar girava em círculo.
  const leave = () => goBack("group");
  const n = songItems(m).length, off = m.options.transpose || 0;
  const sub = (n ? t("medley.saved", {songs: songsN(n)}) : t("medley.startHint")) + (off ? " · " + t("medley.transposed", {n: (off > 0 ? "+" : "") + off}) : "");
  if(song && (!sg || !sit.current)) return null;
  return <section className="view" id="view-medley" data-view="medley" aria-labelledby="medley-name">
    <div className="view-head">
      <div className="title-wrap">
        {/* Medley volta para o repertório de onde veio; o resto volta para os Repertórios do Grupo. */}
        <div className="ctx" id="medley-ctx">
          <button className="back-link" id="ctx-back" onClick={() => { if(song) leave(); else if(isMedley(m) && back) openMedley(back.id); else leave(); }}>
            <Icon name="back" sm/><span id="ctx-back-label">{t("ctx.back", {name: song ? t("lib.title") : isMedley(m) && back ? back.name : t("group.setlists")})}</span></button>
          {!song && isMedley(m) && <span className="chip accent"><Icon name="link" sm/><span>{t("ctx.medley")}</span></span>}
        </div>
        {song ? <h1 id="medley-name" className="title-read">{sg!.title || t("song.newTitle")}</h1> : canEdit ? <MedleyName key={m.id} m={m}/> : <h1 id="medley-name" className="title-read">{m.name}</h1>}
        <p className="sub" id="medley-sub">{song ? t("medley.startHint") : sub}</p>
      </div>
      <div className="actions">
        {canEdit && (song || isMedley(m)) && <AddButton r={song ? {kind: "song", id: sg!.id} : {kind: "medley", id: m.id}}/>}
        {canEdit && <><span className="act-sep" aria-hidden="true"/><button className="icon-btn danger line" id="btn-del-medley" aria-label={t("common.delete")} title={t("common.delete")} onClick={async () => {
          if(song){ const n = usage().get(sg!.id) || 0; if(await confirmDialog({title: t("confirm.songTitle"), message: t(n ? "confirm.songUsed" : "confirm.song", {title: sg!.title || t("song.newTitle"), medleys: tn("medley", n)})})){ deleteSong(sg!); } return; }
          // Medley volta para o repertório de onde veio; repertório vai para a Biblioteca.
          if(await confirmDeleteMedley(m) && !(isMedley(m) && back)) leave();
        }}><Icon name="trash"/></button>
        {!song && <button className="btn ghost" id="btn-new-medley" data-tip-key="tip.new" aria-label={t("medley.new")} onClick={() => newMedley()}><Icon name="plus"/><span className="label-lg">{t("medley.new")}</span></button>}</>}
        {!song && <button className="btn primary" id="btn-stage" data-tip-key="tip.stage" onClick={() => useUI.setState({stageOpen: true})}><Icon name="stage"/><span>{t("medley.stage")}</span></button>}
      </div>
    </div>
    {canEdit && <Seg className="block pane-toggle" id="pane-toggle" aria={t("pane.aria")} value={pane} onChange={setPane}
      options={[{v: "edit", label: t("pane.edit")}, {v: "sheet", label: t("pane.sheet")}]}/>}
    <div className="medley-grid" id="medley-grid" data-pane={pane}>
      <div className="pane pane-edit">
        {/* Dica: no celular logo abaixo das abas Editar | Ver folha; no computador, entre a lista e os botões. */}
        {!song && m.items.length > 1 && <DragHint at="top"/>}
        {song ? <ol className="items"><ItemCard m={m} it={sit.current!} i={0} bare/></ol> : <Items m={m}/>}
        {!song && <div className="add-bar">
          <button className="btn soft" id="add-chords" onClick={() => addItem("")}><Icon name="plus"/><span className="lbl-long">{t("add.song")}</span><span className="lbl-short">{t("add.songShort")}</span></button>
          <button className="btn soft" id="add-library" data-tip-key="tip.addLibrary" onClick={() => openDialog("picker", {})}><Icon name="library"/><span className="lbl-long">{t("add.library")}</span><span className="lbl-short">{t("add.libraryShort")}</span></button>
          <button className="btn soft" id="add-medley" data-tip-key="tip.addMedley" hidden={isMedley(m)} onClick={addMedleyBlock}><Icon name="link"/><span>{t("add.medley")}</span></button>
        </div>}
      </div>
      <SheetPane m={m}><Sheet m={m}/></SheetPane>
    </div>
  </section>;
}

function MedleyName({m}: {m: Medley}){
  const [v, setV] = useSynced(m.name);
  // Salva a cada tecla; ao sair do campo, mostra o "✓ Salvo" do perfil se o nome mudou.
  const before = useRef(m.name);
  // Campo de várias linhas (sem Enter): no celular, nome comprido quebra em vez de ficar cortado.
  return <div className="field title-field">
    <textarea id="medley-name" className="title-input" rows={1} aria-label={t("medley.nameAria")} maxLength={80} autoComplete="off" value={v}
      onFocus={() => { before.current = m.name; }}
      onChange={e => { const x = e.target.value.replace(/\s*\n\s*/g, " "); setV(x); m.name = x.trim() || t("medley.noName"); drafts.delete(m.id); store.saveMedley(m); }}
      onBlur={e => { if(m.name !== before.current) flashSaved(e.currentTarget); }}
      onKeyDown={e => { if(e.key === "Enter"){ e.preventDefault(); e.currentTarget.blur(); } }}/></div>;
}

// Arrastar o cartão: tira o item do lugar antigo e põe no novo, salvando uma vez só.
function reorder(from: number, to: number){
  const m = current(), [it] = m.items.splice(from, 1);
  m.items.splice(to, 0, it); store.saveMedley(m);
  flushSync(() => store.touchNow());
}
// Dica de arrastar, sempre visível com 2 itens ou mais (só uma das duas aparece, conforme a largura).
function DragHint({at}: {at: "top" | "bottom"}){
  const touch = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
  return <p className={"drag-hint " + at}><Icon name="grip" sm/><span>{t(touch ? "item.dragHintTouch" : "item.dragHint")}</span></p>;
}
function Items({m}: {m: Medley}){
  const list = useRef<HTMLOListElement>(null);
  useDragSort(list, reorder);
  return <ol className="items" id="items" ref={list}>
    {!m.items.length && <li className="empty-state"><Icon name="music"/><strong>{t(isMedley(m) ? "mblock.emptyTitle" : "medley.emptyTitle")}</strong><span>{t(isMedley(m) ? "mblock.emptyText" : "medley.emptyText")}</span></li>}
    {m.items.map((it, i) => it.type === "medley" ? <MedleyCard key={it.id} m={m} it={it} i={i}/> : <ItemCard key={it.id} m={m} it={it} i={i}/>)}
  </ol>;
}

// Alça para mudar a ordem: arrasta pelo número (mouse ou dedo) ou, no teclado, foca e usa ↑ ↓.
// Com mouse, o número vira ⠿ ao passar sobre o cartão; no toque, ao segurar (o arraste ativa).
function DragHandle({id, n}: {id: string; n: number}){
  const key = (e: React.KeyboardEvent) => {
    if(e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault(); moveItem(id, e.key === "ArrowUp" ? -1 : 1);
  };
  return <button type="button" className="drag-handle" data-drag data-tip-key="item.drag" aria-label={t("item.dragAria", {n})} onKeyDown={key}>
    <span className="num"><span className="num-n">{n}</span><Icon name="grip" sm className="grip-hover"/></span>
  </button>;
}
function ItemActions({it, children, after}: {it: {id: string}; children?: React.ReactNode; after?: React.ReactNode}){
  return <div className="item-actions">{children}
    <button className="icon-btn sm danger" data-a="rm" aria-label={t("item.remove")} onClick={e => removeItem(it.id, e.currentTarget.closest(".item"))}><Icon name="x" sm/></button>
    {after}
  </div>;
}

// Momento do culto (Louvor, o padrão, ou Pós-pregação) de uma música ou de um medley no repertório.
// Dentro do medley não aparece: as músicas dele seguem o momento do medley.
function MomentSeg({m, it}: {m: Medley; it: SongItem | MedleyItem}){
  return <Seg className="sm moment-seg" aria={t("item.momentAria")} value={it.moment || ""}
    onChange={(v: Moment) => { it.moment = v; store.saveMedley(m); }}
    options={[{v: "", label: t("item.momentLouvor")}, {v: "pos", label: t("item.momentPos")}]}/>;
}
// Louvor é o padrão e não ganha chip (seria ruído em toda música); só a Pós-pregação aparece.
const momentChip = (it: SongItem | MedleyItem) => it.moment === "pos" ? <span key="mo" className="chip moment-chip">{t("item.momentPos")}</span> : null;

function MedleyCard({m, it, i}: {m: Medley; it: MedleyItem; i: number}){
  const md = data.medleys.get(it.medleyId);
  // Cada música com o tom em que toca no medley (só as com cifra têm tom).
  const songs = md ? md.items.flatMap(x => {
    const s = x.type === "medley" ? null : data.songs.get(x.songId);
    if(!s || !s.title) return [];
    const k = s.type !== "letra" && s.text.trim() ? eff(s, x as SongItem).target || songKey(s) : "";
    return [{title: s.title, key: k}];
  }) : [];
  const titles = songs.map(x => x.title);
  // Tom no card: um só quando todas tocam no mesmo; senão a sequência (E → D), sem repetir os seguidos.
  const keys = songs.map(x => x.key).filter(Boolean).filter((k, j, a) => k !== a[j-1]);
  const sameKey = new Set(keys).size === 1;
  // Abre e fecha como as músicas: aberto, mostra as músicas e entra na folha ao lado. O lápis edita o medley.
  const open = useUI(st => st.expanded.has(it.id));
  const toggle = (e: React.MouseEvent) => { const li = e.currentTarget.closest(".item"); toggleExpanded(it.id); if(!open) reveal(li); };
  const edit = () => { if(md) openMedley(md.id, {from: m.id}); };
  return <li className={"item medley-item" + (open ? "" : " collapsed")} data-id={it.id}>
    <div className="item-head">
      <DragHandle id={it.id} n={i+1}/>
      <button className="item-toggle" aria-expanded={open} onClick={toggle}><span className="item-title">{md ? md.name : t("mblock.missing")}</span>
        <span className="item-chips">{keys.length > 0 && <span className="chip accent key-chip">{keys.join(" → ")}</span>}
          <span className="chip"><Icon name="link" sm/> {t("mblock.chip", {songs: songsN(titles.length)})}</span>{momentChip(it)}</span></button>
      <ItemActions it={it} after={<button className="icon-btn sm" data-a="toggle" aria-label={t(open ? "common.close" : "common.open")} onClick={toggle}><Icon name="chev" sm className="chev"/></button>}>
        {md && <button className="icon-btn sm" data-a="open-medley" aria-label={t("mblock.edit")} onClick={edit}><Icon name="edit" sm/></button>}
      </ItemActions>
    </div>
    <div className="item-body"><div>
      <div className="medley-songs"><MomentSeg m={m} it={it}/>{songs.length ? <ol>{songs.map((x, k) => <li key={k}>{x.title}{!sameKey && x.key && <span className="chip key-chip">{x.key}</span>}</li>)}</ol> : <p className="sub">{t("mblock.empty")}</p>}</div>
    </div></div>
  </li>;
}

// bare: música avulsa (página de música nova), sem o que é do repertório (ordem, momento, solo, remover).
function ItemCard({m, it, i, bare}: {m: Medley; it: SongItem; i: number; bare?: boolean}){
  let s = data.songs.get(it.songId);
  if(!s){ s = store.createSong({}); it.songId = s.id; }
  const song: Song = s;
  const expanded = useUI(st => st.expanded.has(it.id)), open = bare || expanded;
  const ref = useRef<HTMLLIElement>(null);
  // A música fica enxuta, no repertório e no medley: só tom, solo, BPM e referência.
  const letra = isLyricsOnly(song), a = arrangementOf(song, it), e = eff(song, it);
  const [text, setText] = useSynced(song.text);
  const [bpm, setBpm] = useSynced(song.bpm || "");
  const [refUrl, setRef] = useSynced(song.ref || "");
  const saveSong = () => store.saveSong(song);
  // Com um arranjo antigo escolhido, o tom muda o arranjo (vale em todos os repertórios que o usam).
  const setTarget = (v: string) => { if(bare){ song.key = v; saveSong(); } else if(a){ a.target = v; saveSong(); } else { it.target = v; store.saveMedley(m); } };
  const key = songKey(song);
  // A primeira linha fica toda para o nome; tom, Pós-pregação e o resto vão na de baixo.
  const chips: React.ReactNode[] = [];
  if(!letra && key && song.text.trim()) chips.push(<span key="k" className="chip accent key-chip">{e.target && e.target !== key ? key + " → " + e.target : key}</span>);
  if(!isMedley(m)) chips.push(momentChip(it));
  if(letra) chips.push(<span key="l" className="chip">{t("item.lyricsOnly")}</span>);
  else {
    if(a) chips.push(<span key="a" className="chip">{a.name}</span>);
    if(e.capo) chips.push(<span key="c" className="chip">{t("item.capoChip", {n:e.capo})}</span>);
    if(song.bpm) chips.push(<span key="b" className="chip">{t("sheet.bpm", {n:song.bpm})}</span>);
  }
  if(it.singer) chips.push(<span key="s" className="chip">{it.singer}</span>);
  if(!letra && it.solo) chips.push(<span key="so" className="chip">{t("sheet.solo", {name: it.solo})}</span>);
  const toggle = () => {
    toggleExpanded(it.id);
    if(!open){ setTimeout(() => ref.current?.querySelector("textarea")?.focus({preventScroll:true}), 120); reveal(ref.current); }
  };
  // Montar cifra: os acordes entram no texto; com acordes, a música passa a ser "com cifra".
  const ear = () => openDialog("ear", {text: song.text, songKey: song.key, onApply: (nt, k) => {
    song.text = nt; song.title = songTitle(nt);
    const p = parseSong(nt);
    if(p.blocks.some(b => b.some(x => x.chord))){ song.type = ""; if(!song.key && detectKey(p) !== k) song.key = k; }
    saveSong();
  }});
  return <li ref={ref} className={"item" + (open ? "" : " collapsed")} data-id={it.id}>
    {!bare && <div className="item-head">
      <DragHandle id={it.id} n={i+1}/>
      <button className="item-toggle" aria-expanded={open} onClick={toggle}>
        <span className="item-title">{song.title || t("item.newSong")}</span>
        {chips.some(Boolean) && <span className="item-chips">{chips}</span>}</button>
      <ItemActions it={it} after={<button className="icon-btn sm" data-a="toggle" aria-label={t(open ? "common.close" : "common.open")} onClick={toggle}><Icon name="chev" sm className="chev"/></button>}>
        <button className="icon-btn sm ref-btn" data-a="ref" aria-label={t("ref.listen")} title={t("ref.listen")} hidden={!song.ref} onClick={() => openRef(song.ref || "", song.title)}><Icon name="play" sm/></button>
      </ItemActions>
    </div>}
    <div className="item-body"><div><div className="item-inner">
      <div className="type-row">
        <button type="button" className="btn soft sm" data-a="ear" data-tip-key="tip.ear" disabled={!song.title} onClick={ear}><Icon name="music" sm/> {t("ear.open")}</button>
        {!bare && <button type="button" className="btn soft sm" data-a="copy-lyrics" disabled={!song.title} onClick={() => { const s = sheetSongs(m).find(x => x.itemId === it.id); if(s) copySheet(m, [s]); }}><Icon name="copy" sm/> {t("item.copy." + sheetMode())}</button>}
        {!isMedley(m) && !bare && <MomentSeg m={m} it={it}/>}</div>
      <textarea className="input song-text" spellCheck={false} aria-label={t("item.textAria", {n:i+1})} placeholder={t(letra ? "item.phLyrics" : "item.phChords")} autoFocus={bare}
        value={text} onChange={ev => { const v = ev.target.value; setText(v); song.text = v; song.title = songTitle(v);
          // O tipo acompanha o texto: sem nenhum acorde é só letra.
          song.type = v.trim() && !parseSong(v).blocks.some(b => b.some(x => x.chord)) ? "letra" : ""; saveSong(); }}/>
      <p className="note song-hint">{t("item.chorusHint")}</p>
      {/* Só o tom fica à vista (o tom em que a música toca; a cifra é transposta para ele). Solo, BPM e referência
          ficam em "Mais detalhes", aberto sozinho quando algum já está preenchido. */}
      <div className="fields item-fields">
        <label className="field" data-key-field hidden={letra}>{t("item.keyShort")}<Select f="target" value={bare ? song.key : e.target}
          options={keyOptions(key ? t("item.autoKey", {key}) : t("item.auto"))} onChange={setTarget}/></label>
      </div>
      <details className="item-more" open={!!(it.solo || song.bpm || song.ref) || !!bare}><summary>{t("item.more")}</summary>
      <div className="fields item-fields">
        <SoloField hidden={letra || !!bare} value={it.solo || ""} onChange={v => { it.solo = v; store.saveMedley(m); }}/>
        <label className="field" hidden={letra}>{t("item.bpm")}<input className="input" data-f="bpm" type="number" inputMode="numeric" min={20} max={300} placeholder="—" value={bpm}
          onChange={ev => { setBpm(ev.target.value); const v = +ev.target.value; song.bpm = v > 0 && v < 400 ? String(Math.round(v)) : ""; saveSong(); }}/></label>
        <label className="field wide">{t("item.ref")}<input className="input" data-f="ref" type="url" inputMode="url" autoComplete="off" placeholder={t("item.refPh")} value={refUrl}
          onChange={ev => setRef(ev.target.value)}
          onBlur={ev => {
            const v = sanitizeUrl(ev.target.value);
            if(ev.target.value.trim() && !v) toast(t("ref.bad"));
            else if(v !== (song.ref || "")) flashSaved(ev.currentTarget);
            song.ref = v; setRef(v); saveSong();
          }}/></label>
      </div>
      </details>
    </div></div></div>
  </li>;
}

// Quem faz o solo: a lista vem dos membros do grupo; sem grupo, escreve o nome. Um nome que não está
// mais no grupo continua na lista para não sumir.
function SoloField({hidden, value, onChange}: {hidden: boolean; value: string; onChange: (v: string) => void}){
  const members = useGroups(s => s.members);
  const [v, setV] = useSynced(value);
  const names = [...new Set(members.map(x => x.name || x.email.split("@")[0]))].sort((a, b) => a.localeCompare(b, locale()));
  if(!names.length) return <label className="field" hidden={hidden}>{t("item.solo")}<input className="input" data-f="solo" maxLength={80} placeholder="—" value={v}
    onChange={ev => { setV(ev.target.value); onChange(ev.target.value); }}/></label>;
  if(value && !names.includes(value)) names.push(value);
  return <label className="field" hidden={hidden}>{t("item.solo")}<Select f="solo" value={value} options={[{value: "", label: "—"}, ...names.map(n => ({value: n, label: n}))]} onChange={onChange}/></label>;
}

export function openRef(url: string, title: string){
  if(!url) return;
  if(!youtubeId(url)){ window.open(url, "_blank", "noopener"); return; }
  openDialog("player", {url, title});
}
