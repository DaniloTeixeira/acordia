// Página Repertório: o repertório (ou medley) aberto, com a edição das músicas e a folha A4.
import { useRef } from "react";
import { flushSync } from "react-dom";
import { KEYS, MINOR_KEYS, songTitle, sanitizeUrl, youtubeId } from "../lib/core";
import { suggestCapo } from "../lib/instruments";
import { t, tn, locale } from "../lib/i18n";
import * as store from "../lib/store";
import { reduced, vt } from "../lib/util";
import { useUI, useData, toast, openDialog, toggleExpanded, go } from "../state";
import { current, isMedley, openMedley, songItems, arrangementOf, eff, songKey, medleyPayload } from "../repertoire";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select, type Options } from "../ui/Select";
import { useSynced } from "../ui/hooks";
import { Sheet, SheetPane } from "./Sheet";
import type { Medley, MedleyItem, SongItem, Song } from "../lib/types";

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
  const it = store.newItem(s.id); m.items.push(it); toggleExpanded(it.id, true);
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
  });
  const after = () => {
    items().forEach(el => el.style.viewTransitionName = "");
    const li = document.querySelector<HTMLElement>(`.item[data-id="${id}"]`); if(!li) return;
    li.classList.add("moved");
    const b = li.querySelector<HTMLButtonElement>(`[data-a="${dir<0?"up":"down"}"]`);
    (b && !b.disabled ? b : li.querySelector<HTMLButtonElement>(`[data-a="${dir<0?"down":"up"}"]`))?.focus();
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
  const pane = data.settings.pane === "sheet" ? "sheet" : "edit";
  const m = current(), back = data.medleys.get(data.settings.returnTo as string);
  const n = songItems(m).length, off = m.options.transpose || 0;
  const sub = (n ? t("medley.saved", {songs: songsN(n)}) : t("medley.startHint")) + (off ? " · " + t("medley.transposed", {n: (off > 0 ? "+" : "") + off}) : "");
  return <section className="view" id="view-medley" data-view="medley" aria-labelledby="medley-name">
    <div className="view-head">
      <div className="title-wrap">
        <div className="ctx" id="medley-ctx" hidden={!isMedley(m)}>
          <button className="btn ghost sm back" id="ctx-back" hidden={!(isMedley(m) && back)} onClick={() => { if(back) openMedley(back.id); }}>
            <Icon name="back" sm/><span id="ctx-back-label">{back ? t("ctx.back", {name: back.name}) : ""}</span></button>
          <span className="chip accent"><Icon name="link" sm/><span>{t("ctx.medley")}</span></span>
        </div>
        <MedleyName key={m.id} m={m}/>
        <p className="sub" id="medley-sub">{sub}</p>
      </div>
      <div className="actions">
        <button className="btn ghost" id="btn-new-medley" data-tip-key="tip.new" onClick={newMedley}><Icon name="plus"/><span className="label-lg">{t("medley.new")}</span></button>
        <button className="btn ghost" id="btn-share" data-tip-key="tip.share" onClick={() => shareMedley(m)}><Icon name="share"/><span className="label-lg">{t("medley.share")}</span></button>
        <button className="btn primary" id="btn-stage" data-tip-key="tip.stage" onClick={() => useUI.setState({stageOpen: true})}><Icon name="stage"/><span>{t("medley.stage")}</span></button>
      </div>
    </div>
    <Seg className="block pane-toggle" id="pane-toggle" aria={t("pane.aria")} value={pane} onChange={setPane}
      options={[{v: "edit", label: t("pane.edit")}, {v: "sheet", label: t("pane.sheet")}]}/>
    <div className="medley-grid" id="medley-grid" data-pane={pane}>
      <div className="pane pane-edit">
        <Items m={m}/>
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

export function shareMedley(m: Medley){
  if(!medleyPayload(m).songs.length) return toast(t("share.needSong"));
  openDialog("share", {medley: m});
}

function MedleyName({m}: {m: Medley}){
  const [v, setV] = useSynced(m.name);
  return <input id="medley-name" className="title-input" aria-label={t("medley.nameAria")} maxLength={80} autoComplete="off" value={v}
    onChange={e => { setV(e.target.value); m.name = e.target.value.trim() || t("medley.noName"); store.saveMedley(m); }}
    onKeyDown={e => { if(e.key === "Enter") e.currentTarget.blur(); }}/>;
}

function Items({m}: {m: Medley}){
  return <ol className="items" id="items">
    {!m.items.length && <li className="empty-state"><Icon name="music"/><strong>{t(isMedley(m) ? "mblock.emptyTitle" : "medley.emptyTitle")}</strong><span>{t(isMedley(m) ? "mblock.emptyText" : "medley.emptyText")}</span></li>}
    {m.items.map((it, i) => it.type === "medley" ? <MedleyCard key={it.id} m={m} it={it} i={i}/> : <ItemCard key={it.id} m={m} it={it} i={i}/>)}
  </ol>;
}

function ItemActions({m, it, i, children, after}: {m: Medley; it: {id: string}; i: number; children?: React.ReactNode; after?: React.ReactNode}){
  return <div className="item-actions">{children}
    <button className="icon-btn sm" data-a="up" aria-label={t("item.up")} disabled={i === 0} onClick={() => moveItem(it.id, -1)}><Icon name="up" sm/></button>
    <button className="icon-btn sm" data-a="down" aria-label={t("item.down")} disabled={i === m.items.length - 1} onClick={() => moveItem(it.id, 1)}><Icon name="down" sm/></button>
    <button className="icon-btn sm danger" data-a="rm" aria-label={t("item.remove")} onClick={e => removeItem(it.id, e.currentTarget.closest(".item"))}><Icon name="x" sm/></button>
    {after}
  </div>;
}

function MedleyCard({m, it, i}: {m: Medley; it: MedleyItem; i: number}){
  const md = data.medleys.get(it.medleyId);
  const titles = md ? md.items.map(x => x.type === "medley" ? "" : (data.songs.get(x.songId) || {title: ""}).title).filter(Boolean) : [];
  const open = () => { if(md) openMedley(md.id, {from: m.id}); };
  return <li className="item medley-item" data-id={it.id}>
    <div className="item-head">
      <span className="num">{i+1}</span>
      <button className="item-toggle" data-a="open-medley" onClick={open}><span className="item-title">{md ? md.name : t("mblock.missing")}</span>
        <span className="item-chips"><span className="chip accent"><Icon name="link" sm/> {t("mblock.chip", {songs: songsN(titles.length)})}</span></span></button>
      <ItemActions m={m} it={it} i={i}/>
    </div>
    <div className="medley-songs">{titles.length ? <ol>{titles.map((x, k) => <li key={k}>{x}</li>)}</ol> : <p className="sub">{t("mblock.empty")}</p>}
      <button className="btn soft sm" data-a="open-medley" onClick={open}><Icon name="edit" sm/> {t("mblock.edit")}</button></div>
  </li>;
}

function ItemCard({m, it, i}: {m: Medley; it: SongItem; i: number}){
  let s = data.songs.get(it.songId);
  if(!s){ s = store.createSong({}); it.songId = s.id; }
  const song: Song = s;
  const open = useUI(st => st.expanded.has(it.id));
  const ref = useRef<HTMLLIElement>(null);
  const letra = song.type === "letra", a = arrangementOf(song, it), e = eff(song, it), arrs = song.arrangements || [];
  const [text, setText] = useSynced(song.text);
  const [bpm, setBpm] = useSynced(song.bpm || "");
  const [singer, setSinger] = useSynced(it.singer || "");
  const [notes, setNotes] = useSynced(e.notes || "");
  const [refUrl, setRef] = useSynced(song.ref || "");
  const saveSong = () => store.saveSong(song);
  // Com arranjo escolhido, tom/capo/observações mudam o arranjo (vale em todos os repertórios).
  const setField = (f: "target" | "capo" | "notes", v: string) => { const cur = arrangementOf(song, it); if(cur){ cur[f] = v; saveSong(); } else { it[f] = v; store.saveMedley(m); } };
  const key = songKey(song), auto = song.type !== "letra" && song.text.trim() ? songKey({...song, key: ""}) : "";
  // Sugestão de capotraste para quem toca cordas (desenhos fáceis no tom de execução).
  const inst = instrument(), playKey = e.target || key;
  const sug = !letra && playKey ? suggestCapo(playKey, inst) : null;
  const showHint = !!sug && e.capo !== String(sug.capo);
  const chips: React.ReactNode[] = [];
  if(letra) chips.push(<span key="l" className="chip">{t("item.lyricsOnly")}</span>);
  else {
    if(key && song.text.trim()) chips.push(<span key="k" className="chip accent">{e.target && e.target !== key ? key + " → " + e.target : key}</span>);
    if(a) chips.push(<span key="a" className="chip">{a.name}</span>);
    if(e.capo) chips.push(<span key="c" className="chip">{t("item.capoChip", {n:e.capo})}</span>);
    if(song.bpm) chips.push(<span key="b" className="chip">{t("sheet.bpm", {n:song.bpm})}</span>);
  }
  if(it.singer) chips.push(<span key="s" className="chip">{it.singer}</span>);
  const toggle = () => {
    toggleExpanded(it.id);
    if(!open) setTimeout(() => ref.current?.querySelector("textarea")?.focus({preventScroll:true}), 120);
  };
  const capoOpts: Options = [{value: "", label: "—"}, ...Array.from({length: 11}, (_, k) => ({value: String(k + 1), label: String(k + 1)}))];
  return <li ref={ref} className={"item" + (open ? "" : " collapsed")} data-id={it.id}>
    <div className="item-head">
      <span className="num">{i+1}</span>
      <button className="item-toggle" aria-expanded={open} onClick={toggle}><span className="item-title">{song.title || t("item.newSong")}</span><span className="item-chips">{chips}</span></button>
      <ItemActions m={m} it={it} i={i} after={<button className="icon-btn sm" data-a="toggle" aria-label={t("item.toggle")} onClick={toggle}><Icon name="chev" sm className="chev"/></button>}>
        <button className="icon-btn sm ref-btn" data-a="ref" aria-label={t("ref.listen")} title={t("ref.listen")} hidden={!song.ref} onClick={() => openRef(song.ref || "", song.title)}><Icon name="play" sm/></button>
      </ItemActions>
    </div>
    <div className="item-body"><div><div className="item-inner">
      <Seg className="sm" aria={t("item.typeAria")} value={song.type || ""} onChange={v => { song.type = v; saveSong(); }}
        options={[{v: "", label: t("item.withChords")}, {v: "letra", label: t("item.lyricsOnly")}]}/>
      <textarea className="input song-text" spellCheck={false} aria-label={t("item.textAria", {n:i+1})} placeholder={t(letra ? "item.phLyrics" : "item.phChords")}
        value={text} onChange={ev => { setText(ev.target.value); song.text = ev.target.value; song.title = songTitle(ev.target.value); saveSong(); }}/>
      <div className="fields">
        <label className="field wide" hidden={letra}>{t("arr.label")}<span className="arr-row">
          <Select f="arr" value={a ? a.id : ""} options={[{value: "", label: t("arr.none")}, ...arrs.map(x => ({value: x.id, label: x.name}))]}
            onChange={v => { it.arrangementId = v; store.saveMedley(m); }} className="arr-select"/>
          <button type="button" className="btn ghost sm" data-a="arr-save" onClick={() => openDialog("arr", {medley: m, song, item: it})}><Icon name="plus" sm/> {t("arr.save")}</button></span>
          {a && <small className="arr-hint">{t("arr.shared")}</small>}</label>
        <label className="field" hidden={letra}>{t("item.key")}<Select f="key" value={song.key} options={keyOptions(auto ? t("item.autoKey", {key: auto}) : t("item.auto"))} onChange={v => { song.key = v; saveSong(); }}/></label>
        <label className="field" hidden={letra}>{t("item.target")}<Select f="target" value={e.target} options={keyOptions(t("item.sameKey"))} onChange={v => setField("target", v)}/></label>
        <label className="field" hidden={letra}>{t("item.capo")}<Select f="capo" value={e.capo} options={capoOpts} onChange={v => setField("capo", v)}/></label>
        <p className="capo-hint wide" data-capo-hint="" hidden={!showHint}>{sug && <>{t("capo.suggest", {inst: t("inst." + inst).toLowerCase(), capo: sug.capo, shape: sug.shapeKey})} <button type="button" className="link-btn" onClick={() => setField("capo", String(sug.capo))}>{t("capo.use")}</button></>}</p>
        <label className="field" hidden={letra}>{t("item.bpm")}<input className="input" data-f="bpm" type="number" inputMode="numeric" min={20} max={300} placeholder="—" value={bpm}
          onChange={ev => { setBpm(ev.target.value); const v = +ev.target.value; song.bpm = v > 0 && v < 400 ? String(Math.round(v)) : ""; saveSong(); }}/></label>
        <label className="field" style={{gridColumn: "span 2"}}>{t("item.singer")}<input className="input" data-f="singer" maxLength={80} placeholder="—" value={singer}
          onChange={ev => { setSinger(ev.target.value); it.singer = ev.target.value; store.saveMedley(m); }}/></label>
        <label className="field wide">{t("item.notes")}<input className="input" data-f="notes" maxLength={300} placeholder={t("item.notesPh")} value={notes}
          onChange={ev => { setNotes(ev.target.value); setField("notes", ev.target.value); }}/></label>
        <label className="field wide">{t("item.ref")}<input className="input" data-f="ref" type="url" inputMode="url" autoComplete="off" placeholder={t("item.refPh")} value={refUrl}
          onChange={ev => setRef(ev.target.value)}
          onBlur={ev => {
            const v = sanitizeUrl(ev.target.value);
            if(ev.target.value.trim() && !v) toast(t("ref.bad"));
            song.ref = v; setRef(v); saveSong();
          }}/></label>
      </div>
    </div></div></div>
  </li>;
}

export function openRef(url: string, title: string){
  if(!url) return;
  if(!youtubeId(url)){ window.open(url, "_blank", "noopener"); return; }
  openDialog("player", {url, title});
}
