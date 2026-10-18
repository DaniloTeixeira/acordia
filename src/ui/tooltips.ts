// Tooltips no visual do app: ao passar o mouse (com atraso), ao focar pelo teclado ou segurando o dedo.
// Usa data-tip-key (texto traduzido), data-tip, ou o aria-label/title de botões só com ícone.
// Funciona por delegação no documento, então vale para tudo o que o React desenhar.
import { t } from "../lib/i18n";

// Escolhe o lado da dica pela posição do elemento: em cima, embaixo, à esquerda ou à direita,
// o que couber inteiro na tela com o menor deslocamento (empate fica com a ordem da lista). Com `prefer`
// (data-tip-side no elemento), esse lado vence sempre que couber.
export function placeTip(r: DOMRect, w: number, h: number, vw: number, vh: number, gap = 8, m = 8, prefer = ""){
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
    const score = s.side === prefer ? -1 : Math.abs(x - s.x) + Math.abs(y - s.y) + i * 6;
    if(!best || score < best.score) best = {side: s.side, x, y, score};
  });
  const b = best as {side: string; x: number; y: number} | null
    || {side: "bottom", x: Math.max(m, Math.min(cx - w / 2, vw - w - m)), y: Math.min(r.bottom + gap, vh - h - m)};
  return {side: b.side, x: Math.round(b.x), y: Math.round(b.y)};
}

export function initTooltips(){
  const tip = document.createElement("div");
  tip.className = "tooltip"; tip.id = "tooltip"; tip.setAttribute("role", "tooltip"); tip.popover = "manual";
  document.body.appendChild(tip);
  let timer: ReturnType<typeof setTimeout> | undefined, target: HTMLElement | null = null;
  // No touch os eventos de mouse são emulados depois do toque; enquanto o último ponteiro foi um dedo,
  // eles são ignorados e a dica só aparece segurando o dedo no elemento.
  let touch = false, press: {x: number; y: number} | null = null, swallow = false;
  const SEL = "[data-tip-key],[data-tip],[title],.icon-btn[aria-label]";
  const textOf = (el: HTMLElement) => {
    if(el.title){ el.dataset.tip = el.title; el.removeAttribute("title"); }
    // No touch, a chave com ".touch" (quando existe) troca mouse e teclado por toque no texto.
    if(el.dataset.tipKey){ const k = el.dataset.tipKey + ".touch", s = touch ? t(k) : k; return s !== k ? s : t(el.dataset.tipKey); }
    if(el.dataset.tip) return el.dataset.tip;
    return el.getAttribute("aria-label") || "";
  };
  const hide = () => { clearTimeout(timer); if(target){ target.removeAttribute("aria-describedby"); target = null; } if(tip.matches(":popover-open")) tip.hidePopover(); };
  const show = (el: HTMLElement) => {
    // Pode ter ficado desabilitado durante o atraso (ex.: a seta que chegou na ponta da lista).
    const txt = textOf(el); if(!txt || !el.isConnected || inactive(el)) return;
    tip.textContent = txt; target = el; el.setAttribute("aria-describedby", "tooltip");
    tip.style.left = "0px"; tip.style.top = "0px"; tip.style.width = "";
    if(!tip.matches(":popover-open")) tip.showPopover();
    // Mede no canto e trava a largura: reposicionada perto da borda, a dica não quebra a linha.
    const box = tip.getBoundingClientRect(), w = Math.ceil(box.width), h = Math.ceil(box.height);
    tip.style.width = w + "px";
    const r = el.getBoundingClientRect();
    const p = placeTip(r, w, h, document.documentElement.clientWidth, document.documentElement.clientHeight, 8, 8, el.dataset.tipSide || "");
    tip.dataset.side = p.side;
    tip.style.left = p.x + "px"; tip.style.top = p.y + "px";
    // A setinha mira o centro do elemento a partir de onde a dica de fato ficou (descontando a borda),
    // para zoom, barra de rolagem ou arredondamento não a desalinharem.
    const at = tip.getBoundingClientRect(), bw = tip.clientLeft;
    const vertical = p.side === "top" || p.side === "bottom";
    const arrow = vertical ? r.left + r.width / 2 - at.left - bw : r.top + r.height / 2 - at.top - bw;
    const max = (vertical ? at.width : at.height) - 2 * bw - 10;
    const a = Math.max(10, Math.min(arrow, max));
    tip.style.setProperty("--arrow", a + "px");
    // Onde a setinha sai, em % da largura: a borda dela pega a cor do gradiente nesse ponto.
    tip.style.setProperty("--arrow-p", String(Math.round((a + bw) / at.width * 100)));
  };
  // Só itens ativos têm dica: desabilitado (ou dentro de um fieldset desabilitado) não mostra nada.
  const inactive = (el: HTMLElement) => el.matches(":disabled,[aria-disabled=true]");
  const find = (e: Event) => {
    const el = e.target as Element | null, hit = el && el.closest ? el.closest<HTMLElement>(SEL) : null;
    return hit && !inactive(hit) ? hit : null;
  };
  document.addEventListener("mouseover", e => {
    if(touch) return;
    const el = find(e);
    if(el === target) return;
    hide(); if(!el) return;
    textOf(el);
    timer = setTimeout(() => show(el), 450);
  });
  document.addEventListener("mouseout", e => { if(touch) return; if(target && !target.contains(e.relatedTarget as Node)) hide(); else if(!target) clearTimeout(timer); });
  document.addEventListener("focusin", e => { const el = find(e); if(el && el.matches(":focus-visible")){ hide(); show(el); } });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide, true);
  // Segurar o dedo (~meio segundo) mostra a dica; o toque normal continua fazendo a ação.
  // A dica some sozinha (mais tempo para texto maior) ou no próximo toque.
  const pressDone = (el: HTMLElement) => {
    press = null; swallow = true; show(el);
    if(target) timer = setTimeout(hide, Math.min(6000, 1800 + tip.textContent!.length * 40));
  };
  document.addEventListener("pointerdown", e => {
    touch = e.pointerType === "touch"; swallow = false; press = null;
    if(!touch) return;
    const el = find(e); if(!el || !textOf(el)) return;
    press = {x: e.clientX, y: e.clientY};
    timer = setTimeout(() => pressDone(el), 450);
  }, true);
  document.addEventListener("pointermove", e => {
    if(e.pointerType !== "touch"){ if(e.pointerType === "mouse") touch = false; return; }
    if(press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10){ press = null; clearTimeout(timer); }
  }, true);
  const release = () => { if(press){ press = null; clearTimeout(timer); } };
  document.addEventListener("pointerup", release, true);
  document.addEventListener("pointercancel", release, true);
  // O clique que vem ao soltar o dedo depois da dica não dispara a ação.
  document.addEventListener("click", e => { if(swallow){ swallow = false; e.preventDefault(); e.stopPropagation(); } }, true);
  // No Android o toque longo abre o menu de contexto; ali ele vira a dica.
  document.addEventListener("contextmenu", e => {
    if(!touch) return;
    if(press){ clearTimeout(timer); const el = find(e); if(el) pressDone(el); }
    if(swallow) e.preventDefault();
  }, true);
  document.addEventListener("keydown", e => { if(e.key === "Escape") hide(); });
  addEventListener("scroll", hide, true);
}
