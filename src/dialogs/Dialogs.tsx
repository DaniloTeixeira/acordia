// Janelas do app. Cada uma aparece quando aberta com openDialog(nome, dados).
import { Fragment, useEffect, useRef, useState } from "react";
import { t, tn, locale } from "../lib/i18n";
import * as store from "../lib/store";
import { norm } from "../lib/util";
import { useUI, toast, type DialogProps } from "../state";
import { current, isMedley, lastPlayKey, songItems, sheetSongs, libTargets, libTitle, inSetlist, addToSetlist, removeFromSetlist, type LibRef } from "../repertoire";
import { Dialog, DialogHead } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";
import { ChordDialog } from "./ChordDialog";
import { setSheetSkip } from "../views/Sheet";
import { PlayerDialog } from "./PlayerDialog";
import { EarDialog } from "./EarDialog";
import { EventDialog } from "./EventDialog";
import { PhotoDialog } from "./PhotoDialog";
import { EventDetailDialog } from "./EventDetailDialog";
import { MemberDialog } from "./MemberDialog";
import { GroupDialog, NewGroupDialog } from "./GroupDialog";

const { data } = store;
const songsN = (n: number) => tn("song", n);

export function Dialogs(){
  const d = useUI(s => s.dialogs);
  return <>
    {d.picker && <Picker/>}
    {d.addTo && <AddToDialog {...d.addTo}/>}
    {d.sheetPick && <SheetPickDialog {...d.sheetPick}/>}
    {d.install && <InstallDialog/>}
    {d.chord && <ChordDialog {...d.chord}/>}
    {d.player && <PlayerDialog {...d.player}/>}
    {d.confirm && <ConfirmDialog {...d.confirm}/>}
    {d.leader && <LeaderDialog {...d.leader}/>}
    {d.help && <HelpDialog {...d.help}/>}
    {d.ear && <EarDialog {...d.ear}/>}
    {d.event && <EventDialog {...d.event}/>}
    {d.photo && <PhotoDialog {...d.photo}/>}
    {d.member && <MemberDialog {...d.member}/>}
    {d.eventDetail && <EventDetailDialog {...d.eventDetail}/>}
    {d.group && <GroupDialog/>}
    {d.newGroup && <NewGroupDialog/>}
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

// ---------- músicas na folha (impressão e PDF) ----------
// Marcar ou desmarcar cada música; o medley aparece com o nome em cima e as músicas dele. Vale na hora.
function SheetPickDialog({id}: {id: string}){
  const m = data.medleys.get(id), skip = useUI(s => s.sheetSkip[id]) || [];
  if(!m) return null;
  const list = sheetSongs(m), set = (v: string[]) => setSheetSkip(id, v);
  const toggle = (itemId: string, on: boolean) => set(on ? skip.filter(x => x !== itemId) : [...skip, itemId]);
  return <Dialog name="sheetPick" id="dlg-sheet-pick" labelledBy="sheet-pick-h">
    <form method="dialog" className="dlg">
      <DialogHead id="sheet-pick-h" title={t("sheetPick.title")} closeLabel={t("common.close")}/>
      <div className="dlg-body"><p className="sub">{t("sheetPick.sub")}</p>
        <div className="sheet-pick-quick">
          <button type="button" className="btn ghost sm" disabled={!skip.length} onClick={() => set([])}>{t("sheetPick.all")}</button>
          <button type="button" className="btn ghost sm" disabled={skip.length >= list.length} onClick={() => set(list.map(s => s.itemId))}>{t("sheetPick.none")}</button>
        </div>
        <ul className="pick-list" id="sheet-pick-list">{list.map((s, i) => <Fragment key={s.itemId}>
          {s.group && s.group !== list[i - 1]?.group && <li className="pick-h"><Icon name="link" sm/> {s.gname}</li>}
          <li className={s.group ? "in-medley" : ""}><label><input type="checkbox" checked={!skip.includes(s.itemId)} onChange={e => toggle(s.itemId, e.target.checked)}/>
            <span className="t">{i + 1}. {s.title}</span></label>{(s.target || s.key) && <span className="chip accent">{s.target || s.key}</span>}</li>
        </Fragment>)}</ul></div>
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
function ConfirmDialog({title, message, confirm, cancel, resolve}: DialogProps["confirm"]){
  return <Dialog name="confirm" id="dlg-confirm" labelledBy="confirm-h" onClose={rv => resolve(rv === "ok")}
    onOpen={d => d.querySelector<HTMLButtonElement>(".btn.ghost")?.focus()}>
    <form method="dialog" className="dlg">
      <DialogHead id="confirm-h" title={title} closeLabel={t("common.close")}/>
      <div className="dlg-body"><p id="confirm-msg">{message}</p></div>
      <Foot><button className="btn ghost" value="cancel">{cancel || t("common.cancel")}</button><button className="btn danger-solid" value="ok" id="confirm-ok">{confirm || t("common.delete")}</button></Foot>
    </form>
  </Dialog>;
}

// ---------- novo líder do grupo ----------
// Desligar o Líder pergunta antes quem fica no lugar; a troca só acontece ao confirmar.
function LeaderDialog({group, current, options, allowNone, mine, resolve}: DialogProps["leader"]){
  const opts = [...(allowNone ? [{value: "", label: t("group.noLeader")}] : []), ...options];
  const [pick, setPick] = useState(opts[0]?.value ?? ""), ref = useRef(pick);
  ref.current = pick;
  return <Dialog name="leader" id="dlg-leader" labelledBy="leader-h" onClose={rv => resolve(rv === "ok" ? ref.current : null)}>
    <form method="dialog" className="dlg">
      <DialogHead id="leader-h" title={t("group.newLeaderTitle")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        <p id="leader-msg">{t(mine ? "group.newLeaderMine" : "group.newLeaderMsg", {group, current})}</p>
        <div className="field"><span>{t("group.newLeader")}</span>
          <Select id="leader-pick" aria={t("group.newLeader")} value={pick} onChange={setPick} options={opts}/></div>
      </div>
      <Foot><button className="btn ghost" value="cancel">{t("common.cancel")}</button>
        <button className="btn primary" value="ok" id="leader-ok" disabled={!opts.length}>{t("group.passLead")}</button></Foot>
    </form>
  </Dialog>;
}

// ---------- guia "Como usar" de cada página ----------
export const HELP_STEPS = {home: 3, medley: 8, library: 2, group: 6, study: 2, tools: 5} as const;
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
