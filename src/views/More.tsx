// Mais: o que fica fora da barra de abas: Grupos, Membros, Usuários do app (só admin), Estudo e Ferramentas.
// Em ordem alfabética do idioma atual, para achar sem aprender onde cada coisa está.
import { t, locale } from "../lib/i18n";
import { go } from "../state";
import { useAuth } from "../lib/cloud";
import { openGroup } from "./Group";
import { Icon } from "../ui/Icon";

export function More(){
  const admin = useAuth(s => s.admin);
  const items = [
    {id: "groups", icon: "grid", title: t("groups.title"), sub: t("more.groupsSub"), run: () => go("groups")},
    {id: "members", icon: "users", title: t("group.membersTab"), sub: t("more.membersSub"), run: () => openGroup("members")},
    ...(admin ? [{id: "people", icon: "id", title: t("people.title"), sub: t("more.peopleSub"), run: () => go("people")}] : []),
    {id: "study", icon: "study", title: t("nav.study"), sub: t("more.studySub"), run: () => go("study")},
    {id: "tools", icon: "metro", title: t("nav.tools"), sub: t("tools.sub"), run: () => go("tools")},
  ].sort((a, b) => a.title.localeCompare(b.title, locale()));
  return <section className="view" id="view-more" data-view="more" aria-labelledby="more-h">
    <div className="view-head"><div><h1 id="more-h">{t("more.title")}</h1><p className="sub">{t("more.sub")}</p></div></div>
    <ul className="more-list">{items.map(x => <li key={x.id}>
      <button type="button" className="card more-item" id={"more-" + x.id} onClick={x.run}>
        <span className="home-tile-icon"><Icon name={x.icon}/></span>
        <span className="more-what"><b>{x.title}</b><span className="sub">{x.sub}</span></span>
        <Icon name="chev" sm className="chev-right"/>
      </button></li>)}</ul>
  </section>;
}
