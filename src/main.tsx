// Início do app: carrega os dados, aplica idioma/tema/volume, desenha e liga o modo offline.
import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import "./styles/app.scss";
import * as store from "./lib/store";
import { setLang, detectLang, t, getLang } from "./lib/i18n";
import { decodeMedley } from "./lib/share";
import { setTimbre } from "./lib/audio";
import { clearMeasureCache } from "./lib/util";
import { useUI, toast, openDialog, VIEWS, viewFromHash, viewUrl, type View } from "./state";
import { current } from "./repertoire";
import { initMetro } from "./metro";
import { initTooltips } from "./ui/tooltips";
import { App, applyTheme, applyVolume, theme } from "./App";

await store.init(() => toast(t("lib.saveFail")));
setLang((store.data.settings.lang as string) || detectLang());
const m = current();
// Com uma música só, ou com alguma ainda vazia, os itens já abrem para editar.
if(m.items.length === 1 || m.items.some(i => i.type !== "medley" && !(store.data.songs.get(i.songId) || {text: ""}).text.trim()))
  useUI.setState({expanded: new Set(m.items.map(i => i.id))});
// A página do endereço vence a última aberta; o endereço passa a mostrar a página aberta.
const saved = store.data.settings.view as View;
const view = viewFromHash() ?? (VIEWS.includes(saved) ? saved : "medley");
useUI.setState({lang: getLang(), view});
if(!/^#m=/.test(location.hash)) history.replaceState(null, "", viewUrl(view));
applyTheme(theme());
applyVolume();
// Um timbre salvo que não existe mais (ex.: o antigo "Teclado") volta ao Piano.
setTimbre((store.data.settings.timbre as string) || "piano");
initMetro();

// Para testes: ?debug expõe os dados.
if(new URLSearchParams(location.search).has("debug")) Object.assign(window, {__store: store});

createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
initTooltips();
document.documentElement.classList.add("ready");

// As fontes da folha precisam estar carregadas para medir o texto certo.
Promise.all(["700 10px AHMono","400 10px AHMono","400 10px AHSans","700 10px AHSans","400 10px Lexend","700 10px Lexend"].map(f => document.fonts.load(f).catch(()=>null)))
  .then(() => { clearMeasureCache(); store.touch(); });
addEventListener("pagehide", () => store.flush());

// ---------- repertório recebido por link (#m=...) ----------
async function checkIncoming(){
  const mt = /^#m=(.+)$/.exec(location.hash); if(!mt) return;
  const med = await decodeMedley(mt[1]);
  history.replaceState(null, "", viewUrl(useUI.getState().view));
  if(!med) return toast(t("incoming.bad"));
  openDialog("incoming", {med});
}
checkIncoming();
addEventListener("hashchange", checkIncoming);

// ---------- modo offline e atualizações ----------
// Avisa quando uma versão nova assumir; procura versão nova a cada 30 minutos e ao voltar para o app
// (esta só se a última procura foi há mais de 5 minutos, para não repetir a cada troca de aba).
if("serviceWorker" in navigator && import.meta.env.PROD){
  const had = !!navigator.serviceWorker.controller;
  let shown = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if(!had || shown) return; shown = true;
    toast(t("update.ready"), {label: t("update.reload"), run: () => location.reload()}, {sticky: true});
  });
  const register = () => navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").then(reg => {
    let last = Date.now();
    const check = () => { last = Date.now(); reg.update().catch(()=>{}); };
    document.addEventListener("visibilitychange", () => { if(!document.hidden && Date.now() - last > 5 * 60 * 1000) check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(()=>{});
  if(document.readyState === "complete") register(); else addEventListener("load", register);
}
