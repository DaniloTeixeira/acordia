// Grupo (equipe de louvor): agenda com calendário do mês, escala de cada evento com confirmação,
// presença nos ensaios, datas em que cada um não pode, repertórios compartilhados e membros.
// Os dados vêm de lib/groups (nuvem) e as regras sem rede de lib/calendar.
import { useEffect, useMemo, useState } from "react";
import { t, tn, locale } from "../lib/i18n";
import * as store from "../lib/store";
import { cloud, useAuth, validEmail, initials } from "../lib/cloud";
import { encodeMedley, decodeMedley } from "../lib/share";
import { saveBlob } from "../lib/pdf";
import { ago } from "../lib/util";
import { monthGrid, dayKey, eventDay, splitEvents, canCheckIn, attendanceRate, monthLoad, toICS, type GEvent, type Presence } from "../lib/calendar";
import { useGroups, loadGroups, chooseGroup, createGroup, renameGroup, deleteGroup, addMember, setMemberAdmin, setMemberRole, removeMember,
  shareSetlist, removeSetlist, deleteEvent, respond, checkIn, markAttendance, setUnavailable, personName, amGroupAdmin, type GroupSetlist, type Member } from "../lib/groups";
import { useData, toast, openDialog, confirmDialog } from "../state";
import { isMedley, medleyPayload } from "../repertoire";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { useLock, Spin } from "./Account";

const { data } = store;
type Tab = "agenda" | "setlists" | "members";

// ---------- datas ----------
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale(), o);
const timeOf = (iso: string) => fmt({hour: "2-digit", minute: "2-digit"}).format(new Date(iso));
export const eventTitle = (e: Pick<GEvent, "title" | "kind">) => e.title || t("group.kind." + e.kind);
const longDay = (d: Date) => fmt({weekday: "long", day: "numeric", month: "long"}).format(d);

// Abre um repertório do grupo como um link recebido (salvar e abrir, ou atualizar a cópia).
export async function openGroupSetlist(s: GroupSetlist, stage = false){
  const med = await decodeMedley(s.code);
  if(!med) return toast(t("incoming.bad"));
  openDialog("incoming", {med, stage});
}

// Baixa o .ics de um ou mais eventos (o celular oferece adicionar ao calendário, com lembretes).
function downloadICS(events: GEvent[], name: string){
  const sets = useGroups.getState().setlists, gname = useGroups.getState().groups.find(g => g.id === useGroups.getState().gid)?.name || "";
  const ics = toICS(events.map(e => {
    const roster = useGroups.getState().roster.filter(r => r.event_id === e.id);
    const set = sets.find(s => s.id === e.setlist_id);
    const desc = [gname,
      e.call_at ? t("group.callAt", {time: timeOf(e.call_at)}) : "",
      set ? t("group.setlist") + ": " + set.name : "",
      roster.length ? roster.map(r => (r.role ? r.role + ": " : "") + personName(r.email)).join("\n") : "",
      e.notes].filter(Boolean).join("\n\n");
    return {id: e.id, title: eventTitle(e) + (gname ? " · " + gname : ""), start: new Date(e.call_at || e.starts_at), place: e.place, description: desc};
  }));
  saveBlob(new Blob([ics], {type: "text/calendar"}), name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() + ".ics");
}

export function Group(){
  useData();
  const status = useAuth(s => s.status), admin = useAuth(s => s.admin);
  const g = useGroups();
  const tab: Tab = (["agenda", "setlists", "members"] as const).find(v => v === data.settings.groupTab) || "agenda";
  // Ao abrir a página e ao voltar para o app, busca o que mudou.
  useEffect(() => {
    if(status !== "in") return;
    loadGroups();
    const wake = () => { if(!document.hidden) loadGroups(); };
    document.addEventListener("visibilitychange", wake);
    return () => document.removeEventListener("visibilitychange", wake);
  }, [status]);
  const group = g.groups.find(x => x.id === g.gid);
  const head = (sub: string, actions?: React.ReactNode) => <div className="view-head"><div><h1 id="group-h">{group ? group.name : t("group.title")}</h1><p className="sub">{sub}</p></div>
    {actions && <div className="actions">{actions}</div>}</div>;
  if(!cloud || status !== "in") return <section className="view" id="view-group" data-view="group" aria-labelledby="group-h">
    {head(t("group.sub"))}<div className="card empty-state"><Icon name="users"/><strong>{t("group.needLogin")}</strong><span>{t("group.needLoginSub")}</span></div></section>;
  if(!group) return <section className="view" id="view-group" data-view="group" aria-labelledby="group-h">
    {head(t("group.sub"))}
    {!g.loaded || g.loading ? <div className="card empty-state"><Spin/><span>{t("auth.loading")}</span></div>
      : g.error ? <div className="card empty-state"><Icon name="sync"/><strong>{t("group.loadFail")}</strong><button className="btn ghost" onClick={() => loadGroups()}>{t("group.retry")}</button></div>
      : <div className="card empty-state"><Icon name="users"/><strong>{t("group.none")}</strong><span>{t(admin ? "group.noneAdmin" : "group.noneSub")}</span>{admin && <NewGroup/>}</div>}
  </section>;
  const canEdit = amGroupAdmin();
  return <section className="view" id="view-group" data-view="group" aria-labelledby="group-h">
    {head(tn("group.members", g.members.length) + (g.error ? " · " + t("group.offline") : ""), <>
      {g.loading && <Spin/>}
      {g.groups.length > 1 && <Select id="group-pick" aria={t("group.pick")} value={g.gid} onChange={v => chooseGroup(v)} options={g.groups.map(x => ({value: x.id, label: x.name}))}/>}
      {canEdit && tab === "agenda" && <button className="btn primary" id="group-new-event" onClick={() => openDialog("event", {id: null, day: dayKey(new Date())})}><Icon name="plus" sm/><span>{t("group.newEvent")}</span></button>}
    </>)}
    <Seg id="group-tabs" className="block" aria={t("group.title")} value={tab} onChange={v => store.setSetting("groupTab", v)}
      options={[{v: "agenda", label: t("group.agenda")}, {v: "setlists", label: t("group.setlists")}, {v: "members", label: t("group.membersTab")}]}/>
    {tab === "agenda" && <Agenda canEdit={canEdit}/>}
    {tab === "setlists" && <Setlists canEdit={canEdit}/>}
    {tab === "members" && <Members canEdit={canEdit}/>}
  </section>;
}

function NewGroup(){
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), lock = useLock();
  return <form className="people-add group-new" onSubmit={e => { e.preventDefault(); if(!name.trim()) return; lock(async () => {
    setBusy(true); const ok = await createGroup(name).finally(() => setBusy(false));
    toast(t(ok ? "group.created" : "profile.saveFail", {name: name.trim()})); if(ok) setName("");
  }); }}>
    <input className="input" id="group-name-new" maxLength={80} placeholder={t("group.namePh")} aria-label={t("group.name")} value={name} onChange={e => setName(e.target.value)}/>
    <button className="btn primary" disabled={!name.trim()} aria-busy={busy}>{busy ? <Spin/> : <Icon name="plus" sm/>} {t("group.create")}</button>
  </form>;
}

// ---------- agenda ----------
function Agenda({canEdit}: {canEdit: boolean}){
  const g = useGroups(), me = useAuth(s => s.email);
  const [month, setMonth] = useState(() => { const d = new Date(); return {y: d.getFullYear(), m: d.getMonth()}; });
  const [sel, setSel] = useState("");
  const [showPast, setShowPast] = useState(false);
  const byDay = useMemo(() => { const m = new Map<string, GEvent[]>(); g.events.forEach(e => { const k = eventDay(e); m.set(k, [...(m.get(k) || []), e]); }); return m; }, [g.events]);
  const myOff = new Set(g.unavail.filter(u => u.email === me).map(u => u.day));
  const {upcoming, past} = splitEvents(g.events);
  const mine = upcoming.filter(e => g.roster.some(r => r.event_id === e.id && r.email === me));
  const today = dayKey(new Date());
  const shift = (d: number) => setMonth(({y, m}) => { const x = new Date(y, m + d, 1); return {y: x.getFullYear(), m: x.getMonth()}; });
  const list = sel ? (byDay.get(sel) || []) : showPast ? past : upcoming;
  const weekdays = Array.from({length: 7}, (_, i) => fmt({weekday: "narrow"}).format(new Date(2024, 0, 7 + i)));
  return <div className="agenda">
    {mine.length > 0 && <div className="card my-next"><h2>{t("group.myNext")}</h2>
      <ul className="my-next-list">{mine.slice(0, 4).map(e => <MyNextRow key={e.id} e={e}/>)}</ul>
      <button className="btn ghost sm" id="group-ics-mine" onClick={() => downloadICS(mine, t("group.myNext"))}><Icon name="calendar" sm/> {t("group.addAllToCal")}</button>
    </div>}
    <div className="agenda-grid">
      <div className="card cal" aria-label={t("group.calendar")}>
        <div className="cal-head">
          <button className="icon-btn sm" aria-label={t("group.prevMonth")} onClick={() => shift(-1)}><Icon name="chev" sm className="chev-left"/></button>
          <b>{fmt({month: "long", year: "numeric"}).format(new Date(month.y, month.m, 1))}</b>
          <button className="icon-btn sm" aria-label={t("group.nextMonth")} onClick={() => shift(1)}><Icon name="chev" sm className="chev-right"/></button>
        </div>
        <div className="cal-grid" role="grid">
          {weekdays.map((w, i) => <span key={"w" + i} className="cal-wd" role="columnheader">{w}</span>)}
          {monthGrid(month.y, month.m).flat().map((d, i) => {
            if(!d) return <span key={i}/>;
            const k = dayKey(d), evs = byDay.get(k) || [];
            const off = myOff.has(k), mineDay = evs.some(e => g.roster.some(r => r.event_id === e.id && r.email === me));
            return <button key={i} type="button" className={"cal-day" + (k === today ? " today" : "") + (off ? " off" : "") + (mineDay ? " mine" : "")} aria-pressed={sel === k}
              aria-label={longDay(d) + (evs.length ? " · " + evs.map(eventTitle).join(", ") : "") + (off ? " · " + t("group.unavailable") : "")}
              onClick={() => setSel(sel === k ? "" : k)}>
              <span>{d.getDate()}</span>
              {evs.length > 0 && <span className="cal-dots">{evs.slice(0, 3).map(e => <i key={e.id} className={e.kind}/>)}</span>}
            </button>;
          })}
        </div>
        <div className="cal-legend"><span><i className="service"/>{t("group.kind.service")}</span><span><i className="rehearsal"/>{t("group.kind.rehearsal")}</span><span><i className="off"/>{t("group.unavailable")}</span></div>
      </div>
      <div className="agenda-list">
        {sel ? <DayBar day={sel} off={myOff.has(sel)} canEdit={canEdit} onClear={() => setSel("")}/>
          : <Seg className="block" id="agenda-when" aria={t("group.agenda")} value={showPast ? "past" : "next"} onChange={v => setShowPast(v === "past")}
            options={[{v: "next", label: t("group.upcoming")}, {v: "past", label: t("group.past")}]}/>}
        {list.length ? <ul className="events">{list.map(e => <EventCard key={e.id} e={e} canEdit={canEdit}/>)}</ul>
          : <div className="card empty-state"><Icon name="calendar"/><strong>{t(sel ? "group.noEventsDay" : showPast ? "group.noPast" : "group.noEvents")}</strong>
            {canEdit && !showPast && <span>{t("group.noEventsAdmin")}</span>}</div>}
      </div>
    </div>
  </div>;
}

function MyNextRow({e}: {e: GEvent}){
  const me = useAuth(s => s.email), g = useGroups();
  const rows = g.roster.filter(r => r.event_id === e.id && r.email === me), st = rows[0]?.status || "pending";
  const d = new Date(e.starts_at);
  return <li><span className="date-badge"><small>{fmt({weekday: "short"}).format(d)}</small><b>{d.getDate()}</b><small>{fmt({month: "short"}).format(d)}</small></span>
    <span className="my-next-what"><b>{eventTitle(e)}</b><span className="sub">{timeOf(e.starts_at)} · {rows.map(r => r.role).filter(Boolean).join(", ") || t("group.onRoster")}</span></span>
    <StatusChip status={st}/></li>;
}

function StatusChip({status}: {status: string}){
  return <span className={"chip st-" + status}><Icon name={status === "yes" ? "check" : status === "no" ? "x" : "dot"} sm/> {t("group.status." + status)}</span>;
}

// Barra do dia escolhido no calendário: data, "não posso neste dia" e novo evento nesse dia.
function DayBar({day, off, canEdit, onClear}: {day: string; off: boolean; canEdit: boolean; onClear: () => void}){
  const [busy, setBusy] = useState(false), lock = useLock();
  const [y, m, d] = day.split("-").map(Number), date = new Date(y, m - 1, d), future = day >= dayKey(new Date());
  const toggle = () => lock(async () => { setBusy(true); const ok = await setUnavailable(day, !off).finally(() => setBusy(false)); toast(t(ok ? (off ? "group.availableSaved" : "group.unavailableSaved") : "profile.saveFail")); });
  return <div className="day-bar card">
    <b>{longDay(date)}</b>
    <div className="day-actions">
      {future && <label className="switch lead boxed" title={t("group.unavailableHint")}><span>{busy && <Spin/>}{t("group.cantThisDay")}</span><input type="checkbox" id="group-off" checked={off} onChange={toggle}/></label>}
      {canEdit && <button className="btn ghost sm" onClick={() => openDialog("event", {id: null, day})}><Icon name="plus" sm/> {t("group.newEvent")}</button>}
      <button className="icon-btn sm" aria-label={t("group.allDays")} title={t("group.allDays")} onClick={onClear}><Icon name="x" sm/></button>
    </div>
  </div>;
}

function EventCard({e, canEdit}: {e: GEvent; canEdit: boolean}){
  const g = useGroups(), me = useAuth(s => s.email);
  const [open, setOpen] = useState(false), [declining, setDeclining] = useState(false), [reason, setReason] = useState(""), [busy, setBusy] = useState("");
  const lock = useLock();
  const roster = g.roster.filter(r => r.event_id === e.id), mineRows = roster.filter(r => r.email === me), myStatus = mineRows[0]?.status;
  const set = g.setlists.find(s => s.id === e.setlist_id);
  const d = new Date(e.starts_at), isPast = d.getTime() < Date.now() - 6 * 3600 * 1000;
  const att = g.attendance.filter(a => a.event_id === e.id), myAtt = att.find(a => a.email === me);
  const needs = roster.filter(r => r.status === "no");
  const act = (key: string, fn: () => Promise<boolean>, ok?: string) => lock(async () => { setBusy(key); const r = await fn().finally(() => setBusy("")); toast(t(r ? ok || "group.saved" : "profile.saveFail")); return r; });
  const yes = mineRows.length > 0 && !isPast && <button className={"btn sm" + (myStatus === "yes" ? " primary" : " ghost")} aria-pressed={myStatus === "yes"} aria-busy={busy === "yes"}
    onClick={() => act("yes", () => respond(e.id, myStatus === "yes" ? "pending" : "yes"), myStatus === "yes" ? "group.saved" : "group.confirmed")}>{busy === "yes" ? <Spin/> : <Icon name="check" sm/>} {t("group.confirm")}</button>;
  const no = mineRows.length > 0 && !isPast && <button className={"btn sm" + (myStatus === "no" ? " danger armed" : " ghost")} aria-pressed={myStatus === "no"}
    onClick={() => myStatus === "no" ? act("no", () => respond(e.id, "pending")) : (setDeclining(true), setOpen(true))}><Icon name="x" sm/> {t("group.decline")}</button>;
  return <li className={"card event " + e.kind + (myStatus === "no" ? " declined" : "")}>
    <div className="event-top" onClick={() => setOpen(o => !o)}>
      <span className="date-badge"><small>{fmt({weekday: "short"}).format(d)}</small><b>{d.getDate()}</b><small>{fmt({month: "short"}).format(d)}</small></span>
      <div className="event-what">
        <b>{eventTitle(e)}</b>
        <span className="sub">{timeOf(e.starts_at)}{e.call_at && " · " + t("group.callAt", {time: timeOf(e.call_at)})}{e.place && " · " + e.place}</span>
        <span className="event-chips">
          <span className={"chip kind-" + e.kind}>{t("group.kind." + e.kind)}</span>
          {set && <span className="chip"><Icon name="music" sm/> {set.name}</span>}
          {myStatus && <StatusChip status={myStatus}/>}
          {canEdit && needs.length > 0 && !isPast && <span className="chip st-no">{tn("group.needSub", needs.length)}</span>}
          {e.kind === "rehearsal" && myAtt?.status === "present" && <span className="chip st-yes"><Icon name="check" sm/> {t("group.att.present")}</span>}
        </span>
      </div>
      <button className="icon-btn sm" aria-expanded={open} aria-label={t(open ? "group.less" : "group.more")} onClick={ev => { ev.stopPropagation(); setOpen(o => !o); }}><Icon name="chev" sm className={"event-chev" + (open ? " up" : "")}/></button>
    </div>
    {(yes || no || (e.kind === "rehearsal" && canCheckIn(e))) && <div className="event-actions">
      {yes}{no}
      {e.kind === "rehearsal" && canCheckIn(e) && !(myAtt && myAtt.by_admin) && <button className={"btn sm" + (myAtt ? " primary" : " soft")} aria-pressed={!!myAtt} aria-busy={busy === "in"}
        onClick={() => act("in", () => checkIn(e.id, !myAtt), myAtt ? "group.saved" : "group.checkedIn")}>{busy === "in" ? <Spin/> : <Icon name="user" sm/>} {t("group.checkIn")}</button>}
    </div>}
    {declining && <form className="decline" onSubmit={ev => { ev.preventDefault(); act("no", () => respond(e.id, "no", reason.trim()), "group.declined").then(() => { setDeclining(false); setReason(""); }); }}>
      <input className="input" autoFocus maxLength={200} placeholder={t("group.reasonPh")} aria-label={t("group.reason")} value={reason} onChange={ev => setReason(ev.target.value)}/>
      <button type="button" className="btn ghost sm" onClick={() => setDeclining(false)}>{t("common.cancel")}</button>
      <button className="btn danger-solid sm" aria-busy={busy === "no"}>{busy === "no" && <Spin/>}{t("group.sendDecline")}</button>
    </form>}
    {open && <div className="event-more">
      {roster.length ? <ul className="roster">{roster.map(r => <li key={r.email + r.role} className={"st-" + r.status}>
        <span className="roster-role">{r.role || "—"}</span><span className="roster-who">{personName(r.email)}{r.email === me && " " + t("group.you")}</span>
        <StatusChip status={r.status}/>{r.reason && <span className="roster-reason">“{r.reason}”</span>}</li>)}</ul>
        : <p className="sub">{t("group.noRoster")}</p>}
      {e.notes && <p className="event-notes">{e.notes}</p>}
      {e.kind === "rehearsal" && canEdit && Date.now() >= d.getTime() - 12 * 3600 * 1000 && <Attendance e={e}/>}
      <div className="event-foot">
        {set && <><button className="btn ghost sm" onClick={() => openGroupSetlist(set)}><Icon name="music" sm/> {t("group.openSetlist")}</button>
          <button className="btn ghost sm" onClick={() => openGroupSetlist(set, true)}><Icon name="stage" sm/> {t("medley.stage")}</button></>}
        {!isPast && <button className="btn ghost sm" onClick={() => downloadICS([e], eventTitle(e) + "-" + eventDay(e))}><Icon name="calendar" sm/> {t("group.addToCal")}</button>}
        {canEdit && <><button className="btn ghost sm" onClick={() => openDialog("event", {id: e.id, day: eventDay(e)})}><Icon name="edit" sm/> {t("common.edit")}</button>
          <button className="icon-btn sm danger" aria-label={t("common.delete")} title={t("common.delete")} onClick={async () => {
            if(await confirmDialog({title: t("group.deleteEventTitle"), message: t("group.deleteEventMsg", {name: eventTitle(e), day: longDay(d)})})) act("del", () => deleteEvent(e.id), "group.eventDeleted");
          }}><Icon name="trash" sm/></button></>}
      </div>
    </div>}
  </li>;
}

// Chamada do ensaio (só admins): presente, falta ou justificada para cada membro.
function Attendance({e}: {e: GEvent}){
  const g = useGroups(), [busy, setBusy] = useState("");
  const att = g.attendance.filter(a => a.event_id === e.id);
  const mark = async (email: string, v: Presence | "") => {
    setBusy(email);
    const ok = await markAttendance(e.id, email, v || null).finally(() => setBusy(""));
    if(!ok) toast(t("profile.saveFail"));
  };
  return <div className="attendance"><h3>{t("group.attendance")} <span className="sub">{t("group.attCount", {n: att.filter(a => a.status === "present").length, total: g.members.length})}</span></h3>
    <ul>{g.members.map(m => { const a = att.find(x => x.email === m.email);
      return <li key={m.email}><span className="roster-who">{busy === m.email && <Spin/>}{personName(m.email)}{a && !a.by_admin && <span className="chip">{t("group.selfCheckIn")}</span>}</span>
        <Seg aria={t("group.attendance") + ": " + personName(m.email)} value={(a?.status || "") as Presence | ""} onChange={v => mark(m.email, v === a?.status ? "" : v)}
          options={[{v: "present", label: t("group.att.p"), title: t("group.att.present")}, {v: "absent", label: t("group.att.a"), title: t("group.att.absent")}, {v: "excused", label: t("group.att.e"), title: t("group.att.excused")}]}/></li>; })}</ul>
  </div>;
}

// ---------- repertórios do grupo ----------
function Setlists({canEdit}: {canEdit: boolean}){
  useData();
  const g = useGroups();
  const mine = [...data.medleys.values()].filter(m => !isMedley(m) && medleyPayload(m).songs.length).sort((a, b) => a.name.localeCompare(b.name));
  const [pick, setPick] = useState(""), [busy, setBusy] = useState(""), lock = useLock();
  const share = () => lock(async () => {
    const m = data.medleys.get(pick || mine[0]?.id || ""); if(!m) return;
    const p = medleyPayload(m);
    setBusy("share");
    const ok = await shareSetlist(g.gid, p.sourceId, m.name, p.songs.length, await encodeMedley(p)).finally(() => setBusy(""));
    toast(t(ok ? "group.shared" : "profile.saveFail", {name: m.name}));
  });
  return <div className="group-setlists">
    {canEdit && <div className="card share-to-group"><h2>{t("group.shareTitle")}</h2><p className="sub">{t("group.shareSub")}</p>
      {mine.length ? <div className="people-add"><Select id="group-share-pick" aria={t("group.setlist")} value={pick || mine[0].id} onChange={setPick} options={mine.map(m => ({value: m.id, label: m.name}))}/>
        <button className="btn primary" aria-busy={busy === "share"} onClick={share}>{busy === "share" ? <Spin/> : <Icon name="share" sm/>} {t("group.share")}</button></div>
        : <p className="note info">{t("group.shareEmpty")}</p>}</div>}
    {g.setlists.length ? <ul className="cards">{g.setlists.map(s => <li key={s.id} className="lib-card" onClick={() => openGroupSetlist(s)}>
      <h3>{s.name}</h3>
      <div className="meta"><span className="chip">{tn("song", s.songs)}</span></div>
      <span className="when">{t("group.sharedBy", {name: personName(s.shared_by), when: ago(new Date(s.updated_at).getTime())})}</span>
      <div className="foot group-set-foot" onClick={ev => ev.stopPropagation()}>
        <button className="btn ghost sm" onClick={() => openGroupSetlist(s)}><Icon name="download" sm/> {t("group.openSetlist")}</button>
        <button className="btn ghost sm" onClick={() => openGroupSetlist(s, true)}><Icon name="stage" sm/> {t("medley.stage")}</button>
        {canEdit && <button className="icon-btn sm danger" aria-label={t("group.unshare")} title={t("group.unshare")} onClick={async () => {
          if(!await confirmDialog({title: t("group.unshareTitle"), message: t("group.unshareMsg", {name: s.name}), confirm: t("group.unshare")})) return;
          toast(t(await removeSetlist(s.id) ? "group.unshared" : "profile.saveFail", {name: s.name}));
        }}><Icon name="trash" sm/></button>}
      </div>
    </li>)}</ul> : <div className="card empty-state"><Icon name="music"/><strong>{t("group.noSetlists")}</strong><span>{t(canEdit ? "group.noSetlistsAdmin" : "group.noSetlistsSub")}</span></div>}
  </div>;
}

// ---------- membros ----------
function Members({canEdit}: {canEdit: boolean}){
  const g = useGroups(), me = useAuth(s => s.email), appAdmin = useAuth(s => s.admin);
  const [email, setEmail] = useState(""), [role, setRole] = useState(""), [asAdmin, setAsAdmin] = useState(false), [busy, setBusy] = useState(""), lock = useLock();
  const group = g.groups.find(x => x.id === g.gid)!;
  const load = monthLoad(dayKey(new Date()), g.events, g.roster);
  const add = (ev: React.FormEvent) => { ev.preventDefault(); lock(async () => {
    const v = email.trim().toLowerCase();
    if(!validEmail(v)) return toast(t("auth.badEmail"));
    setBusy("add"); const ok = await addMember(g.gid, v, asAdmin, role).finally(() => setBusy(""));
    if(!ok) return toast(t("profile.saveFail"));
    toast(t("group.memberAdded", {email: v})); setEmail(""); setRole(""); setAsAdmin(false);
  }); };
  const row = (m: Member, key: string, fn: () => Promise<boolean>, ok = "group.saved") => lock(async () => { setBusy(m.email + key); const r = await fn().finally(() => setBusy("")); toast(t(r ? ok : "profile.saveFail", {email: m.email})); });
  return <div className="profile-grid">
    <div className="card people-card">
      <h2>{t("group.membersTab")}</h2>
      {canEdit && <><p className="sub">{t("group.addSub")}</p>
        <form className="people-add" onSubmit={add}>
          <input className="input" id="member-email" type="email" inputMode="email" placeholder={t("people.emailPh")} aria-label={t("auth.email")} value={email} onChange={e => setEmail(e.target.value)}/>
          <input className="input role-input" id="member-role" maxLength={40} placeholder={t("group.rolePh")} aria-label={t("group.role")} value={role} onChange={e => setRole(e.target.value)} list="group-roles"/>
          <label className="switch lead boxed"><span>{t("group.leader")}</span><input type="checkbox" checked={asAdmin} onChange={e => setAsAdmin(e.target.checked)}/></label>
          <button className="btn primary" disabled={!email.trim()} aria-busy={busy === "add"}>{busy === "add" ? <Spin/> : <Icon name="plus" sm/>} {t("common.add")}</button>
        </form></>}
      <RoleList/>
      <ul className="people-list members">{g.members.map(m => {
        const rate = attendanceRate(m.email, g.events, g.attendance), n = load.get(m.email) || 0;
        return <li key={m.email}>
          <span className="avatar" aria-hidden="true">{initials({name: m.name, email: m.email})}</span>
          <span className="people-who"><span><b>{personName(m.email)}</b>{m.email === me && " " + t("group.you")}<br/><span className="sub people-email">{m.email}</span></span></span>
          <span className="member-chips">
            {m.is_admin && <span className="chip accent">{t("group.leader")}</span>}
            {rate.total > 0 && <span className="chip" title={t("group.rateHint")}>{t("group.rate", {p: Math.round(100 * rate.present / rate.total), n: rate.present, total: rate.total})}</span>}
            {n > 0 && <span className="chip" title={t("group.loadHint")}>{tn("group.load", n)}</span>}
          </span>
          {(canEdit || m.email === me) ? <RoleInput m={m} onSave={v => row(m, "role", () => setMemberRole(g.gid, m.email, v))}/> : m.role && <span className="chip">{m.role}</span>}
          {canEdit && m.email !== me && <span className="people-actions">
            <button className="btn ghost sm" aria-busy={busy === m.email + "adm"} onClick={() => row(m, "adm", () => setMemberAdmin(g.gid, m.email, !m.is_admin))}>{busy === m.email + "adm" && <Spin/>}{t(m.is_admin ? "group.unleader" : "group.makeLeader")}</button>
            <button className="icon-btn sm danger" aria-label={t("group.removeMember")} title={t("group.removeMember")} onClick={async () => {
              if(await confirmDialog({title: t("group.removeMember"), message: t("group.removeMemberMsg", {email: m.email, group: group.name}), confirm: t("people.remove")}))
                row(m, "del", () => removeMember(g.gid, m.email), "group.memberRemoved");
            }}><Icon name="trash" sm/></button></span>}
        </li>; })}</ul>
    </div>
    {canEdit && <GroupSettings appAdmin={appAdmin}/>}
  </div>;
}

// Sugestões de função ao digitar (as que o grupo já usa e as mais comuns).
const ROLES = ["voice", "lead", "back", "guitar", "acoustic", "bass", "keys", "drums", "perc", "sound", "media"];
function RoleList(){
  const g = useGroups();
  const all = [...new Set([...g.members.map(m => m.role), ...g.roster.map(r => r.role), ...ROLES.map(r => t("group.roles." + r))].filter(Boolean))];
  return <datalist id="group-roles">{all.map(r => <option key={r} value={r}/>)}</datalist>;
}
function RoleInput({m, onSave}: {m: Member; onSave: (v: string) => void}){
  const [v, setV] = useState(m.role);
  useEffect(() => setV(m.role), [m.role]);
  return <input className="input role-input sm" maxLength={40} list="group-roles" placeholder={t("group.rolePh")} aria-label={t("group.role") + ": " + personName(m.email)} value={v}
    onChange={e => setV(e.target.value)} onBlur={() => { if(v.trim() !== m.role) onSave(v); }} onKeyDown={e => { if(e.key === "Enter") e.currentTarget.blur(); }}/>;
}

function GroupSettings({appAdmin}: {appAdmin: boolean}){
  const g = useGroups(), group = g.groups.find(x => x.id === g.gid)!;
  const [name, setName] = useState(group.name), lock = useLock();
  useEffect(() => setName(group.name), [group.name]);
  return <div className="card people-card">
    <h2>{t("group.settings")}</h2>
    <label className="field"><span>{t("group.name")}</span><input className="input" id="group-rename" maxLength={80} value={name} onChange={e => setName(e.target.value)}
      onBlur={() => { if(name.trim() && name.trim() !== group.name) lock(async () => toast(t(await renameGroup(g.gid, name) ? "group.saved" : "profile.saveFail"))); }}
      onKeyDown={e => { if(e.key === "Enter") e.currentTarget.blur(); }}/></label>
    {appAdmin && <><h3>{t("group.newGroup")}</h3><NewGroup/>
      <button className="btn ghost danger" onClick={async () => {
        if(!await confirmDialog({title: t("group.deleteTitle"), message: t("group.deleteMsg", {name: group.name})})) return;
        lock(async () => toast(t(await deleteGroup(g.gid) ? "group.deleted" : "profile.saveFail", {name: group.name})));
      }}><Icon name="trash" sm/> {t("group.delete")}</button></>}
  </div>;
}
