// Grupo (equipe de louvor): agenda com calendário do mês, escala de cada evento com confirmação,
// presença nos ensaios, datas em que cada um não pode, repertórios compartilhados e membros.
// Os dados vêm de lib/groups (nuvem) e as regras sem rede de lib/calendar.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { t, tn, locale } from "../lib/i18n";
import * as store from "../lib/store";
import { useAuth, validEmail, listAllowed, initials, setPersonInfo, setAllowedInfo, type Allowed } from "../lib/cloud";
import { decodeMedley, type IncomingMedley, type IncomingSong } from "../lib/share";
import { songTitle, sanitizeItem } from "../lib/core";
import { norm } from "../lib/util";
import { current, openMedley } from "../repertoire";
import type { Item } from "../lib/types";
import { copyName } from "./Library";
import { saveBlob } from "../lib/pdf";
import { ago, reduced } from "../lib/util";
import { splitRoles, joinRoles, toggleRole, sortRoles } from "../lib/roles";
import { monthGrid, dayKey, eventDay, splitEvents, canCheckIn, pendingCheckIn, waLink, waNumber, CHECKIN_MS, attendanceRate, rehearsalStanding, MISS_LIMIT, COMEBACK, monthLoad, toICS, rosterByPerson, needsCover, maskPhone, capFirst, type GEvent, type Presence } from "../lib/calendar";
import { useGroups, loadGroups, createGroup, removeGroupPhoto, setGroupRound, addMember, setMemberAdmin, setGroupLeader, setMemberRole, removeMember,
  deleteEvent, respond, setCover, checkIn, markAttendance, setUnavailable, personName, personPhoto, amGroupAdmin, setMemberOut, outMark, isActive, setMemberActive, type GroupSetlist, type Member, type Group } from "../lib/groups";
import { useUI, useData, toast, openDialog, confirmDialog, pickLeaderDialog, go } from "../state";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { useFold, FoldHead } from "../ui/Fold";
import { SKIP_OPEN, StreakChip, useLock, Spin, Avatar, PersonFields, useEmailCheck, pickPhoto, PhoneLink, fmtBirthday, today, usePeopleFilter, PeopleTools } from "./Account";
import { DateInput } from "../ui/DateInput";

const { data } = store;
export type Tab = "agenda" | "setlists" | "members";

// ---------- datas ----------
export const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale(), o);
export const timeOf = (iso: string) => fmt({hour: "2-digit", minute: "2-digit"}).format(new Date(iso));
export const eventTitle = (e: Pick<GEvent, "title" | "kind">) => e.title || t("group.kind." + e.kind);
export const longDay = (d: Date) => fmt({weekday: "long", day: "numeric", month: "long"}).format(d);

// Bolinha de um membro: a foto do perfil (conta Google) ou as iniciais.
export const PersonAvatar = ({email}: {email: string}) => <Avatar person={{name: personName(email), email, photo: personPhoto(email)}}/>;

// Abre um repertório do grupo: guarda (ou atualiza) a cópia na biblioteca, sempre na versão publicada, e vai
// para ela; com stage, direto no Palco.
export async function openGroupSetlist(s: GroupSetlist, stage = false){
  const med = await decodeMedley(s.code);
  if(!med) return toast(t("incoming.bad"));
  // Quem publicou já tem o original (é dele que sai a versão do grupo): abre ele, sem criar uma cópia.
  const own = data.medleys.get(med.sourceId);
  const id = own && !own.sourceId ? own.id : saveIncoming(med);
  // Um repertório vazio aberto (ex.: primeiro acesso) não precisa ficar sobrando.
  const prev = current(); if(prev.id !== id && !prev.items.length) store.deleteMedley(prev.id);
  openMedley(id); go("medley");
  if(stage) useUI.setState({stageOpen: true});
}
function findOrCreateSong(e: IncomingSong){
  const same = [...data.songs.values()].find(x => norm(x.title) === norm(songTitle(e.text)) && x.text.trim() === e.text.trim());
  if(same && e.ref && !same.ref){ same.ref = e.ref; store.saveSong(same); }
  return same || store.createSong({text:e.text, type:e.type, key:e.key, bpm:e.bpm, ref:e.ref});
}
// Já recebeu este repertório antes? Então atualiza a cópia em vez de criar outra.
function saveIncoming(med: IncomingMedley){
  const existing = med.sourceId ? [...data.medleys.values()].find(x => x.sourceId === med.sourceId && x.kind === med.kind) : undefined;
  const blocks = med.groups.map(name => store.createMedley(name, [], med.options, "medley"));
  const items: Item[] = [], placed = new Set<number>();
  med.songs.forEach(e => {
    const songItem = store.newItem(findOrCreateSong(e).id, sanitizeItem(e));
    if(e.g !== undefined && blocks[e.g]){
      // No medley o momento é do bloco inteiro (vem repetido em cada música dele).
      songItem.moment = "";
      blocks[e.g].items.push(songItem);
      if(!placed.has(e.g)){ placed.add(e.g); items.push(Object.assign(store.newMedleyItem(blocks[e.g].id), {moment: e.moment || ""})); }
    } else items.push(songItem);
  });
  blocks.forEach(b => { b.linkOf = med.sourceId; store.saveMedley(b); });
  if(existing){
    // Os medleys que vieram da versão anterior saem; os novos entram no lugar.
    existing.items.forEach(i => { const b = i.type === "medley" && data.medleys.get(i.medleyId); if(b && b.linkOf === med.sourceId && !blocks.includes(b)) store.deleteMedley(b.id); });
    // O nome segue o do líder; se outro da biblioteca já usa esse nome, fica com "(cópia)" (mantém o que já tinha).
    const clash = [...data.medleys.values()].some(x => x !== existing && x.name === med.name);
    const name = !clash ? med.name : existing.name !== med.name && existing.name.startsWith(med.name) ? existing.name : copyName(med.name);
    Object.assign(existing, {name, items, options: med.options}); store.saveMedley(existing);
    return existing.id;
  }
  // Já tem um com esse nome? A cópia nova ganha "(cópia)", para não ficar dois iguais na biblioteca.
  const name = [...data.medleys.values()].some(x => x.name === med.name) ? copyName(med.name) : med.name;
  const nm = store.createMedley(name, items, med.options, med.kind === "medley" ? "medley" : "setlist");
  if(med.sourceId){ nm.sourceId = med.sourceId; store.saveMedley(nm); }
  return nm.id;
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
// Abre a página do grupo numa aba; sem aba, em Membros.
export function openGroup(tab: Tab = "members", eventId = ""){
  store.setSetting("groupTab", tab);
  useUI.setState({eventFocus: eventId});
  go("group");
}

export function Group(){
  useData();
  useGroupRefresh();
  const admin = useAuth(s => s.admin);
  const g = useGroups();
  const group = g.groups.find(x => x.id === g.gid);
  const canEdit = !!group && amGroupAdmin();
  const tab: Tab = (["agenda", "setlists", "members"] as const).find(v => v === data.settings.groupTab) || "members";
  // Quem lidera tem o lápis ao lado do nome: abre a janela com a foto, o nome e (admin do app) outro grupo e excluir.
  const head = (sub: string, actions?: React.ReactNode) => <div className="view-head"><div>
    <button className="btn ghost sm back" id="group-back" onClick={() => go("home")}><Icon name="back" sm/><span>{t("nav.home")}</span></button>
    <div className="group-title">{group && (admin ? <GroupPhotoButton group={group}/> : <GroupMark group={group}/>)}
      <div>{group && <span className="group-kicker">{t("group.title")}</span>}<h1 id="group-h">{group ? group.name : t("group.title")}{canEdit && <button type="button" className="icon-btn sm line group-edit-btn" id="group-edit"
        aria-label={t("group.edit")} title={t("group.edit")} onClick={() => openDialog("group", {})}><Icon name="edit" sm/></button>}</h1><p className="sub">{sub}</p></div></div></div>
    {actions && <div className="actions">{actions}</div>}</div>;
  if(!group) return <section className="view" id="view-group" data-view="group" aria-labelledby="group-h">
    {head(t("group.sub"))}
    {!g.loaded || g.loading ? <div className="card empty-state"><Spin/><span>{t("auth.loading")}</span></div>
      : g.error ? <div className="card empty-state"><Icon name="sync"/><strong>{t("group.loadFail")}</strong><button className="btn ghost" onClick={() => loadGroups()}>{t("group.retry")}</button></div>
      : <div className="card empty-state"><Icon name="users"/><strong>{t("group.none")}</strong><span>{t(admin ? "group.noneAdmin" : "group.noneSub")}</span>{admin && <NewGroup/>}</div>}
  </section>;
  return <section className="view" id="view-group" data-view="group" aria-labelledby="group-h">
    {head(tn("group.members", g.members.length) + (g.error ? " · " + t("group.offline") : ""), <>
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
      <p className="sub my-next-hint">{t("group.addToCalHint")}</p>
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
            options={[{v: "past", label: t("group.past")}, {v: "next", label: t("group.upcoming")}]}/>}
        {list.length ? <ul className="events">{list.map(e => <EventCard key={e.id} e={e} canEdit={canEdit}/>)}</ul>
          : <div className="card empty-state"><Icon name="calendar"/><strong>{t(sel ? "group.noEventsDay" : showPast ? "group.noPast" : "group.noEvents")}</strong>
            {canEdit && !showPast && <span>{t("group.noEventsAdmin")}</span>}</div>}
      </div>
    </div>
  </div>;
}

function MyNextRow({e}: {e: GEvent}){
  const me = useAuth(s => s.email), g = useGroups();
  const rows = g.roster.filter(r => r.event_id === e.id && r.email === me);
  // O status (confirmado / não pode) fica só no card do evento, em "Sua resposta"; aqui são data, hora e funções.
  const d = new Date(e.starts_at), roles = sortRoles(rows.map(r => r.role).filter(Boolean)), sq = useSquareBadge();
  // O selo da data cresce até a altura do bloco inteiro (título, hora, funções e botão) e fica quadrado.
  return <li><span className="date-badge" ref={sq.badge}><small>{fmt({weekday: "short"}).format(d)}</small><b>{d.getDate()}</b><small>{fmt({month: "short"}).format(d)}</small></span>
    <div className="my-next-what" ref={sq.what}><b>{eventTitle(e)}</b><span className="sub">{timeOf(e.starts_at)}{roles.length === 0 && " · " + t("group.onRoster")}</span>
      <span className="my-next-chips">{roles.map(x => <span key={x} className="chip role">{x}</span>)}</span>
      <button className="btn soft sm my-next-ics" onClick={() => downloadICS([e], eventTitle(e))}><Icon name="calendar" sm/> {t("group.addAllToCal")}</button></div></li>;
}

export function StatusChip({status, noIcon}: {status: string; noIcon?: boolean}){
  return <span className={"chip st-" + status}>{!noIcon && <><Icon name={status === "yes" ? "check" : status === "no" ? "x" : "dot"} sm/> </>}{t("group.status." + status)}</span>;
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
  useLayoutEffect(() => {
    const w = what.current, b = badge.current; if(!w || !b) return;
    // O lado é a altura do texto ao lado; mede de novo quando o texto muda de tamanho, a tela gira ou a fonte termina de carregar.
    const fit = () => { const h = Math.max(52, Math.ceil(w.getBoundingClientRect().height)) + "px"; b.style.width = h; b.style.height = h; };
    fit();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null; ro?.observe(w);
    window.addEventListener("resize", fit); document.fonts?.ready.then(fit);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, []);
  return {what, badge};
}
function EventCard({e, canEdit}: {e: GEvent; canEdit: boolean}){
  const sq = useSquareBadge();
  const g = useGroups(), me = useAuth(s => s.email);
  const [busy, setBusy] = useState("");
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
  const needs = needsCover(roster), myCover = mineRows[0]?.cover || "";
  const act = (key: string, fn: () => Promise<boolean>, ok?: string) => lock(async () => { setBusy(key); const r = await fn().finally(() => setBusy("")); toast(t(r ? ok || "group.saved" : "profile.saveFail")); return r; });
  // Resposta de quem está na escala: abas Confirmar / Não posso; tocar na aba ativa volta para "sem resposta".
  // A aba escolhida já fica marcada, com o spinner, enquanto grava (e volta ao valor real se falhar).
  const canReply = mineRows.length > 0 && !isPast, cur = myStatus === "yes" || myStatus === "no" ? myStatus : "";
  const [sent, setSent] = useState<{v: "yes" | "no"; to: "yes" | "no" | ""} | null>(null);
  const pick = (v: "yes" | "no") => {
    if(sent) return;
    const to: "yes" | "no" | "" = cur === v ? "" : v;
    setSent({v, to});
    act(v, () => respond(e.id, to || "pending"), to === "yes" ? "group.confirmed" : to === "no" ? "group.declined" : "group.saved").finally(() => setSent(null));
  };
  const tab = (v: "yes" | "no", icon: string, label: string) => ({v, label: <>{sent?.v === v ? <Spin/> : <Icon name={icon} sm/>}<span>{label}</span></>});
  // Quem disse "não posso" pode indicar quem cobre; é só um aviso para o grupo.
  const coverOpts = [{value: "", label: t("group.coverNone")}, ...g.members.filter(m => isActive(m) && m.email !== me).map(m => ({value: m.email, label: personName(m.email)}))];
  const pickCover = (v: string) => act("cover", () => setCover(e.id, v));
  const reply = canReply && <Seg<"yes" | "no" | ""> className="event-reply" aria={t("group.myReply")} value={sent ? sent.to : cur} disabled={!!sent}
    options={[tab("yes", "check", t("group.confirm")), tab("no", "x", t("group.decline"))]} onChange={v => v && pick(v)}/>;
  return <li ref={ref} className={"card event " + e.kind + (myStatus === "no" ? " declined" : "")}>
    <div className="event-sec"><h3 className="people-sub-h">{t("group.details")}</h3>
    <div className="event-info">
    <div className="event-top">
      <span className="date-badge" ref={sq.badge}><small>{fmt({weekday: "short"}).format(d)}</small><b>{d.getDate()}</b><small>{fmt({month: "short"}).format(d)}</small></span>
      <div className="event-what" ref={sq.what}>
        <b>{eventTitle(e)}</b>
        <span className="sub">{timeOf(e.starts_at)}{e.call_at && " · " + t("group.callAt", {time: timeOf(e.call_at)})}{e.place && " · " + e.place}</span>
        <span className="event-chips">
          {/* Sem título (ou com título igual ao tipo), o tipo já é o título: o chip só aparece quando o evento tem nome próprio. */}
          {e.title && e.title.trim().toLowerCase() !== t("group.kind." + e.kind).toLowerCase() && <span className={"chip kind-" + e.kind}>{t("group.kind." + e.kind)}</span>}
          {set && <span className="chip"><Icon name="music" sm/> {set.name}</span>}
          {canEdit && needs.length > 0 && !isPast && <span className="chip st-no">{tn("group.needSub", needs.length)}</span>}
          {e.kind === "rehearsal" && myAtt?.status === "present" && <span className="chip st-yes"><Icon name="check" sm/> {t("group.att.present")}</span>}
          {pendingCheckIn(e, [me], g.attendance).length > 0 && <span className="chip st-pending"><Icon name="dot" sm/> {t("group.att.pending")}</span>}
        </span>
      </div>
    </div>
    </div></div>
    <div className="event-more">
      {/* Cada pessoa: nome e situação em cima, as funções neste evento como chips embaixo. */}
      {/* Ensaio é de todos: quem não foi escalado também aparece (sem resposta a dar), só com o nome. */}
      <div className="event-sec"><h3 className="people-sub-h">{t("group.roster")}</h3>
      {e.kind === "rehearsal" && g.members.length ? <ul className="quick-att roster-tbl">
        <li className="quick-att-head" aria-hidden="true"><span className="quick-att-when">{t("people.colPerson")}</span><span className="quick-att-roles">{t("member.roles")}</span><span className="quick-att-ctl">{t("group.respCol")}</span></li>
        {rosterByPerson(roster).map(r => <li key={r.email}>
          <span className="quick-att-when"><b>{personName(r.email)}{r.email === me && " " + t("group.you")}</b>
            {r.reason && <span className="roster-reason">“{r.reason}”</span>}{r.cover && <span className="roster-reason">{t("group.coveredBy", {name: personName(r.cover)})}</span>}</span>
          <span className="quick-att-roles">{r.roles.length > 0 ? <span className="roster-chips">{sortRoles(r.roles).map(x => <span key={x} className="chip role">{x}</span>)}</span> : <span className="sub">—</span>}</span>
          <span className="quick-att-ctl"><StatusChip status={r.status}/></span></li>)}
        {g.members.filter(m => isActive(m) && !roster.some(r => r.email === m.email)).map(m => <li key={m.email}>
          <span className="quick-att-when"><b>{personName(m.email)}{m.email === me && " " + t("group.you")}</b></span>
          <span className="quick-att-roles"><span className="sub">—</span></span>
          <span className="quick-att-ctl"><span className="sub">—</span></span></li>)}</ul>
        : roster.length ? <ul className="roster">{rosterByPerson(roster).map(r => <li key={r.email} className={"st-" + r.status}>
        <span className="roster-who">{personName(r.email)}{r.email === me && " " + t("group.you")}</span>
        <StatusChip status={r.status}/>
        {r.roles.length > 0 && <span className="roster-chips">{sortRoles(r.roles).map(x => <span key={x} className="chip role">{x}</span>)}</span>}
        {r.reason && <span className="roster-reason">“{r.reason}”</span>}{r.cover && <span className="roster-reason">{t("group.coveredBy", {name: personName(r.cover)})}</span>}</li>)}</ul>
        : <p className="sub">{t("group.noRoster")}</p>}</div>
      {e.notes && <div className="event-sec"><h3 className="people-sub-h">{t("group.notes")}</h3><p className="event-notes">{e.notes}</p></div>}
      {/* A resposta vem depois de ver o evento e quem está na escala: primeiro entender, depois responder. */}
      {(reply || (e.kind === "rehearsal" && canCheckIn(e))) && <div className="event-sec"><h3 className="people-sub-h">{t("group.myReply")}</h3><div className="event-actions">
        {reply}
        {canReply && myStatus === "no" && <label className="event-cover">
          <Select value={myCover} options={coverOpts} aria={t("group.coverAsk")} disabled={busy === "cover"} onChange={pickCover}/>{busy === "cover" && <Spin/>}</label>}
        {e.kind === "rehearsal" && canCheckIn(e) && !(myAtt && myAtt.by_admin) && <button className={"btn sm" + (myAtt ? " primary" : " soft")} aria-pressed={!!myAtt} aria-busy={busy === "in"}
          onClick={() => act("in", () => checkIn(e.id, !myAtt), myAtt ? "group.saved" : "group.checkedIn")}>{busy === "in" ? <Spin/> : <Icon name="user" sm/>} {t("group.checkIn")}</button>}
      </div>
      </div>}
      {e.kind === "rehearsal" && canEdit && Date.now() >= d.getTime() - 12 * 3600 * 1000 && <Attendance e={e}/>}
      <div className="event-foot">
        {set && <><button className="btn ghost sm" onClick={() => openGroupSetlist(set)}><Icon name="music" sm/> {t("group.openSetlist")}</button>
          <button className="btn ghost sm" onClick={() => openGroupSetlist(set, true)}><Icon name="stage" sm/> {t("medley.stage")}</button></>}
        {canEdit && <><button className="btn ghost sm" onClick={() => openDialog("event", {id: e.id, day: eventDay(e)})}><Icon name="edit" sm/> {t("common.edit")}</button>
          <button className="btn ghost sm danger" onClick={async () => {
            if(await confirmDialog({title: t("group.deleteEventTitle"), message: t("group.deleteEventMsg", {name: eventTitle(e), day: longDay(d)})})) act("del", () => deleteEvent(e.id), "group.eventDeleted");
          }}><Icon name="trash" sm/> {t("common.delete")}</button></>}
      </div>
    </div>
  </li>;
}

// Mensagem do WhatsApp para quem ainda não marcou presença: com o nome vai para a pessoa; com a
// lista de nomes, para o grupo da equipe. O prazo é o fim da chamada.
function waText(e: GEvent, who: {name: string} | {names: string[]}){
  const d = new Date(e.starts_at), until = new Date(d.getTime() + CHECKIN_MS);
  const v = {what: eventTitle(e), day: longDay(d), time: timeOf(e.starts_at), link: location.href.split("#")[0],
    until: fmt({weekday: "long", hour: "2-digit", minute: "2-digit"}).format(until)};
  return "name" in who ? t("group.waMsgOne", {...v, name: who.name})
    : t("group.waMsgAll", {...v, names: new Intl.ListFormat(locale(), {type: "conjunction"}).format(who.names)});
}

// Chamada do ensaio (só admins): presente ou falta para cada membro. Enquanto a chamada está aberta,
// quem não marcou aparece pendente, com o aviso no WhatsApp.
function Attendance({e}: {e: GEvent}){
  const g = useGroups(), [busy, setBusy] = useState("");
  const att = g.attendance.filter(a => a.event_id === e.id);
  const pending = new Set(pendingCheckIn(e, g.members.filter(isActive).map(m => m.email), g.attendance));
  const until = fmt({weekday: "long", hour: "2-digit", minute: "2-digit"}).format(new Date(new Date(e.starts_at).getTime() + CHECKIN_MS));
  const mark = async (email: string, v: Presence | "") => {
    setBusy(email);
    const ok = await markAttendance(e.id, email, v || null).finally(() => setBusy(""));
    if(!ok) toast(t("profile.saveFail"));
  };
  return <div className="attendance"><h3>{t("group.attendance")} <span className="sub">{t("group.attCount", {n: att.filter(a => a.status === "present").length, total: g.members.filter(isActive).length})}</span></h3>
    {pending.size > 0 && <div className="att-pending">
      <span className="sub">{t("group.pendingHint", {until})}</span>
      <a className="btn sm soft" href={waLink(waText(e, {names: [...pending].map(personName)}))} target="_blank" rel="noopener"><Icon name="chat" sm/> {t("group.waAll")}</a>
    </div>}
    <ul>{g.members.filter(m => isActive(m) || att.some(x => x.email === m.email)).map(m => { const a = att.find(x => x.email === m.email), wa = pending.has(m.email) && waNumber(m.phone || "");
      return <li key={m.email}><span className="roster-who">{busy === m.email && <Spin/>}{personName(m.email)}{a && !a.by_admin && <span className="chip">{t("group.selfCheckIn")}</span>}
        {pending.has(m.email) && <span className="chip st-pending">{t("group.att.pending")}</span>}
        {wa && <a className="icon-btn sm" href={waLink(waText(e, {name: personName(m.email)}), m.phone)} target="_blank" rel="noopener"
          aria-label={t("group.waOne", {name: personName(m.email)})} title={t("group.waOne", {name: personName(m.email)})}><Icon name="chat" sm/></a>}</span>
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
        <button className="btn ghost sm" onClick={() => openGroupSetlist(s)}><Icon name="music" sm/> {t("group.openSetlist")}</button>
        <button className="btn ghost sm" onClick={() => openGroupSetlist(s, true)}><Icon name="stage" sm/> {t("medley.stage")}</button>
      </div>
    </li>)}</ul> : <div className="card empty-state"><Icon name="music"/><strong>{t("group.noSetlists")}</strong><span>{t(canEdit ? "group.noSetlistsAdmin" : "group.noSetlistsSub")}</span></div>}
  </div>;
}

// ---------- membros ----------
function Members({canEdit}: {canEdit: boolean}){
  const g = useGroups(), me = useAuth(s => s.email), appAdmin = useAuth(s => s.admin);
  const [email, setEmail] = useState(""), [name, setName] = useState(""), [birthday, setBirthday] = useState(""), [phone, setPhone] = useState(""), [roles, setRoles] = useState<string[]>([]), [asAdmin, setAsAdmin] = useState(false), [busy, setBusy] = useState(""), lock = useLock(), check = useEmailCheck(email);
  // Um líder só por grupo: o cadastro só pergunta "Líder" quando o grupo ainda não tem.
  const leaderNow = g.members.find(m => m.is_admin);
  const load = monthLoad(dayKey(new Date()), g.events, g.roster);
  // Puxar do cadastro (só admins do app leem a lista): quem tem acesso e ainda não está no grupo.
  const [allowed, setAllowed] = useState<Allowed[]>([]);
  // Também diz quem é o Dono: os dados dele só ele muda (o editar fica só com as funções).
  useEffect(() => { if(appAdmin) listAllowed().then(r => r && setAllowed(r)); }, [appAdmin, g.members.length]);
  const outside = allowed.filter(a => !g.members.some(m => m.email === a.email));
  const pickUser = (v: string) => {
    const a = outside.find(x => x.email === v); if(!a) return;
    setEmail(a.email); setName(a.profileName || a.name); setBirthday(a.profileBirthday || a.birthday || ""); setPhone(a.profilePhone || a.phone);
  };
  const add = (ev: React.FormEvent) => { ev.preventDefault(); lock(async () => {
    const v = email.trim().toLowerCase();
    if(!validEmail(v)){ check.fail(); document.getElementById("member-email")?.focus(); return; }
    setBusy("add"); const ok = await addMember(g.gid, v, asAdmin && !leaderNow, joinRoles(roles), name, birthday, phone).finally(() => setBusy(""));
    if(!ok) return toast(t("profile.saveFail"));
    toast(t("group.memberAdded", {email: v})); setEmail(""); setName(""); setBirthday(""); setPhone(""); setRoles([]); setAsAdmin(false); check.reset();
  }); };
  const fold = useFold("group-members");
  // Busca e ordem, como na lista "Com acesso" do Perfil (recentes: pela data em que entrou no grupo).
  const filter = usePeopleFilter(g.members, "acordia-members-order", m => m.name, m => m.created_at || ""), shown = filter.shown || [];
  return <div className="profile-grid">
    <div className={"card people-card" + fold.cls}>
      <FoldHead folded={fold.folded} onToggle={fold.toggle} title={t("group.membersTab")}/>
      <h2>{t("group.membersTab")}</h2>
      <div className="card-body">
      {canEdit && <><p className="sub">{t("group.addSub")}</p>
        <form className="member-add people-add-box" onSubmit={add} noValidate>
          <h3 className="people-sub-h">{t("group.addTitle")}</h3>
          {outside.length > 0 && <Select id="member-pick" className="member-pick" aria={t("group.pickUser")} value={outside.some(a => a.email === email) ? email : ""} onChange={pickUser}
            options={[{value: "", label: t("group.pickUser")}, ...outside.map(a => ({value: a.email, label: (a.profileName || a.name) ? (a.profileName || a.name) + " · " + a.email : a.email}))]}/>}
          <div className="people-add">
            <PersonFields idp="member" name={name} onName={setName} email={email} onEmail={setEmail} phone={phone} onPhone={setPhone} birthday={birthday} onBirthday={setBirthday} check={check}/>
            {!leaderNow && <label className="switch lead boxed"><span>{t("group.leader")}</span><input type="checkbox" checked={asAdmin} onChange={e => setAsAdmin(e.target.checked)}/></label>}
          </div>
          <RolePicker value={roles} onChange={setRoles}/>
          {/* Adicionar por último, embaixo das funções. */}
          <div className="member-roles-foot">
            <button className="btn primary" disabled={!email.trim()} aria-busy={busy === "add"}>{busy === "add" ? <Spin/> : <Icon name="plus" sm/>} {t("common.add")}</button>
          </div>
        </form></>}
      <h3 className="people-sub-h">{t("group.listTitle")} <span className="count-chip">{filter.nq ? shown.length + "/" + g.members.length : g.members.length}</span></h3>
      {g.members.length > 0 && <PeopleTools idp="members" f={filter}/>}
      {/* Cabeçalho como o da lista "Com acesso" do Perfil. */}
      {shown.length > 0 && <div className="people-list-head" aria-hidden="true"><span>{t("people.colPerson")}</span><span>{t("people.colActions")}</span></div>}
      <ul className="people-list members" ref={filter.listRef}>{filter.nq && !shown.length && <li className="sub">{t("lib.noResults")}</li>}{shown.map(m => {
        const rate = attendanceRate(m.email, g.events, g.attendance), sd = rehearsalStanding(m.email, g.events, g.attendance, Date.now(), outMark(m)), n = load.get(m.email) || 0;
        // Regra dos ensaios no lugar do "% nos ensaios" (a porcentagem fica na dica).
        const hint = t("group.ruleHint", {max: MISS_LIMIT, back: COMEBACK, p: rate.total ? Math.round(100 * rate.present / rate.total) : 0, present: rate.present, total: rate.total});
        // Tocar em qualquer parte da linha (fora dos botões, links e do painel de editar) abre os detalhes; o
        // nome é o botão, para o teclado e o leitor de tela. O celular continua sendo link de ligar.
        return <li key={m.email} className={"member-open" + (isActive(m) ? "" : " inactive")} onClick={e => { if(!(e.target as HTMLElement).closest(SKIP_OPEN)) openDialog("member", {email: m.email}); }}>
          {/* Como na lista "Com acesso": sempre nome, e-mail (com o aniversário) e celular, com o que falta apagado. */}
          <span className="people-who">
            <PersonAvatar email={m.email}/><span className="people-id">
            <span className="people-name"><button type="button" className="member-open-btn" aria-label={t("member.open", {name: m.name || m.email})}
              onClick={() => openDialog("member", {email: m.email})}>{m.name ? <b>{m.name}</b> : <span className="people-missing">{t("people.noName")}</span>}</button>{m.is_admin && <span className="chip leader">{t("group.leader")}</span>}{m.email === me && <span className="chip current">{t("people.you")}</span>}{!isActive(m) && <span className="chip">{t("group.inactive")}</span>}</span>
            <span className="sub people-email">{m.email}{m.birthday && " · " + fmtBirthday(m.birthday)}</span>
            {m.phone ? <PhoneLink phone={m.phone}/> : <span className="phone-link people-missing"><Icon name="phone" sm/><span>{t("people.noPhone")}</span></span>}</span></span>
          {/* Escalas no mês primeiro; a situação nos ensaios (em dia, faltas seguidas, fora) por último. */}
          {/* Escalas no mês, situação nos ensaios e funções: tudo na mesma fileira de chips. */}
          {/* As funções só aparecem aqui; mudar (como todo o resto) é na janela de detalhes. */}
          <MemberRoles m={m} editable={false} lead={<>
            {sd.out ? <span className="chip st-no" title={hint}>{tn("group.standOut", sd.need)}</span>
              : sd.streak > 0 ? <StreakChip streak={sd.streak} title={hint}/>
              : sd.called > 0 && <span className="chip st-yes" title={hint}>{t("group.standOk")}</span>}
            {n > 0 && <span className="chip accent" title={t("group.loadHint")}>{tn("group.load", n)}</span>}
          </>} showEmpty={canEdit || m.email === me} busy={false} onSave={() => {}}/>
          {/* Chevron: indica que a linha inteira abre os detalhes. */}
          <span className="member-open-hint" aria-hidden="true">›</span>
        </li>; })}</ul>
      </div>
    </div>
  </div>;
}

// Editar um membro, aberto pelo botão Editar da janela de detalhes. O admin do app muda tudo (nome, celular, data e funções,
// mesmo o que a pessoa preencheu no perfil); quem lidera sem ser admin do app, e a própria pessoa, mudam as funções.
// inline: dentro de outra janela com formulário (a de detalhes): sem <form> aninhado, para o Enter e o Salvar
// nunca fecharem a janela; o Enter dos campos salva.
function MemberEdit({m, full, onDone, inline}: {m: Member; full: boolean; onDone: () => void; inline?: boolean}){
  const gid = useGroups(s => s.gid), id = "medit-" + m.email;
  const [name, setName] = useState(m.name), [phone, setPhone] = useState(maskPhone(m.phone || "")), [birthday, setBirthday] = useState(m.birthday || "");
  const [roles, setRoles] = useState(() => sortRoles(splitRoles(m.role))), [busy, setBusy] = useState(false), lock = useLock();
  const save = (e?: React.SyntheticEvent) => { e?.preventDefault(); lock(async () => {
    setBusy(true);
    // Banco sem admin_set_person ainda: grava só na lista de acesso (o que a pessoa preencheu continua valendo).
    let ok = !full || await setPersonInfo(m.email, name, phone, birthday).then(done => done || setAllowedInfo(m.email, name, birthday, phone));
    const v = joinRoles(roles);
    if(ok && v !== m.role) ok = await setMemberRole(gid, m.email, v);
    setBusy(false);
    toast(t(ok ? "people.infoSaved" : "profile.saveFail", {email: m.email}));
    if(ok){
      // Mostra já o que foi salvo e recarrega com o gid (sem ele, uma leitura em andamento seria reaproveitada e traria o nome antigo).
      if(full) useGroups.setState(st => ({members: st.members.map(x => x.email === m.email ? {...x, name: name.trim(), phone, birthday: birthday || null} : x)}));
      onDone(); if(full) loadGroups(gid);
    }
  }); };
  const Root = inline ? "div" : "form";
  return <Root className="people-edit member-edit" {...(inline
    ? {onKeyDown: (e: React.KeyboardEvent) => { if(e.key === "Enter" && !e.defaultPrevented && (e.target as HTMLElement).tagName === "INPUT"){ e.preventDefault(); save(); } }}
    : {onSubmit: save})}>
    {full && <div className="people-add">
      <div className="field"><label htmlFor={id + "-name"}>{t("profile.name")}</label>
        <input className="input" id={id + "-name"} maxLength={80} autoComplete="off" placeholder={t("people.namePh")} value={name} onChange={e => setName(capFirst(e.target.value))} autoFocus/></div>
      <div className="field phone"><label htmlFor={id + "-phone"}>{t("profile.phone")}</label>
        <input className="input" id={id + "-phone"} type="tel" inputMode="tel" autoComplete="off" maxLength={30} placeholder={t("profile.phonePh")} value={phone} onChange={e => setPhone(maskPhone(e.target.value))}/></div>
      <div className="field birthday"><label htmlFor={id + "-birthday"}>{t("profile.birthday")}</label>
        <DateInput className="people-birthday" id={id + "-birthday"} max={today()} clearable value={birthday} onChange={setBirthday}/></div>
    </div>}
    <RolePicker value={roles} onChange={setRoles}/>
    <div className="member-roles-foot">
      <button type="button" className="btn ghost sm" onClick={onDone}>{t("common.cancel")}</button>
      <button type={inline ? "button" : "submit"} className="btn primary sm" aria-busy={busy} onClick={inline ? () => save() : undefined}>{busy ? <Spin/> : <Icon name="check" sm/>} {t("common.save")}</button>
    </div>
  </Root>;
}

// Tudo o que se faz com uma pessoa do grupo, na janela de detalhes (a linha da lista só abre a janela):
// chamada, fora dos cultos, líder, ativar/desativar e remover (editar os dados é o lápis da própria janela).
// Presença e fora dos cultos abrem o painel logo abaixo dos botões; as demais rodam na hora e mostram o resultado num aviso.
// Lixeira sozinha no canto do cabeçalho da janela do membro: a única ação destrutiva fica longe das outras.
export function MemberRemove({m, onGone}: {m: Member; onGone: () => void}){
  const g = useGroups(), me = useAuth(s => s.email), [busy, setBusy] = useState(false), lock = useLock();
  if(!amGroupAdmin() || m.email === me) return null;
  const remove = async () => {
    const group = g.groups.find(x => x.id === g.gid);
    if(!await confirmDialog({title: t("group.removeMember"), message: t("group.removeMemberMsg", {email: m.email, group: group?.name || ""}), confirm: t("people.remove")})) return;
    lock(async () => {
      setBusy(true);
      const ok = await removeMember(g.gid, m.email).finally(() => setBusy(false));
      toast(t(ok ? "group.memberRemoved" : "profile.saveFail", {email: m.email}));
      if(ok) onGone();
    });
  };
  return <button type="button" className="icon-btn line danger member-remove" aria-label={t("group.removeMember")} aria-busy={busy} disabled={busy} onClick={remove}>
    {busy ? <Spin/> : <Icon name="trash"/>}</button>;
}

export function MemberManage({m}: {m: Member}){
  const g = useGroups(), me = useAuth(s => s.email), appAdmin = useAuth(s => s.admin);
  const [panel, setPanel] = useState<"" | "att" | "out">(""), [busy, setBusy] = useState(""), lock = useLock(), box = useRef<HTMLDivElement>(null);
  // Abriu um painel: rola a janela até ele (embaixo dos botões, pode estar fora da tela no celular).
  useEffect(() => { if(panel) box.current?.scrollIntoView({block: "nearest", behavior: reduced() ? "auto" : "smooth"}); }, [panel]);
  const canEdit = amGroupAdmin(), self = m.email === me, act = isActive(m), leaderNow = g.members.find(x => x.is_admin);
  const group = g.groups.find(x => x.id === g.gid);
  const sd = rehearsalStanding(m.email, g.events, g.attendance, Date.now(), outMark(m));
  const standing = sd.out ? <span className="chip st-no">{tn("group.standOut", sd.need)}</span>
    : sd.streak > 0 ? <StreakChip streak={sd.streak}/>
    : <span className="chip st-yes">{t("group.standOk")}</span>;
  const run = (key: string, fn: () => Promise<boolean>, ok = "group.saved", after?: () => void) => lock(async () => { setBusy(key); const r = await fn().finally(() => setBusy("")); toast(t(r ? ok : "profile.saveFail", {email: m.email})); if(r) after?.(); });
  const open = (p: "att" | "out") => setPanel(panel === p ? "" : p);
  // Um líder só: sem líder, qualquer pessoa pode virar; desligar pergunta antes quem fica no lugar (sem ninguém, só o admin do app).
  const toggleLeader = async () => {
    if(!m.is_admin) return void run("adm", () => setGroupLeader(g.gid, m.email));
    const next = await pickLeaderDialog({group: group?.name || "", current: personName(m.email), allowNone: appAdmin, mine: self && !appAdmin,
      options: g.members.filter(x => x.email !== m.email).map(x => ({value: x.email, label: x.name || x.email, sub: x.name ? x.email : undefined}))});
    if(next === null) return;
    run("adm", () => next ? setGroupLeader(g.gid, next) : setMemberAdmin(g.gid, m.email, false));
  };
  const showLead = canEdit && (m.is_admin || !leaderNow), showAct = canEdit && !self && !m.is_admin;
  if(!canEdit) return null;
  return <div className="member-manage">
    <h3 className="people-sub-h">{t("member.manage")}</h3>
    <div className="member-manage-btns">
      {canEdit && <button type="button" className="btn ghost" aria-pressed={panel === "att"} onClick={() => open("att")}><Icon name="calendar" sm/> {t("group.attMenu")}</button>}
      {canEdit && !self && <button type="button" className="btn ghost" aria-pressed={panel === "out"} onClick={() => open("out")}><Icon name="lock" sm/> {t(sd.out ? "group.outMenuOn" : "group.outMenu")}</button>}
      {showLead && <button type="button" className="btn ghost" aria-busy={busy === "adm"} disabled={busy === "adm"} onClick={toggleLeader}>{busy === "adm" ? <Spin/> : <Icon name="star" sm/>} {t(m.is_admin ? "group.leaderUndo" : "group.leaderMake")}</button>}
      {showAct && <button type="button" className="btn ghost" aria-busy={busy === "act"} disabled={busy === "act"}
        onClick={() => run("act", () => setMemberActive(g.gid, m.email, !act), act ? "group.deactivated" : "group.activated")}>{busy === "act" ? <Spin/> : <Icon name={act ? "eye-off" : "eye"} sm/>} {t(act ? "group.deactivateShort" : "group.activateShort")}</button>}
    </div>
    {panel && <div ref={box}>
      {panel === "att" && <QuickAttendance email={m.email} onDone={() => setPanel("")}/>}
      {panel === "out" && <OutEdit m={m} status={standing} marked={!!sd.marked} need={sd.marked ? sd.need : COMEBACK} busy={busy === "out"}
        onSave={k => { setPanel(""); run("out", () => setMemberOut(g.gid, m.email, k), k ? "group.outSaved" : "group.outCleared"); }} onCancel={() => setPanel("")}/>}
    </div>}
  </div>;
}

// Editar os dados da pessoa dentro da janela de detalhes (o lápis do nome). Quem decide o que dá para mudar é
// MemberEdit: o admin do app muda tudo (menos o Dono, só ele mesmo); líder e a própria pessoa, as funções.
export function MemberEditInline({m, onDone}: {m: Member; onDone: () => void}){
  const me = useAuth(s => s.email), appAdmin = useAuth(s => s.admin), owner = useAuth(s => s.owner);
  const [allowed, setAllowed] = useState<Allowed[]>([]);
  useEffect(() => { if(appAdmin) listAllowed().then(r => r && setAllowed(r)); }, [appAdmin]);
  return <MemberEdit m={m} full={appAdmin && (owner || m.email === me || !allowed.find(a => a.email === m.email)?.is_owner)} onDone={onDone} inline/>;
}

// Atalho da chamada para uma pessoa só: os últimos ensaios que já começaram, cada um com presente/falta.
// Serve para corrigir sem abrir cada ensaio na agenda.
function QuickAttendance({email, onDone}: {email: string; onDone: () => void}){
  const g = useGroups(), [busy, setBusy] = useState("");
  const list = g.events.filter(e => e.kind === "rehearsal" && Date.now() >= new Date(e.starts_at).getTime() - 12 * 3600 * 1000)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at)).slice(0, 5);
  const mark = async (e: GEvent, v: Presence | "") => {
    setBusy(e.id);
    const ok = await markAttendance(e.id, email, v || null).finally(() => setBusy(""));
    toast(t(ok ? "group.saved" : "profile.saveFail", {email}));
  };
  return <div className="people-edit quick-att-box">
    <div className="quick-att-top">
      <p className="people-sub-h quick-att-hint">{t("group.attQuickHelp", {name: personName(email)})}</p>
      <button type="button" className="icon-btn sm" aria-label={t("common.close")} onClick={onDone}><Icon name="x" sm/></button>
    </div>
    {list.length ? <ul className="quick-att"><li className="quick-att-head" aria-hidden="true"><span className="quick-att-when">{t("group.kind.rehearsal")}</span><span className="quick-att-ctl">{t("group.attQuickCol")}</span></li>{list.map(e => { const a = g.attendance.find(x => x.event_id === e.id && x.email === email);
      return <li key={e.id}><span className="quick-att-when"><b><span className="qa-long">{fmt({weekday: "short", day: "numeric", month: "short"}).format(new Date(e.starts_at))}</span><span className="qa-short">{fmt({weekday: "short", day: "2-digit", month: "2-digit"}).format(new Date(e.starts_at))}</span></b>
          <span className="sub">{timeOf(e.starts_at)}</span></span>
        <span className="quick-att-ctl">{busy === e.id && <Spin/>}<Seg className="sm" aria={t("group.attendance") + ": " + personName(email)} value={(a?.status || "") as Presence | ""} onChange={v => mark(e, v === a?.status ? "" : v)} disabled={busy === e.id}
          options={[{v: "present", label: t("group.att.present")}, {v: "absent", label: t("group.att.absent")}]}/></span></li>; })}</ul>
      : <p className="sub">{t("group.attQuickNone")}</p>}
  </div>;
}

// Marcar à mão como fora dos cultos (quem já faltou antes do app): a partir de agora, precisa de N
// ensaios para voltar; cada presença na chamada desconta um. Marcado, dá para mudar o número ou tirar.
function OutEdit({m, status, marked, need, busy, onSave, onCancel}: {m: Member; status: React.ReactNode; marked: boolean; need: number; busy: boolean; onSave: (need: number) => void; onCancel: () => void}){
  const [k, setK] = useState(need);
  // Primeiro a situação de hoje (em dia, faltas seguidas ou fora), depois o ajuste: o stepper em cima, os botões embaixo.
  return <form className="people-edit out-edit" onSubmit={e => { e.preventDefault(); onSave(k); }}>
    <p className="out-status">{status}</p>
    <p className="sub people-edit-hint">{t("group.outHelp", {name: personName(m.email)})}</p>
    <div className="out-edit-row">
      <span>{t("group.outNeed")}</span>
      <span className="tr-ctl out-step">
        <button type="button" className="icon-btn line" aria-label="−1" disabled={k <= 1} onClick={() => setK(k - 1)}>−</button><b aria-live="polite">{k}</b>
        <button type="button" className="icon-btn line" aria-label="+1" disabled={k >= 20} onClick={() => setK(k + 1)}>+</button></span>
    </div>
    <div className="out-edit-foot">
      <button type="button" className="btn ghost sm" onClick={onCancel}>{t("common.cancel")}</button>
      {marked && <button type="button" className="btn ghost sm" onClick={() => onSave(0)}>{t("group.outClear")}</button>}
      <button className="btn primary sm" aria-busy={busy}>{busy ? <Spin/> : <Icon name="check" sm/>} {t(marked ? "common.save" : "group.outConfirm")}</button>
    </div>
  </form>;
}

// Funções para escolher: as mais comuns e as que o grupo já usa.
const ROLES = ["sound", "voice", "bass", "drums", "acoustic", "electric", "keys"];
export function roleOptions(){
  const g = useGroups.getState();
  return sortRoles(splitRoles([...ROLES.map(r => t("group.roles." + r)), ...g.members.map(m => m.role), ...g.roster.map(r => r.role)].join(",")));
}
// Botões para ligar e desligar cada função, e um campo para incluir outra.
export function RolePicker({value, onChange, label}: {value: string[]; onChange: (v: string[]) => void; label?: string}){
  const [other, setOther] = useState("");
  const has = (r: string) => value.some(x => x.toLocaleLowerCase() === r.toLocaleLowerCase());
  const opts = sortRoles(splitRoles([...roleOptions(), ...value].join(",")));
  const add = () => { const r = other.trim().replace(/,/g, " "); if(r && !has(r)) onChange([...value, r]); setOther(""); };
  return <div className="role-picker">
    <span className="lbl">{label || t("group.roles")}</span>
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
export function MemberRoles({m, editable, busy, onSave, before, after, lead, showEmpty = editable}: {m: Member; lead?: React.ReactNode; editable: boolean; busy: boolean; onSave: (v: string) => void; before?: React.ReactNode; after?: React.ReactNode; showEmpty?: boolean}){
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
    {lead}
    {roles.length ? roles.map(r => <span key={r} className="chip role">{r}</span>) : showEmpty && <span className="sub">{t("group.noRoles")}</span>}
    {editable && <button type="button" className="icon-btn sm" aria-label={t("group.editRoles") + ": " + personName(m.email)} title={t("group.editRoles")} onClick={() => setEditing(roles)}><Icon name="edit" sm/></button>}
    {busy && <Spin/>}
    {(before || after) && <span className="member-role-actions">{before}{after}</span>}
  </span>;
}

// Marca do grupo: a foto ou as iniciais do nome (tamanho pelo CSS de onde aparece).
export function GroupMark({group}: {group: {name: string; photo?: string; photo_round?: boolean}}){
  const [broken, setBroken] = useState("");
  const photo = group.photo && group.photo !== broken ? group.photo : "";
  return <span className={"group-mark" + (group.photo_round ? " round" : "")} aria-hidden="true">
    {photo ? <img src={photo} alt="" onError={() => setBroken(photo)}/> : initials({name: group.name, email: ""})}</span>;
}

// A marca com a câmera: toca para adicionar ou trocar a foto (só admins do app; o banco recusa os líderes).
export function GroupPhotoButton({group, id}: {group: Group; id?: string}){
  const label = t(group.photo ? "photo.change" : "photo.add");
  return <button type="button" className={"avatar-edit group-edit" + (group.photo_round ? " round" : "")} id={id} aria-label={label} title={label} onClick={() => pickPhoto(group.id)}>
    <GroupMark group={group}/><span className="cam"><Icon name="camera" sm/></span></button>;
}

// Foto do grupo: só os admins do app trocam (o banco recusa os líderes).
export function GroupPhoto(){
  const g = useGroups(), group = g.groups.find(x => x.id === g.gid)!, [busy, setBusy] = useState(false), lock = useLock();
  const label = t(group.photo ? "photo.change" : "photo.add");
  const remove = async () => {
    if(!await confirmDialog({title: t("photo.removeTitle"), message: t("photo.groupRemoveMsg"), confirm: t("photo.remove")})) return;
    lock(async () => { setBusy(true); const ok = await removeGroupPhoto(g.gid).finally(() => setBusy(false)); toast(t(ok ? "photo.removed" : "profile.saveFail")); });
  };
  const shape = (v: string) => lock(async () => { if(!await setGroupRound(g.gid, v === "round")) toast(t("profile.saveFail")); });
  return <div className="field"><span>{t("photo.groupTitle")}</span>
    <div className="group-photo-row">
      <GroupPhotoButton group={group} id="group-photo"/>
      <span className="profile-photo-actions">
        <Seg id="group-shape" className="photo-shape" aria={t("photo.shape")} value={group.photo_round ? "round" : "square"} onChange={shape}
          options={[{v: "square", label: t("photo.shape.square")}, {v: "round", label: t("photo.shape.round")}]}/>
        <button type="button" className="link-btn" onClick={() => pickPhoto(g.gid)}>{label}</button>
        {group.photo && <button type="button" className="link-btn" aria-busy={busy} onClick={remove}>{busy && <Spin/>}{t("photo.remove")}</button>}
      </span>
    </div></div>;
}

