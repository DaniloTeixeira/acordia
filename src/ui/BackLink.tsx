// Link "Voltar" no topo da página (seta + nome de onde a pessoa veio). Fica fixo (sticky) logo abaixo da barra do topo, visível
// durante a rolagem: por isso deve ser filho direto da página, e não de um cabeçalho que rola junto.
// Com `mobileOnly` só aparece na barra de abas
// (celular/tablet): na tela larga o trilho já leva direto a cada página, então não há "pai" para voltar.
import { Icon } from "./Icon";

export function BackLink({id, label, onClick, mobileOnly}: {id: string; label: string; onClick: () => void; mobileOnly?: boolean}){
  return <button type="button" className={"back-link" + (mobileOnly ? " back-mobile" : "")} id={id} onClick={onClick}><Icon name="back" sm/><span>{label}</span></button>;
}
