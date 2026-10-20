// Título de seção com o traço no gradiente antes do texto (e, às vezes, contador ou texto de apoio depois).
// É o único lugar que desenha esse traço: o tamanho, a cor e o alinhamento com a primeira linha do texto
// ficam em .sec-h / .sec-bar no app.scss. Usar este componente em vez de criar outro título com traço.
import type { ReactNode } from "react";

export function SecHead({as: Tag = "h2", id, className = "", children}: {as?: "h2" | "h3" | "p" | "span"; id?: string; className?: string; children: ReactNode}){
  return <Tag id={id} className={"sec-h" + (className ? " " + className : "")}><span className="sec-bar" aria-hidden="true"/>{children}</Tag>;
}
