// Estrutura do app: navegação (trilho no computador, barra de abas no celular), páginas, modo
// palco, janelas, menus de idioma e volume, e avisos.
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { useIndicator } from "./ui/Seg";
import { t, getLang, LANGS } from "./lib/i18n";
import * as store from "./lib/store";
import { setVolume, playChord } from "./lib/audio";
import { useUI, useData, go, changeLang, toast, animate, openDialog, type View } from "./state";
import { Icon } from "./ui/Icon";
import { Toasts } from "./ui/Toasts";
import { Range } from "./ui/Range";
import { TIMBRES, getTimbre } from "./lib/audio";
import { chooseTimbre } from "./views/InstrumentSelect";
import { openNear, toggler } from "./ui/popover";
import { Repertoire } from "./views/Repertoire";
import { Library } from "./views/Library";
import { Study } from "./views/study/Study";
import { Tools } from "./views/Tools";
import { Stage } from "./views/Stage";
import { Dialogs, HELP_STEPS, seenHelp } from "./dialogs/Dialogs";

const { data } = store;
const BASE = import.meta.env.BASE_URL;

// ---------- tema ----------
type Theme = "system" | "light" | "dark";
const THEME_ICON: Record<Theme, string> = {system:"monitor", light:"sun", dark:"moon"};
export const theme = (): Theme => (["light", "dark"] as const).find(v => v === data.settings.theme) || "system";
export function applyTheme(th: Theme){
  if(th === "light" || th === "dark") document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme;
  try{ localStorage.setItem("acordia-theme", th); }catch(e){ /* sem armazenamento */ }
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(m => { const dark = th === "dark" || (th === "system" && m.media.includes("dark")); m.content = dark ? "#0B0F1C" : "#F5F7FC"; });
}
function cycleTheme(){
  const order: Theme[] = ["system","light","dark"], prev = theme(), th = order[(order.indexOf(prev) + 1) % 3];
  const isDark = (x: Theme) => x === "dark" || (x === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  store.setSetting("theme", th);
  // Se a aparência efetiva não muda (ex.: escuro → sistema com o SO escuro), não há o que animar.
  if(isDark(th) === isDark(prev)) applyTheme(th); else animate(() => applyTheme(th), "theme");
}
function ThemeButton({rail}: {rail?: boolean}){
  const th = theme(), name = t("theme." + th);
  return <button className={rail ? "nav-item" : "icon-btn"} data-theme-toggle aria-label={t("theme.aria", {name})} onClick={cycleTheme}>
    <Icon name={THEME_ICON[th]}/>{rail && <span>{t("theme.label", {name})}</span>}</button>;
}

// ---------- volume ----------
const vol = () => ({v: (data.settings.volume as number) ?? 80, m: !!data.settings.muted});
export function applyVolume(){ const {v, m} = vol(); setVolume(v / 100, m); }
function setVol(v: number){ store.setSetting("volume", v); if(v) store.setSetting("muted", false); applyVolume(); }
// Rolar o mouse sobre o volume ajusta de 5 em 5%.
function useWheel(ref: React.RefObject<HTMLElement | null>){
  useEffect(() => {
    const el = ref.current; if(!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); setVol(Math.max(0, Math.min(100, vol().v + (e.deltaY < 0 ? 5 : -5)))); };
    el.addEventListener("wheel", wheel, {passive: false}); return () => el.removeEventListener("wheel", wheel);
  }, [ref]);
}
const volPop = () => document.getElementById("vol-pop");
const volToggle = toggler(volPop, btn => openNear(volPop()!, btn, 280));
function VolumeButton({rail}: {rail?: boolean}){
  const ref = useRef<HTMLButtonElement>(null); useWheel(ref);
  const {v, m} = vol(), icon = m || !v ? "mute" : "sound", label = m ? t("vol.muted") : v + "%";
  return <button ref={ref} className={rail ? "nav-item" : "icon-btn"} data-volume data-tip-key={rail ? "tip.volume" : undefined} aria-label={rail ? undefined : t("vol.title")}
    onPointerDown={volToggle.onPointerDown} onClick={volToggle.onClick}>
    <Icon name={icon}/>{rail && <><span>{t("vol.title")}</span><span className="count" data-vol-label>{label}</span></>}</button>;
}
function VolumePop(){
  const range = useRef<HTMLInputElement>(null); useWheel(range);
  const {v, m} = vol();
  return <div id="vol-pop" className="popover vol-pop" popover="auto">
    <h3>{t("vol.title")}</h3>
    <div className="vol-row"><button className="icon-btn" id="vol-mute" aria-label={t(m ? "vol.unmute" : "vol.mute")} onClick={() => { store.setSetting("muted", !m); applyVolume(); }}><Icon name={m || !v ? "mute" : "sound"}/></button>
      <Range id="vol-range" ref={range} min={0} max={100} step={5} aria-label={t("vol.title")} value={v} onChange={e => setVol(+e.target.value)}
        onPointerUp={() => playChord([0, 4, 7], {base: 60, dur: 0.6})} onKeyUp={() => playChord([0, 4, 7], {base: 60, dur: 0.6})}/>
      <b id="vol-val">{m ? t("vol.muted") : v + "%"}</b></div>
    <p className="sub">{t("vol.hint")}</p>
    {/* Timbre das notas (acordes, escalas, teclado); o metrônomo não muda. */}
    <h3>{t("timbre.title")}</h3>
    <div className="timbres" id="timbres" role="group" aria-label={t("timbre.title")}>
      {TIMBRES.map(v => <button key={v} data-v={v} aria-pressed={v === getTimbre()} onClick={() => chooseTimbre(v)}>{t("timbre." + v)}</button>)}
    </div>
  </div>;
}

// ---------- idioma ----------
const langPop = () => document.getElementById("lang-pop");
const langToggle = toggler(langPop, btn => openNear(langPop()!, btn, 220));
function LangButton({rail}: {rail?: boolean}){
  const name = (LANGS.find(([v]) => v === getLang()) || LANGS[0])[1];
  return <button className={rail ? "nav-item lang-item" : "icon-btn"} data-lang-menu aria-haspopup="menu" aria-label={t("lang.label")}
    onPointerDown={langToggle.onPointerDown} onClick={langToggle.onClick}>
    <Icon name="globe"/>{rail && <><span data-lang-name>{name}</span><Icon name="chev" sm className="chev-down"/></>}</button>;
}
function LangPop(){
  return <div id="lang-pop" className="popover menu-pop" popover="auto" role="menu">
    {LANGS.map(([v, n]) => <button key={v} className="menu-item" role="menuitemradio" aria-checked={v === getLang()} data-lang={v}
      onClick={() => { langPop()?.hidePopover(); changeLang(v); }}>{n}{v === getLang() && <Icon name="check" sm/>}</button>)}
  </div>;
}

// ---------- instalar ----------
interface InstallPrompt extends Event { prompt(): void; userChoice: Promise<{outcome: string}> }
let deferred: InstallPrompt | null = null;
function useInstall(){
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as {standalone?: boolean}).standalone;
  const [show, setShow] = useState(!!(isIOS && !standalone) || !!deferred);
  useEffect(() => {
    const bip = (e: Event) => { e.preventDefault(); deferred = e as InstallPrompt; setShow(true); };
    const done = () => { setShow(false); toast(t("install.done")); };
    addEventListener("beforeinstallprompt", bip); addEventListener("appinstalled", done);
    return () => { removeEventListener("beforeinstallprompt", bip); removeEventListener("appinstalled", done); };
  }, []);
  const run = async () => {
    if(deferred){ deferred.prompt(); const r = await deferred.userChoice.catch(()=>null); if(r && r.outcome === "accepted") setShow(false); deferred = null; }
    else openDialog("install", {});
  };
  return {show, run};
}

const NAV: [View, string, string][] = [["medley", "music", "nav.medley"], ["library", "library", "nav.library"], ["study", "study", "nav.study"], ["tools", "metro", "nav.tools"]];

// Itens do trilho com o fundo do ativo deslizando entre eles (as variáveis --y e --h posicionam o fundo no CSS).
function NavList({children}: {children: ReactNode}){
  const ref = useRef<HTMLDivElement>(null);
  useIndicator(ref, '[aria-current="page"]', true);
  return <div className="nav-list" ref={ref}>{children}</div>;
}

export function App(){
  useData();
  const view = useUI(s => s.view), stageOpen = useUI(s => s.stageOpen);
  useUI(s => s.lang);
  const install = useInstall();
  const songCount = [...data.songs.values()].filter(s => s.title).length;
  // Na primeira visita a uma página, um aviso discreto oferece o guia "Como usar".
  useEffect(() => {
    if(!(view in HELP_STEPS) || ((data.settings.seenHelp || {}) as Record<string, boolean>)[view]) return;
    seenHelp(view);
    const h = setTimeout(() => toast(t("help.first"), {label: t("help.button"), run: () => openDialog("help", {page: view})}), 600);
    return () => clearTimeout(h);
  }, [view]);
  const brand = (tagline: boolean) => <a className="brand" href="./" onClick={e => { e.preventDefault(); go("medley"); }}>
    <img className="logo-on-light" src={BASE + "icons/icon.svg"} alt=""/><img className="logo-on-dark" src={BASE + "icons/icon-light.svg"} alt=""/><span><b className="brand-name">Acordia</b>{tagline && <small>{t("app.tagline")}</small>}</span></a>;
  const current = (v: View) => view === v ? "page" as const : undefined;
  return <>
    <div className="shell">
      <aside className="rail" aria-label={t("nav.nav")}>
        {brand(true)}
        <NavList>{NAV.map(([v, ic, label]) => <button key={v} className="nav-item" data-nav={v} aria-current={current(v)} onClick={() => go(v)}>
          <Icon name={ic}/><span>{t(label)}</span>{v === "library" && <span className="count" data-count="songs">{songCount || ""}</span>}</button>)}</NavList>
        <div className="rail-foot">
          <button className="nav-item" data-install hidden={!install.show} onClick={install.run}><Icon name="phone"/><span>{t("nav.install")}</span></button>
          <VolumeButton rail/>
          <ThemeButton rail/>
          <LangButton rail/>
        </div>
      </aside>
      <header className="topbar">
        {brand(false)}
        <button className="icon-btn" data-install hidden={!install.show} aria-label={t("nav.install")} onClick={install.run}><Icon name="phone"/></button>
        <LangButton/>
        <VolumeButton/>
        <ThemeButton/>
        <button className="icon-btn" data-help-btn data-tip-key="help.button" aria-label={t("help.button")} onClick={() => openDialog("help", {page: view})}><Icon name="question"/></button>
      </header>
      <main id="main">
        {view === "medley" && <Repertoire/>}
        {view === "library" && <Library/>}
        {view === "study" && <Study/>}
        {view === "tools" && <Tools/>}
      </main>
      <button className="help-fab" id="help-fab" data-tip-key="help.button" aria-label={t("help.button")} onClick={() => openDialog("help", {page: view})}><Icon name="question"/></button>
      <nav className="tabbar" aria-label={t("nav.nav")} style={{"--i": NAV.findIndex(([v]) => v === view)} as CSSProperties}>
        {NAV.map(([v, ic, label]) => <button key={v} className="tab" data-nav={v} aria-current={current(v)} onClick={() => go(v)}>
          <span className="pill"><Icon name={ic}/></span><span>{t(label)}</span></button>)}
      </nav>
    </div>
    {stageOpen && <Stage/>}
    <Dialogs/>
    <LangPop/>
    <VolumePop/>
    <Toasts/>
  </>;
}
