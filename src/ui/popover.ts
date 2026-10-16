// Posicionamento de popovers nativos junto do botão que os abriu.

// Abre/fecha sem reabrir quando o clique no próprio botão já o fechou (o "light dismiss" fecha no
// pointerdown, antes do click).
export function toggler(pop: () => HTMLElement | null, open: (btn: HTMLElement) => void){
  let wasOpen = false, owner: HTMLElement | null = null;
  return {
    onPointerDown(e: {currentTarget: HTMLElement}){ const p = pop(); wasOpen = !!p && p.matches(":popover-open") && owner === e.currentTarget; },
    onClick(e: {currentTarget: HTMLElement; preventDefault(): void}){
      e.preventDefault();
      const p = pop(); if(!p) return;
      const btn = e.currentTarget;
      if(wasOpen || (p.matches(":popover-open") && owner === btn)){ wasOpen = false; if(p.matches(":popover-open")) p.hidePopover(); return; }
      owner = btn; open(btn);
    }
  };
}

// Abaixo do botão, ou acima quando não cabe.
export function openNear(pop: HTMLElement, btn: HTMLElement, w: number){
  const r = btn.getBoundingClientRect();
  pop.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + "px";
  pop.style.top = "0px"; if(!pop.matches(":popover-open")) pop.showPopover();
  const h = pop.offsetHeight;
  pop.style.top = (r.bottom + 8 + h > innerHeight ? Math.max(12, r.top - h - 8) : r.bottom + 8) + "px";
}

// Lista suspensa: largura mínima do botão; abre para baixo se couber (ou se houver mais espaço
// embaixo), senão para cima. Sempre dentro da tela.
export function placeNear(pop: HTMLElement, btn: HTMLElement, minW = 0){
  const r = btn.getBoundingClientRect(), w = Math.max(minW, r.width);
  pop.style.minWidth = w + "px";
  pop.style.left = "0px"; pop.style.top = "0px"; pop.style.maxHeight = "none";
  if(!pop.matches(":popover-open")) pop.showPopover();
  const pw = pop.offsetWidth, natural = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pw - 8)) + "px";
  const below = innerHeight - r.bottom - 14, above = r.top - 14;
  const down = natural <= below || below >= above;
  pop.style.maxHeight = Math.max(120, Math.min(360, down ? below : above)) + "px";
  const h = pop.offsetHeight;
  pop.style.top = Math.max(8, down ? r.bottom + 6 : r.top - h - 6) + "px";
}
