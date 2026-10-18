// Recolher um card da .profile-grid (Perfil, Grupo → Membros) para economizar rolagem. Só vale com os cards um
// abaixo do outro: o botão e o card fechado só existem dentro da container query do CSS; lado a lado, todos
// ficam abertos. Fica guardado neste aparelho (localStorage), por card.
import { useState } from "react";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";

const KEY = "acordia.fold.";

export function useFold(id: string){
  const [folded, setFolded] = useState(() => { try{ return localStorage.getItem(KEY + id) === "1"; }catch{ return false; } });
  const toggle = () => setFolded(f => {
    try{ if(f) localStorage.removeItem(KEY + id); else localStorage.setItem(KEY + id, "1"); }catch{ /* sem armazenamento: só nesta tela */ }
    return !f;
  });
  return {folded, toggle, cls: folded ? " foldable folded" : " foldable"};
}

export function FoldButton({folded, onToggle, title}: {folded: boolean; onToggle: () => void; title: string}){
  const label = t(folded ? "card.expand" : "card.collapse", {title});
  return <button type="button" className="icon-btn sm fold-btn" aria-expanded={!folded} aria-label={label} title={label} onClick={onToggle}>
    <Icon name="chev" sm className={"event-chev" + (folded ? "" : " up")}/></button>;
}
