// Tooltips no visual do app: ao passar o mouse (com atraso) ou ao focar pelo teclado.
// Usa data-tip-key (texto traduzido), data-tip, ou o aria-label/title de botões só com ícone.
// Funciona por delegação no documento, então vale para tudo o que o React desenhar.
import { t } from "../lib/i18n";

export function initTooltips(){
  if(!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const tip = document.createElement("div");
  tip.className = "tooltip"; tip.id = "tooltip"; tip.setAttribute("role", "tooltip"); tip.popover = "manual";
  document.body.appendChild(tip);
  let timer: ReturnType<typeof setTimeout> | undefined, target: HTMLElement | null = null;
  const SEL = "[data-tip-key],[data-tip],[title],.icon-btn[aria-label]";
  const textOf = (el: HTMLElement) => {
    if(el.title){ el.dataset.tip = el.title; el.removeAttribute("title"); }
    if(el.dataset.tipKey) return t(el.dataset.tipKey);
    if(el.dataset.tip) return el.dataset.tip;
    return el.getAttribute("aria-label") || "";
  };
  const hide = () => { clearTimeout(timer); if(target){ target.removeAttribute("aria-describedby"); target = null; } if(tip.matches(":popover-open")) tip.hidePopover(); };
  const show = (el: HTMLElement) => {
    const txt = textOf(el); if(!txt || !el.isConnected) return;
    tip.textContent = txt; target = el; el.setAttribute("aria-describedby", "tooltip");
    tip.style.left = "0px"; tip.style.top = "0px";
    if(!tip.matches(":popover-open")) tip.showPopover();
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    let top = r.top - h - 8; if(top < 8) top = r.bottom + 8;
    tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + "px";
    tip.style.top = top + "px";
  };
  const find = (e: Event) => { const el = e.target as Element | null; return el && el.closest ? el.closest<HTMLElement>(SEL) : null; };
  document.addEventListener("mouseover", e => {
    const el = find(e);
    if(el === target) return;
    hide(); if(!el) return;
    textOf(el);
    timer = setTimeout(() => show(el), 450);
  });
  document.addEventListener("mouseout", e => { if(target && !target.contains(e.relatedTarget as Node)) hide(); else if(!target) clearTimeout(timer); });
  document.addEventListener("focusin", e => { const el = find(e); if(el && el.matches(":focus-visible")){ hide(); show(el); } });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide, true);
  document.addEventListener("keydown", e => { if(e.key === "Escape") hide(); });
  addEventListener("scroll", hide, true);
}
