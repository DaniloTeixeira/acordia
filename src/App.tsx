// Estrutura do app: navegação (trilho no computador, barra de abas no celular), páginas, modo
// palco, janelas, menus de idioma e volume, e avisos.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useIndicator } from "./ui/Seg";
import { t, getLang, LANGS } from "./lib/i18n";
import * as store from "./lib/store";
import { setVolume, playChord, setCues, cue } from "./lib/audio";
import { useUI, useData, go, changeLang, toast, closeToast, openDialog, type View } from "./state";
import { Icon } from "./ui/Icon";
import { Toasts } from "./ui/Toasts";
import { Range } from "./ui/Range";
import { TIMBRES, getTimbre } from "./lib/audio";
import { chooseTimbre } from "./views/InstrumentSelect";
import { openNear, toggler } from "./ui/popover";
import { Repertoire } from "./views/Repertoire";
import { Study } from "./views/study/Study";
import { Tools } from "./views/Tools";
import { Stage } from "./views/Stage";
import { Dialogs, HELP_STEPS, seenHelp } from "./dialogs/Dialogs";
import { AuthScreen, Avatar, Profile, PeoplePage } from "./views/Account";
import { useAuth } from "./lib/cloud";
import { Group, openGroup, LIB_TABS } from "./views/Group";
import { More } from "./views/More";
import { Home } from "./views/Home";
import { ThemeButton } from "./ui/theme";
export { applyTheme, theme } from "./ui/theme";

const { data } = store;
const BASE = import.meta.env.BASE_URL;

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
    {/* Sons de retorno (tic da oitava, acerto e erro): ligados por padrão. */}
    <hr/>
    <label className="switch lead boxed vol-cues">{t("vol.cues")}<input type="checkbox" id="vol-cues" checked={store.setting("cues", true)}
      onChange={e => { const on = e.target.checked; store.setSetting("cues", on); setCues(on); cue("ok"); }}/></label>
    <p className="sub">{t("vol.cuesHint")}</p>
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
  const name = t("lang." + getLang());
  return <button className={rail ? "nav-item lang-item" : "icon-btn"} data-lang-menu aria-haspopup="menu" aria-label={t("lang.label")}
    onPointerDown={langToggle.onPointerDown} onClick={langToggle.onClick}>
    <Icon name="globe"/>{rail && <><span data-lang-name>{name}</span><Icon name="chev" sm className="chev-down"/></>}</button>;
}
function LangPop(){
  return <div id="lang-pop" className="popover menu-pop" popover="auto" role="menu">
    {LANGS.map(([v]) => <button key={v} className="menu-item" role="menuitemradio" aria-checked={v === getLang()} data-lang={v}
      onClick={() => { langPop()?.hidePopover(); changeLang(v); }}>{t("lang." + v)}{v === getLang() && <Icon name="check" sm/>}</button>)}
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

// Quatro destinos, cada um uma tela só: Início (o que vem aí e a resposta da escala), Agenda, Biblioteca (repertórios,
// músicas e medleys) e Mais (Membros, Estudo e Ferramentas). Agenda e Biblioteca são a página do Grupo em modos
// diferentes. O repertório aberto conta como Biblioteca; Membros conta como Mais; Usuários conta como Perfil.
type NavId = "home" | "agenda" | "library" | "more";
const NAV: {id: NavId; icon: string; label: string; run: () => void}[] = [
  {id: "home", icon: "home", label: "nav.home", run: () => go("home")},
  {id: "agenda", icon: "calendar", label: "group.agenda", run: () => openGroup("agenda")},
  // Volta para a lista em que a pessoa estava (repertórios, músicas ou medleys).
  {id: "library", icon: "library", label: "lib.title", run: () => openGroup(LIB_TABS.find(v => v === data.settings.groupTab) || "setlists")},
  {id: "more", icon: "more", label: "nav.more", run: () => go("more")},
];
// No trilho da tela larga há espaço: o que o Mais agrupa no celular aparece direto, cada um no seu item.
const RAIL: {id: string; icon: string; label: string; run: () => void}[] = [
  ...NAV.filter(n => n.id !== "more"),
  {id: "members", icon: "users", label: "group.membersTab", run: () => openGroup("members")},
  {id: "study", icon: "study", label: "nav.study", run: () => go("study")},
  {id: "tools", icon: "metro", label: "nav.tools", run: () => go("tools")},
];
function railOf(v: View, groupTab: unknown, nav: string): string{
  if(v === "study" || v === "tools") return v;
  if(v === "group" && groupTab === "members") return "members";
  return nav === "more" ? "" : nav;
}
function navOf(v: View, groupTab: unknown): NavId | "profile" | ""{
  if(v === "profile" || v === "people") return "profile";
  if(v === "medley") return "library";
  if(v === "group") return groupTab === "members" ? "more" : (LIB_TABS as unknown[]).includes(groupTab) ? "library" : "agenda";
  return v === "home" ? "home" : v === "more" || v === "study" || v === "tools" ? "more" : "";
}

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
  // Abas do celular com largura pelo rótulo: o traço da aba ativa mede a aba de verdade.
  const tabbar = useRef<HTMLElement>(null);
  useIndicator(tabbar, '.tab[aria-current="page"]');
  // Na primeira visita a uma página, um aviso discreto oferece o guia "Como usar". Ele é daquela página:
  // some ao trocar de página ou ao abrir o Palco (no celular, ficaria por cima da cifra).
  useEffect(() => {
    if(stageOpen || !(view in HELP_STEPS) || ((data.settings.seenHelp || {}) as Record<string, boolean>)[view]) return;
    seenHelp(view);
    let id = 0;
    const h = setTimeout(() => { id = toast(t("help.first"), {label: t("help.button"), run: () => openDialog("help", {page: view})}); }, 600);
    return () => { clearTimeout(h); if(id) closeToast(id); };
  }, [view, stageOpen]);
  const brand = (tagline: boolean) => <a className="brand" href="./" onClick={e => { e.preventDefault(); go("home"); }}>
    <img className="logo-on-light" src={BASE + "icons/icon.svg"} alt=""/><img className="logo-on-dark" src={BASE + "icons/icon-light.svg"} alt=""/><span><b className="brand-name">Acordia</b>{tagline && <small>{t("app.tagline")}</small>}</span></a>;
  const nav = navOf(view, data.settings.groupTab);
  const current = (v: string) => nav === v ? "page" as const : undefined;
  const rail = railOf(view, data.settings.groupTab, nav);
  const auth = useAuth(s => s.status), recovery = useAuth(s => s.recovery), helpable = view in HELP_STEPS;
  // A dica e o rótulo da ajuda dizem de qual página é ("Como usar o Repertório").
  const helpKey = helpable ? `help.${view}.title` : "help.button";
  // Nada do app aparece antes de a pessoa entrar e ter acesso (nem antes da senha nova).
  if(auth !== "in" || recovery) return <><div className="auth-corner"><LangButton/><ThemeButton/></div><AuthScreen/><LangPop/><Toasts/></>;
  const profileBtn = (rail: boolean) => <button className={rail ? "nav-item" : "icon-btn"} data-nav="profile" aria-current={current("profile")} aria-label={t("profile.title")} onClick={() => go("profile")}>
    <Avatar/>{rail && <span>{t("profile.title")}</span>}</button>;
  return <>
    <div className="shell">
      <aside className="rail" aria-label={t("nav.nav")}>
        {brand(true)}
        <NavList>{RAIL.map(n => <button key={n.id} className="nav-item" data-nav={n.id} aria-current={rail === n.id ? "page" : undefined} onClick={n.run}>
          <Icon name={n.icon}/><span>{t(n.label)}</span></button>)}</NavList>
        <div className="rail-foot">
          <button className="nav-item" data-install hidden={!install.show} onClick={install.run}><Icon name="phone"/><span>{t("nav.install")}</span></button>
          <VolumeButton rail/>
          <ThemeButton rail/>
          <LangButton rail/>
          {profileBtn(true)}
        </div>
      </aside>
      <header className="topbar">
        {brand(false)}
        <button className="icon-btn" data-install hidden={!install.show} aria-label={t("nav.install")} onClick={install.run}><Icon name="phone"/></button>
        <LangButton/>
        <VolumeButton/>
        <ThemeButton/>
        {helpable && <button className="icon-btn" data-help-btn data-tip-key={helpKey} aria-label={t(helpKey)} onClick={() => openDialog("help", {page: view})}><Icon name="help"/></button>}
        {profileBtn(false)}
      </header>
      <main id="main">
        {view === "home" && <Home/>}
        {view === "medley" && <Repertoire/>}
        {view === "study" && <Study/>}
        {view === "group" && <Group/>}
        {view === "tools" && <Tools/>}
        {view === "more" && <More/>}
        {view === "profile" && <Profile/>}
        {view === "people" && <PeoplePage/>}
      </main>
      <button className="help-fab" id="help-fab" hidden={!helpable} data-tip-key={helpKey} data-tip-side="left" aria-label={t(helpKey)} onClick={() => openDialog("help", {page: view})}><Icon name="question"/></button>
      <nav className="tabbar" ref={tabbar} aria-label={t("nav.nav")}>
        {NAV.map(n => <button key={n.id} className="tab" data-nav={n.id} aria-current={current(n.id)} onClick={n.run}>
          <span className="pill"><Icon name={n.icon}/></span><span>{t(n.label)}</span></button>)}
      </nav>
    </div>
    {stageOpen && <Stage/>}
    <Dialogs/>
    <LangPop/>
    <VolumePop/>
    <Toasts/>
  </>;
}
