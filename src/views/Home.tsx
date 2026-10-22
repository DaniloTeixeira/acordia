// Início: feito para o que o membro faz sempre. Primeiro o próximo compromisso, com Confirmar / Não posso e
// "Estudar" ali mesmo; para quem lidera, logo depois os eventos que precisam de substituto. Depois a semana com
// as outras escalas, o que estudar e os aniversariantes. Cada coisa aparece num lugar só. O líder vê também
// quantos já confirmaram, quem ainda não respondeu e o "Novo evento"; o admin, os grupos (com "Novo grupo"). As ferramentas e a Biblioteca ficam em "Mais".
import { GoLink } from "../ui/GoLink";
import type { ReactNode } from "react";
import * as store from "../lib/store";
import { t, tn, locale } from "../lib/i18n";
import { useAuth } from "../lib/cloud";
import { dayKey, eventDay, splitEvents, upcomingBirthdays, needsCover, pendingReplies, type GEvent } from "../lib/calendar";
import { useGroups, chooseGroup, personName, amGroupAdmin, type GroupSetlist } from "../lib/groups";
import { useData, openDialog } from "../state";
import { openGroupSetlist } from "./Group";
import { Icon } from "../ui/Icon";
import { sortRoles } from "../lib/roles";
import { useGroupRefresh, ReplySeg, openGroup, eventTitle, fmt, timeOf, longDay, useSquareBadge, relDay, PersonAvatar, GroupMark, GroupPhotoButton } from "./Group";
import { SecHead } from "../ui/SecHead";
import { CardSkeleton } from "../ui/Skeleton";
import { LinkCard, IconMark } from "../ui/LinkCard";
import { YouChip } from "../ui/YouChip";


export function Home(){
  useData();
  useGroupRefresh();
  const g = useGroups(), me = useAuth(s => s.email), profile = useAuth(s => s.profile), admin = useAuth(s => s.admin);
  const group = g.groups.find(x => x.id === g.gid);
  const {upcoming} = splitEvents(g.events);
  const mine = upcoming.filter(e => g.roster.some(r => r.event_id === e.id && r.email === me));
  const leader = amGroupAdmin();
  const rosterOf = (e: GEvent) => g.roster.filter(r => r.event_id === e.id);
  const needs = leader ? upcoming.filter(e => needsCover(rosterOf(e)).length > 0) : [];
  // Para o líder: os próximos eventos com gente que ainda não respondeu (fora os que já pedem substituto).
  const waiting = leader ? upcoming.filter(e => !needs.includes(e) && pendingReplies(rosterOf(e)).length > 0).slice(0, 5) : [];
  // O próximo compromisso é a primeira escala da pessoa; sem escala, o próximo evento do grupo (sem resposta).
  const next = mine[0] || upcoming[0], rest = mine.slice(1);
  const name = (profile?.name || me.split("@")[0]).split(" ")[0];
  const bdays = group ? upcomingBirthdays(g.members, dayKey(new Date()), 7) : [];
  const study = studyList(next?.setlist_id);
  // Os grupos só aparecem para quem tem mais de um (para trocar) ou é admin (para criar outro); com um grupo só,
  // a aba Grupo já leva até ele.
  const showGroups = g.groups.length > 1 || admin;
  // Embaixo, Estudo e Grupos lado a lado (as músicas vêm do repertório de um grupo); sozinho, cada um ocupa a linha toda.
  const pair = study.length > 0 && group && showGroups;
  // Em cima, na tela larga: próximo compromisso ao lado do que o líder precisa resolver (substituto e respostas),
  // depois a semana na linha toda, Estudo ao lado de Grupos e, por último, os aniversários na linha toda. Um número ímpar de blocos deixa o último na linha toda.
  const top = [next && "next", needs.length > 0 && "needs", waiting.length > 0 && "waiting"].filter(Boolean);
  const topWide = top.length % 2 ? top[top.length - 1] : "";
  return <section className="view" id="view-home" data-view="home" aria-labelledby="home-h">
    <div className="view-head"><div><h1 id="home-h">{t("home.hello", {name})}</h1>
      <p className="sub">{fmt({weekday: "long", day: "numeric", month: "long"}).format(new Date())}</p></div></div>
    <div className="home-grid">
    {group ? <>
      {next && <NextCard e={next} mine={mine.includes(next)} leader={leader} wide={topWide === "next"}/>}
      {needs.length > 0 && <Block id="home-needs" className="home-needs" wide={topWide === "needs"} title={t("home.needsSub")} count={needs.length}>
        <ul className="my-next-list">{needs.map(e => <EventRow key={e.id} e={e} chip={<span className="event-chips need-end"><span className="chip st-no">{tn("group.needSub", needsCover(rosterOf(e)).length)}</span></span>} extra={<span className="event-chips need-under"><span className="chip st-no">{tn("group.needSub", needsCover(rosterOf(e)).length)}</span></span>}/>)}</ul>
      </Block>}
      {waiting.length > 0 && <Block id="home-waiting" className="home-needs home-waiting" wide={topWide === "waiting"} title={t("home.pendingTitle")} count={waiting.length} link={{label: t("home.seeAgenda"), run: () => openGroup("agenda")}}>
        <ul className="home-waiting-list">{waiting.map(e => <WaitingItem key={e.id} e={e}/>)}</ul>
      </Block>}
      {/* A semana sempre; embaixo, as outras escalas da pessoa (a primeira já está em destaque). */}
      <Block id="home-scales-block" wide title={t(rest.length ? "home.myScales" : "home.week")} count={rest.length ? mine.length : 0} link={{label: t("home.seeAgenda"), run: () => openGroup("agenda")}}>
        <WeekStrip upcoming={upcoming}/>
        {rest.length > 0 && <ul className="my-next-list home-scales" id="home-scales">{rest.map(e => <ScaleRow key={e.id} e={e} leader={leader}/>)}</ul>}
        {!next && <div className="empty-state home-empty"><Icon name="calendar"/><span>{t("group.noEvents")}</span></div>}
        {leader && <button type="button" className="btn soft sm home-new-event" id="home-new-event" onClick={() => openDialog("event", {id: null, day: dayKey(new Date())})}><Icon name="plus" sm/> {t("group.newEvent")}</button>}
      </Block>
    </> : <>
      {!g.loaded || g.loading ? <><CardSkeleton wide lines={4}/><CardSkeleton wide/></>
        : <div className="card empty-state wide"><Icon name="users"/><strong>{t("group.none")}</strong><span>{t(admin ? "group.noneAdmin" : "group.noneSub")}</span>
          {admin && <button className="btn primary" onClick={() => openDialog("newGroup", {})}><Icon name="plus" sm/> {t("group.create")}</button>}</div>}
    </>}
      {study.length > 0 && <StudyBlock list={study} wide={!pair}/>}
      {group && showGroups && <Groups upcoming={upcoming.length} wide={!pair}/>}
      {group && <Birthdays list={bdays} wide/>}
    </div>
  </section>;
}

// Bloco do painel: título (com o número e um link "Ver…" opcionais) e o conteúdo embaixo.
// wide: ocupa a linha toda da grade.
// action: um botão no lugar do link (como o "Novo grupo").
function Block({id, className = "", wide, icon, title, count, link, action, children}: {id: string; className?: string; wide?: boolean; icon?: string; title: string; count?: number;
  link?: {label: string; run: () => void}; action?: ReactNode; children: ReactNode}){
  return <section className={"card home-block " + className + (wide ? " wide" : "")} id={id} aria-labelledby={id + "-h"}>
    <div className="home-block-head">
      <SecHead id={id + "-h"}>{icon && <Icon name={icon} sm/>}{title}{!!count && <span className="count-chip">{count}</span>}</SecHead>
      {link && <GoLink onClick={link.run}>{link.label}</GoLink>}
      {action}
    </div>
    {children}
  </section>;
}

// Para o líder: quantos dos escalados já confirmaram, escrito (no toque não há dica).
function Replies({e}: {e: GEvent}){
  const g = useGroups();
  const roster = g.roster.filter(r => r.event_id === e.id), people = [...new Set(roster.map(r => r.email))];
  if(!people.length) return null;
  const yes = people.filter(p => roster.some(r => r.email === p && r.status === "yes")).length;
  return <span className={"home-replies" + (yes === people.length ? " ok" : "")}><Icon name="users" sm/> {t("home.replies", {yes, total: people.length})}</span>;
}

// Uma escala da pessoa numa linha: data, título, hora, funções e a resposta direta embaixo.
function ScaleRow({e, leader}: {e: GEvent; leader: boolean}){
  const g = useGroups(), me = useAuth(s => s.email);
  const roles = sortRoles(g.roster.filter(r => r.event_id === e.id && r.email === me).map(r => r.role).filter(Boolean));
  const d = new Date(e.starts_at), sq = useSquareBadge<HTMLSpanElement>();
  return <li className="home-scale">
    <button type="button" className="home-row" onClick={() => openGroup("agenda", e.id)}>
      <span className="date-badge" ref={sq.badge}><small>{fmt({weekday: "short"}).format(d)}</small><b>{d.getDate()}</b><small>{fmt({month: "short"}).format(d)}</small></span>
      <span className="my-next-what" ref={sq.what}><b>{eventTitle(e)}</b><span className="sub">{timeOf(e.starts_at)} · {relDay(e.starts_at)}</span>
        {roles.length > 0 && <span className="roster-chips">{roles.map(x => <span key={x} className="chip role">{x}</span>)}</span>}
        {leader && <Replies e={e}/>}</span>
    </button>
    <ReplySeg e={e}/>
  </li>;
}

function EventRow({e, chip, extra}: {e: GEvent; chip: ReactNode; extra?: ReactNode}){
  const d = new Date(e.starts_at), sq = useSquareBadge<HTMLSpanElement>();
  return <li><button className="home-row" onClick={() => openGroup("agenda", e.id)}>
    <span className="date-badge" ref={sq.badge}><small>{fmt({weekday: "short"}).format(d)}</small><b>{d.getDate()}</b><small>{fmt({month: "short"}).format(d)}</small></span>
    <span className="my-next-what" ref={sq.what}><b>{eventTitle(e)}</b><span className="sub">{timeOf(e.starts_at)}{e.place && " · " + e.place} · {relDay(e.starts_at)}</span>{extra}</span>
    {chip}</button></li>;
}

// Um evento com gente sem resposta, num bloco que preenche o card: em cima a data, o título e o selo; embaixo
// quem falta (primeiros nomes, em lista de marcadores pequena) e quantos já confirmaram.
function WaitingItem({e}: {e: GEvent}){
  const g = useGroups(), d = new Date(e.starts_at), sq = useSquareBadge<HTMLSpanElement>();
  const roster = g.roster.filter(r => r.event_id === e.id), people = [...new Set(roster.map(r => r.email))];
  const yes = people.filter(p => roster.some(r => r.email === p && r.status === "yes")).length;
  const list = pendingReplies(roster), names = list.map(p => personName(p).split(" ")[0]);
  return <li className="home-waiting-item">
    <button type="button" className="home-row" onClick={() => openGroup("agenda", e.id)}>
      <span className="date-badge" ref={sq.badge}><small>{fmt({weekday: "short"}).format(d)}</small><b>{d.getDate()}</b><small>{fmt({month: "short"}).format(d)}</small></span>
      <span className="my-next-what" ref={sq.what}><b>{eventTitle(e)}</b><span className="sub">{timeOf(e.starts_at)}{e.place && " · " + e.place} · {relDay(e.starts_at)}</span></span>
      <span className="chip st-yes home-waiting-replies"><Icon name="users" sm/> {t("home.replies", {yes, total: people.length})}</span>
    </button>
    <div className="home-waiting-box">
      <span className="home-waiting-count">{tn("home.pending", list.length)}</span>
      <ul className="home-waiting-who">{names.map((n, i) => <li key={i}>{n}</li>)}</ul>
    </div>
  </li>;
}

// Aniversariantes do grupo nos próximos 7 dias (só dia e mês; a idade não aparece). O bloco fica sempre, com um aviso
// quando não há ninguém: a tela não muda de forma e a pessoa fica sabendo que o recurso existe.
function Birthdays({list, wide}: {list: {email: string; in: number; day: number; month: number}[]; wide: boolean}){
  const me = useAuth(s => s.email);
  const when = (n: number) => new Intl.RelativeTimeFormat(locale(), {numeric: "auto"}).format(n, "day");
  return <Block id="home-birthdays" className="home-birthdays" wide={wide} icon="gift" title={t("home.birthdays")}>
    {list.length === 0 ? <div className="empty-state home-empty"><Icon name="gift"/><span>{t("home.noBirthdays")}</span></div>
    : <ul className="birthday-list">{list.map(p => <li key={p.email} className={p.in === 0 ? "today" : ""}>
      <PersonAvatar email={p.email}/>
      <span className="birthday-who"><b>{personName(p.email)}{p.email === me && <YouChip/>}</b>
        <span className="sub">{fmt({day: "numeric", month: "long", timeZone: "UTC"}).format(new Date(Date.UTC(2000, p.month - 1, p.day)))}</span></span>
      <span className={"chip" + (p.in === 0 ? " accent" : "")}>{p.in === 0 ? t("home.birthdayToday") : when(p.in)}</span>
    </li>)}</ul>}
  </Block>;
}

// Os próximos 7 dias, de hoje em diante: um ponto nos dias com evento do grupo (na cor de destaque quando a
// pessoa está escalada). Tocar no dia abre o primeiro evento dele na agenda.
function WeekStrip({upcoming}: {upcoming: GEvent[]}){
  const g = useGroups(), me = useAuth(s => s.email), now = new Date();
  const days = Array.from({length: 7}, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
  return <ol className="home-week" aria-label={t("home.week")}>{days.map((d, i) => {
    const evs = upcoming.filter(e => eventDay(e) === dayKey(d));
    const mine = evs.some(e => g.roster.some(r => r.event_id === e.id && r.email === me));
    const label = longDay(d) + (evs.length ? ": " + evs.map(eventTitle).join(", ") : "");
    return <li key={i}><button type="button" className={"home-day" + (i === 0 ? " today" : "")} disabled={!evs.length} aria-label={label}
      onClick={() => openGroup("agenda", evs[0].id)}>
      <small>{fmt({weekday: "short"}).format(d).replace(".", "")}</small><b>{d.getDate()}</b>
      <span className={"home-day-dot" + (mine ? " mine" : evs.length ? "" : " none")} aria-hidden="true"/>
    </button></li>;
  })}</ol>;
}

// O que estudar: só os repertórios do grupo ligados a um evento que ainda vai acontecer (menos o do próximo
// compromisso, que já tem o "Estudar"), na ordem dos eventos. Repertório sem evento futuro não é para o ensaio. Até 5 linhas.
function studyList(skip?: string | null): GroupSetlist[] {
  const g = useGroups.getState(), ids: string[] = [];
  for(const e of splitEvents(g.events).upcoming) if(e.setlist_id && e.setlist_id !== skip && !ids.includes(e.setlist_id)) ids.push(e.setlist_id);
  return ids.map(id => g.setlists.find(x => x.id === id)).filter((x): x is GroupSetlist => !!x).slice(0, 5);
}
function StudyBlock({list, wide}: {list: GroupSetlist[]; wide: boolean}){
  const g = useGroups();
  return <Block id="home-study" wide={wide} title={t("home.setlists")}
    link={g.setlists.length ? {label: t("home.seeAll"), run: () => openGroup("setlists")} : undefined}>
    <ul className="home-groups">{list.map(x => <GroupSetRow key={x.id} set={x}/>)}</ul>
  </Block>;
}
function GroupSetRow({set}: {set: GroupSetlist}){
  return <LinkCard mark={<IconMark name="music"/>} title={set.name} sub={tn("song", set.songs)} onClick={() => openGroupSetlist(set)}/>;
}

// Os grupos (só com mais de um ou para o admin): tocar abre o grupo. O aberto agora usa os números já carregados.
// Fixar: um grupo só, que vem primeiro (os outros seguem em ordem alfabética). Fixar outro troca o fixado.
// Fica neste aparelho, como as outras preferências.
function Groups({upcoming, wide}: {upcoming: number; wide: boolean}){
  const g = useGroups(), admin = useAuth(s => s.admin);
  const pinned = store.setting<string>("pinnedGroup", "");
  const togglePin = (id: string) => store.setSetting("pinnedGroup", pinned === id ? "" : id);
  const ordered = [...g.groups.filter(x => x.id === pinned), ...g.groups.filter(x => x.id !== pinned)];
  const many = g.groups.length > 1;
  return <Block id="home-group" className="home-group" wide={wide} title={tn("home.groups", g.groups.length)} count={many ? g.groups.length : 0}
    action={admin && <button type="button" className="link-btn" id="home-new-group" onClick={() => openDialog("newGroup", {})}><Icon name="plus" sm/> {t("group.newGroupTitle")}</button>}>
    <ul className="home-groups">{ordered.map(x => {
      const cur = x.id === g.gid, st = cur ? {events: upcoming, members: g.members.length} : x.stats;
      const pin = pinned === x.id;
      return <LinkCard key={x.id} id={"home-group-" + x.id} mark={admin ? <GroupPhotoButton group={x}/> : <GroupMark group={x}/>} title={x.name}
        sub={st && tn("home.events", st.events) + " · " + tn("profile.members", st.members)}
        onClick={() => { if(!cur) chooseGroup(x.id); openGroup("agenda"); }}
        /* Fixar (no canto de baixo à direita) só faz sentido com mais de um grupo; excluir fica em editar o grupo. */
        acts={many && <span className="home-group-acts">
          <button type="button" className="icon-btn sm line home-group-pin" aria-pressed={pin}
            aria-label={t(pin ? "group.unpin" : "group.pin") + ": " + x.name} onClick={() => togglePin(x.id)}><Icon name="pin" sm/></button>
        </span>}/>;
    })}</ul>
  </Block>;
}

// O próximo compromisso, em destaque: quando, onde, minha função, as duas respostas (Confirmar / Não posso) e
// "Estudar" (abre o repertório da data na folha) sem sair do Início. Quem não está na escala vê o evento e o
// aviso de que não está escalado; o líder vê também quantos já confirmaram.
function NextCard({e, mine, leader, wide}: {e: GEvent; mine: boolean; leader: boolean; wide: boolean}){
  const g = useGroups(), me = useAuth(s => s.email);
  const rows = g.roster.filter(r => r.event_id === e.id && r.email === me), set = g.setlists.find(x => x.id === e.setlist_id);
  const d = new Date(e.starts_at), roles = sortRoles(rows.map(r => r.role).filter(Boolean));
  return <Block id="home-next" className={"home-next " + e.kind} wide={wide} title={t(mine ? "home.next" : "home.nextGroup")} link={{label: t("home.details"), run: () => openGroup("agenda", e.id)}}>
    <div className="next-when"><b>{longDay(d)}</b><span>{timeOf(e.starts_at)}{e.call_at && " · " + t("group.callAt", {time: timeOf(e.call_at)})}</span><span className="sub">{relDay(e.starts_at)}</span></div>
    <b className="next-title">{eventTitle(e)}</b>
    {(e.place || roles.length > 0) && <span className="sub next-meta">{e.place}{roles.length > 0 && <span className="roster-chips">{roles.map(x => <span key={x} className="chip role">{x}</span>)}</span>}</span>}
    {!mine && <span className="sub">{t("home.noScales")}</span>}
    {leader && <Replies e={e}/>}
    {mine && <ReplySeg e={e}/>}
    {set && <div className="next-acts"><button type="button" className="btn primary sm" onClick={() => openGroupSetlist(set)}><Icon name="music" sm/> {t("home.study")}</button>
      <button type="button" className="btn ghost sm" onClick={() => openGroupSetlist(set, true)}><Icon name="stage" sm/> {t("medley.stage")}</button></div>}
  </Block>;
}
