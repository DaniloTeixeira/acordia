// Janelas do app. Cada uma aparece quando aberta com openDialog(nome, dados).
import { useEffect, useRef, useState } from "react";
import { songTitle, sanitizeUrl, parseSong, detectKey, keyShift, transposeKey, transposeText } from "../lib/core";
import { t, tn, locale } from "../lib/i18n";
import * as store from "../lib/store";
import { norm } from "../lib/util";
import { useUI, toast, openDialog, type DialogProps } from "../state";
import { current, isMedley, lastPlayKey, songItems, libTargets, libTitle, inSetlist, addToSetlist, removeFromSetlist, type LibRef } from "../repertoire";
import { Dialog, DialogHead } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { keyOptions } from "../views/Repertoire";
import { ChordDialog } from "./ChordDialog";
import { PlayerDialog } from "./PlayerDialog";
import { EarDialog } from "./EarDialog";
import { EventDialog } from "./EventDialog";
import type { SongType } from "../lib/types";

const { data } = store;
const songsN = (n: number) => tn("song", n);

export function Dialogs(){
  const d = useUI(s => s.dialogs);
  return <>
    {d.picker && <Picker/>}
    {d.song && <SongDialog {...d.song}/>}
    {d.addTo && <AddToDialog {...d.addTo}/>}
    {d.install && <InstallDialog/>}
    {d.chord && <ChordDialog {...d.chord}/>}
    {d.player && <PlayerDialog {...d.player}/>}
    {d.confirm && <ConfirmDialog {...d.confirm}/>}
    {d.help && <HelpDialog {...d.help}/>}
    {d.ear && <EarDialog {...d.ear}/>}
    {d.event && <EventDialog {...d.event}/>}
  </>;
}

function Foot({children}: {children: React.ReactNode}){ return <div className="dlg-foot">{children}</div>; }

// ---------- adicionar da biblioteca ----------
function Picker(){
  const m = current(), withMedleys = !isMedley(m);
  const [q, setQ] = useState(""), [chosen, setChosen] = useState<Set<string>>(new Set());
  const inMedley = new Set(m.items.map(i => i.type === "medley" ? "m:" + i.medleyId : i.songId));
  const nq = norm(q);
  const rows = [...data.songs.values()].filter(s=>s.title && !s.disabled && (!nq || norm(s.title).includes(nq) || norm(s.text).includes(nq))).sort((a,b)=>a.title.localeCompare(b.title, locale()));
  const meds = withMedleys ? [...data.medleys.values()].filter(x => isMedley(x) && !x.disabled && (!nq || norm(x.name).includes(nq))) : [];
  const toggle = (v: string, on: boolean) => setChosen(c => { const n = new Set(c); if(on) n.add(v); else n.delete(v); return n; });
  const row = (value: string, title: string, chips: React.ReactNode) => <li key={value}>
    <label><input type="checkbox" value={value} checked={chosen.has(value)} onChange={e => toggle(value, e.target.checked)}/><span className="t">{title}</span></label>
    {chips}{inMedley.has(value) && <span className="chip accent">{t("picker.inMedley")}</span>}</li>;
  const close = (rv: string) => {
    if(rv !== "ok" || !chosen.size) return;
    chosen.forEach(v => {
      if(v.startsWith("m:")) return m.items.push(store.newMedleyItem(v.slice(2)));
      const it = store.newItem(v);
      // No medley, a música entra no tom da anterior.
      if(isMedley(m) && data.songs.get(v)?.type !== "letra") it.target = lastPlayKey(m);
      m.items.push(it);
    });
    store.saveMedley(m);
    toast(tn("picker.added", chosen.size));
  };
  return <Dialog name="picker" id="dlg-picker" labelledBy="picker-h" onClose={close}>
    <form method="dialog" className="dlg">
      <DialogHead id="picker-h" title={t("picker.title")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        <div className="search"><Icon name="search" sm/><input type="search" className="input" id="picker-q" placeholder={t("picker.search")} aria-label={t("picker.searchAria")} value={q} onChange={e => setQ(e.target.value)}/></div>
        <ul className="pick-list" id="picker-list">
          {!rows.length && !meds.length && <li className="empty-state"><span>{t([...data.songs.values()].some(s=>s.title) ? "picker.none" : "picker.emptyLib")}</span></li>}
          {meds.length > 0 && <li className="pick-h">{t("picker.medleys")}</li>}
          {meds.map(x => row("m:" + x.id, x.name, <span className="chip accent">{t("mblock.chip", {songs: songsN(x.items.length)})}</span>))}
          {meds.length > 0 && <li className="pick-h">{t("picker.songs")}</li>}
          {rows.map(s => row(s.id, s.title, s.type === "letra" ? <span className="chip">{t("item.lyricsOnly")}</span> : null))}
        </ul>
      </div>
      <Foot><button className="btn ghost" value="cancel">{t("common.cancel")}</button>
        <button className="btn primary" value="ok" id="picker-ok" disabled={!chosen.size}>{chosen.size > 1 ? t("common.addN", {n: chosen.size}) : t("common.add")}</button></Foot>
    </form>
  </Dialog>;
}

// ---------- nova música / editar música ----------
function SongDialog({song: s}: DialogProps["song"]){
  const isNew = !s;
  const [type, setType] = useState<SongType>(s ? s.type : "");
  const [text, setText] = useState(s ? s.text : ""), [key, setKey] = useState(s ? s.key : "");
  const [bpm, setBpm] = useState(s ? s.bpm : ""), [ref, setRef] = useState(s ? s.ref || "" : "");
  const start = useRef([text, type, key, bpm, ref].join("\u0000"));
  const vals = useRef({text, type, key, bpm, ref}); vals.current = {text, type, key, bpm, ref};
  const close = (rv: string) => {
    if(rv !== "ok") return;
    const v = vals.current;
    if(!songTitle(v.text)) return toast(t("song.needTitle"));
    const n = +v.bpm, fields = {text: v.text, title: songTitle(v.text), type: v.type, key: v.key, bpm: n > 0 && n < 400 ? String(Math.round(n)) : "", ref: sanitizeUrl(v.ref)};
    if(isNew) store.createSong(fields); else { Object.assign(s!, fields); store.saveSong(s!); }
    toast(t(isNew ? "song.saved" : "song.updated"));
  };
  // Com alterações, clicar fora não descarta o texto.
  const dirty = () => { const v = vals.current; return [v.text, v.type, v.key, v.bpm, v.ref].join("\u0000") !== start.current; };
  const hasChords = (x: string) => parseSong(x).blocks.some(b => b.some(it => it.chord));
  const ear = () => openDialog("ear", {text, songKey: key, onApply: (nt, k) => {
    setText(nt);
    if(hasChords(nt)){ setType(""); if(!key && detectKey(parseSong(nt)) !== k) setKey(k); }
  }});
  // Transpor reescreve a cifra no texto; com tom automático, o tom acompanha sozinho.
  const shiftKey = (d: number) => {
    if(!hasChords(text)) return toast(t("song.noChords"));
    const base = key || detectKey(parseSong(text)), to = transposeKey(base, d);
    setText(transposeText(text, keyShift(base, to), to));
    if(key) setKey(to);
  };
  const shownKey = type === "letra" || !hasChords(text) ? "" : key || detectKey(parseSong(text));
  return <Dialog name="song" id="dlg-song" labelledBy="song-h" onClose={close} dirty={dirty}
    onOpen={d => requestAnimationFrame(() => d.querySelector<HTMLTextAreaElement>("#song-text")?.focus())}>
    <form method="dialog" className="dlg">
      <DialogHead id="song-h" title={t(isNew ? "song.newTitle" : "song.editTitle")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        <div className="type-row"><Seg className="sm" id="song-type" aria={t("song.typeAria")} value={type} onChange={setType} options={[{v: "", label: t("item.withChords")}, {v: "letra", label: t("item.lyricsOnly")}]}/>
          <button type="button" className="btn soft sm" id="song-ear" data-tip-key="tip.ear" disabled={!songTitle(text)} onClick={ear}><Icon name="music" sm/> {t("ear.open")}</button></div>
        <textarea className="input song-text" id="song-text" spellCheck={false} aria-label={t("song.textAria")} placeholder={t(type === "letra" ? "item.phLyrics" : "item.phChords")} value={text} onChange={e => setText(e.target.value)}/>
        <div className="fields">
          <div className="field wide" hidden={!shownKey}><span>{t("song.transpose")}</span><span className="tr-ctl">
            <button type="button" className="icon-btn sm" id="song-tr-down" aria-label={t("song.down")} title={t("song.down")} onClick={() => shiftKey(-1)}>−</button>
            <b id="song-tr-key">{shownKey}</b>
            <button type="button" className="icon-btn sm" id="song-tr-up" aria-label={t("song.up")} title={t("song.up")} onClick={() => shiftKey(1)}>+</button></span></div>
          <label className="field" hidden={type === "letra"}><span>{t("song.key")}</span><Select id="song-key" value={key} onChange={setKey} options={keyOptions(t("item.auto"))}/></label>
          <label className="field"><span>{t("item.bpm")}</span><input className="input" id="song-bpm" type="number" inputMode="numeric" min={20} max={300} placeholder="—" value={bpm} onChange={e => setBpm(e.target.value)}/></label>
          <label className="field wide"><span>{t("item.ref")}</span><input className="input" id="song-ref" type="url" inputMode="url" autoComplete="off" placeholder={t("item.refPh")} value={ref} onChange={e => setRef(e.target.value)}/></label>
        </div>
      </div>
      <Foot><button className="btn ghost" value="cancel">{t("common.cancel")}</button><button className="btn primary" value="ok">{t("common.save")}</button></Foot>
    </form>
  </Dialog>;
}

// ---------- pôr ou tirar dos repertórios (Biblioteca) ----------
// Cada repertório com uma caixa: marcar põe, desmarcar tira. Vale na hora, sem botão de salvar.
function AddToDialog(r: LibRef){
  const [, redraw] = useState(0);
  const list = libTargets();
  const toggle = (m: (typeof list)[number], on: boolean) => { if(on) addToSetlist(m, r); else removeFromSetlist(m, r); redraw(n => n + 1); };
  return <Dialog name="addTo" id="dlg-add-to" labelledBy="add-to-h">
    <form method="dialog" className="dlg">
      <DialogHead id="add-to-h" title={t("addTo.title")} closeLabel={t("common.close")}/>
      <div className="dlg-body"><p className="sub">{t("addTo.sub", {name: libTitle(r)})}</p>
        <ul className="pick-list" id="add-to-list">{list.map(m => <li key={m.id}>
          <label><input type="checkbox" checked={inSetlist(m, r)} onChange={e => toggle(m, e.target.checked)}/><span className="t">{m.name}</span></label>
          <span className="chip accent">{tn("song", songItems(m).length)}</span></li>)}</ul></div>
      <Foot><button className="btn primary" value="ok">{t("common.done")}</button></Foot>
    </form>
  </Dialog>;
}

// ---------- instalar (iPhone e navegadores sem o aviso de instalação) ----------
function InstallDialog(){
  return <Dialog name="install" id="dlg-install" labelledBy="install-h">
    <form method="dialog" className="dlg">
      <DialogHead id="install-h" title={t("install.title")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        {/* Textos do próprio dicionário, com marcação simples (negrito). */}
        <ol className="steps">{["install.s1", "install.s2", "install.s3"].map(k => <li key={k} dangerouslySetInnerHTML={{__html: t(k)}}/>)}</ol>
        <p className="sub">{t("install.sub")}</p>
      </div>
      <Foot><button className="btn primary" value="ok">{t("common.gotIt")}</button></Foot>
    </form>
  </Dialog>;
}

// ---------- confirmar exclusão ----------
function ConfirmDialog({title, message, confirm, resolve}: DialogProps["confirm"]){
  return <Dialog name="confirm" id="dlg-confirm" labelledBy="confirm-h" onClose={rv => resolve(rv === "ok")}
    onOpen={d => d.querySelector<HTMLButtonElement>(".btn.ghost")?.focus()}>
    <form method="dialog" className="dlg">
      <DialogHead id="confirm-h" title={title} closeLabel={t("common.close")}/>
      <div className="dlg-body"><p id="confirm-msg">{message}</p></div>
      <Foot><button className="btn ghost" value="cancel">{t("common.cancel")}</button><button className="btn danger-solid" value="ok" id="confirm-ok">{confirm || t("common.delete")}</button></Foot>
    </form>
  </Dialog>;
}

// ---------- guia "Como usar" de cada página ----------
export const HELP_STEPS = {home: 3, medley: 7, library: 2, group: 6, study: 3, tools: 4} as const;
export function seenHelp(page: string){ const s = Object.assign({}, data.settings.seenHelp || {}) as Record<string, boolean>; if(!s[page]){ s[page] = true; store.setSetting("seenHelp", s); } }
function HelpDialog({page}: DialogProps["help"]){
  useEffect(() => seenHelp(page), [page]);
  return <Dialog name="help" id="dlg-help" className="help-dlg" labelledBy="help-h">
    <form method="dialog" className="dlg">
      <DialogHead id="help-h" title={t("help." + page + ".title")} closeLabel={t("common.close")}/>
      <div className="dlg-body"><p id="help-intro">{t("help." + page + ".intro")}</p>
        <ol className="help-steps" id="help-steps">{Array.from({length: HELP_STEPS[page as keyof typeof HELP_STEPS] ?? 0}, (_, i) => <li key={i}>{t("help." + page + ".s" + (i + 1))}</li>)}</ol></div>
      <Foot><button className="btn primary" value="ok">{t("common.gotIt")}</button></Foot>
    </form>
  </Dialog>;
}
