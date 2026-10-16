// Tooltips no visual do app: ao passar o mouse (com atraso) ou ao focar pelo teclado.
// Usa data-tip-key (texto traduzido), data-tip, ou o aria-label/title de botões só com ícone.
// Funciona por delegação no documento, então vale para tudo o que o React desenhar.
import { t } from "../lib/i18n";

// Escolhe o lado da dica pela posição do elemento: em cima, embaixo, à esquerda ou à direita,
// o que couber inteiro na tela com o menor deslocamento (empate fica com a ordem da lista).
export function placeTip(r: DOMRect, w: number, h: number, vw: number, vh: number, gap = 8, m = 8){
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const sides = [
    {side: "top", x: cx - w / 2, y: r.top - h - gap, fits: r.top - h - gap >= m},
    {side: "bottom", x: cx - w / 2, y: r.bottom + gap, fits: r.bottom + gap + h <= vh - m},
    {side: "left", x: r.left - w - gap, y: cy - h / 2, fits: r.left - w - gap >= m},
    {side: "right", x: r.right + gap, y: cy - h / 2, fits: r.right + gap + w <= vw - m}
  ];
  let best: {side: string; x: number; y: number; score: number} | null = null;
  sides.forEach((s, i) => {
    if(!s.fits) return;
    const x = Math.max(m, Math.min(s.x, vw - w - m)), y = Math.max(m, Math.min(s.y, vh - h - m));
    const score = Math.abs(x - s.x) + Math.abs(y - s.y) + i * 6;
    if(!best || score < best.score) best = {side: s.side, x, y, score};
  });
  const b = best as {side: string; x: number; y: number} | null
    || {side: "bottom", x: Math.max(m, Math.min(cx - w / 2, vw - w - m)), y: Math.min(r.bottom + gap, vh - h - m)};
  return {side: b.side, x: Math.round(b.x), y: Math.round(b.y)};
}

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
    tip.style.left = "0px"; tip.style.top = "0px"; tip.style.width = "";
    if(!tip.matches(":popover-open")) tip.showPopover();
    // Mede no canto e trava a largura: reposicionada perto da borda, a dica não quebra a linha.
    const box = tip.getBoundingClientRect(), w = Math.ceil(box.width), h = Math.ceil(box.height);
    tip.style.width = w + "px";
    const r = el.getBoundingClientRect();
    const p = placeTip(r, w, h, document.documentElement.clientWidth, document.documentElement.clientHeight);
    tip.dataset.side = p.side;
    tip.style.left = p.x + "px"; tip.style.top = p.y + "px";
    // A setinha mira o centro do elemento a partir de onde a dica de fato ficou (descontando a borda),
    // para zoom, barra de rolagem ou arredondamento não a desalinharem.
    const at = tip.getBoundingClientRect(), bw = tip.clientLeft;
    const vertical = p.side === "top" || p.side === "bottom";
    const arrow = vertical ? r.left + r.width / 2 - at.left - bw : r.top + r.height / 2 - at.top - bw;
    const max = (vertical ? at.width : at.height) - 2 * bw - 10;
    tip.style.setProperty("--arrow", Math.max(10, Math.min(arrow, max)) + "px");
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
