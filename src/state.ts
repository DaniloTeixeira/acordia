// Estado da interface (Zustand): página aberta, idioma, avisos e janelas abertas.
// Os dados (músicas, repertórios, preferências) ficam em lib/store e avisam por useData().
import { create } from "zustand";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import * as store from "./lib/store";
import { setLang, getLang, t, type Lang } from "./lib/i18n";
import { vt } from "./lib/util";
import type { Song, Medley, SongItem } from "./lib/types";
import type { IncomingMedley } from "./lib/share";

export type View = "medley" | "library" | "study" | "tools";
export const VIEWS: View[] = ["medley", "library", "study", "tools"];

export interface ToastAction { label: string; run: () => void }
export interface Toast { id: number; msg: string; action?: ToastAction; sticky?: boolean; out?: boolean }

// Cada janela recebe seus dados ao abrir.
export interface DialogProps {
  picker: Record<string, never>;
  song: {song: Song | null};
  share: {medley: Medley};
  incoming: {med: IncomingMedley};
  install: Record<string, never>;
  arr: {medley: Medley; song: Song; item: SongItem};
  chord: {symbol: string; songKey: string};
  player: {url: string; title: string};
  confirm: {title: string; message: string; confirm?: string; resolve: (ok: boolean) => void};
  help: {page: View};
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
}

export const useUI = create<UIState>(() => ({
  view: "medley", lang: "pt", toasts: [], dialogs: {}, stageOpen: false, expanded: new Set()
}));

// Os dados mudaram (qualquer música, repertório ou preferência): redesenha quem usa.
export function useData(){ return useSyncExternalStore(store.subscribe, store.getVersion); }

// ---------- avisos ----------
let toastId = 0;
export function toast(msg: string, action?: ToastAction, {sticky = false} = {}){
  const id = ++toastId;
  useUI.setState(s => ({toasts: [...s.toasts, {id, msg, action, sticky}]}));
  if(!sticky) setTimeout(() => closeToast(id), action ? 6000 : 3200);
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
export function animate(run: () => void){ vt(() => flushSync(run)); }

export function go(v: string, {instant = false} = {}){
  const view = (VIEWS as string[]).includes(v) ? v as View : "medley";
  store.setSetting("view", view);
  const run = () => { useUI.setState({view}); window.scrollTo({top: 0}); };
  if(instant) run(); else animate(run);
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
