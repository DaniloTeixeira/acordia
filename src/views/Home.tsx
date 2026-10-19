// Início: o painel da semana na equipe. Na coluna principal, o grupo (com o número de eventos, repertórios
// e membros), os próximos 7 dias, as escalas da pessoa com quantos confirmaram, os eventos que precisam de
// substituto (para quem lidera), os números da Biblioteca e os últimos itens abertos. Ao lado (embaixo, no
// celular), as ferramentas rápidas, os aniversariantes e a agenda do grupo.
import { useState, type ReactNode } from "react";
import * as store from "../lib/store";
import { t, tn, locale } from "../lib/i18n";
import { ago } from "../lib/util";
import { useAuth } from "../lib/cloud";
import { dayKey, eventDay, splitEvents, upcomingBirthdays, needsCover, type GEvent } from "../lib/calendar";
import { useGroups, chooseGroup, personName, amGroupAdmin, deleteGroup, type Group } from "../lib/groups";
import { useUI, useData, go, openDialog, confirmDialog, toast } from "../state";
import { peekCurrent, openMedley, songItems, isMedley, songKey, recentItems, type Recent } from "../repertoire";
import { Icon } from "../ui/Icon";
import { Spin } from "./Account";
import { sortRoles } from "../lib/roles";
import { openLibrary } from "./Library";
import { setStudy } from "./study/Study";
import { useGroupRefresh, openGroup, eventTitle, StatusChip, fmt, timeOf, longDay, PersonAvatar, GroupMark, GroupPhotoButton } from "./Group";

const { data } = store;

// "hoje", "amanhã", "em 3 dias" (no idioma do app).
function relDay(iso: string){
  const [y, m, d] = dayKey(new Date(iso)).split("-").map(Number), [ty, tm, td] = dayKey(new Date()).split("-").map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 864e5);
  return new Intl.RelativeTimeFormat(locale(), {numeric: "auto"}).format(days, "day");
}


export function Home(){
  useData();
  useGroupRefresh();
  const g = useGroups(), me = useAuth(s => s.email), profile = useAuth(s => s.profile), admin = useAuth(s => s.admin);
  const group = g.groups.find(x => x.id === g.gid);
  const {upcoming} = splitEvents(g.events);
  const mine = upcoming.filter(e => g.roster.some(r => r.event_id === e.id && r.email === me));
  const needs = amGroupAdmin() ? upcoming.filter(e => needsCover(g.roster.filter(r => r.event_id === e.id)).length > 0) : [];
  const others = upcoming.filter(e => !mine.includes(e)).slice(0, 3);
  const name = (profile?.name || me.split("@")[0]).split(" ")[0];
  const recent = recentList(), bdays = group ? upcomingBirthdays(g.members, dayKey(new Date()), 30) : [];
  const showAgenda = !!group && others.length > 0;
  const small = [recent.length > 0 && "continue", "tools", bdays.length > 0 && "birthdays", showAgenda && "agenda"].filter(Boolean);
  const lastWide = small.length % 2 ? small[small.length - 1] : "";
  // Excluir um grupo pelo card (só admins do app), depois de confirmar. Enquanto o banco apaga, o card fica
  // apagado, com "Excluindo…" no lugar dos números e sem aceitar toque.
  const [deleting, setDeleting] = useState("");
  // Fixar: um grupo só, que vem primeiro (os outros seguem em ordem alfabética). Fixar outro troca o fixado.
  // Fica neste aparelho, como as outras preferências.
  const pinned = store.setting<string>("pinnedGroup", "");
  const togglePin = (id: string) => store.setSetting("pinnedGroup", pinned === id ? "" : id);
  const ordered = [...g.groups.filter(x => x.id === pinned), ...g.groups.filter(x => x.id !== pinned)];
  const removeGroup = async (x: Group) => {
    if(!await confirmDialog({title: t("group.deleteTitle"), message: t("group.deleteMsg", {name: x.name})})) return;
    setDeleting(x.id);
    const ok = await deleteGroup(x.id).finally(() => setDeleting(""));
    toast(t(ok ? "group.deleted" : "profile.saveFail", {name: x.name}));
  };
  return <section className="view" id="view-home" data-view="home" aria-labelledby="home-h">
    <div className="view-head"><div><h1 id="home-h">{t("home.hello", {name})}</h1>
      <p className="sub">{fmt({weekday: "long", day: "numeric", month: "long"}).format(new Date())}</p></div></div>
    <div className="home-grid">
    {group ? <>
      {/* Um card por grupo (no lugar do dropdown): tocar abre o grupo. O aberto agora usa os números já carregados. */}
      <Block id="home-group" className="home-group" wide title={tn("home.groups", g.groups.length)} count={g.groups.length > 1 ? g.groups.length : 0}
        action={admin && <button className="btn ghost sm" id="home-new-group" onClick={() => openDialog("newGroup", {})}><Icon name="plus" sm/> {t("group.newGroupTitle")}</button>}>
        <ul className="home-groups">{ordered.map(x => {
          const cur = x.id === g.gid, st = cur ? {events: upcoming.length, setlists: g.setlists.length, members: g.members.length} : x.stats;
          const del = deleting === x.id, pin = pinned === x.id;
          return <li key={x.id} className={"card home-group-card" + (del ? " deleting" : "")} aria-busy={del}>
            {admin ? <GroupPhotoButton group={x}/> : <GroupMark group={x}/>}
            <button className="home-group-open" id={"home-group-" + x.id} disabled={del} onClick={() => { if(!cur) chooseGroup(x.id); openGroup("members"); }}>
            <span className="home-group-what"><b>{x.name}</b>
              {del ? <span className="home-group-stats home-group-deleting" role="status">{t("group.deleting")}</span>
              : st && <span className="home-group-stats">
                <span title={t("group.agenda")}><Icon name="calendar" sm/> {tn("home.events", st.events)}</span>
                <span title={t("group.setlists")}><Icon name="music" sm/> {st.setlists}</span>
                <span title={t("group.membersTab")}><Icon name="users" sm/> {st.members}</span>
              </span>}</span>
            <Icon name="chev" sm className="chev-right"/>
            </button>
            {/* Fixar e excluir juntos no canto de baixo à direita. */}
            {(g.groups.length > 1 || admin) && <span className="home-group-acts">
              {/* Fixar só faz sentido com mais de um grupo. */}
              {g.groups.length > 1 && <button type="button" className="icon-btn sm line home-group-pin" aria-pressed={pin} disabled={del}
                aria-label={t(pin ? "group.unpin" : "group.pin") + ": " + x.name} title={t(pin ? "group.unpin" : "group.pin")} onClick={() => togglePin(x.id)}><Icon name="pin" sm/></button>}
              {admin && <button type="button" className="icon-btn sm danger line home-group-del" aria-label={t("group.delete") + ": " + x.name} title={t("group.delete")}
                disabled={!!deleting} onClick={() => removeGroup(x)}>{del ? <Spin/> : <Icon name="trash" sm/>}</button>}
            </span>}
          </li>;
        })}</ul>
      </Block>

      <Block id="home-scales-block" wide title={t("home.myScales")} count={mine.length} link={{label: t("home.seeAgenda"), run: () => openGroup("agenda")}}>
        <WeekStrip upcoming={upcoming}/>
        {mine.length ? <ul className="home-scroll" id="home-scales">{mine.map(e => <ScaleCard key={e.id} e={e}/>)}</ul>
          : <div className="empty-state home-empty"><Icon name="calendar"/><span>{t("home.noScales")}</span></div>}
      </Block>

      {needs.length > 0 && <Block id="home-needs" className="home-needs" wide title={t("home.needsSub")} count={needs.length}>
        <ul className="my-next-list">{needs.map(e => <EventRow key={e.id} e={e} chip={<span className="chip st-no">{tn("group.needSub", needsCover(g.roster.filter(r => r.event_id === e.id)).length)}</span>}/>)}</ul>
      </Block>}
      <Tiles/>
    </> : <>
      <div className="card empty-state wide">{!g.loaded || g.loading ? <><Spin/><span>{t("auth.loading")}</span></>
        : <><Icon name="users"/><strong>{t("group.none")}</strong><span>{t(useAuth.getState().admin ? "group.noneAdmin" : "group.noneSub")}</span>
          {useAuth.getState().admin && <button className="btn primary" onClick={() => openDialog("newGroup", {})}><Icon name="plus" sm/> {t("group.create")}</button>}</>}</div>
      <Tiles/>
    </>}

      {/* Os blocos menores, 2 por linha quando cabem; com um número ímpar, o último ocupa a linha toda. */}
      {recent.length > 0 && <Continue list={recent} wide={lastWide === "continue"}/>}
      <QuickTools wide={lastWide === "tools"}/>
      {bdays.length > 0 && <Birthdays list={bdays} wide={lastWide === "birthdays"}/>}
      {showAgenda && <Block id="home-agenda" className="home-agenda" wide={lastWide === "agenda"} title={t("home.groupAgenda")} link={{label: t("home.seeAgenda"), run: () => openGroup("agenda")}}>
        <ul className="my-next-list">{others.map(e => <EventRow key={e.id} e={e} chip={<span className={"chip kind-" + e.kind}>{t("group.kind." + e.kind)}</span>}/>)}</ul>
      </Block>}
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
      <h2 id={id + "-h"}>{icon && <Icon name={icon} sm/>}{title}{!!count && <span className="count-chip">{count}</span>}</h2>
      {link && <button type="button" className="link-btn" onClick={link.run}>{link.label} <Icon name="chev" sm className="chev-right"/></button>}
      {action}
    </div>
    {children}
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
      <span className="sub scale-rel">{relDay(e.starts_at)}</span>
      {myRows.some(r => r.role) && <span className="roster-chips">{sortRoles(myRows.map(r => r.role).filter(Boolean)).map(x => <span key={x} className="chip role">{x}</span>)}</span>}
      <span className="scale-people" aria-hidden="true">{people.slice(0, 7).map(p => <PersonAvatar key={p} email={p}/>)}
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

// Aniversariantes do grupo nos próximos 30 dias (só dia e mês; a idade não aparece).
function Birthdays({list, wide}: {list: {email: string; in: number; day: number; month: number}[]; wide: boolean}){
  const me = useAuth(s => s.email);
  const when = (n: number) => new Intl.RelativeTimeFormat(locale(), {numeric: "auto"}).format(n, "day");
  return <Block id="home-birthdays" className="home-birthdays" wide={wide} icon="gift" title={t("home.birthdays")}>
    <ul className="birthday-list">{list.map(p => <li key={p.email} className={p.in === 0 ? "today" : ""}>
      <PersonAvatar email={p.email}/>
      <span className="birthday-who"><b>{personName(p.email)}{p.email === me && " " + t("group.you")}</b>
        <span className="sub">{fmt({day: "numeric", month: "long", timeZone: "UTC"}).format(new Date(Date.UTC(2000, p.month - 1, p.day)))}</span></span>
      <span className={"chip" + (p.in === 0 ? " accent" : "")}>{p.in === 0 ? t("home.birthdayToday") : when(p.in)}</span>
    </li>)}</ul>
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

// Números da Biblioteca num bloco, cada um no seu cartão interno, dividindo a linha em partes iguais; cada um leva à sua lista.
function Tiles(){
  const meds = [...data.medleys.values()];
  const tiles = [
    {id: "songs", icon: "music", n: [...data.songs.values()].filter(s => s.title).length, label: t("home.tile.songs"), run: () => openLibrary("songs")},
    {id: "setlists", icon: "list", n: meds.filter(m => !isMedley(m)).length, label: t("home.tile.setlists"), run: () => openLibrary("setlists")},
    {id: "medleys", icon: "link", n: meds.filter(isMedley).length, label: t("home.tile.medleys"), run: () => openLibrary("medleys")},
  ];
  return <Block id="home-shortcuts" wide title={t("home.shortcuts")}>
    <ul className="home-tiles">{tiles.map(x => <li key={x.id}>
    <button type="button" className="home-tile" id={"home-tile-" + x.id} onClick={x.run}>
      <span className="home-tile-icon"><Icon name={x.icon}/></span>
      <span className="home-tile-what"><b>{x.n}</b><span>{x.label}</span></span>
      <Icon name="chev" sm className="chev-right"/>
    </button></li>)}</ul>
  </Block>;
}

// Últimos itens abertos (músicas, repertórios e medleys), lado a lado. Sem histórico ainda, o último repertório.
function recentList(): Recent[] {
  const cur = peekCurrent(), list = recentItems().slice(0, 8);
  if(!list.length && cur && cur.items.length) list.push({kind: "medley", id: cur.id, at: cur.updatedAt || 0});
  return list;
}
function Continue({list, wide}: {list: Recent[]; wide: boolean}){
  return <Block id="home-continue" wide={wide} title={t("home.continue")} link={{label: t("lib.title"), run: () => openLibrary("songs")}}>
    <ul className="home-scroll home-recent" id="home-recent">{list.map(r => <RecentCard key={r.kind + r.id} r={r}/>)}</ul>
  </Block>;
}
function RecentCard({r}: {r: Recent}){
  if(r.kind === "song"){
    const s = data.songs.get(r.id)!, key = s.type === "letra" ? "" : songKey(s);
    return <li><div className="recent-card">
      <span className="recent-kind"><Icon name="music" sm/> {t("home.kind.song")}</span>
      <b className="recent-name">{s.title}</b>
      <span className="sub recent-meta">{key && <span className="chip accent">{t("lib.key", {key})}</span>}<span>{ago(r.at)}</span></span>
      <div className="recent-actions"><button className="btn soft sm" onClick={() => openDialog("song", {song: s})}>{t("common.open")}</button></div>
    </div></li>;
  }
  const m = data.medleys.get(r.id)!, blocks = isMedley(m);
  const open = (stage: boolean) => { openMedley(m.id); go("medley"); if(stage) useUI.setState({stageOpen: true}); };
  return <li><div className="card recent-card">
    <span className="recent-kind"><Icon name={blocks ? "link" : "list"} sm/> {t(blocks ? "home.kind.medley" : "home.kind.setlist")}</span>
    <b className="recent-name">{m.name}</b>
    <span className="sub recent-meta"><span>{tn("song", songItems(m).length)}</span><span>{ago(r.at)}</span></span>
    <div className="recent-actions">
      <button className={"btn sm " + (blocks ? "soft" : "ghost")} onClick={() => open(false)}>{t("common.open")}</button>
      {!blocks && m.items.length > 0 && <button className="btn primary sm" onClick={() => open(true)}><Icon name="stage" sm/> {t("medley.stage")}</button>}
    </div>
  </div></li>;
}

// Ferramentas rápidas: abrem a página já na aba certa.
function QuickTools({wide}: {wide: boolean}){
  const tool = (tab: string) => () => { store.setSetting("toolsTab", tab); go("tools"); };
  const items = [
    {id: "metro", icon: "metro", label: t("tools.metro"), run: tool("metro")},
    {id: "tuner", icon: "tuner", label: t("tools.tuner"), run: tool("tuner")},
    {id: "pad", icon: "pad", label: t("tools.pad"), run: tool("pad")},
    {id: "train", icon: "study", label: t("study.train"), run: () => { setStudy({tab: "train"}); go("study"); }},
  ];
  return <Block id="home-tools" wide={wide} title={t("home.tools")}>
    <ul className="home-tools-grid">{items.map(x => <li key={x.id}>
      <button type="button" className="home-tool" id={"home-tool-" + x.id} onClick={x.run}><Icon name={x.icon}/><span>{x.label}</span></button>
    </li>)}</ul>
  </Block>;
}
