// Estado da interface (Zustand): página aberta, idioma, avisos e janelas abertas.
// Os dados (músicas, repertórios, preferências) ficam em lib/store e avisam por useData().
import type { LibRef } from "./repertoire";
import { create } from "zustand";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import * as store from "./lib/store";
import { setLang, getLang, t, type Lang } from "./lib/i18n";
import { vt, type VtKind } from "./lib/util";
import type { Song } from "./lib/types";

// "profile" e "group" não estão na barra de abas: o perfil abre pela bolinha, e o grupo pelo Início.
export type View = "home" | "medley" | "library" | "group" | "study" | "tools" | "profile";
export const VIEWS: View[] = ["home", "medley", "library", "group", "study", "tools", "profile"];

export interface ToastAction { label: string; run: () => void }
export interface Toast { id: number; msg: string; action?: ToastAction; sticky?: boolean; out?: boolean }

// Cada janela recebe seus dados ao abrir.
export interface DialogProps {
  picker: Record<string, never>;
  song: {song: Song | null};
  // Pôr ou tirar uma música ou um medley da Biblioteca de cada repertório.
  addTo: LibRef;
  // Escolher as músicas que entram na folha do repertório (id).
  sheetPick: {id: string};
  install: Record<string, never>;
  chord: {symbol: string; songKey: string};
  player: {url: string; title: string};
  confirm: {title: string; message: string; confirm?: string; resolve: (ok: boolean) => void};
  help: {page: View};
  ear: {text: string; songKey: string; onApply: (text: string, key: string) => void};
  // id null: evento novo no dia (AAAA-MM-DD).
  event: {id: string | null; day: string};
  // Recortar a foto escolhida (src: link local da imagem, URL.createObjectURL): a do perfil ou, com gid, a do grupo.
  photo: {src: string; gid?: string};
  // Detalhes de uma pessoa (só leitura): do grupo aberto ou, fora dele, com os dados da lista de acesso.
  member: {email: string; person?: {name: string; phone: string; birthday: string | null; photo: string}};
}
export type DialogName = keyof DialogProps;

interface UIState {
  view: View;
  lang: Lang;
  toasts: Toast[];
  dialogs: {[K in DialogName]?: DialogProps[K]};
  stageOpen: boolean;
  // Itens abertos na edição do repertório.
  expanded: Set<string>;
  // Evento que o Início mandou abrir na agenda do grupo.
  eventFocus: string;
  // Músicas fora da folha (impressão e PDF), por repertório: os itemId desmarcados. Só nesta sessão.
  sheetSkip: Record<string, string[]>;
}

export const useUI = create<UIState>(() => ({
  view: "medley", lang: "pt", toasts: [], dialogs: {}, stageOpen: false, expanded: new Set(), eventFocus: "", sheetSkip: {}
}));

// Os dados mudaram (qualquer música, repertório ou preferência): redesenha quem usa.
export function useData(){ return useSyncExternalStore(store.subscribe, store.getVersion); }

// ---------- avisos ----------
let toastId = 0;
export function toast(msg: string, action?: ToastAction, {sticky = false} = {}){
  const id = ++toastId;
  useUI.setState(s => ({toasts: [...s.toasts, {id, msg, action, sticky}]}));
  if(!sticky) setTimeout(() => closeToast(id), action ? 6000 : 3200);
  return id;
}
export function closeToast(id: number){
  useUI.setState(s => ({toasts: s.toasts.map(x => x.id === id ? {...x, out: true} : x)}));
  setTimeout(() => useUI.setState(s => ({toasts: s.toasts.filter(x => x.id !== id)})), 260);
}

// ---------- janelas ----------
export function openDialog<K extends DialogName>(name: K, props: DialogProps[K]){
  useUI.setState(s => ({dialogs: {...s.dialogs, [name]: props}}));
}
export function closeDialog(name: DialogName){
  useUI.setState(s => { const d = {...s.dialogs}; delete d[name]; return {dialogs: d}; });
}
// Confirmação antes de excluir. Resolve true quando a pessoa confirma.
export function confirmDialog(p: {title: string; message: string; confirm?: string}){
  return new Promise<boolean>(resolve => openDialog("confirm", {...p, resolve}));
}

// ---------- navegação e idioma ----------
// Aplica a mudança dentro de uma transição animada (o React desenha na hora, com flushSync).
export function animate(run: () => void, kind: VtKind = "fade"){ return vt(() => flushSync(run), kind); }

// Cada página tem seu endereço (#home, #library, #study...; o repertório fica sem hash), para o voltar
// do navegador e do mouse trocar de tela.
export function viewFromHash(): View | null {
  const h = location.hash.slice(1);
  return (VIEWS as string[]).includes(h) ? h as View : null;
}
export function viewUrl(view: View){ return location.pathname + location.search + (view === "medley" ? "" : "#" + view); }
addEventListener("popstate", () => {
  const v = viewFromHash() ?? (location.hash ? null : "medley");
  if(v && v !== useUI.getState().view) go(v, {push: false});
});

export function go(v: string, {instant = false, push = true} = {}){
  const view = (VIEWS as string[]).includes(v) ? v as View : "medley";
  // Já na página: só volta ao topo, sem transição (ela fazia a tela piscar).
  if(view === useUI.getState().view){ window.scrollTo({top: 0, behavior: "smooth"}); return null; }
  if(push) history.pushState(null, "", viewUrl(view));
  const run = () => { useUI.setState({view}); window.scrollTo({top: 0}); };
  if(instant){ run(); return null; }
  return animate(run, "slide");
}
export function changeLang(l: Lang){
  if(l === getLang()) return;
  store.setSetting("lang", l);
  animate(() => {
    const oldDefault = t("medley.defaultName");
    setLang(l);
    store.data.medleys.forEach(m => { if(m.name === oldDefault){ m.name = t("medley.defaultName"); store.saveMedley(m); } });
    useUI.setState({lang: l});
  });
}
export function toggleExpanded(id: string, open?: boolean){
  useUI.setState(s => {
    const e = new Set(s.expanded), now = open ?? !e.has(id);
    if(now) e.add(id); else e.delete(id);
    return {expanded: e};
  });
}
