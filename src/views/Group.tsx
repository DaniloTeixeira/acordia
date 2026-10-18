// Grupo (equipe de louvor): agenda com calendário do mês, escala de cada evento com confirmação,
// presença nos ensaios, datas em que cada um não pode, repertórios compartilhados e membros.
// Os dados vêm de lib/groups (nuvem) e as regras sem rede de lib/calendar.
import { useEffect, useMemo, useRef, useState } from "react";
import { t, tn, locale } from "../lib/i18n";
import * as store from "../lib/store";
import { useAuth, validEmail, listAllowed, type Allowed } from "../lib/cloud";
import { decodeMedley } from "../lib/share";
import { saveBlob } from "../lib/pdf";
import { ago, reduced, flashSaved } from "../lib/util";
import { splitRoles, joinRoles, toggleRole, sortRoles } from "../lib/roles";
import { monthGrid, dayKey, eventDay, splitEvents, canCheckIn, attendanceRate, rehearsalStanding, MISS_LIMIT, COMEBACK, monthLoad, toICS, rosterByPerson, type GEvent, type Presence } from "../lib/calendar";
import { useGroups, loadGroups, chooseGroup, createGroup, renameGroup, deleteGroup, addMember, setMemberAdmin, setMemberRole, removeMember,
  deleteEvent, respond, checkIn, markAttendance, setUnavailable, personName, personPhoto, amGroupAdmin, type GroupSetlist, type Member } from "../lib/groups";
import { useUI, useData, toast, openDialog, confirmDialog, go } from "../state";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { DateInput } from "../ui/DateInput";
import { useLock, Spin, today, Avatar } from "./Account";

const { data } = store;
export type Tab = "agenda" | "setlists" | "members";

// ---------- datas ----------
export const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale(), o);
export const timeOf = (iso: string) => fmt({hour: "2-digit", minute: "2-digit"}).format(new Date(iso));
export const eventTitle = (e: Pick<GEvent, "title" | "kind">) => e.title || t("group.kind." + e.kind);
const longDay = (d: Date) => fmt({weekday: "long", day: "numeric", month: "long"}).format(d);

// Bolinha de um membro: a foto do perfil (conta Google) ou as iniciais.
export const PersonAvatar = ({email}: {email: string}) => <Avatar person={{name: personName(email), email, photo: personPhoto(email)}}/>;

// Abre um repertório do grupo como um link recebido (salvar na biblioteca, ou atualizar a cópia).
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
      roster.length ? rosterByPerson(roster).map(p => (p.roles.length ? sortRoles(p.roles).join(", ") + ": " : "") + personName(p.email)).join("\n") : "",
      e.notes].filter(Boolean).join("\n\n");
    return {id: e.id, title: eventTitle(e) + (gname ? " · " + gname : ""), start: new Date(e.call_at || e.starts_at), place: e.place, description: desc};
  }));
  saveBlob(new Blob([ics], {type: "text/calendar"}), name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() + ".ics");
}

// Ao abrir a página e ao voltar para o app, busca o que mudou no grupo.
export function useGroupRefresh(){
  const status = useAuth(s => s.status);
  useEffect(() => {
    if(status !== "in") return;
    loadGroups();
    const wake = () => { if(!document.hidden) loadGroups(); };
    document.addEventListener("visibilitychange", wake);
    return () => document.removeEventListener("visibilitychange", wake);
  }, [status]);
}
// Abre a página do grupo numa aba (do Início).
export function openGroup(tab: Tab = "agenda", eventId = ""){
  store.setSetting("groupTab", tab);
  useUI.setState({eventFocus: eventId});
  go("group");
}

export function Group(){
  useData();
  useGroupRefresh();
  const admin = useAuth(s => s.admin);
  const g = useGroups();
  const tab: Tab = (["agenda", "setlists", "members"] as const).find(v => v === data.settings.groupTab) || "agenda";
  const group = g.groups.find(x => x.id === g.gid);
  const head = (sub: string, actions?: React.ReactNode) => <div className="view-head"><div>
    <button className="btn ghost sm back" id="group-back" onClick={() => go("home")}><Icon name="back" sm/><span>{t("nav.home")}</span></button>
    <h1 id="group-h">{group ? group.name : t("group.title")}</h1><p className="sub">{sub}</p></div>
    {actions && <div className="actions">{actions}</div>}</div>;
  if(!group) return <section className="view" id="view-group" data-view="group" aria-labelledby="group-h">
    {head(t("group.sub"))}
    {!g.loaded || g.loading ? <div className="card empty-state"><Spin/><span>{t("auth.loading")}</span></div>
      : g.error ? <div className="card empty-state"><Icon name="sync"/><strong>{t("group.loadFail")}</strong><button className="btn ghost" onClick={() => loadGroups()}>{t("group.retry")}</button></div>
      : <div className="card empty-state"><Icon name="users"/><strong>{t("group.none")}</strong><span>{t(admin ? "group.noneAdmin" : "group.noneSub")}</span>{admin && <NewGroup/>}</div>}
  </section>;
  const canEdit = amGroupAdmin();
  return <section className="view" id="view-group" data-view="group" aria-labelledby="group-h">
    {head(tn("group.members", g.members.length) + (g.error ? " · " + t("group.offline") : ""), <>
      {g.groups.length > 1 && <Select id="group-pick" aria={t("group.pick")} value={g.gid} onChange={v => chooseGroup(v)} options={g.groups.map(x => ({value: x.id, label: x.name}))}/>}
      {canEdit && tab === "agenda" && <button className="btn primary" id="group-new-event" onClick={() => openDialog("event", {id: null, day: dayKey(new Date())})}><Icon name="plus" sm/><span>{t("group.newEvent")}</span></button>}
    </>)}
    <Seg id="group-tabs" className="block" aria={t("group.title")} value={tab} onChange={v => store.setSetting("groupTab", v)}
      options={[{v: "members", label: t("group.membersTab")}, {v: "agenda", label: t("group.agenda")}, {v: "setlists", label: t("group.setlists")}]}/>
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
  // Vindo do Início com um evento: abre o dia dele.
  const focus = useUI(s => s.eventFocus);
  const [sel, setSel] = useState(() => { const e = g.events.find(x => x.id === focus); return e ? eventDay(e) : ""; });
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
    <span className="my-next-what"><b>{eventTitle(e)}</b><span className="sub">{timeOf(e.starts_at)} · {sortRoles(rows.map(r => r.role).filter(Boolean)).join(", ") || t("group.onRoster")}</span></span>
    <StatusChip status={st}/></li>;
}

export function StatusChip({status}: {status: string}){
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

// Quadro da data do evento: quadrado com o lado igual à altura do cabeçalho (título, hora e chips).
// Só com CSS a largura é calculada antes da altura esticar, e o quadro ficava retangular.
function useSquareBadge(){
  const what = useRef<HTMLDivElement>(null), badge = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const w = what.current, b = badge.current; if(!w || !b || typeof ResizeObserver !== "function") return;
    const fit = () => { const h = Math.max(52, Math.round(w.getBoundingClientRect().height)) + "px"; b.style.width = h; b.style.height = h; };
    const ro = new ResizeObserver(fit); ro.observe(w); fit();
    return () => ro.disconnect();
  }, []);
  return {what, badge};
}
function EventCard({e, canEdit}: {e: GEvent; canEdit: boolean}){
  const sq = useSquareBadge();
  const g = useGroups(), me = useAuth(s => s.email);
  const [open, setOpen] = useState(() => useUI.getState().eventFocus === e.id), [declining, setDeclining] = useState(false), [reason, setReason] = useState(""), [busy, setBusy] = useState("");
  const lock = useLock(), ref = useRef<HTMLLIElement>(null);
  // O evento que veio do Início aparece aberto e na tela; depois o pedido é esquecido.
  useEffect(() => {
    if(useUI.getState().eventFocus !== e.id) return;
    requestAnimationFrame(() => ref.current?.scrollIntoView({block: "center", behavior: reduced() ? "auto" : "smooth"}));
    useUI.setState({eventFocus: ""});
  }, [e.id]);
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
  return <li ref={ref} className={"card event " + e.kind + (myStatus === "no" ? " declined" : "")}>
    <div className="event-top" onClick={() => setOpen(o => !o)}>
      <span className="date-badge" ref={sq.badge}><small>{fmt({weekday: "short"}).format(d)}</small><b>{d.getDate()}</b><small>{fmt({month: "short"}).format(d)}</small></span>
      <div className="event-what" ref={sq.what}>
        <b>{eventTitle(e)}</b>
        <span className="sub">{timeOf(e.starts_at)}{e.call_at && " · " + t("group.callAt", {time: timeOf(e.call_at)})}{e.place && " · " + e.place}</span>
        <span className="event-chips">
          {/* Sem título, o tipo já é o título: o chip só aparece quando o evento tem nome próprio. */}
          {e.title && <span className={"chip kind-" + e.kind}>{t("group.kind." + e.kind)}</span>}
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
      {roster.length ? <ul className="roster">{rosterByPerson(roster).map(r => <li key={r.email} className={"st-" + r.status}>
        <span className="roster-role">{sortRoles(r.roles).join(", ") || "—"}</span><span className="roster-who">{personName(r.email)}{r.email === me && " " + t("group.you")}</span>
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

// Chamada do ensaio (só admins): presente ou falta para cada membro.
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
        <Seg className="sm" aria={t("group.attendance") + ": " + personName(m.email)} value={(a?.status || "") as Presence | ""} onChange={v => mark(m.email, v === a?.status ? "" : v)}
          options={[{v: "present", label: t("group.att.present")}, {v: "absent", label: t("group.att.absent")}]}/></li>; })}</ul>
  </div>;
}

// ---------- repertórios do grupo ----------
// Os repertórios dos admins entram aqui sozinhos (publish.ts), sempre na versão mais nova.
function Setlists({canEdit}: {canEdit: boolean}){
  const g = useGroups();
  return <div className="group-setlists">
    {canEdit && <p className="note info">{t("group.autoShare")}</p>}
    {g.setlists.length ? <ul className="cards">{g.setlists.map(s => <li key={s.id} className="lib-card" onClick={() => openGroupSetlist(s)}>
      <h3>{s.name}</h3>
      <div className="meta"><span className="chip">{tn("song", s.songs)}</span></div>
      <span className="when">{t("group.sharedBy", {name: personName(s.shared_by), when: ago(new Date(s.updated_at).getTime())})}</span>
      <div className="foot group-set-foot" onClick={ev => ev.stopPropagation()}>
        <button className="btn ghost sm" onClick={() => openGroupSetlist(s)}><Icon name="download" sm/> {t("group.openSetlist")}</button>
        <button className="btn ghost sm" onClick={() => openGroupSetlist(s, true)}><Icon name="stage" sm/> {t("medley.stage")}</button>
      </div>
    </li>)}</ul> : <div className="card empty-state"><Icon name="music"/><strong>{t("group.noSetlists")}</strong><span>{t(canEdit ? "group.noSetlistsAdmin" : "group.noSetlistsSub")}</span></div>}
  </div>;
}

// ---------- membros ----------
function Members({canEdit}: {canEdit: boolean}){
  const g = useGroups(), me = useAuth(s => s.email), appAdmin = useAuth(s => s.admin);
  const [email, setEmail] = useState(""), [name, setName] = useState(""), [birthday, setBirthday] = useState(""), [roles, setRoles] = useState<string[]>([]), [asAdmin, setAsAdmin] = useState(false), [busy, setBusy] = useState(""), lock = useLock();
  const group = g.groups.find(x => x.id === g.gid)!;
  const load = monthLoad(dayKey(new Date()), g.events, g.roster);
  // Puxar do cadastro (só admins do app leem a lista): quem tem acesso e ainda não está no grupo.
  const [allowed, setAllowed] = useState<Allowed[]>([]);
  useEffect(() => { if(canEdit && appAdmin) listAllowed().then(r => r && setAllowed(r)); }, [canEdit, appAdmin, g.members.length]);
  const outside = allowed.filter(a => !g.members.some(m => m.email === a.email));
  const pickUser = (v: string) => {
    const a = outside.find(x => x.email === v); if(!a) return;
    setEmail(a.email); setName(a.profileName || a.name); setBirthday(a.profileBirthday || a.birthday || "");
  };
  const add = (ev: React.FormEvent) => { ev.preventDefault(); lock(async () => {
    const v = email.trim().toLowerCase();
    if(!validEmail(v)) return toast(t("auth.badEmail"));
    setBusy("add"); const ok = await addMember(g.gid, v, asAdmin, joinRoles(roles), name, birthday).finally(() => setBusy(""));
    if(!ok) return toast(t("profile.saveFail"));
    toast(t("group.memberAdded", {email: v})); setEmail(""); setName(""); setBirthday(""); setRoles([]); setAsAdmin(false);
  }); };
  const row = (m: Member, key: string, fn: () => Promise<boolean>, ok = "group.saved") => lock(async () => { setBusy(m.email + key); const r = await fn().finally(() => setBusy("")); toast(t(r ? ok : "profile.saveFail", {email: m.email})); });
  return <div className="profile-grid">
    <div className="card people-card">
      <h2>{t("group.membersTab")}</h2>
      {canEdit && <><p className="sub">{t("group.addSub")}</p>
        <form className="member-add people-add-box" onSubmit={add}>
          <h3 className="people-sub-h">{t("group.addTitle")}</h3>
          {outside.length > 0 && <Select id="member-pick" className="member-pick" aria={t("group.pickUser")} value={outside.some(a => a.email === email) ? email : ""} onChange={pickUser}
            options={[{value: "", label: t("group.pickUser")}, ...outside.map(a => ({value: a.email, label: (a.profileName || a.name) ? (a.profileName || a.name) + " · " + a.email : a.email}))]}/>}
          <div className="people-add">
            <input className="input" id="member-name" maxLength={80} autoComplete="off" placeholder={t("people.namePh")} aria-label={t("profile.name")} value={name} onChange={e => setName(e.target.value)}/>
            <input className="input" id="member-email" type="email" inputMode="email" placeholder={t("people.emailPh")} aria-label={t("auth.email")} value={email} onChange={e => setEmail(e.target.value)}/>
            <DateInput className="people-birthday" id="member-birthday" aria={t("profile.birthday")} max={today()} clearable value={birthday} onChange={setBirthday}/>
            <label className="switch lead boxed"><span>{t("group.leader")}</span><input type="checkbox" checked={asAdmin} onChange={e => setAsAdmin(e.target.checked)}/></label>
            <button className="btn primary" disabled={!email.trim()} aria-busy={busy === "add"}>{busy === "add" ? <Spin/> : <Icon name="plus" sm/>} {t("common.add")}</button>
          </div>
          <RolePicker value={roles} onChange={setRoles}/>
        </form></>}
      <h3 className="people-sub-h">{t("group.listTitle")} <span className="count-chip">{g.members.length}</span></h3>
      <ul className="people-list members">{g.members.map(m => {
        const rate = attendanceRate(m.email, g.events, g.attendance), sd = rehearsalStanding(m.email, g.events, g.attendance), n = load.get(m.email) || 0;
        // Regra dos ensaios no lugar do "% nos ensaios" (a porcentagem fica na dica).
        const hint = t("group.ruleHint", {max: MISS_LIMIT, back: COMEBACK, p: rate.total ? Math.round(100 * rate.present / rate.total) : 0, present: rate.present, total: rate.total});
        // Líder: toggle com moldura (como o Admin da lista de usuários), antes do lápis; desabilitado enquanto salva.
        // Na própria linha só aparece se a pessoa não fica sem acesso: é admin do app ou há outro líder.
        const self = m.email === me, otherLeader = g.members.some(x => x.is_admin && x.email !== me);
        const leader = canEdit && (!self || appAdmin || otherLeader) ? <label className="switch lead boxed people-admin" aria-busy={busy === m.email + "adm"}><span>{t("group.leader")}</span>
          <input type="checkbox" checked={m.is_admin} disabled={busy === m.email + "adm"} aria-label={t("group.leaderAria", {name: personName(m.email)})}
            onChange={async () => {
              if(self && m.is_admin && !appAdmin && !await confirmDialog({title: t("group.leaveLeadTitle"), message: t("group.leaveLeadMsg", {group: group.name})})) return;
              row(m, "adm", () => setMemberAdmin(g.gid, m.email, !m.is_admin));
            }}/></label> : null;
        return <li key={m.email}>
          <PersonAvatar email={m.email}/>
          <span className="people-who"><span><b>{personName(m.email)}</b>{m.email === me && " " + t("group.you")}<br/><span className="sub people-email">{m.email}</span></span></span>
          <span className="member-chips">
            {m.is_admin && <span className="chip accent">{t("group.leader")}</span>}
            {sd.out ? <span className="chip st-no" title={hint}>{tn("group.standOut", sd.need)}</span>
              : sd.streak > 0 ? <span className={"chip" + (sd.streak >= MISS_LIMIT - 3 ? " st-pending" : "")} title={hint}>{t("group.streak", {n: sd.streak, max: MISS_LIMIT})}</span>
              : sd.called > 0 && <span className="chip st-yes" title={hint}>{t("group.standOk")}</span>}
            {n > 0 && <span className="chip" title={t("group.loadHint")}>{tn("group.load", n)}</span>}
          </span>
          <MemberRoles m={m} editable={canEdit || m.email === me} busy={busy === m.email + "role"} before={leader} onSave={v => row(m, "role", () => setMemberRole(g.gid, m.email, v))}
            after={canEdit && m.email !== me && <button className="icon-btn sm danger" aria-label={t("group.removeMember")} title={t("group.removeMember")} onClick={async () => {
              if(await confirmDialog({title: t("group.removeMember"), message: t("group.removeMemberMsg", {email: m.email, group: group.name}), confirm: t("people.remove")}))
                row(m, "del", () => removeMember(g.gid, m.email), "group.memberRemoved");
            }}><Icon name="trash" sm/></button>}/>
        </li>; })}</ul>
    </div>
    {canEdit && <GroupSettings appAdmin={appAdmin}/>}
  </div>;
}

// Funções para escolher: as mais comuns e as que o grupo já usa.
const ROLES = ["sound", "voice", "bass", "drums", "acoustic", "keys"];
export function roleOptions(){
  const g = useGroups.getState();
  return sortRoles(splitRoles([...ROLES.map(r => t("group.roles." + r)), ...g.members.map(m => m.role), ...g.roster.map(r => r.role)].join(",")));
}
// Botões para ligar e desligar cada função, e um campo para incluir outra.
function RolePicker({value, onChange}: {value: string[]; onChange: (v: string[]) => void}){
  const [other, setOther] = useState("");
  const has = (r: string) => value.some(x => x.toLocaleLowerCase() === r.toLocaleLowerCase());
  const opts = sortRoles(splitRoles([...roleOptions(), ...value].join(",")));
  const add = () => { const r = other.trim().replace(/,/g, " "); if(r && !has(r)) onChange([...value, r]); setOther(""); };
  return <div className="role-picker">
    <span className="lbl">{t("group.roles")}</span>
    <div className="role-chips" role="group" aria-label={t("group.roles")}>{opts.map(r =>
      <button type="button" key={r} className="role-chip" aria-pressed={has(r)} onClick={() => onChange(toggleRole(value, r))}>{has(r) && <Icon name="check" sm/>}{r}</button>)}</div>
    <div className="role-other">
      <input className="input sm" maxLength={40} placeholder={t("group.roleOther")} aria-label={t("group.roleOther")} value={other} onChange={e => setOther(e.target.value)}
        onKeyDown={e => { if(e.key === "Enter"){ e.preventDefault(); add(); } }}/>
      <button type="button" className="btn ghost sm" disabled={!other.trim()} onClick={add}><Icon name="plus" sm/> {t("common.add")}</button>
    </div>
  </div>;
}
// Funções de um membro: os chips, e o lápis para quem pode mudar (quem lidera, ou a própria pessoa).
// O lápis fica junto dos chips (edita as funções); before e after (o toggle de líder e excluir o membro)
// ficam num bloco à parte, que na lista de membros vai para a direita.
export function MemberRoles({m, editable, busy, onSave, before, after}: {m: Member; editable: boolean; busy: boolean; onSave: (v: string) => void; before?: React.ReactNode; after?: React.ReactNode}){
  const [editing, setEditing] = useState<string[] | null>(null);
  const roles = sortRoles(splitRoles(m.role));
  if(editing) return <div className="member-roles editing">
    <RolePicker value={editing} onChange={setEditing}/>
    <div className="member-roles-foot">
      <button type="button" className="btn ghost sm" onClick={() => setEditing(null)}>{t("common.cancel")}</button>
      <button type="button" className="btn primary sm" onClick={() => { const v = joinRoles(editing); setEditing(null); if(v !== m.role) onSave(v); }}>{t("common.save")}</button>
    </div>
  </div>;
  return <span className="member-roles">
    {roles.length ? roles.map(r => <span key={r} className="chip">{r}</span>) : editable && <span className="sub">{t("group.noRoles")}</span>}
    {editable && <button type="button" className="icon-btn sm" aria-label={t("group.editRoles") + ": " + personName(m.email)} title={t("group.editRoles")} onClick={() => setEditing(roles)}><Icon name="edit" sm/></button>}
    {busy && <Spin/>}
    {(before || after) && <span className="member-role-actions">{before}{after}</span>}
  </span>;
}

function GroupSettings({appAdmin}: {appAdmin: boolean}){
  const g = useGroups(), group = g.groups.find(x => x.id === g.gid)!;
  const [name, setName] = useState(group.name), lock = useLock();
  useEffect(() => setName(group.name), [group.name]);
  return <div className="card people-card">
    <h2>{t("group.settings")}</h2>
    <label className="field"><span>{t("group.name")}</span><input className="input" id="group-rename" maxLength={80} value={name} onChange={e => setName(e.target.value)}
      onBlur={e => { const el = e.currentTarget; if(name.trim() && name.trim() !== group.name) lock(async () => { if(await renameGroup(g.gid, name)) flashSaved(el); else toast(t("profile.saveFail")); }); }}
      onKeyDown={e => { if(e.key === "Enter") e.currentTarget.blur(); }}/></label>
    {appAdmin && <><h3>{t("group.newGroup")}</h3><NewGroup/>
      <button className="btn ghost danger" onClick={async () => {
        if(!await confirmDialog({title: t("group.deleteTitle"), message: t("group.deleteMsg", {name: group.name})})) return;
        lock(async () => toast(t(await deleteGroup(g.gid) ? "group.deleted" : "profile.saveFail", {name: group.name})));
      }}><Icon name="trash" sm/> {t("group.delete")}</button></>}
  </div>;
}
