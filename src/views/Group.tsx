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
import { current, openMedley, isMedley } from "../repertoire";
import { isAutoSetlist } from "../lib/syncrules";
import { newMedley } from "./Repertoire";
import type { Item } from "../lib/types";
import { copyName, LibraryList } from "./Library";
import { saveBlob } from "../lib/pdf";
import { reduced } from "../lib/util";
import { VoiceChip } from "../ui/VoiceChip";
import { rangeType } from "../lib/voice";
import { splitRoles, joinRoles, toggleRole, sortRoles } from "../lib/roles";
import { monthGrid, dayKey, eventDay, splitEvents, canCheckIn, pendingCheckIn, waLink, waNumber, CHECKIN_MS, attendanceRate, rehearsalStanding, MISS_LIMIT, COMEBACK, monthLoad, toICS, rosterByPerson, needsCover, maskPhone,type GEvent, type Presence } from "../lib/calendar";
import { useGroups, loadGroups, createGroup, removeGroupPhoto, setGroupRound, addMember, setMemberAdmin, setGroupLeader, setMemberRole, removeMember,
  deleteEvent, respond, setCover, checkIn, setMyAttendance, markAttendance, requestAttendanceChange, declineAttendanceChange, setUnavailable, personName, voiceOf, personPhoto, amGroupAdmin, setMemberOut, outMark, isActive, setMemberActive, type GroupSetlist, type Member, type Group } from "../lib/groups";
import { useUI, useData, toast, openDialog, confirmDialog, pickLeaderDialog, confirmUnsaved, useUnsaved, go } from "../state";
import { Icon } from "../ui/Icon";
import { CopyBtn } from "../ui/CopyBtn";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { useFold, FoldHead } from "../ui/Fold";
import { SKIP_OPEN, StreakChip, useLock, Spin, Avatar, PersonFields, useEmailCheck, pickPhoto, PhoneLink, today, usePeopleFilter, PeopleTools } from "./Account";
import { DateInput } from "../ui/DateInput";
import { useMedia } from "../ui/hooks";
import { SecHead } from "../ui/SecHead";
import { PhoneInput } from "../ui/PhoneInput";
import { NameInput } from "../ui/NameInput";
import { YouChip } from "../ui/YouChip";
import { BackLink } from "../ui/BackLink";

// Confirmar / Não posso de uma escala (Início e Perfil). Tocar na resposta ativa desfaz (volta a "sem resposta").
// A escolhida já fica marcada, com o spinner, enquanto grava; se falhar, volta ao valor real e avisa.
export function ReplySeg({e, onEditing}: {e: GEvent; onEditing?: (v: boolean) => void}){
  const g = useGroups(), me = useAuth(s => s.email);
  const st = g.roster.find(r => r.event_id === e.id && r.email === me)?.status, cur = st === "yes" || st === "no" ? st : "";
  const [sent, setSent] = useState<{v: "yes" | "no"; to: "yes" | "no" | ""} | null>(null);
  const pick = async (v: "yes" | "no") => {
    if(sent) return;
    // Tocar na resposta já marcada só fecha a edição; antes ela voltava a "sem resposta" e os botões ficavam iguais.
    if(cur === v){ setEditing(false); return; }
    const to: "yes" | "no" | "" = v;
    setSent({v, to});
    const ok = await respond(e.id, to || "pending").finally(() => setSent(null));
    setEditing(false);
    toast(t(ok ? (to === "yes" ? "group.confirmed" : to === "no" ? "group.declined" : "group.saved") : "profile.saveFail"));
  };
  // Só a escolha em andamento fica marcada: ao mudar a resposta os dois botões aparecem iguais, um por estado.
  const shown = sent?.to;
  // Já respondeu: os botões somem e ficam o selo com a resposta e o link para mudar (os botões voltam ao tocar nele).
  const [editing, setEditing] = useState(false);
  useEffect(() => { onEditing?.(editing); }, [editing]);
  if(cur && !sent && !editing) return <div className={"reply-done " + cur} role="status">
    <span className="reply-badge"><Icon name={cur === "yes" ? "check" : "x"} sm/> {t(cur === "yes" ? "group.replyYes" : "group.replyNo")}</span>
    <button type="button" className="link-btn" onClick={() => setEditing(true)}>{t("group.changeReply")}</button></div>;
  const btn =(v: "yes" | "no", icon: string, label: string) =>
    <button type="button" className={"btn sm " + (v === "yes" ? "reply-yes" : "reply-no") + (shown === v ? " on" : "")} aria-pressed={shown === v} aria-busy={sent?.v === v} disabled={!!sent} onClick={() => pick(v)}>
      {sent?.v === v ? <Spin/> : <Icon name={icon} sm/>} {label}</button>;
  // Com os botões abertos a pedido (já tinha resposta), "Alterar resposta" vira "Cancelar" para voltar sem recarregar.
  return <div className="reply-edit"><div className="reply-btns" role="group" aria-label={t("group.myReply")}>{btn("yes", "check", t("group.confirm"))}{btn("no", "x", t("group.decline"))}</div>
    {cur && editing && !sent && <button type="button" className="link-btn" onClick={() => setEditing(false)}>{t("common.cancel")}</button>}</div>;
}

const { data } = store;
export type Tab = "agenda" | "setlists" | "songs" | "medleys" | "members";
// A Biblioteca é a mesma página em três modos (repertórios, músicas e medleys).
export const LIB_TABS: Tab[] = ["setlists", "songs", "medleys"];

// ---------- datas ----------
export const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale(), o);
// "hoje", "amanhã", "em 3 dias" (no idioma do app).
export function relDay(iso: string){
  const [y, m, d] = dayKey(new Date(iso)).split("-").map(Number), [ty, tm, td] = dayKey(new Date()).split("-").map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 864e5);
  return new Intl.RelativeTimeFormat(locale(), {numeric: "auto"}).format(days, "day");
}
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
  // Quem abre pelo grupo quer estudar: cai na folha (leitura), não na edição.
  store.setSetting("pane", "sheet");
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

// Ao abrir a página, ao voltar para o app e a cada 30s com a tela à vista, busca o que mudou no grupo
// (resposta de escala, presença, evento novo), já que não há atualização em tempo real.
const REFRESH_MS = 30000;
export function useGroupRefresh(){
  const status = useAuth(s => s.status);
  useEffect(() => {
    if(status !== "in") return;
    loadGroups();
    const wake = () => { if(!document.hidden) loadGroups(); };
    const tick = setInterval(wake, REFRESH_MS);
    document.addEventListener("visibilitychange", wake);
    return () => { clearInterval(tick); document.removeEventListener("visibilitychange", wake); };
  }, [status]);
}
// Abre a página do grupo numa aba; sem aba, na Agenda (o que o membro mais consulta).
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
  const group = g.groups.find(x => x.id === g.gid);
  const canEdit = !!group && amGroupAdmin();
  // Números das abas da Biblioteca (quem só lê não conta o repertório vazio que o app cria sozinho no aparelho).
  const meds = [...data.medleys.values()].filter(m => canEdit || !isAutoSetlist(m));
  const libCount = {songs: [...data.songs.values()].filter(s => s.title).length, setlists: meds.filter(m => !isMedley(m)).length, medleys: meds.filter(isMedley).length};
  const tab: Tab = (["agenda", "setlists", "songs", "medleys", "members"] as const).find(v => v === data.settings.groupTab) || "agenda";
  // Quem lidera tem o lápis ao lado do nome: abre a janela com a foto, o nome e (admin do app) outro grupo e excluir.
  const head = (sub: string, actions?: React.ReactNode) => <div className="view-head"><div>
    <BackLink id="group-back" label={t("common.back")} onClick={() => tab === "members" ? go("more") : go("home")}/>
    <div className="group-title">{group && (admin ? <GroupPhotoButton group={group}/> : <GroupMark group={group}/>)}
      <div>{group && <span className="group-kicker">{t(tab === "members" ? "group.membersTab" : tab === "agenda" ? "group.agenda" : "lib.title")}</span>}<h1 id="group-h">{group ? group.name : t("group.title")}{canEdit && <button type="button" className="icon-btn sm line group-edit-btn" id="group-edit"
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
      {canEdit && tab === "setlists" && <button className="btn primary" id="group-new-setlist" onClick={() => newMedley()}><Icon name="plus" sm/><span>{t("group.newSetlist")}</span></button>}
      {canEdit && tab === "songs" && <button className="btn primary" id="group-new-song" onClick={() => openDialog("song", {song: null})}><Icon name="plus" sm/><span>{t("lib.new")}</span></button>}
      {canEdit && tab === "agenda" && <button className="btn primary" id="group-new-event" onClick={() => openDialog("event", {id: null, day: dayKey(new Date())})}><Icon name="plus" sm/><span>{t("group.newEvent")}</span></button>}
    </>)}
    {/* Agenda e Biblioteca estão na barra de baixo (Membros, em Mais): só a Biblioteca tem abas, as suas três listas. */}
    {LIB_TABS.includes(tab) && <Seg id="group-tabs" className="block" aria={t("lib.tabsAria")} value={tab} onChange={v => store.setSetting("groupTab", v)}
      options={[{v: "setlists", label: t("lib.setlists", {n: libCount.setlists})}, {v: "songs", label: t("lib.songs", {n: libCount.songs})}, {v: "medleys", label: t("lib.mblocks", {n: libCount.medleys})}]}/>}
    {tab === "agenda" && <Agenda canEdit={canEdit}/>}
    {tab !== "agenda" && tab !== "members" && <LibraryList key={tab} tab={tab} canEdit={canEdit}/>}
    {tab === "members" && <Members canEdit={canEdit}/>}
  </section>;
}

function NewGroup(){
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [tried, setTried] = useState(false), lock = useLock();
  // Botão sempre ativo: vazio avisa embaixo do campo e leva o foco para ele.
  const bad = tried && !name.trim();
  return <form className="people-add group-new" onSubmit={e => { e.preventDefault(); if(!name.trim()){ setTried(true); document.getElementById("group-name-new")?.focus(); return; } lock(async () => {
    setBusy(true); const ok = await createGroup(name).finally(() => setBusy(false));
    toast(t(ok ? "group.created" : "profile.saveFail", {name: name.trim()})); if(ok){ setName(""); setTried(false); }
  }); }} noValidate>
    <input className="input" id="group-name-new" maxLength={80} placeholder={t("group.namePh")} aria-label={t("group.name")} value={name} aria-invalid={bad} aria-describedby={bad ? "group-name-new-err" : undefined} onChange={e => setName(e.target.value)}/>
    {bad && <span className="field-error" id="group-name-new-err">{t("group.needName")}</span>}
    <button className="btn primary" aria-busy={busy}>{busy ? <Spin/> : <Icon name="plus" sm/>} {t("group.create")}</button>
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
    {mine.length > 0 && <div className="card my-next"><SecHead>{t("group.myNext")}</SecHead>
      <ul className="my-next-list">{mine.slice(0, 4).map(e => <MyNextRow key={e.id} e={e}/>)}</ul>
      <p className="sub my-next-hint">{t("group.addToCalHint")}</p>
    </div>}
    <div className="agenda-grid">
      <div className="card cal" aria-labelledby="cal-h">
        <SecHead id="cal-h">{t("group.calendar")}</SecHead>
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
      <div className="card agenda-list">
        <SecHead className="people-sub-h agenda-list-h">{t("group.events")}</SecHead>
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
  // No celular o botão desce para a linha de baixo, na largura toda; na tela larga fica sob as funções.
  const narrow = useMedia("(max-width: 599px)");
  const ics = <button className="btn soft sm my-next-ics" onClick={() => downloadICS([e], eventTitle(e))}><Icon name="calendar" sm/> {t("group.addAllToCal")}</button>;
  // O selo da data cresce até a altura do bloco de texto ao lado e fica quadrado.
  return <li><span className="date-badge" ref={sq.badge}><small>{fmt({weekday: "short"}).format(d)}</small><b>{d.getDate()}</b><small>{fmt({month: "short"}).format(d)}</small></span>
    <div className="my-next-what" ref={sq.what}><b>{eventTitle(e)}</b><span className="sub">{timeOf(e.starts_at)}{roles.length === 0 && " · " + t("group.onRoster")}</span>
      <span className="my-next-chips">{roles.map(x => <span key={x} className="chip role">{x}</span>)}</span>
      {!narrow && ics}</div>
    {narrow && ics}</li>;
}

export function StatusChip({status, noIcon}: {status: string; noIcon?: boolean}){
  // Sem resposta não é problema: fica neutro ("st-wait"), para o laranja não competir com o vermelho de Indisponível.
  return <span className={"chip st-" + (status === "pending" ? "wait" : status)}>{!noIcon && <><Icon name={status === "yes" ? "check" : status === "no" ? "x" : "dot"} sm/> </>}{t("group.status." + status)}</span>;
}

// Barra do dia escolhido no calendário: data, "não posso neste dia" e novo evento nesse dia.
function DayBar({day, off, canEdit, onClear}: {day: string; off: boolean; canEdit: boolean; onClear: () => void}){
  const [busy, setBusy] = useState(false), lock = useLock();
  const [y, m, d] = day.split("-").map(Number), date = new Date(y, m - 1, d), future = day >= dayKey(new Date());
  const toggle = () => lock(async () => { setBusy(true); const ok = await setUnavailable(day, !off).finally(() => setBusy(false)); toast(t(ok ? (off ? "group.availableSaved" : "group.unavailableSaved") : "profile.saveFail")); });
  return <div className="day-bar card">
    <b>{longDay(date)}</b>
    <div className="day-actions">
      {future && <label className="switch lead boxed" title={t("group.unavailableHint")}><span>{busy && <Spin/>}{t("group.cantThisDay")}</span><input type="checkbox" id="group-off" checked={busy ? !off : off} disabled={busy} aria-busy={busy} onChange={toggle}/></label>}
      {canEdit && <button className="btn ghost sm" onClick={() => openDialog("event", {id: null, day})}><Icon name="plus" sm/> {t("group.newEvent")}</button>}
      <button className="icon-btn sm" aria-label={t("group.allDays")} title={t("group.allDays")} onClick={onClear}><Icon name="x" sm/></button>
    </div>
  </div>;
}

// Quadro da data do evento: quadrado com o lado igual à altura do cabeçalho (título, hora e chips).
// Só com CSS a largura é calculada antes da altura esticar, e o quadro ficava retangular.
export function useSquareBadge<W extends HTMLElement = HTMLDivElement>(){
  const what = useRef<W>(null), badge = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const w = what.current, b = badge.current; if(!w || !b) return;
    // O lado é a altura do texto ao lado, mas nunca menor que o próprio selo com o respiro em cima e embaixo (o padding
    // do CSS) nem que 64px; mede de novo quando o texto muda de tamanho, a tela gira ou a fonte termina de carregar.
    const fit = () => {
      b.style.height = "auto";
      const h = Math.max(64, Math.ceil(b.getBoundingClientRect().height), Math.ceil(w.getBoundingClientRect().height)) + "px";
      b.style.width = h; b.style.height = h;
    };
    fit();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null; ro?.observe(w);
    window.addEventListener("resize", fit); document.fonts?.ready.then(fit);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, []);
  return {what, badge};
}
// Presença que o líder marcou: a pessoa não troca direto. Pede a mudança (para o outro estado) e o líder aceita ou recusa;
// enquanto o pedido está aberto dá para cancelar.
function AskChange({e, act}: {e: GEvent; act: (key: string, fn: () => Promise<boolean>, ok?: string) => Promise<unknown>}){
  const g = useGroups(), me = useAuth(s => s.email), a = g.attendance.find(x => x.event_id === e.id && x.email === me);
  if(!a) return null;
  const to = a.status === "present" ? "absent" : "present";
  if(a.req_status) return <><span className="chip st-pending">{t("group.askSent", {to: t("group.att." + a.req_status)})}</span>
    <button type="button" className="link-btn" onClick={() => act("ask", () => requestAttendanceChange(e.id, null), "group.askCanceled")}>{t("group.askCancel")}</button></>;
  return <button type="button" className="link-btn" onClick={async () => {
    if(await confirmDialog({title: t("group.askTitle"), message: t("group.askMsg", {now: t("group.att." + a.status), to: t("group.att." + to)}), confirm: t("group.askConfirm")})) act("ask", () => requestAttendanceChange(e.id, to), "group.askDone");
  }}>{t("group.askChange")}</button>;
}

function EventCard({e, canEdit}: {e: GEvent; canEdit: boolean}){
  const sq = useSquareBadge();
  const g = useGroups(), me = useAuth(s => s.email);
  const [busy, setBusy] = useState(""), [editIn, setEditIn] = useState(false), [editReply, setEditReply] = useState(false);
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
  const att = g.attendance.filter(a => a.event_id === e.id), myAtt = att.find(a => a.email === me), myIn = myAtt?.status === "present";
  const pastNow = Date.now() > d.getTime(), myMark = myAtt?.status === "present" || myAtt?.status === "absent";
  const needs = needsCover(roster), myCover = mineRows[0]?.cover || "";
  // Ordem da escala: clicar no título da coluna ordena (de novo, inverte). Pessoa é alfabética (padrão); Resposta vai de
  // confirmado a indisponível, com empate em ordem alfabética.
  const [order, setOrder] = useState<{by: "name" | "status"; desc: boolean}>({by: "name", desc: false});
  const byName = (a: string, b: string) => personName(a).localeCompare(personName(b), locale(), {sensitivity: "base"});
  const STATUS_RANK: Record<string, number> = {yes: 0, pending: 1, no: 2};
  const sortBy = (by: "name" | "status") => setOrder(o => ({by, desc: o.by === by && !o.desc}));
  const people = rosterByPerson(roster).sort((a, b) => ((order.by === "status" ? (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) : 0) || byName(a.email, b.email)) * (order.desc ? -1 : 1));
  const sortHead = (by: "name" | "status", label: string) => <button type="button" className={"qa-sort" + (order.by === by ? " on" : "")} aria-label={t("group.sortBy", {col: label})} onClick={() => sortBy(by)}>
    {label}<span className="qa-sort-dir" aria-hidden="true"><Icon name="arrow-up" sm className={order.by === by && !order.desc ? "on" : ""}/><Icon name="arrow-down" sm className={order.by === by && order.desc ? "on" : ""}/></span></button>;
  // Quem não foi escalado (como quem está em pausa) só pode marcar presença: falta não conta para ele, e o banco recusa.
  const myOut = mineRows.length === 0;
  const act = (key: string, fn: () => Promise<boolean>, ok?: string) => lock(async () => { setBusy(key); const r = await fn().finally(() => setBusy("")); toast(t(r ? ok || "group.saved" : "profile.saveFail")); return r; });
  // Resposta de quem está na escala: o mesmo ReplySeg do Início e do Perfil (botões verde/vermelho, depois o selo).
  const canReply = mineRows.length > 0 && !isPast;
  // Quem disse "não posso" pode indicar quem cobre; é só um aviso para o grupo.
  const coverOpts = [{value: "", label: t("group.coverNone")}, ...g.members.filter(m => isActive(m) && m.email !== me).map(m => ({value: m.email, label: personName(m.email)}))];
  // Tocar na linha de uma pessoa abre os detalhes dela, com o histórico nos ensaios (no celular não há hover: a seta mostra que toca).
  const openHistory = (email: string) => ({className: "is-link", role: "button", tabIndex: 0, "aria-label": t("member.historyOpen", {name: personName(email)}),
    onClick: () => openDialog("member", {email}), onKeyDown: (ev: React.KeyboardEvent) => { if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); openDialog("member", {email}); } }});
  const pickCover = (v: string) => act("cover", () => setCover(e.id, v));
  const reply = canReply && <ReplySeg e={e} onEditing={setEditReply}/>;
  // Os mesmos chips em dois lugares: ao lado da data na tela larga e, no celular, numa linha própria embaixo,
  // com a largura toda do card (ao lado da data não cabem). O CSS mostra um ou outro.
  const chips = <>
    {/* Sem título (ou com título igual ao tipo), o tipo já é o título: o chip só aparece quando o evento tem nome próprio. */}
    {e.title && e.title.trim().toLowerCase() !== t("group.kind." + e.kind).toLowerCase() && <span className={"chip kind-" + e.kind}>{t("group.kind." + e.kind)}</span>}
    {set && <span className="chip"><Icon name="music" sm/> {set.name}</span>}
    {canEdit && needs.length > 0 && !isPast && <span className="chip st-no">{tn("group.needSub", needs.length)}</span>}
    {e.kind === "rehearsal" && myAtt?.status === "present" && <span className="chip st-yes"><Icon name="check" sm/> {t("group.att.present")}</span>}
    {e.kind === "rehearsal" && myAtt?.status === "absent" && <span className="chip st-no"><Icon name="x" sm/> {t("group.att.absent")}</span>}
    {pendingCheckIn(e, [me], g.attendance).length > 0 && <span className="chip st-pending"><Icon name="dot" sm/> {t("group.att.pending")}</span>}
  </>;
  return <li ref={ref} className={"card event " + e.kind + (myStatus === "no" ? " declined" : "")}>
    <div className="event-sec"><SecHead as="h3" className="people-sub-h">{t("group.details")}</SecHead>
    <div className="event-info">
    <div className="event-top">
      <span className="date-badge" ref={sq.badge}><small>{fmt({weekday: "short"}).format(d)}</small><b>{d.getDate()}</b><small>{fmt({month: "short"}).format(d)}</small></span>
      <div className="event-what" ref={sq.what}>
        <b>{eventTitle(e)}</b>
        <span className="sub">{timeOf(e.starts_at)}{e.call_at && " · " + t("group.callAt", {time: timeOf(e.call_at)})}{e.place && " · " + e.place}</span>
        <span className="sub">{relDay(e.starts_at)}{roster.length > 0 && " · " + tn("group.people", new Set(roster.map(r => r.email)).size)}</span>
        <span className="event-chips beside">{chips}</span>
      </div>
    </div>
    <span className="event-chips below">{chips}</span>
    </div></div>
    <div className="event-more">
      {/* A resposta vem antes da escala: quem abre o evento responde primeiro e depois confere quem vai. */}
      {/* Ensaio que já passou e ainda sem marcação: a pergunta "você estava?" sobe para logo abaixo do cabeçalho (antes ficava no fim do card e ninguém achava). */}
      {(reply || (e.kind === "rehearsal" && canCheckIn(e))) && <div className={"event-sec" + (e.kind === "rehearsal" && canCheckIn(e) && pastNow && !myMark ? " reply-first" : "")}><SecHead as="h3" className="people-sub-h">{t("group.myReply")}</SecHead><div className="event-actions boxed">
        {reply}
        {canReply && myStatus === "no" && !editReply && <label className="event-cover">
          <Select value={myCover} options={coverOpts} aria={t("group.coverAsk")} disabled={busy === "cover"} onChange={pickCover}/>{busy === "cover" && <Spin/>}</label>}
        {/* Ensaio que já começou: três estados, presente, falta ou sem marcação (um botão por marcação, como na resposta). */}
        {e.kind === "rehearsal" && canCheckIn(e) && pastNow && myMark && !editIn && busy !== "in" && <div className={"reply-done " + (myIn ? "yes" : "no")} role="status">
          <span className="reply-badge"><Icon name={myIn ? "check" : "x"} sm/> {t(myIn ? "group.att.present" : "group.att.absent")}</span>
          {myAtt?.by_admin ? <AskChange e={e} act={act}/> : <button type="button" className="link-btn" onClick={() => setEditIn(true)}>{t("group.changeReply")}</button>}</div>}
        {e.kind === "rehearsal" && canCheckIn(e) && pastNow && (!myMark || editIn || busy === "in") && <div className="reply-edit"><div className="reply-btns" role="group" aria-label={t("group.myReply")}>
          {([["present", "check", "group.checkInPast", "reply-yes"], ["absent", "x", "group.notThere", "reply-no"]] as const).filter(([v]) => v === "present" || !myOut || myAtt?.status === "absent").map(([v, icon, key, cls]) =>
            <button key={v} type="button" className={"btn sm " + cls} aria-busy={busy === "in:" + v} disabled={busy.startsWith("in:")}
              onClick={() => myAtt?.status === v ? setEditIn(false) : act("in:" + v, () => setMyAttendance(e.id, v), "group.saved").then(() => setEditIn(false))}>
              {busy === "in:" + v ? <Spin/> : <Icon name={icon} sm/>} {t(key)}</button>)}</div>
          {myMark && editIn && !busy && <button type="button" className="link-btn" onClick={() => setEditIn(false)}>{t("common.cancel")}</button>}</div>}
        {e.kind === "rehearsal" && canCheckIn(e) && !pastNow && myIn && !editIn && busy !== "in" && <div className="reply-done yes" role="status">
          <span className="reply-badge"><Icon name="check" sm/> {t("group.att.present")}</span>
          {myAtt?.by_admin ? <AskChange e={e} act={act}/> : <button type="button" className="link-btn" onClick={() => setEditIn(true)}>{t("group.changeReply")}</button>}</div>}
        {e.kind === "rehearsal" && canCheckIn(e) && !pastNow && (!myIn || editIn || busy === "in") && <div className="reply-edit"><button className="btn sm soft" aria-busy={busy === "in"} disabled={busy === "in"}
          onClick={() => act("in", () => checkIn(e.id, !myIn), myIn ? "group.saved" : "group.checkedIn").then(() => setEditIn(false))}>{busy === "in" ? <Spin/> : <Icon name={myIn ? "x" : "user"} sm/>} {t(myIn ? "group.uncheckIn" : Date.now() > d.getTime() ? "group.checkInPast" : "group.checkIn")}</button>
          {myIn && editIn && !busy && <button type="button" className="link-btn" onClick={() => setEditIn(false)}>{t("common.cancel")}</button>}</div>}
      </div>
      </div>}
      {/* Cada pessoa: nome e situação em cima, as funções neste evento como chips embaixo. */}
      {/* Ensaio é de todos: quem não foi escalado também aparece (sem resposta a dar), com o selo "Não escalado" (ou "Em pausa"). */}
      <div className="event-sec"><SecHead as="h3" className="people-sub-h">{t("group.roster")}</SecHead>
      {e.kind === "rehearsal" && g.members.length ? <ul className="quick-att roster-tbl">
        <li className="quick-att-head"><span className="quick-att-when">{sortHead("name", t("people.colPerson"))}</span><span className="quick-att-ctl">{sortHead("status", t("group.respCol"))}</span><span className="quick-att-go" aria-hidden="true"/></li>
        {/* Uma lista só (escalados e não escalados), na mesma ordem da coluna escolhida. */}
        {[...(
          people.map(r => ({email: r.email, rank: STATUS_RANK[r.status] ?? 3, li: <li key={r.email} {...openHistory(r.email)}>
          <span className="quick-att-when"><b><span>{personName(r.email)}</span>{r.email === me && <YouChip/>}</b>
            {r.reason && <span className="roster-reason">“{r.reason}”</span>}{r.cover && <span className="roster-reason">{t("group.coveredBy", {name: personName(r.cover)})}</span>}</span>
          <span className="quick-att-ctl">{(a => a ? <span className={"chip " + (a.status === "present" ? "st-yes" : a.status === "absent" ? "st-no" : "st-off")}>{t("group.att." + a.status)}</span> : <StatusChip status={r.status} noIcon/>)(att.find(x => x.email === r.email))}</span><span className="quick-att-go" aria-hidden="true"><Icon name="eye" sm/></span></li>}))
        ), ...(
          // Quem está em pausa não é escalado nem listado, a menos que tenha marcado presença neste ensaio.
          g.members.filter(m => isActive(m) && !roster.some(r => r.email === m.email)).sort((a, b) => byName(a.email, b.email)).map(m => ({m, sd: rehearsalStanding(m.email, g.events, g.attendance, Date.now(), outMark(m), g.roster), here: att.some(a => a.email === m.email && a.status === "present")}))
          .filter(x => x.here || !x.sd.out).map(({m, sd, here}) => ({email: m.email, rank: here ? 0 : 3, li: <li key={m.email} {...openHistory(m.email)}>
          <span className={"quick-att-when" + (sd.out ? " with-note" : "") + (here ? "" : " dim")}><b><span>{personName(m.email)}</span>{m.email === me && <YouChip/>}</b>{sd.out && <> <span className="sub pause-note">{tn("group.standOut", sd.need)}</span></>}</span>
          <span className="quick-att-ctl">{here ? <span className="chip st-yes">{t("group.att.present")}</span> : <span className="chip st-off">{t("group.status.off")}</span>}</span><span className="quick-att-go" aria-hidden="true"><Icon name="eye" sm/></span></li>}))
        )]
          .sort((a, b) => ((order.by === "status" ? a.rank - b.rank : 0) || byName(a.email, b.email)) * (order.desc ? -1 : 1)).map(x => x.li)}</ul>
        : roster.length ? <ul className="roster">{people.map(r => <li key={r.email} className={"st-" + r.status}>
        <span className="roster-who">{personName(r.email)}{r.email === me && <YouChip/>}</span>
        <StatusChip status={r.status}/>
        {(r.roles.length > 0 || rangeType(voiceOf(r.email))) && <span className="roster-chips">{sortRoles(r.roles).map(x => <span key={x} className="chip role">{x}</span>)}<VoiceChip {...voiceOf(r.email)}/></span>}
        {r.reason && <span className="roster-reason">“{r.reason}”</span>}{r.cover && <span className="roster-reason">{t("group.coveredBy", {name: personName(r.cover)})}</span>}</li>)}</ul>
        : <p className="sub">{t("group.noRoster")}</p>}
      {/* Quem não foi escalado não tem resposta a dar: avisa o porquê, senão parece que os botões sumiram. */}
      {e.kind === "rehearsal" && !isPast && mineRows.length === 0 && g.members.some(m => m.email === me && isActive(m)) && <div className="not-scaled" role="note"><span className="chip st-pending"><span><b>{t("group.notScaled")}.</b> {t("group.notScaledWhy")}</span></span></div>}</div>
      {e.notes && <div className="event-sec"><SecHead as="h3" className="people-sub-h">{t("group.notes")}</SecHead><p className="event-notes">{e.notes}</p></div>}
      {e.kind === "rehearsal" && canEdit && Date.now() >= d.getTime() - 12 * 3600 * 1000 && <Attendance e={e}/>}
      <div className="event-foot">
        {set && <><button className="btn ghost sm" onClick={() => openGroupSetlist(set)}><Icon name="music" sm/> {t("group.openSetlist")}</button>
          <button className="btn ghost sm" onClick={() => openGroupSetlist(set, true)}><Icon name="stage" sm/> {t("medley.stage")}</button></>}
        {canEdit && <div className="event-admin"><button className="btn ghost sm" onClick={() => openDialog("event", {id: e.id, day: eventDay(e)})}><Icon name="edit" sm/> {t("common.edit")}</button>
          <button className="btn ghost sm danger" onClick={async () => {
            if(await confirmDialog({title: t("group.deleteEventTitle"), message: t("group.deleteEventMsg", {name: eventTitle(e), day: longDay(d)})})) act("del", () => deleteEvent(e.id), "group.eventDeleted");
          }}><Icon name="trash" sm/> {t("common.delete")}</button></div>}
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
  const [open, setOpen] = useState(false);
  const att = g.attendance.filter(a => a.event_id === e.id);
  const pending = new Set(pendingCheckIn(e, g.members.filter(isActive).map(m => m.email), g.attendance));
  const until = fmt({weekday: "long", hour: "2-digit", minute: "2-digit"}).format(new Date(new Date(e.starts_at).getTime() + CHECKIN_MS));
  const mark = async (email: string, v: Presence | "") => {
    setBusy(email);
    const ok = await markAttendance(e.id, email, v || null).finally(() => setBusy(""));
    if(!ok) toast(t("profile.saveFail"));
  };
  return <div className="event-sec attendance"><SecHead as="h3" className="people-sub-h"><button type="button" className="att-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <span>{t("group.attendance")} <span className="sub">{t("group.attCount", {n: att.filter(a => a.status === "present").length, total: g.members.filter(isActive).length})}</span></span>
      <Icon name="chev" sm className={"att-chev" + (open ? " up" : "")}/></button></SecHead>
    {open && <div className="att-box">
    {pending.size > 0 && <div className="att-pending">
      <span className="sub">{t("group.pendingHint", {until})}</span>
      <a className="btn sm soft" href={waLink(waText(e, {names: [...pending].map(personName)}))} target="_blank" rel="noopener"><Icon name="chat" sm/> {t("group.waAll")}</a>
    </div>}
    <ul>{g.members.filter(m => isActive(m) || att.some(x => x.email === m.email)).map(m => { const a = att.find(x => x.email === m.email), wa = pending.has(m.email) && waNumber(m.phone || "");
      return <li key={m.email}><span className="roster-who">{busy === m.email && <Spin/>}{personName(m.email)}{a && !a.by_admin && <small className="sub">{t("group.selfCheckIn")}</small>}
        {pending.has(m.email) && <span className="chip st-pending">{t("group.att.pending")}</span>}
        {wa && <a className="icon-btn sm" href={waLink(waText(e, {name: personName(m.email)}), m.phone)} target="_blank" rel="noopener"
          aria-label={t("group.waOne", {name: personName(m.email)})} title={t("group.waOne", {name: personName(m.email)})}><Icon name="chat" sm/></a>}</span>
        {a?.req_status && <span className="att-req"><span className="chip st-pending">{t("group.reqWants", {to: t("group.att." + a.req_status)})}</span>
          <button type="button" className="btn sm soft" disabled={busy === m.email} onClick={() => mark(m.email, a.req_status!)}>{t("group.reqAccept")}</button>
          <button type="button" className="btn sm ghost" disabled={busy === m.email} onClick={async () => { setBusy(m.email); const ok = await declineAttendanceChange(e.id, m.email).finally(() => setBusy("")); if(!ok) toast(t("profile.saveFail")); }}>{t("group.reqDecline")}</button></span>}
        <Seg className="sm" aria={t("group.attendance") + ": " + personName(m.email)} value={(a?.status || (rehearsalStanding(m.email, g.events, g.attendance, Date.now(), outMark(m), g.roster).out ? "paused" : "")) as Presence | ""} onChange={v => mark(m.email, a && v === a.status ? "" : v)}
          options={[{v: "present", label: t("group.att.present")}, {v: "absent", label: t("group.att.absent")}, {v: "paused", label: t("group.att.paused")}]}/></li>; })}</ul></div>}
  </div>;
}

// ---------- membros ----------
function Members({canEdit}: {canEdit: boolean}){
  const g = useGroups(), me = useAuth(s => s.email), appAdmin = useAuth(s => s.admin);
  const [email, setEmail] = useState(""), [name, setName] = useState(""), [birthday, setBirthday] = useState(""), [phone, setPhone] = useState(""), [roles, setRoles] = useState<string[]>([]), [asAdmin, setAsAdmin] = useState(false), [asOut, setAsOut] = useState(false), [busy, setBusy] = useState(""), lock = useLock(), check = useEmailCheck(email);
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
    // Quem já está há muitos ensaios sem aparecer entra marcado em pausa (a volta conta daqui para frente).
    if(asOut && !(asAdmin && !leaderNow)){
      if(!await setMemberOut(g.gid, v, COMEBACK)) toast(t("profile.saveFail"));
      else toast(t("group.outSaved"));
    }
    toast(t("group.memberAdded", {email: v})); setEmail(""); setName(""); setBirthday(""); setPhone(""); setRoles([]); setAsAdmin(false); setAsOut(false); check.reset();
  }); };
  const fold = useFold("group-members");
  // Busca e ordem, como na lista "Com acesso" do Perfil (recentes: pela data em que entrou no grupo).
  const filter = usePeopleFilter(g.members, "acordia-members-order", m => m.name, m => m.created_at || ""), shown = filter.shown || [];
  return <div className="profile-grid">
    <div className={"card people-card" + fold.cls}>
      <FoldHead folded={fold.folded} onToggle={fold.toggle} title={t("group.membersTab")}/>
      <SecHead>{t("group.membersTab")}</SecHead>
      <div className="card-body">
      {canEdit && <><p className="sub">{t("group.addSub")}</p>
        <form className="member-add people-add-box" onSubmit={add} noValidate>
          <SecHead as="h3" className="people-sub-h">{t("group.addTitle")}</SecHead>
          {outside.length > 0 && <Select id="member-pick" className="member-pick" aria={t("group.pickUser")} value={outside.some(a => a.email === email) ? email : ""} onChange={pickUser}
            options={[{value: "", label: t("group.pickUser")}, ...outside.map(a => ({value: a.email, label: a.profileName || a.name || a.email, sub: (a.profileName || a.name) ? a.email : undefined}))]}/>}
          <div className="people-add">
            <PersonFields idp="member" name={name} onName={setName} email={email} onEmail={setEmail} phone={phone} onPhone={setPhone} birthday={birthday} onBirthday={setBirthday} check={check}/>
            {!leaderNow && <label className="switch lead boxed"><span>{t("group.leader")}</span><input type="checkbox" checked={asAdmin} onChange={e => setAsAdmin(e.target.checked)}/></label>}
          </div>
          {!(asAdmin && !leaderNow) && <div className="member-add-out">
            <label className="switch lead boxed"><span>{t("group.addOut")}</span><input type="checkbox" checked={asOut} onChange={e => setAsOut(e.target.checked)}/></label>
            <small className="sub">{t("group.addOutHelp", {max: MISS_LIMIT})}</small></div>}
          <RolePicker value={roles} onChange={setRoles}/>
          {/* Adicionar por último, embaixo das funções. */}
          <div className="member-roles-foot">
            <button className="btn primary" aria-busy={busy === "add"}>{busy === "add" ? <Spin/> : <Icon name="plus" sm/>} {t("common.add")}</button>
          </div>
        </form></>}
      <SecHead as="h3" className="people-sub-h">{t("group.listTitle")} <span className="count-chip">{filter.nq ? shown.length + "/" + g.members.length : g.members.length}</span></SecHead>
      {g.members.length > 0 && <PeopleTools idp="members" f={filter}/>}
      {/* Cabeçalho como o da lista "Com acesso" do Perfil. */}
      {shown.length > 0 && <div className="people-list-head" aria-hidden="true"><span>{t("people.colPerson")}</span><span>{t("people.colActions")}</span></div>}
      <ul className="people-list members" ref={filter.listRef}>{filter.nq && !shown.length && <li className="sub">{t("lib.noResults")}</li>}{shown.map(m => {
        const rate = attendanceRate(m.email, g.events, g.attendance, Date.now(), g.roster), sd = rehearsalStanding(m.email, g.events, g.attendance, Date.now(), outMark(m), g.roster), n = load.get(m.email) || 0;
        // Regra dos ensaios no lugar do "% nos ensaios" (a porcentagem fica na dica).
        const hint = t("group.ruleHint", {max: MISS_LIMIT, back: COMEBACK, p: rate.total ? Math.round(100 * rate.present / rate.total) : 0, present: rate.present, total: rate.total});
        // Tocar em qualquer parte da linha (fora dos botões, links e do painel de editar) abre os detalhes; o
        // nome é o botão, para o teclado e o leitor de tela. O celular continua sendo link de ligar.
        return <li key={m.email} className={"member-open" + (isActive(m) ? "" : " inactive")} onClick={e => { if(!(e.target as HTMLElement).closest(SKIP_OPEN)) openDialog("member", {email: m.email}); }}>
          {/* Como na lista "Com acesso": sempre nome, e-mail (com o aniversário) e celular, com o que falta apagado. */}
          <span className="people-who">
            <PersonAvatar email={m.email}/><span className="people-id">
            <span className="people-name"><button type="button" className="member-open-btn" aria-label={t("member.open", {name: m.name || m.email})}
              onClick={() => openDialog("member", {email: m.email})}>{m.name ? <b>{m.name}</b> : <span className="people-missing">{t("people.noName")}</span>}</button>{m.is_admin && <span className="chip leader">{t("group.leader")}</span>}{m.email === me && <YouChip/>}{!isActive(m) && <span className="chip">{t("group.inactive")}</span>}</span>
            <span className="copy-row"><span className="sub people-email">{m.email}</span><CopyBtn text={m.email} kind="email"/></span>
            {m.phone ? <span className="copy-row"><PhoneLink phone={m.phone}/><CopyBtn text={m.phone} kind="phone"/></span> :<span className="phone-link people-missing"><Icon name="phone" sm/><span>{t("people.noPhone")}</span></span>}</span></span>
          {/* Escalas no mês primeiro; a situação nos ensaios (em dia, faltas seguidas, fora) por último. */}
          {/* Escalas no mês, situação nos ensaios e funções: tudo na mesma fileira de chips. */}
          {/* As funções só aparecem aqui; mudar (como todo o resto) é na janela de detalhes. */}
          <MemberRoles m={m} editable={false} lead={<>
            {sd.out ? <span className="chip st-no" title={hint}>{tn("group.standOut", sd.need)}</span>
              : sd.streak > 0 ? <StreakChip streak={sd.streak} title={hint}/>
              : sd.called > 0 && <span className="chip st-yes" title={hint}>{t("group.standOk")}</span>}
            {n > 0 && <span className="chip accent" title={t("group.loadHint")}>{tn("group.load", n)}</span>}
            <VoiceChip {...m}/>
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
  // Alterado = diferente de quando abriu: sair (Cancelar, fechar a janela, trocar de página) pergunta antes.
  const root = useRef<HTMLElement>(null), snap = JSON.stringify([name, phone, birthday, roles]), start = useRef(snap);
  useUnsaved(root, snap !== start.current);
  const cancel = async () => { if(snap === start.current || await confirmUnsaved()) onDone(); };
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
  return <Root ref={root as React.RefObject<never>} className="people-edit member-edit" {...(inline
    ? {onKeyDown: (e: React.KeyboardEvent) => { if(e.key === "Enter" && !e.defaultPrevented && (e.target as HTMLElement).tagName === "INPUT"){ e.preventDefault(); save(); } }}
    : {onSubmit: save})}>
    {full && <div className="people-add">
      <div className="field"><label htmlFor={id + "-name"}>{t("profile.name")}</label>
        <NameInput className="input" id={id + "-name"} maxLength={80} autoComplete="off" placeholder={t("people.namePh")} value={name} onValue={setName} autoFocus/></div>
      <div className="field phone"><label htmlFor={id + "-phone"}>{t("profile.phone")}</label>
        <PhoneInput className="input" id={id + "-phone"} autoComplete="off" maxLength={30} placeholder={t("profile.phonePh")} value={phone} onValue={setPhone}/></div>
      <div className="field birthday"><label htmlFor={id + "-birthday"}>{t("profile.birthday")}</label>
        <DateInput className="people-birthday" id={id + "-birthday"} max={today()} clearable value={birthday} onChange={setBirthday}/></div>
    </div>}
    <RolePicker value={roles} onChange={setRoles}/>
    <div className="member-roles-foot">
      <button type="button" className="btn ghost sm" onClick={cancel}>{t("common.cancel")}</button>
      <button type={inline ? "button" : "submit"} className={"btn sm " + (inline ? "soft" : "primary")} aria-busy={busy} onClick={inline ? () => save() : undefined}>{busy ? <Spin/> : <Icon name="check" sm/>} {t("common.save")}</button>
    </div>
  </Root>;
}

// Tudo o que se faz com uma pessoa do grupo, na janela de detalhes (a linha da lista só abre a janela):
// chamada, em pausa, líder, ativar/desativar e remover (editar os dados é o lápis da própria janela).
// Presença e em pausa abrem o painel logo abaixo dos botões; as demais rodam na hora e mostram o resultado num aviso.
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
  const sd = rehearsalStanding(m.email, g.events, g.attendance, Date.now(), outMark(m), g.roster);
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
    <SecHead as="h3" className="people-sub-h">{t("member.manage")}</SecHead>
    <div className="member-manage-btns">
      {canEdit && <button type="button" className="btn ghost" aria-pressed={panel === "att"} onClick={() => open("att")}><Icon name="calendar" sm/> {t("group.attMenu")}</button>}
      {canEdit && !self && <button type="button" className="btn ghost" aria-pressed={panel === "out"} onClick={() => open("out")}><Icon name="lock" sm/> {t(sd.out ? "group.outMenuOn" : "group.outMenu")}</button>}
      {showLead && <button type="button" className="btn ghost" aria-busy={busy === "adm"} disabled={busy === "adm"} onClick={toggleLeader}>{busy === "adm" ? <Spin/> : <Icon name="star" sm/>} {t(m.is_admin ? "group.leaderUndo" : "group.leaderMake")}</button>}
      {showAct && <button type="button" className={"btn ghost" + (act ? " member-deact" : "")} aria-busy={busy === "act"} disabled={busy === "act"}
        onClick={() => run("act", () => setMemberActive(g.gid, m.email, !act), act ? "group.deactivated" : "group.activated")}>{busy === "act" ? <Spin/> : <Icon name={act ? "eye-off" : "eye"} sm/>} {t(act ? "group.deactivateShort" : "group.activateShort")}</button>}
    </div>
    {panel && <div ref={box}>
      {panel === "att" && <QuickAttendance email={m.email} onDone={() => setPanel("")}/>}
      {panel === "out" && <OutEdit m={m} status={standing} marked={!!sd.marked} need={sd.marked ? sd.need : COMEBACK} busy={busy === "out"}
        onSave={k => run("out", () => setMemberOut(g.gid, m.email, k), k ? "group.outSaved" : "group.outCleared", () => setPanel(""))} onCancel={() => setPanel("")}/>}
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
      <SecHead as="p" className="people-sub-h quick-att-hint">{t("group.attQuickHelp", {name: personName(email)})}</SecHead>
      <button type="button" className="icon-btn sm" aria-label={t("common.close")} onClick={onDone}><Icon name="x" sm/></button>
    </div>
    {list.length ? <ul className="quick-att"><li className="quick-att-head" aria-hidden="true"><span className="quick-att-when">{t("group.kind.rehearsal")}</span><span className="quick-att-ctl">{t("group.attQuickCol")}</span></li>{list.map(e => { const a = g.attendance.find(x => x.event_id === e.id && x.email === email);
      return <li key={e.id}><span className="quick-att-when"><b><span className="qa-long">{fmt({weekday: "short", day: "numeric", month: "short"}).format(new Date(e.starts_at))}</span><span className="qa-short">{fmt({weekday: "short", day: "2-digit", month: "2-digit"}).format(new Date(e.starts_at))}</span></b>
          <span className="sub">{timeOf(e.starts_at)}</span></span>
        <span className="quick-att-ctl">{busy === e.id && <Spin/>}<Seg className="sm" aria={t("group.attendance") + ": " + personName(email)} value={(a?.status || "") as Presence | ""} onChange={v => mark(e, v === a?.status ? "" : v)} disabled={busy === e.id}
          options={[{v: "present", label: t("group.att.present")}, {v: "absent", label: t("group.att.absent")}, {v: "paused", label: t("group.att.paused")}]}/></span></li>; })}</ul>
      : <p className="sub">{t("group.attQuickNone")}</p>}
  </div>;
}

// Marcar à mão como em pausa (quem já faltou antes do app): a partir de agora, precisa de N
// ensaios para voltar; cada presença na chamada desconta um. Marcado, dá para mudar o número ou tirar.
function OutEdit({m, status, marked, need, busy, onSave, onCancel}: {m: Member; status: React.ReactNode; marked: boolean; need: number; busy: boolean; onSave: (need: number) => void; onCancel: () => void}){
  const [k, setK] = useState(need), [which, setWhich] = useState<"save" | "clear">("save"), root = useRef<HTMLDivElement>(null);
  useUnsaved(root, k !== need);
  // O spinner fica no botão que foi clicado (busy é um só para o painel).
  const go = (w: "save" | "clear") => { setWhich(w); onSave(w === "clear" ? 0 : k); };
  const cancel = async () => { if(k === need || await confirmUnsaved()) onCancel(); };
  // Primeiro a situação de hoje (em dia, faltas seguidas ou fora), depois o ajuste: o stepper em cima, os botões embaixo.
  // div, não form: vive dentro da janela de detalhes, que já é um formulário (form aninhado é inválido).
  return <div className="people-edit out-edit" ref={root}>
    <p className="out-status">{status}</p>
    <p className="sub people-edit-hint">{t("group.outHelp", {name: personName(m.email)})}</p>
    <div className="out-edit-row">
      <span>{t("group.outNeed")}</span>
      <span className="tr-ctl out-step">
        <button type="button" className="icon-btn line" aria-label="−1" disabled={k <= 1} onClick={() => setK(k - 1)}>−</button><b aria-live="polite">{k}</b>
        <button type="button" className="icon-btn line" aria-label="+1" disabled={k >= 20} onClick={() => setK(k + 1)}>+</button></span>
    </div>
    <div className="out-edit-foot">
      {marked && <button type="button" className="link-btn out-edit-clear" aria-busy={busy && which === "clear"} disabled={busy} onClick={() => go("clear")}>{busy && which === "clear" && <Spin/>}{t("group.outClear")}</button>}
      <button type="button" className="btn ghost sm" disabled={busy} onClick={cancel}>{t("common.cancel")}</button>
      <button type="button" className="btn soft sm" aria-busy={busy && which === "save"} disabled={busy} onClick={() => go("save")}>{busy && which === "save" ? <Spin/> : <Icon name="check" sm/>} {t(marked ? "common.save" : "group.outConfirm")}</button>
    </div>
  </div>;
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
  const roles = sortRoles(splitRoles(m.role)), box = useRef<HTMLDivElement>(null);
  const changed = !!editing && joinRoles(editing) !== m.role;
  useUnsaved(box, changed);
  if(editing) return <div className="member-roles editing" ref={box}>
    <RolePicker value={editing} onChange={setEditing}/>
    <div className="member-roles-foot">
      <button type="button" className="btn ghost sm" onClick={async () => { if(!changed || await confirmUnsaved()) setEditing(null); }}>{t("common.cancel")}</button>
      <button type="button" className="btn primary sm" onClick={() => { const v = joinRoles(editing); setEditing(null); if(v !== m.role) onSave(v); }}>{t("common.save")}</button>
    </div>
  </div>;
  return <span className="member-roles">
    {lead}
    {roles.length ? roles.map(r => <span key={r} className="chip role">{r}</span>) : showEmpty && <span className="people-missing">{t("group.noRoles")}</span>}
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

