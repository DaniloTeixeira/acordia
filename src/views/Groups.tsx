// Grupos: a lista de todos os grupos da pessoa (celular: em Mais; tela larga: no trilho). A mesma lista de cards
// aparece no Início; aqui ela ganha uma página só dela, com "Novo grupo", para achar um grupo sem rolar o Início.
import * as store from "../lib/store";
import { t, tn } from "../lib/i18n";
import { splitEvents } from "../lib/calendar";
import { useGroups, ownsGroup, chooseGroup } from "../lib/groups";
import { useData, openDialog } from "../state";
import { Icon } from "../ui/Icon";
import { LinkCard } from "../ui/LinkCard";
import { SecHead } from "../ui/SecHead";
import { BackLink } from "../ui/BackLink";
import { CardSkeleton } from "../ui/Skeleton";
import { useGroupRefresh, openGroup, GroupMark, GroupPhotoButton } from "./Group";

// Os grupos (tocar abre o grupo). O aberto agora usa os números já carregados.
// Fixar: um grupo só, que vem primeiro (os outros seguem em ordem alfabética). Fixar outro troca o fixado.
// Fica neste aparelho, como as outras preferências.
export function GroupCards({upcoming}: {upcoming: number}){
  const g = useGroups();
  const pinned = store.setting<string>("pinnedGroup", "");
  const togglePin = (id: string) => store.setSetting("pinnedGroup", pinned === id ? "" : id);
  const ordered = [...g.groups.filter(x => x.id === pinned), ...g.groups.filter(x => x.id !== pinned)];
  const many = g.groups.length > 1;
  return <ul className="home-groups">{ordered.map(x => {
    const cur = x.id === g.gid, st = cur ? {events: upcoming, members: g.members.length} : x.stats;
    const pin = pinned === x.id;
    return <LinkCard key={x.id} id={"home-group-" + x.id} mark={ownsGroup(x) ? <GroupPhotoButton group={x}/> : <GroupMark group={x}/>} title={x.name}
      sub={st && tn("home.events", st.events) + " · " + tn("profile.members", st.members)}
      onClick={() => { if(!cur) chooseGroup(x.id); openGroup("agenda"); }}
      /* Fixar (no canto de baixo à direita) só faz sentido com mais de um grupo; excluir fica em editar o grupo. */
      acts={many && <span className="home-group-acts">
        <button type="button" className="icon-btn sm line home-group-pin" aria-pressed={pin}
          aria-label={t(pin ? "group.unpin" : "group.pin") + ": " + x.name} onClick={() => togglePin(x.id)}><Icon name="pin" sm/></button>
      </span>}/>;
  })}</ul>;
}

export function Groups(){
  useData();
  useGroupRefresh();
  const g = useGroups();
  const upcoming = splitEvents(g.events).upcoming.length;
  return <section className="view" id="view-groups" data-view="groups" aria-labelledby="groups-h">
    <BackLink id="groups-back" fallback="more"/>
    <div className="view-head"><div><h1 id="groups-h">{t("groups.title")}</h1><p className="sub">{t("groups.sub")}</p></div>
      <div className="actions"><button type="button" className="btn primary" id="groups-new" onClick={() => openDialog("newGroup", {})}><Icon name="plus" sm/><span>{t("group.newGroupTitle")}</span></button></div></div>
    {!g.loaded || g.loading ? <CardSkeleton wide lines={4}/>
      : g.groups.length ? <section className="card" id="groups-list" aria-labelledby="groups-list-h">
          <SecHead id="groups-list-h">{tn("home.groups", g.groups.length)}</SecHead>
          <GroupCards upcoming={upcoming}/>
        </section>
      : <div className="card empty-state"><Icon name="users"/><strong>{t("group.none")}</strong><span>{t("group.noneSub")}</span></div>}
  </section>;
}
