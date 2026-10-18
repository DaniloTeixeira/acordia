// Criar ou editar um evento da agenda do grupo (só quem lidera o grupo): tipo, data, horários, local,
// repertório, observações, repetição semanal e a escala, com avisos de quem não pode, já está em
// outro evento no dia ou já recusou.
import { useRef, useState } from "react";
import { t, tn } from "../lib/i18n";
import { useGroups, saveEvent, personName, type RosterInput } from "../lib/groups";
import { warningsFor, monthLoad, weekly, dayKey, type EventKind, type GEvent } from "../lib/calendar";
import { toast, type DialogProps } from "../state";
import { Dialog, DialogHead } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { eventTitle, roleOptions } from "../views/Group";
import { splitRoles } from "../lib/roles";
import { Spin } from "../views/Account";

const hhmm = (iso: string | null) => { if(!iso) return ""; const d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
// Data do campo (AAAA-MM-DD) + hora (HH:MM), na hora local de quem preenche.
const at = (day: string, time: string) => { const [y, m, d] = day.split("-").map(Number), [h, mi] = (time || "00:00").split(":").map(Number); return new Date(y, m - 1, d, h, mi); };

export function EventDialog({id, day}: DialogProps["event"]){
  const g = useGroups(), ev = id ? g.events.find(e => e.id === id) : undefined;
  const [kind, setKind] = useState<EventKind>(ev?.kind || "service");
  const [title, setTitle] = useState(ev?.title || "");
  const [date, setDate] = useState(ev ? dayKey(new Date(ev.starts_at)) : day);
  const [time, setTime] = useState(ev ? hhmm(ev.starts_at) : "19:00");
  const [call, setCall] = useState(ev ? hhmm(ev.call_at) : "");
  const [place, setPlace] = useState(ev?.place || "");
  const [notes, setNotes] = useState(ev?.notes || "");
  const [setlist, setSetlist] = useState(ev?.setlist_id || "");
  const [weeks, setWeeks] = useState("1");
  const [roster, setRoster] = useState<RosterInput[]>(() => ev ? g.roster.filter(r => r.event_id === ev.id).map(r => ({email: r.email, role: r.role})) : []);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false); const touch = <T,>(fn: (v: T) => void) => (v: T) => { dirty.current = true; fn(v); };
  const form = useRef<HTMLFormElement>(null);
  const starts = date && time ? at(date, time) : null;
  const probe: Pick<GEvent, "id" | "starts_at"> = {id: id || "new", starts_at: (starts || new Date()).toISOString()};
  const load = monthLoad(date || dayKey(new Date()), g.events, g.roster);
  // Ao escalar, a função sugerida é a primeira da pessoa (quem lidera troca se for outra).
  const rolesOf = (email: string) => splitRoles(g.members.find(m => m.email === email)?.role || "");
  const roleOf = (email: string) => rolesOf(email)[0] || "";
  const memberOpts = [{value: "", label: t("group.pickPerson")}, ...g.members.map(m => ({value: m.email,
    label: personName(m.email) + (m.role ? " · " + splitRoles(m.role).join(", ") : "") + ((load.get(m.email) || 0) ? " · " + tn("group.load", load.get(m.email)!) : "")}))];
  const free = g.members.filter(m => !roster.some(r => r.email === m.email));
  const save = async () => {
    if(!starts) return toast(t("group.needDate"));
    setBusy(true);
    const callAt = call ? at(date, call) : null;
    const input = {kind, title: title.trim().slice(0, 80), starts_at: starts.toISOString(), call_at: callAt ? callAt.toISOString() : null, place: place.trim(), notes: notes.trim(), setlist_id: setlist || null};
    const n = id ? 1 : +weeks;
    const dates = n > 1 ? weekly(starts, n).map((s, i) => ({starts_at: s.toISOString(), call_at: callAt ? new Date(callAt.getFullYear(), callAt.getMonth(), callAt.getDate() + 7 * i, callAt.getHours(), callAt.getMinutes()).toISOString() : null})) : undefined;
    const ok = await saveEvent(g.gid, id, input, roster, dates).finally(() => setBusy(false));
    if(!ok) return toast(t("profile.saveFail"));
    toast(n > 1 ? tn("group.eventsCreated", n) : t("group.eventSaved"));
    dirty.current = false;
    form.current?.closest("dialog")?.close("ok");
  };
  return <Dialog name="event" id="dlg-event" className="event-dlg" labelledBy="event-h" dirty={() => dirty.current}>
    <form method="dialog" className="dlg" ref={form} onSubmit={e => {
      // O X do cabeçalho (value="cancel") também envia o formulário: esse fecha sem salvar.
      if((e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "cancel"){ dirty.current = false; return; }
      e.preventDefault(); if(!busy) save();
    }}>
      <DialogHead id="event-h" title={t(id ? "group.editEvent" : "group.newEvent")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        <Seg className="block" id="event-kind" aria={t("group.kindLabel")} value={kind} onChange={touch(setKind)}
          options={[{v: "service", label: t("group.kind.service")}, {v: "rehearsal", label: t("group.kind.rehearsal")}]}/>
        <label className="field"><span>{t("group.eventTitle")}</span><input className="input" id="event-title" maxLength={80} placeholder={t(kind === "service" ? "group.titlePhService" : "group.titlePhRehearsal")} value={title} onChange={e => touch(setTitle)(e.target.value)}/></label>
        <div className="event-row">
          <label className="field"><span>{t("group.date")}</span><input className="input" id="event-date" type="date" required value={date} onChange={e => touch(setDate)(e.target.value)}/></label>
          <label className="field"><span>{t("group.time")}</span><input className="input" id="event-time" type="time" required value={time} onChange={e => touch(setTime)(e.target.value)}/></label>
          <label className="field" title={t("group.callHint")}><span>{t("group.call")}</span><input className="input" id="event-call" type="time" value={call} onChange={e => touch(setCall)(e.target.value)}/></label>
        </div>
        <label className="field"><span>{t("group.place")}</span><input className="input" id="event-place" maxLength={120} placeholder={t("group.placePh")} value={place} onChange={e => touch(setPlace)(e.target.value)}/></label>
        <label className="field"><span>{t("group.setlist")}</span><Select id="event-setlist" value={setlist} onChange={touch(setSetlist)}
          options={[{value: "", label: t("group.noSetlist")}, ...g.setlists.map(s => ({value: s.id, label: s.name}))]}/></label>
        {!g.setlists.length && <p className="sub">{t("group.setlistHint")}</p>}
        {!id && <label className="field"><span>{t("group.repeat")}</span><Select id="event-repeat" value={weeks} onChange={setWeeks}
          options={["1", "2", "4", "8", "12", "26"].map(n => ({value: n, label: n === "1" ? t("group.repeatNo") : t("group.repeatWeeks", {n})}))}/></label>}

        <h3 className="roster-h">{t("group.roster")} <span className="sub">{tn("group.people", roster.filter(r => r.email).length)}</span></h3>
        <ul className="roster-edit">{roster.map((r, i) => {
          const warns = r.email ? warningsFor(r.email, probe, {events: g.events, roster: g.roster, unavail: g.unavail}, eventTitle) : [];
          const upd = (p: Partial<RosterInput>) => { dirty.current = true; setRoster(rs => rs.map((x, k) => k === i ? {...x, ...p} : x)); };
          return <li key={i}>
            <div className="roster-row">
              <Select value={r.email} aria={t("group.person")} onChange={v => upd({email: v, role: r.role || roleOf(v)})} options={memberOpts}/>
              <input className="input role-input" list="event-roles" maxLength={40} placeholder={t("group.rolePh")} aria-label={t("group.role")} value={r.role} onChange={e => upd({role: e.target.value})}/>
              <button type="button" className="icon-btn sm danger" aria-label={t("group.removeFromRoster")} title={t("group.removeFromRoster")} onClick={() => { dirty.current = true; setRoster(rs => rs.filter((_, k) => k !== i)); }}><Icon name="x" sm/></button>
            </div>
            {warns.map((w, k) => <p key={k} className={"roster-warn " + w.kind} role="status"><Icon name={w.kind === "busy" ? "calendar" : "x"} sm/>
              {w.kind === "unavailable" ? t("group.warnOff") + (w.note ? ": " + w.note : "") : w.kind === "busy" ? t("group.warnBusy", {title: w.title}) : t("group.warnDeclined")}</p>)}
          </li>;
        })}</ul>
        <datalist id="event-roles">{roleOptions().map(r => <option key={r} value={r}/>)}</datalist>
        <div className="roster-add">
          <button type="button" className="btn ghost sm" id="event-add-person" onClick={() => { dirty.current = true; setRoster(rs => [...rs, {email: "", role: ""}]); }}><Icon name="plus" sm/> {t("group.addPerson")}</button>
          {free.length > 0 && <button type="button" className="btn ghost sm" onClick={() => { dirty.current = true; setRoster(rs => [...rs.filter(r => r.email), ...free.map(m => ({email: m.email, role: roleOf(m.email)}))]); }}><Icon name="users" sm/> {t("group.addEveryone")}</button>}
        </div>
        <label className="field"><span>{t("group.notes")}</span><textarea className="input" id="event-notes" rows={3} maxLength={1000} placeholder={t("group.notesPh")} value={notes} onChange={e => touch(setNotes)(e.target.value)}/></label>
      </div>
      <div className="dlg-foot"><button type="button" className="btn ghost" onClick={() => { dirty.current = false; form.current?.closest("dialog")?.close("cancel"); }}>{t("common.cancel")}</button>
        <button className="btn primary" id="event-save" aria-busy={busy}>{busy && <Spin/>}{t("common.save")}</button></div>
    </form>
  </Dialog>;
}
