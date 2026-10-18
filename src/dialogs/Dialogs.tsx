// Janelas do app. Cada uma aparece quando aberta com openDialog(nome, dados).
import { useEffect, useRef, useState } from "react";
import { songTitle, sanitizeUrl, sanitizeItem, parseSong, detectKey, keyShift, transposeKey, transposeText } from "../lib/core";
import { t, tn, locale } from "../lib/i18n";
import * as store from "../lib/store";
import { encodeMedley, type IncomingMedley, type IncomingSong } from "../lib/share";
import { norm } from "../lib/util";
import { useUI, toast, go, openDialog, type DialogProps } from "../state";
import { current, isMedley, openMedley, eff, medleyPayload } from "../repertoire";
import { Dialog, DialogHead } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { keyOptions } from "../views/Repertoire";
import { ChordDialog } from "./ChordDialog";
import { PlayerDialog } from "./PlayerDialog";
import { EarDialog } from "./EarDialog";
import { EventDialog } from "./EventDialog";
import type { Item, SongType } from "../lib/types";

const { data } = store;
const songsN = (n: number) => tn("song", n);

export function Dialogs(){
  const d = useUI(s => s.dialogs);
  return <>
    {d.picker && <Picker/>}
    {d.song && <SongDialog {...d.song}/>}
    {d.share && <ShareDialog {...d.share}/>}
    {d.incoming && <IncomingDialog {...d.incoming}/>}
    {d.install && <InstallDialog/>}
    {d.arr && <ArrangementDialog {...d.arr}/>}
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
  const rows = [...data.songs.values()].filter(s=>s.title && (!nq || norm(s.title).includes(nq) || norm(s.text).includes(nq))).sort((a,b)=>a.title.localeCompare(b.title, locale()));
  const meds = withMedleys ? [...data.medleys.values()].filter(x => isMedley(x) && (!nq || norm(x.name).includes(nq))) : [];
  const toggle = (v: string, on: boolean) => setChosen(c => { const n = new Set(c); if(on) n.add(v); else n.delete(v); return n; });
  const row = (value: string, title: string, chips: React.ReactNode) => <li key={value}>
    <label><input type="checkbox" value={value} checked={chosen.has(value)} onChange={e => toggle(value, e.target.checked)}/><span className="t">{title}</span></label>
    {chips}{inMedley.has(value) && <span className="chip accent">{t("picker.inMedley")}</span>}</li>;
  const close = (rv: string) => {
    if(rv !== "ok" || !chosen.size) return;
    chosen.forEach(v => m.items.push(v.startsWith("m:") ? store.newMedleyItem(v.slice(2)) : store.newItem(v)));
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

// ---------- compartilhar ----------
function ShareDialog({medley: m}: DialogProps["share"]){
  const [url, setUrl] = useState(""), [count, setCount] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const payload = medleyPayload(m);
    encodeMedley(payload).then(code => { setUrl(location.href.split("#")[0] + "#m=" + code); setCount(payload.songs.length); requestAnimationFrame(() => input.current?.select()); });
  }, [m]);
  const copy = async () => {
    try{ await navigator.clipboard.writeText(url); }catch(e){ input.current?.select(); document.execCommand("copy"); }
    toast(t("share.copied"));
  };
  return <Dialog name="share" id="dlg-share" labelledBy="share-h">
    <form method="dialog" className="dlg">
      <DialogHead id="share-h" title={t("share.title")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        <p>{t("share.desc")}</p>
        <div className="link-box"><input className="input" id="share-url" readOnly aria-label={t("share.urlAria")} value={url} ref={input}/>
          <button type="button" className="btn primary" id="share-copy" onClick={copy}><Icon name="copy" sm/><span>{t("common.copy")}</span></button></div>
        <p className="sub" id="share-size">{url ? (url.length > 8000 ? t("share.long", {n: url.length.toLocaleString(locale())}) : t("share.count", {songs: songsN(count)})) : ""}</p>
      </div>
      <Foot>
        {"share" in navigator && <button type="button" className="btn ghost" id="share-native" onClick={() => navigator.share({title: m.name, text: t("share.text", {name:m.name}), url}).catch(()=>{})}><Icon name="share" sm/><span>{t("share.send")}</span></button>}
        <button className="btn ghost" value="cancel">{t("common.close")}</button></Foot>
    </form>
  </Dialog>;
}

// ---------- receber um link ----------
function findOrCreateSong(e: IncomingSong){
  const same = [...data.songs.values()].find(s => norm(s.title) === norm(songTitle(e.text)) && s.text.trim() === e.text.trim());
  if(same && e.ref && !same.ref){ same.ref = e.ref; store.saveSong(same); }
  return same || store.createSong({text:e.text, type:e.type, key:e.key, bpm:e.bpm, ref:e.ref});
}
function IncomingDialog({med, stage}: {med: IncomingMedley; stage?: boolean}){
  // Já recebeu este repertório antes? Então o link atualiza a cópia em vez de criar outra.
  const existing = med.sourceId ? [...data.medleys.values()].find(x => x.sourceId === med.sourceId && x.kind === med.kind) : undefined;
  const close = (rv: string) => {
    if(rv !== "ok" && rv !== "new") return;
    const update = !!existing && rv === "ok";
    const blocks = med.groups.map(name => store.createMedley(name, [], med.options, "medley"));
    const items: Item[] = [], placed = new Set<number>();
    med.songs.forEach(e => {
      const songItem = store.newItem(findOrCreateSong(e).id, sanitizeItem(e));
      if(e.g !== undefined && blocks[e.g]){
        blocks[e.g].items.push(songItem);
        if(!placed.has(e.g)){ placed.add(e.g); items.push(store.newMedleyItem(blocks[e.g].id)); }
      } else items.push(songItem);
    });
    blocks.forEach(b => { b.linkOf = med.sourceId; store.saveMedley(b); });
    if(update && existing){
      // Os medleys que vieram do link anterior saem; os novos entram no lugar.
      existing.items.forEach(i => { const b = i.type === "medley" && data.medleys.get(i.medleyId); if(b && b.linkOf === med.sourceId && !blocks.includes(b)) store.deleteMedley(b.id); });
      Object.assign(existing, {name: med.name, items, options: med.options}); store.saveMedley(existing);
      openMedley(existing.id); go("medley");
      if(stage) useUI.setState({stageOpen: true});
      return toast(t("incoming.updated"));
    }
    const nm = store.createMedley(med.name, items, med.options, med.kind === "medley" ? "medley" : "setlist");
    if(med.sourceId && !existing){ nm.sourceId = med.sourceId; store.saveMedley(nm); }
    // Um repertório vazio aberto (ex.: primeiro acesso pelo link) não precisa ficar sobrando.
    const prev = current(); if(prev.id !== nm.id && !prev.items.length) store.deleteMedley(prev.id);
    openMedley(nm.id); go("medley");
    if(stage) useUI.setState({stageOpen: true});
    toast(t("incoming.saved"));
  };
  return <Dialog name="incoming" id="dlg-incoming" labelledBy="incoming-h" onClose={close}>
    <form method="dialog" className="dlg">
      <DialogHead id="incoming-h" title={t(existing ? "incoming.updateTitle" : "incoming.title")} closeLabel={t("common.close")}/>
      <div className="dlg-body"><p id="incoming-desc">{existing ? t("incoming.updateDesc", {name: existing.name, songs: songsN(med.songs.length)}) : t("incoming.desc", {name: med.name, songs: songsN(med.songs.length)})}</p>
        <ol className="steps" id="incoming-list">{med.songs.map((s, i) => <li key={i}>{s.title}{s.target && <> <span className="chip accent">{s.target}</span></>}{s.g !== undefined && <> <span className="chip"><Icon name="link" sm/> {med.groups[s.g]}</span></>}</li>)}</ol></div>
      <Foot><button className="btn ghost" value="cancel">{t("incoming.later")}</button>
        {existing && <button className="btn ghost" value="new" id="incoming-new">{t("incoming.saveNew")}</button>}
        <button className="btn primary" value="ok" id="incoming-ok">{t(existing ? "incoming.update" : "incoming.save")}</button></Foot>
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

// ---------- salvar arranjo ----------
function ArrangementDialog({medley: m, song: s, item: it}: DialogProps["arr"]){
  const e = eff(s, it);
  const key = e.target || s.key || (s.text.trim() ? detectKey(parseSong(s.text)) : "");
  const [name, setName] = useState([key, e.capo ? t("item.capoChip", {n: e.capo}) : ""].filter(Boolean).join(" · "));
  const val = useRef(name); val.current = name;
  const close = (rv: string) => {
    if(rv !== "ok") return;
    const nm = val.current.trim().slice(0, 60) || t("arr.label");
    const a = {id: store.newId("a"), name: nm, target: e.target, capo: e.capo, notes: e.notes};
    s.arrangements = (s.arrangements || []).concat(a); store.saveSong(s);
    it.arrangementId = a.id; store.saveMedley(m);
    toast(t("arr.saved", {name: nm}));
  };
  return <Dialog name="arr" id="dlg-arr" labelledBy="arr-h" onClose={close} onOpen={d => d.querySelector<HTMLInputElement>("#arr-name")?.select()}>
    <form method="dialog" className="dlg">
      <DialogHead id="arr-h" title={t("arr.dlgTitle")} closeLabel={t("common.close")}/>
      <div className="dlg-body"><p className="sub">{t("arr.dlgText")}</p>
        <label className="field"><span>{t("arr.name")}</span><input className="input" id="arr-name" maxLength={60} placeholder={t("arr.namePh")} value={name} onChange={ev => setName(ev.target.value)}/></label></div>
      <Foot><button className="btn ghost" value="cancel">{t("common.cancel")}</button><button className="btn primary" value="ok">{t("common.save")}</button></Foot>
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
export const HELP_STEPS = {medley: 6, library: 4, group: 6, study: 6, tools: 7} as const;
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
