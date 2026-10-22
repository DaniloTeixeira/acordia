// Link que leva para outra tela ou página: texto com a seta à direita. Link que continua no mesmo lugar (Alterar
// resposta, Tentar de novo, abrir uma janela) é só `<button className="link-btn">`, sem seta. O desenho fica em
// .link-btn.go no app.scss.
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function GoLink({onClick, id, className = "", children}: {onClick: () => void; id?: string; className?: string; children: ReactNode}){
  return <button type="button" id={id} className={"link-btn go" + (className ? " " + className : "")} onClick={onClick}>{children} <Icon name="arrow-right" sm/></button>;
}
