// Seção que abre e fecha: o título fica solto (alinhado com os das outras seções) e quem usa decide a moldura do
// conteúdo, como na Agenda. Seção de janela que abre e fecha pelo título (ex.: Detalhes e Escala do evento). Aberto ou fechado de
// início é decidido por quem usa; o estado vive aqui e o conteúdo fica montado (só escondido), para não
// perder o que foi digitado.
import { useState, type ReactNode } from "react";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";
import { SecHead } from "./SecHead";

// boxed: o conteúdo vem num quadro (.people-add-box), para seções empilhadas numa janela não se misturarem.
// after: o que vem logo abaixo do quadro (ex.: botões de ação), fora dele; some junto quando a seção fecha.
// onToggle: avisa quando abre ou fecha pelo título (ex.: rolar até o fim ao abrir).
export function FoldCard({id, title, aside, defaultOpen, boxed, after, onToggle, children}: {id: string; title: string; aside?: ReactNode; defaultOpen: boolean; boxed?: boolean; after?: ReactNode; onToggle?: (open: boolean) => void; children: ReactNode}){
  const [open, setOpen] = useState(defaultOpen);
  return <section className={"fold-card" + (open ? "" : " closed")} aria-labelledby={id + "-h"}>
    <h3 className="fold-card-head" id={id + "-h"}><button type="button" aria-expanded={open} aria-controls={id + "-body"} title={t(open ? "card.collapse" : "card.expand", {title})} onClick={() => { setOpen(!open); onToggle?.(!open); }}>
      <SecHead as="span" className="people-sub-h">{title}{aside}</SecHead>
      <span className="fold-card-chev"><Icon name="chev" sm className={"event-chev" + (open ? " up" : "")}/></span></button></h3>
    <div className={"fold-card-body" + (boxed ? " people-add-box" : "")} id={id + "-body"} hidden={!open}>{children}</div>
    {after && <div className="fold-card-after" hidden={!open}>{after}</div>}
  </section>;
}
