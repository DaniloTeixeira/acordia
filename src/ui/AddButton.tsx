// Botão "Adicionar" aos repertórios: o mesmo na Biblioteca (cards), na página de música nova e na de medley.
import * as store from "../lib/store";
import { t, tn } from "../lib/i18n";
import { toast, openDialog, go } from "../state";
import { openMedley, libTargets, libWhere, libTitle, inSetlist, addToSetlist, removeFromSetlist, type LibRef } from "../repertoire";
import { Icon } from "./Icon";

// Pôr nos repertórios (item do menu "⋯" no celular): diz o que faz ("Adicionar", "Tirar de X" ou "Adicionar ao repertório").
// Com um repertório só, põe e tira direto (tirar avisa com Desfazer); com mais de um, abre a lista para escolher.
// Sem nenhum, cria um e põe nele.
export function addAction(r: LibRef){
  const sets = libTargets(), where = libWhere(r), title = libTitle(r);
  const run = () => {
    if(sets.length > 1) return openDialog("addTo", r);
    const m = sets[0] || store.createMedley(t("medley.defaultName"));
    if(inSetlist(m, r)){
      const before = [...m.items]; removeFromSetlist(m, r);
      toast(t("addTo.removed", {title, medley: m.name}), {label: t("common.undo"), run: () => { m.items = before; store.saveMedley(m); }});
    } else {
      addToSetlist(m, r);
      toast(t("picker.addedTo", {title, medley: m.name}), {label: t("common.see"), run: () => { openMedley(m.id); go("medley"); }});
    }
  };
  const label = sets.length > 1 ? t("addTo.title") : where.length ? t("addTo.removeAria", {title, medley: where[0].name}) : t("common.add");
  // No menu "⋯" o item é da própria música: sem o título, só "Tirar de X".
  const menuLabel = sets.length <= 1 && where.length ? t("addTo.removeFrom", {medley: where[0].name}) : label;
  return {run, label, menuLabel, icon: where.length && sets.length <= 1 ? "minus" : "plus"};
}
// O botão de texto que diz onde o item já está ("+ Adicionar", "✓ Nome do repertório" ou "✓ Em N repertórios").
export function AddButton({r}: {r: LibRef}){
  const {run, label} = addAction(r), where = libWhere(r);
  return where.length
    ? <button type="button" className="chip current chip-btn" data-a="add" aria-label={label} onClick={run}><Icon name="check" sm/>
      <span>{where.length === 1 ? where[0].name : tn("addTo.inN", where.length)}</span></button>
    : <button type="button" className="btn ghost sm" data-a="add" onClick={run}><Icon name="plus" sm/> {t("common.add")}</button>;
}
