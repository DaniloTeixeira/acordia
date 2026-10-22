// Linhas de esqueleto da lista de pessoas enquanto ela carrega: mesma altura e formato das linhas de verdade
// (foto, nome, e-mail, celular), para a lista não "pular" quando chegar. O texto "Carregando…" fica só para
// o leitor de tela. A animação (e o respeito a prefers-reduced-motion) está em .people-skel no app.scss.
import { t } from "../lib/i18n";

export function PeopleSkeleton({rows = 4}: {rows?: number}){
  return <>{Array.from({length: rows}, (_, i) => <li key={i} className="people-skel" aria-hidden={i ? "true" : undefined} role={i ? undefined : "status"}>
    {i === 0 && <span className="sr-only">{t("auth.loading")}</span>}
    <span className="skel skel-avatar"/><span className="skel-lines"><span className="skel skel-line w60"/><span className="skel skel-line w80"/><span className="skel skel-line w40"/></span>
  </li>)}</>;
}
