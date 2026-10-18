// Início: o resumo da semana na equipe. O grupo (com o número de eventos, repertórios e membros), as
// próximas escalas da pessoa com quantos confirmaram, os eventos que precisam de substituto (para quem
// lidera), a agenda do grupo e um atalho para o último repertório.
import type { ReactNode } from "react";
import { t, tn, locale } from "../lib/i18n";
import { useAuth, initials } from "../lib/cloud";
import { dayKey, splitEvents, type GEvent } from "../lib/calendar";
import { useGroups, chooseGroup, personName, amGroupAdmin } from "../lib/groups";
import { useUI, useData, go } from "../state";
import { peekCurrent, openMedley, songItems } from "../repertoire";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";
import { Spin } from "./Account";
import { useGroupRefresh, openGroup, eventTitle, StatusChip, fmt, timeOf } from "./Group";

// "hoje", "amanhã", "em 3 dias" (no idioma do app).
function relDay(iso: string){
  const [y, m, d] = dayKey(new Date(iso)).split("-").map(Number), [ty, tm, td] = dayKey(new Date()).split("-").map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 864e5);
  return new Intl.RelativeTimeFormat(locale(), {numeric: "auto"}).format(days, "day");
}

export function Home(){
  useData();
  useGroupRefresh();
  const g = useGroups(), me = useAuth(s => s.email), profile = useAuth(s => s.profile);
  const group = g.groups.find(x => x.id === g.gid);
  const {upcoming} = splitEvents(g.events);
  const mine = upcoming.filter(e => g.roster.some(r => r.event_id === e.id && r.email === me));
  const needs = amGroupAdmin() ? upcoming.filter(e => g.roster.some(r => r.event_id === e.id && r.status === "no")) : [];
  const others = upcoming.filter(e => !mine.includes(e)).slice(0, 3);
  const name = (profile?.name || me.split("@")[0]).split(" ")[0];
  return <section className="view" id="view-home" data-view="home" aria-labelledby="home-h">
    <div className="view-head"><div><h1 id="home-h">{t("home.hello", {name})}</h1>
      <p className="sub">{fmt({weekday: "long", day: "numeric", month: "long"}).format(new Date())}</p></div></div>
    {group ? <>
      <div className="home-group">
        <button className="card home-group-card" id="home-group" onClick={() => openGroup("agenda")}>
          <span className="home-group-mark" aria-hidden="true">{initials({name: group.name, email: ""})}</span>
          <span className="home-group-what"><b>{group.name}</b>
            <span className="home-group-stats">
              <span title={t("group.agenda")}><Icon name="calendar" sm/> {tn("home.events", upcoming.length)}</span>
              <span title={t("group.setlists")}><Icon name="music" sm/> {g.setlists.length}</span>
              <span title={t("group.membersTab")}><Icon name="users" sm/> {g.members.length}</span>
            </span></span>
          <Icon name="chev" sm className="chev-right"/>
        </button>
        {g.groups.length > 1 && <Select id="home-group-pick" aria={t("group.pick")} value={g.gid} onChange={v => chooseGroup(v)} options={g.groups.map(x => ({value: x.id, label: x.name}))}/>}
      </div>

      <div className="home-sec-head"><h2>{t("home.myScales")} {mine.length > 0 && <span className="count-chip">{mine.length}</span>}</h2>
        <button className="link-btn" onClick={() => openGroup("agenda")}>{t("home.seeAgenda")} <Icon name="chev" sm className="chev-right"/></button></div>
      {mine.length ? <ul className="home-scroll" id="home-scales">{mine.map(e => <ScaleCard key={e.id} e={e}/>)}</ul>
        : <div className="card empty-state home-empty"><Icon name="calendar"/><span>{t("home.noScales")}</span></div>}

      {needs.length > 0 && <div className="card home-needs">
        <h2>{t("home.needsSub")}</h2>
        <ul className="my-next-list">{needs.map(e => <EventRow key={e.id} e={e} chip={<span className="chip st-no">{tn("group.needSub", g.roster.filter(r => r.event_id === e.id && r.status === "no").length)}</span>}/>)}</ul>
      </div>}

      {others.length > 0 && <div className="card home-agenda">
        <h2>{t("home.groupAgenda")}</h2>
        <ul className="my-next-list">{others.map(e => <EventRow key={e.id} e={e} chip={<span className={"chip kind-" + e.kind}>{t("group.kind." + e.kind)}</span>}/>)}</ul>
      </div>}
    </> : <div className="card empty-state">{!g.loaded || g.loading ? <><Spin/><span>{t("auth.loading")}</span></>
      : <><Icon name="users"/><strong>{t("group.none")}</strong><span>{t(useAuth.getState().admin ? "group.noneAdmin" : "group.noneSub")}</span>
        {useAuth.getState().admin && <button className="btn primary" onClick={() => openGroup("members")}><Icon name="plus" sm/> {t("group.create")}</button>}</>}</div>}

    <Continue/>
  </section>;
}

// Cartão de uma escala da pessoa: quando, o que, quem está escalado e quantos já responderam.
function ScaleCard({e}: {e: GEvent}){
  const g = useGroups(), me = useAuth(s => s.email);
  const roster = g.roster.filter(r => r.event_id === e.id);
  const people = [...new Set(roster.map(r => r.email))];
  const said = (st: string) => people.filter(p => roster.some(r => r.email === p && r.status === st)).length;
  const myRows = roster.filter(r => r.email === me), set = g.setlists.find(s => s.id === e.setlist_id);
  const d = new Date(e.starts_at);
  return <li>
    <button className={"card scale-card " + e.kind} onClick={() => openGroup("agenda", e.id)}>
      <span className="scale-when"><span>{fmt({weekday: "long"}).format(d)}, {timeOf(e.starts_at)}</span><span>{fmt({day: "numeric", month: "short"}).format(d)}</span></span>
      <b className="scale-title">{eventTitle(e)}</b>
      <span className="sub scale-rel">{relDay(e.starts_at)}{myRows.some(r => r.role) && " · " + myRows.map(r => r.role).filter(Boolean).join(", ")}</span>
      <span className="scale-people" aria-hidden="true">{people.slice(0, 7).map(p => <span key={p} className="avatar">{initials({name: personName(p), email: p})}</span>)}
        {people.length > 7 && <span className="avatar more">+{people.length - 7}</span>}</span>
      <span className="scale-stats">
        <span title={t("home.stat.people")}><Icon name="users" sm/> {people.length}</span>
        <span title={t("home.stat.yes")} className="ok"><Icon name="check" sm/> {said("yes")}</span>
        <span title={t("home.stat.no")} className={said("no") ? "bad" : ""}><Icon name="x" sm/> {said("no")}</span>
        <span title={t("home.stat.songs")}><Icon name="music" sm/> {set ? set.songs : 0}</span>
        <StatusChip status={myRows[0]?.status || "pending"}/>
      </span>
    </button>
  </li>;
}

function EventRow({e, chip}: {e: GEvent; chip: ReactNode}){
  const d = new Date(e.starts_at);
  return <li><button className="home-row" onClick={() => openGroup("agenda", e.id)}>
    <span className="date-badge"><small>{fmt({weekday: "short"}).format(d)}</small><b>{d.getDate()}</b><small>{fmt({month: "short"}).format(d)}</small></span>
    <span className="my-next-what"><b>{eventTitle(e)}</b><span className="sub">{timeOf(e.starts_at)}{e.place && " · " + e.place}</span></span>
    {chip}</button></li>;
}

// Atalho para o último repertório aberto (no app ou direto no Palco).
function Continue(){
  const m = peekCurrent();
  if(!m || !m.items.length) return null;
  const n = songItems(m).length;
  const open = (stage: boolean) => { openMedley(m.id); go("medley"); if(stage) useUI.setState({stageOpen: true}); };
  return <div className="card home-continue">
    <div><span className="sub">{t("home.continue")}</span><b>{m.name}</b><span className="sub">{tn("song", n)}</span></div>
    <div className="home-continue-actions">
      <button className="btn ghost" onClick={() => open(false)}>{t("common.open")}</button>
      <button className="btn primary" onClick={() => open(true)}><Icon name="stage" sm/> {t("medley.stage")}</button>
    </div>
  </div>;
}
