// Cartão que leva a algum lugar: marca à esquerda (iniciais, foto ou ícone), título, linha de apoio e a seta.
// Usado nos grupos e nos repertórios do Início; o desenho fica em .home-group-card no app.scss. O cartão todo é
// o botão (o ::after cobre ele); `acts` são botões extras por cima (fixar), `mark` pode ser interativa (câmera).
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function LinkCard({mark, id, title, sub, onClick, acts}: {mark: ReactNode; id?: string; title: string; sub?: ReactNode; onClick: () => void; acts?: ReactNode}){
  return <li className="card home-group-card">
    {mark}
    <button type="button" className="home-group-open" id={id} onClick={onClick}>
      <span className="home-group-what"><b>{title}</b>{sub && <span className="sub">{sub}</span>}</span>
      <Icon name="chev" sm className="chev-right"/>
    </button>
    {acts}
  </li>;
}

// Marca de ícone (repertório, música), do mesmo tamanho e cor da marca do grupo.
export function IconMark({name}: {name: string}){
  return <span className="group-mark" aria-hidden="true"><Icon name={name}/></span>;
}
