// Link "Voltar para <tela>" no topo da página (seta + nome de onde a pessoa veio). Fica fixo (sticky) logo abaixo da barra do
// topo no celular, visível durante a rolagem: por isso deve ser filho direto da página, e não de um cabeçalho que rola junto.
// Leva à página anterior; sem histórico (ex.: abriu direto nela) cai no `fallback`.
// Com `mobileOnly` só aparece na barra de abas
// (celular/tablet): na tela larga o trilho já leva direto a cada página, então não há "pai" para voltar.
import { Icon } from "./Icon";
import { t } from "../lib/i18n";
import { backTarget, goBack, useUI, type View } from "../state";

const NAME: Record<string, string> = {"group:agenda": "group.agenda", "group:library": "lib.title", "group:members": "group.membersTab", home: "nav.home", medley: "nav.medley", group: "nav.group", study: "nav.study", tools: "nav.tools", more: "nav.more", profile: "profile.title", people: "people.title", song: "song.newTitle"};

export function BackLink({id, fallback, mobileOnly}: {id: string; fallback: View; mobileOnly?: boolean}){
  useUI(s => s.trailTick + s.view); // o rótulo acompanha o histórico mesmo com a página já montada
  const label = t("common.backTo", {name: t(NAME[backTarget(fallback)] || "nav.home")});
  return <button type="button" className={"back-link" + (mobileOnly ? " back-mobile" : "")} id={id} onClick={() => goBack(fallback)}><Icon name="back" sm/><span>{label}</span></button>;
}
