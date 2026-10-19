// Recolher um card da .profile-grid (Perfil, Grupo → Membros) para economizar rolagem. Só vale com os cards um
// abaixo do outro: o cabeçalho clicável e o card fechado só existem dentro da container query do CSS; lado a
// lado, o título normal do card aparece e todos ficam abertos. Fica guardado neste aparelho (localStorage), por card.
import { useState } from "react";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";
import { reveal } from "../lib/util";

const KEY = "acordia.fold.";

export function useFold(id: string){
  const [folded, setFolded] = useState(() => { try{ return localStorage.getItem(KEY + id) === "1"; }catch{ return false; } });
  const toggle = () => setFolded(f => {
    try{ if(f) localStorage.removeItem(KEY + id); else localStorage.setItem(KEY + id, "1"); }catch{ /* sem armazenamento: só nesta tela */ }
    return !f;
  });
  return {folded, toggle, cls: folded ? " foldable folded" : " foldable"};
}

// Cabeçalho do card um abaixo do outro: o título inteiro é o botão (padrão de acordeão: h2 com um botão dentro).
export function FoldHead({folded, onToggle, title}: {folded: boolean; onToggle: () => void; title: string}){
  return <h2 className="fold-head"><button type="button" aria-expanded={!folded} title={t(folded ? "card.expand" : "card.collapse", {title})} onClick={e => { if(folded) reveal(e.currentTarget.closest(".card")); onToggle(); }}>
    <span>{title}</span><span className="fold-chev"><Icon name="chev" sm className={"event-chev" + (folded ? "" : " up")}/></span></button></h2>;
}
