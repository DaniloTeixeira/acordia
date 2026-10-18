// Arrastar para reordenar uma lista: pega em qualquer parte do item, menos em botões e campos.
// Mouse: clicou e arrastou, move; só clicou, o clique segue normal (abre e fecha). Toque: segurar ~¼ s começa
// o arraste (deslizar direto continua rolando a página). A alça [data-drag] (o número) arrasta na hora.
// Perto da borda da tela a página rola sozinha; Esc cancela. Os outros itens abrem espaço deslizando e a
// lista só muda (e salva) uma vez, ao soltar.
import { useEffect, type RefObject } from "react";

const EDGE = 80, SPEED = 14, SLOP = 4, HOLD = 250;
// Onde o arraste não começa: controles que têm a própria ação (a alça e o abrir/fechar do título continuam valendo).
const SKIP = "button:not([data-drag]):not(.item-toggle),a,input,textarea,select,label,[contenteditable],[role=listbox]";

export function useDragSort(ref: RefObject<HTMLElement | null>, onMove: (from: number, to: number) => void){
  useEffect(() => {
    const list = ref.current; if(!list) return;
    let stop: (() => void) | null = null;
    const down = (e: PointerEvent) => {
      if(e.button !== 0 || stop) return;
      const target = e.target as Element;
      const li = target.closest<HTMLElement>(".item");
      if(!li || li.parentElement !== list || target.closest(SKIP)) return;
      const items = [...list.querySelectorAll<HTMLElement>(":scope > .item")];
      if(items.length < 2) return;
      const handle = !!target.closest("[data-drag]"), touch = e.pointerType !== "mouse" && !handle;
      if(handle) e.preventDefault();
      const from = items.indexOf(li), startY = e.clientY, startX = e.clientX;
      let rects: DOMRect[] = [], size = 0, startScroll = scrollY;
      let active = false, to = from, lastY = e.clientY, raf = 0, hold: ReturnType<typeof setTimeout> | undefined;

      const place = () => {
        const dy = lastY - startY + (scrollY - startScroll);
        li.style.transform = `translateY(${dy}px)`;
        const center = rects[from].top + rects[from].height / 2 + dy;
        to = from;
        rects.forEach((r, k) => {
          const mid = r.top + r.height / 2;
          if(k < from && center < mid) to = Math.min(to, k);
          if(k > from && center > mid) to = Math.max(to, k);
        });
        items.forEach((el, k) => {
          if(k === from) return;
          const shift = from < to && k > from && k <= to ? -size : from > to && k < from && k >= to ? size : 0;
          el.style.transform = shift ? `translateY(${shift}px)` : "";
        });
      };
      // Perto do topo ou do pé da tela, rola a página e continua posicionando.
      const tick = () => {
        const v = lastY < EDGE ? -SPEED * (1 - lastY / EDGE) : lastY > innerHeight - EDGE ? SPEED * (1 - (innerHeight - lastY) / EDGE) : 0;
        if(v){ scrollBy(0, v); place(); }
        raf = requestAnimationFrame(tick);
      };
      const start = () => {
        active = true;
        // Posições no começo do arraste; a rolagem da página entra no deslocamento.
        rects = items.map(el => el.getBoundingClientRect()); startScroll = scrollY;
        size = rects[from].height + (rects[1].top - rects[0].bottom);
        getSelection()?.removeAllRanges();
        li.style.transition = "none"; li.classList.add("dragging"); list.classList.add("sorting");
        if(touch) navigator.vibrate?.(10);
        raf = requestAnimationFrame(tick);
        place();
      };
      const move = (ev: PointerEvent) => {
        if(ev.pointerId !== e.pointerId) return;
        lastY = ev.clientY;
        if(active){ place(); return; }
        const far = Math.hypot(ev.clientX - startX, ev.clientY - startY) > SLOP;
        // No toque, mexer antes de segurar o tempo é rolagem: desiste e deixa a página rolar.
        if(touch){ if(far) finish(true); return; }
        if(far) start();
      };
      // Com o arraste ativo no toque, o dedo não rola a página.
      const touchMove = (ev: TouchEvent) => { if(active) ev.preventDefault(); };
      // O clique que vem ao soltar depois de arrastar não abre/fecha o cartão.
      const swallow = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); };
      const noMenu = (ev: Event) => ev.preventDefault();
      const finish = (cancel: boolean) => {
        clearTimeout(hold); cancelAnimationFrame(raf);
        removeEventListener("pointermove", move, true);
        removeEventListener("pointerup", up, true);
        removeEventListener("pointercancel", cancelIt, true);
        removeEventListener("keydown", key, true);
        removeEventListener("touchmove", touchMove);
        li.removeEventListener("contextmenu", noMenu);
        stop = null;
        if(!active) return;
        addEventListener("click", swallow, {capture: true, once: true});
        setTimeout(() => removeEventListener("click", swallow, true), 0);
        // Sem animação na volta: a lista já muda de ordem no mesmo quadro, então nada pula.
        items.forEach(el => { el.style.transition = "none"; el.style.transform = ""; });
        li.classList.remove("dragging"); list.classList.remove("sorting");
        if(!cancel && to !== from) onMove(from, to);
        void list.offsetHeight;
        requestAnimationFrame(() => items.forEach(el => { el.style.transition = ""; }));
        if(!cancel && to !== from){ li.classList.remove("moved"); void li.offsetWidth; li.classList.add("moved"); }
      };
      const up = (ev: PointerEvent) => { if(ev.pointerId === e.pointerId) finish(false); };
      const cancelIt = (ev: PointerEvent) => { if(ev.pointerId === e.pointerId) finish(true); };
      const key = (ev: KeyboardEvent) => { if(ev.key === "Escape" && active){ ev.preventDefault(); finish(true); } };
      addEventListener("pointermove", move, true);
      addEventListener("pointerup", up, true);
      addEventListener("pointercancel", cancelIt, true);
      addEventListener("keydown", key, true);
      addEventListener("touchmove", touchMove, {passive: false});
      if(touch){ li.addEventListener("contextmenu", noMenu); hold = setTimeout(start, HOLD); }
      stop = () => finish(true);
    };
    list.addEventListener("pointerdown", down);
    return () => { list.removeEventListener("pointerdown", down); stop?.(); };
  }, [ref, onMove]);
}
