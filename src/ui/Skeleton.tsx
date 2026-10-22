// Esqueletos de carregamento, do mesmo jeito em toda tela: blocos que pulsam no formato do que vai aparecer, para
// o conteúdo não pular quando chegar. O texto "Carregando…" fica só para o leitor de tela. Os blocos (.skel) e a
// animação (com prefers-reduced-motion) estão no app.scss; a lista de pessoas é PeopleSkeleton.
import { t } from "../lib/i18n";

// Barra de texto: w é a largura em % (padrão 100).
export const SkelLine = ({w = 100}: {w?: number}) => <span className="skel skel-line" style={{width: w + "%"}} aria-hidden="true"/>;

// Card inteiro em carregamento: título e algumas linhas. wide ocupa a linha toda da grade do painel.
export function CardSkeleton({lines = 3, wide}: {lines?: number; wide?: boolean}){
  return <div className={"card skel-card" + (wide ? " wide" : "")} role="status" aria-busy="true">
    <span className="sr-only">{t("auth.loading")}</span>
    <span className="skel skel-title" aria-hidden="true"/>
    {Array.from({length: lines}, (_, i) => <SkelLine key={i} w={i === lines - 1 ? 60 : 100}/>)}
  </div>;
}
