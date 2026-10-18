// Página Repertório: o repertório (ou medley) aberto, com a edição das músicas e a folha A4.
import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { KEYS, MINOR_KEYS, songTitle, sanitizeUrl, youtubeId, parseSong, detectKey } from "../lib/core";
import { t, tn, locale } from "../lib/i18n";
import * as store from "../lib/store";
import { reduced, vt, flashSaved } from "../lib/util";
import { useUI, useData, toast, openDialog, toggleExpanded, go } from "../state";
import { current, isMedley, openMedley, songItems, arrangementOf, eff, songKey, lastPlayKey } from "../repertoire";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select, type Options } from "../ui/Select";
import { useSynced } from "../ui/hooks";
import { useDragSort } from "../ui/dragSort";
import { useGroups, loadGroups } from "../lib/groups";
import { Sheet, SheetPane } from "./Sheet";
import { confirmDeleteMedley, openLibrary } from "./Library";
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

export function newMedley(){
  const m = store.createMedley(t("medley.newName", {date: new Date().toLocaleDateString(locale(), {day:"2-digit", month:"2-digit"})}));
  store.setSetting("currentMedley", m.id); store.setSetting("returnTo", "");
  useUI.setState({expanded: new Set()});
  go("medley");
  setTimeout(() => { const name = document.querySelector<HTMLInputElement>("#medley-name"); name?.focus(); name?.select(); }, 50);
  toast(t("medley.created"));
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

export function Repertoire(){
  useData();
  // Membros do grupo para a lista de quem faz o solo (usa a cópia do aparelho se já houver).
  useEffect(() => { if(!useGroups.getState().loaded) loadGroups(); }, []);
  const pane = data.settings.pane === "sheet" ? "sheet" : "edit";
  const m = current(), back = data.medleys.get(data.settings.returnTo as string);
  const n = songItems(m).length, off = m.options.transpose || 0;
  const sub = (n ? t("medley.saved", {songs: songsN(n)}) : t("medley.startHint")) + (off ? " · " + t("medley.transposed", {n: (off > 0 ? "+" : "") + off}) : "");
  return <section className="view" id="view-medley" data-view="medley" aria-labelledby="medley-name">
    <div className="view-head">
      <div className="title-wrap">
        {/* Medley volta para o repertório de onde veio; o resto volta para a lista na Biblioteca. */}
        <div className="ctx" id="medley-ctx">
          <button className="btn ghost sm back" id="ctx-back" onClick={() => { if(isMedley(m) && back) openMedley(back.id); else openLibrary(isMedley(m) ? "medleys" : "setlists"); }}>
            <Icon name="back" sm/><span id="ctx-back-label">{t("ctx.back", {name: isMedley(m) && back ? back.name : t("nav.library")})}</span></button>
          {isMedley(m) && <span className="chip accent"><Icon name="link" sm/><span>{t("ctx.medley")}</span></span>}
        </div>
        <MedleyName key={m.id} m={m}/>
        <p className="sub" id="medley-sub">{sub}</p>
      </div>
      <div className="actions">
        <button className="icon-btn danger" id="btn-del-medley" aria-label={t("common.delete")} title={t("common.delete")} onClick={async () => {
          // Medley volta para o repertório de onde veio; repertório vai para a Biblioteca.
          if(await confirmDeleteMedley(m) && !(isMedley(m) && back)) openLibrary(isMedley(m) ? "medleys" : "setlists");
        }}><Icon name="trash"/></button>
        <button className="btn ghost" id="btn-new-medley" data-tip-key="tip.new" aria-label={t("medley.new")} onClick={newMedley}><Icon name="plus"/><span className="label-lg">{t("medley.new")}</span></button>
        <button className="btn primary" id="btn-stage" data-tip-key="tip.stage" onClick={() => useUI.setState({stageOpen: true})}><Icon name="stage"/><span>{t("medley.stage")}</span></button>
      </div>
    </div>
    <Seg className="block pane-toggle" id="pane-toggle" aria={t("pane.aria")} value={pane} onChange={setPane}
      options={[{v: "edit", label: t("pane.edit")}, {v: "sheet", label: t("pane.sheet")}]}/>
    <div className="medley-grid" id="medley-grid" data-pane={pane}>
      <div className="pane pane-edit">
        <Items m={m}/>
        {m.items.length > 1 && <DragHint/>}
        <div className="add-bar">
          <button className="btn soft" id="add-chords" onClick={() => addItem("")}><Icon name="plus"/><span>{t("add.chords")}</span></button>
          <button className="btn soft" id="add-lyrics" onClick={() => addItem("letra")}><Icon name="text"/><span>{t("add.lyrics")}</span></button>
          <button className="btn soft" id="add-library" data-tip-key="tip.addLibrary" onClick={() => openDialog("picker", {})}><Icon name="library"/><span>{t("add.library")}</span></button>
          <button className="btn soft" id="add-medley" data-tip-key="tip.addMedley" hidden={isMedley(m)} onClick={addMedleyBlock}><Icon name="link"/><span>{t("add.medley")}</span></button>
        </div>
      </div>
      <SheetPane m={m}><Sheet m={m}/></SheetPane>
    </div>
  </section>;
}

function MedleyName({m}: {m: Medley}){
  const [v, setV] = useSynced(m.name);
  // Salva a cada tecla; ao sair do campo, mostra o "✓ Salvo" do perfil se o nome mudou.
  const before = useRef(m.name);
  return <div className="field title-field">
    <input id="medley-name" className="title-input" aria-label={t("medley.nameAria")} maxLength={80} autoComplete="off" value={v}
      onFocus={() => { before.current = m.name; }}
      onChange={e => { setV(e.target.value); m.name = e.target.value.trim() || t("medley.noName"); store.saveMedley(m); }}
      onBlur={e => { if(m.name !== before.current) flashSaved(e.currentTarget); }}
      onKeyDown={e => { if(e.key === "Enter") e.currentTarget.blur(); }}/></div>;
}

// Arrastar o cartão: tira o item do lugar antigo e põe no novo, salvando uma vez só.
function reorder(from: number, to: number){
  const m = current(), [it] = m.items.splice(from, 1);
  m.items.splice(to, 0, it); store.saveMedley(m);
  flushSync(() => store.touchNow());
}
// Dica de arrastar, sempre visível com 2 itens ou mais.
function DragHint(){
  const touch = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
  return <p className="drag-hint"><Icon name="grip" sm/><span>{t(touch ? "item.dragHintTouch" : "item.dragHint")}</span></p>;
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
// Com mouse, o número vira ⠿ ao passar sobre o cartão; no toque, o ⠿ fica sempre ao lado do número.
function DragHandle({id, n}: {id: string; n: number}){
  const key = (e: React.KeyboardEvent) => {
    if(e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault(); moveItem(id, e.key === "ArrowUp" ? -1 : 1);
  };
  return <button type="button" className="drag-handle" data-drag data-tip-key="item.drag" aria-label={t("item.dragAria", {n})} onKeyDown={key}>
    <Icon name="grip" sm className="grip-touch"/>
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
  const toggle = () => toggleExpanded(it.id);
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

function ItemCard({m, it, i}: {m: Medley; it: SongItem; i: number}){
  let s = data.songs.get(it.songId);
  if(!s){ s = store.createSong({}); it.songId = s.id; }
  const song: Song = s;
  const open = useUI(st => st.expanded.has(it.id));
  const ref = useRef<HTMLLIElement>(null);
  // A música fica enxuta, no repertório e no medley: só tom, solo, BPM e referência.
  const letra = song.type === "letra", a = arrangementOf(song, it), e = eff(song, it);
  const [text, setText] = useSynced(song.text);
  const [bpm, setBpm] = useSynced(song.bpm || "");
  const [refUrl, setRef] = useSynced(song.ref || "");
  const saveSong = () => store.saveSong(song);
  // Com um arranjo antigo escolhido, o tom muda o arranjo (vale em todos os repertórios que o usam).
  const setTarget = (v: string) => { if(a){ a.target = v; saveSong(); } else { it.target = v; store.saveMedley(m); } };
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
    if(!open) setTimeout(() => ref.current?.querySelector("textarea")?.focus({preventScroll:true}), 120);
  };
  // Montar cifra: os acordes entram no texto; com acordes, a música passa a ser "com cifra".
  const ear = () => openDialog("ear", {text: song.text, songKey: song.key, onApply: (nt, k) => {
    song.text = nt; song.title = songTitle(nt);
    const p = parseSong(nt);
    if(p.blocks.some(b => b.some(x => x.chord))){ song.type = ""; if(!song.key && detectKey(p) !== k) song.key = k; }
    saveSong();
  }});
  return <li ref={ref} className={"item" + (open ? "" : " collapsed")} data-id={it.id}>
    <div className="item-head">
      <DragHandle id={it.id} n={i+1}/>
      <button className="item-toggle" aria-expanded={open} onClick={toggle}>
        <span className="item-title">{song.title || t("item.newSong")}</span>
        {chips.some(Boolean) && <span className="item-chips">{chips}</span>}</button>
      <ItemActions it={it} after={<button className="icon-btn sm" data-a="toggle" aria-label={t(open ? "common.close" : "common.open")} onClick={toggle}><Icon name="chev" sm className="chev"/></button>}>
        <button className="icon-btn sm ref-btn" data-a="ref" aria-label={t("ref.listen")} title={t("ref.listen")} hidden={!song.ref} onClick={() => openRef(song.ref || "", song.title)}><Icon name="play" sm/></button>
      </ItemActions>
    </div>
    <div className="item-body"><div><div className="item-inner">
      <div className="type-row"><Seg className="sm" aria={t("item.typeAria")} value={song.type || ""} onChange={v => { song.type = v; saveSong(); }}
        options={[{v: "", label: t("item.withChords")}, {v: "letra", label: t("item.lyricsOnly")}]}/>
        <button type="button" className="btn soft sm" data-a="ear" data-tip-key="tip.ear" disabled={!song.title} onClick={ear}><Icon name="music" sm/> {t("ear.open")}</button>
        {!isMedley(m) && <MomentSeg m={m} it={it}/>}</div>
      <textarea className="input song-text" spellCheck={false} aria-label={t("item.textAria", {n:i+1})} placeholder={t(letra ? "item.phLyrics" : "item.phChords")}
        value={text} onChange={ev => { setText(ev.target.value); song.text = ev.target.value; song.title = songTitle(ev.target.value); saveSong(); }}/>
      <div className="fields item-fields">
        {/* Um campo só para o tom: o tom em que a música toca (a cifra é transposta para ele). */}
        <label className="field" data-key-field hidden={letra}>{t("item.keyShort")}<Select f="target" value={e.target}
          options={keyOptions(key ? t("item.autoKey", {key}) : t("item.auto"))} onChange={setTarget}/></label>
        <SoloField hidden={letra} value={it.solo || ""} onChange={v => { it.solo = v; store.saveMedley(m); }}/>
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
