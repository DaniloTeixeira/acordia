// Tema claro/escuro: sem escolha salva, segue o aparelho; o botão alterna entre claro e escuro.
// Fica fora do App para o Palco (que cobre a tela e esconde o menu) também ter o botão.
import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import * as store from "../lib/store";
import { animate } from "../state";
import { Icon } from "./Icon";

const { data } = store;
type Theme = "system" | "light" | "dark";
const DARK_MQ = "(prefers-color-scheme: dark)";
export const theme = (): Theme => (["light", "dark"] as const).find(v => v === data.settings.theme) || "system";
export const shownTheme = (): "light" | "dark" => { const th = theme(); return th !== "system" ? th : matchMedia(DARK_MQ).matches ? "dark" : "light"; };
export function applyTheme(th: Theme){
  if(th === "light" || th === "dark") document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme;
  try{ localStorage.setItem("acordia-theme", th); }catch(e){ /* sem armazenamento */ }
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(m => { const dark = th === "dark" || (th === "system" && m.media.includes("dark")); m.content = dark ? "#0B0F1C" : "#F5F7FC"; });
}
export function toggleTheme(){
  const th = shownTheme() === "dark" ? "light" : "dark";
  store.setSetting("theme", th);
  animate(() => applyTheme(th), "theme");
}
export function ThemeButton({rail}: {rail?: boolean}){
  // Enquanto segue o aparelho, o ícone acompanha se o tema do sistema mudar com o app aberto.
  const [, redraw] = useState(0);
  useEffect(() => { const mq = matchMedia(DARK_MQ), f = () => redraw(n => n + 1); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  const th = shownTheme(), name = t("theme." + th);
  return <button className={rail ? "nav-item" : "icon-btn"} data-theme-toggle aria-label={t("theme.aria", {name})} onClick={toggleTheme}>
    <Icon name={th === "dark" ? "moon" : "sun"}/>{rail && <span>{t("theme.label", {name})}</span>}</button>;
}

