// Botão "⋯" que abre uma lista de ações em popover (ícone + texto em cada uma, sem depender de tooltip).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { placeNear, toggler } from "./popover";

export interface MenuItem { icon: string; label: string; onClick: () => void; danger?: boolean; sep?: boolean }

export function Menu({items, aria, className = ""}: {items: MenuItem[]; aria: string; className?: string}){
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), byItem = useRef(false);
  // Dentro de uma janela modal a lista vai para dentro dela (fora, a janela deixa tudo inerte).
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setHost(btn.current?.closest("dialog") || document.body); }, []);
  const show = () => {
    const p = pop.current, b = btn.current; if(!p || !b) return;
    setOpen(true);
    placeNear(p, b, 200);
    p.querySelector<HTMLElement>(".menu-item")?.focus({preventScroll: true});
  };
  useEffect(() => {
    const p = pop.current; if(!p) return;
    const onToggle = (e: Event) => {
      if((e as ToggleEvent).newState !== "closed") return;
      setOpen(false);
      // Tocar fora só fecha o menu: o clique que vem logo depois não pode chegar ao card de baixo (abriria ele).
      // Escolher um item ou fechar pelo próprio botão já tratam o clique e não entram aqui.
      if(byItem.current){ byItem.current = false; return; }
      const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); document.removeEventListener("click", stop, true); };
      document.addEventListener("click", stop, true);
      setTimeout(() => document.removeEventListener("click", stop, true), 400);
    };
    p.addEventListener("toggle", onToggle); return () => p.removeEventListener("toggle", onToggle);
  }, [host]);
  // Rolar a tela fecha o menu.
  useEffect(() => {
    if(!open) return;
    const onScroll = (e: Event) => { const p = pop.current; if(p && !(e.target instanceof Node && p.contains(e.target))) p.hidePopover(); };
    document.addEventListener("scroll", onScroll, {capture: true, passive: true});
    return () => document.removeEventListener("scroll", onScroll, {capture: true});
  }, [open]);
  const [tg] = useState(() => toggler(() => pop.current, show));
  const run = (it: MenuItem) => { byItem.current = true; pop.current?.hidePopover(); it.onClick(); };
  const onKey = (e: React.KeyboardEvent) => {
    const list = [...pop.current!.querySelectorAll<HTMLElement>(".menu-item")], i = list.indexOf(document.activeElement as HTMLElement);
    if(e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); list[Math.max(0, Math.min(list.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus(); }
    else if(e.key === "Escape"){ e.preventDefault(); pop.current!.hidePopover(); btn.current?.focus(); }
    else if(e.key === "Tab") pop.current!.hidePopover();
  };
  return <>
    <button type="button" ref={btn} className={"icon-btn sm " + className} aria-haspopup="menu" aria-expanded={open} aria-label={aria}
      onPointerDown={tg.onPointerDown} onClick={tg.onClick}><Icon name="more" sm/></button>
    {host && createPortal(<div ref={pop} className="popover menu-pop" popover="auto" role="menu" onKeyDown={onKey}>
      {items.map(it => <button key={it.label} type="button" role="menuitem" className={"menu-item" + (it.danger ? " danger" : "") + (it.sep ? " sep" : "")}
        onClick={() => run(it)}><span className="menu-lbl"><Icon name={it.icon} sm/>{it.label}</span></button>)}
    </div>, host)}
  </>;
}
