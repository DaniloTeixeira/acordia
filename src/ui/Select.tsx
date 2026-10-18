// Lista suspensa no visual do app. O <select> nativo continua na página (escondido) com o valor,
// para leitores de tela e testes; a pessoa usa o botão e a lista em popover.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { placeNear, toggler } from "./popover";

export interface Opt { value: string; label: string }
export interface OptGroup { group: string; options: Opt[] }
export type Options = (Opt | OptGroup)[];
const flat = (o: Options) => o.flatMap(x => "group" in x ? x.options : [x]);

export function Select({value, options, onChange, id, className = "", aria, style, disabled, dataInstrument, f}: {
  value: string; options: Options; onChange: (v: string) => void; id?: string; className?: string; aria?: string;
  style?: CSSProperties; disabled?: boolean; dataInstrument?: boolean; f?: string;
}){
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Dentro de uma janela modal, a lista vai para dentro dela: fora, a janela deixa tudo inerte e a lista
  // aparecia mas não aceitava clique.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setHost(btn.current?.closest("dialog") || document.body); }, []);
  const all = flat(options), cur = all.find(o => o.value === value) || all[0];
  const show = () => {
    const p = pop.current, b = btn.current; if(!p || !b) return;
    setOpen(true);
    placeNear(p, b, 160);
    const sel = p.querySelector<HTMLElement>('[aria-selected="true"]') || p.querySelector<HTMLElement>(".menu-item");
    if(sel){ sel.scrollIntoView({block:"nearest"}); sel.focus({preventScroll:true}); }
  };
  useEffect(() => {
    const p = pop.current; if(!p) return;
    const onToggle = (e: Event) => { if((e as ToggleEvent).newState === "closed") setOpen(false); };
    p.addEventListener("toggle", onToggle); return () => p.removeEventListener("toggle", onToggle);
  }, [host]);
  // Rolar a tela fecha a lista (a rolagem dentro da própria lista não conta).
  useEffect(() => {
    if(!open) return;
    const onScroll = (e: Event) => { const p = pop.current; if(p && !(e.target instanceof Node && p.contains(e.target))) p.hidePopover(); };
    document.addEventListener("scroll", onScroll, {capture: true, passive: true});
    return () => document.removeEventListener("scroll", onScroll, {capture: true});
  }, [open]);
  const [tg] = useState(() => toggler(() => pop.current, show));
  const choose = (v: string) => {
    pop.current?.hidePopover();
    if(v !== value) onChange(v);
    btn.current?.focus();
  };
  const item = (o: Opt) => <button key={o.value} type="button" className="menu-item" role="option" data-value={o.value} aria-selected={o.value === value}
    onClick={() => choose(o.value)}>{o.label}{o.value === value && <Icon name="check" sm/>}</button>;
  const onKey = (e: React.KeyboardEvent) => {
    const items = [...pop.current!.querySelectorAll<HTMLElement>(".menu-item")], i = items.indexOf(document.activeElement as HTMLElement);
    if(e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus(); }
    else if((e.key === "Enter" || e.key === " ") && i >= 0){ e.preventDefault(); items[i].click(); }
    else if(e.key === "Home" || e.key === "End"){ e.preventDefault(); (e.key === "Home" ? items[0] : items[items.length - 1])?.focus(); }
    else if(e.key === "Escape"){ e.preventDefault(); pop.current!.hidePopover(); btn.current?.focus(); }
    else if(e.key === "Tab"){ pop.current!.hidePopover(); }
    else if(e.key.length === 1 && /\S/.test(e.key)){ // vai para o primeiro item que começa com a letra
      const k = e.key.toLowerCase(), start = i + 1;
      items.slice(start).concat(items.slice(0, start)).find(b => (b.textContent || "").trim().toLowerCase().startsWith(k))?.focus();
    }
  };
  return <>
    <select className={"input native-hidden " + className} id={id} value={value} tabIndex={-1} aria-label={aria} disabled={disabled}
      data-instrument={dataInstrument ? "" : undefined} data-f={f} onChange={e => onChange(e.target.value)}>
      {options.map(o => "group" in o
        ? <optgroup key={o.group} label={o.group}>{o.options.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}</optgroup>
        : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <button type="button" ref={btn} className={"input select-btn " + className} aria-haspopup="listbox" aria-expanded={open} aria-label={aria}
      style={style} disabled={disabled} onPointerDown={tg.onPointerDown} onClick={tg.onClick}
      onKeyDown={e => { if(e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); show(); } }}>
      <span className="select-label">{cur ? cur.label : ""}</span><Icon name="chev" sm className="chev-down"/>
    </button>
    {host && createPortal(<div ref={pop} className="popover menu-pop select-pop" popover="auto" role="listbox" onKeyDown={onKey}
>
      {options.map(o => "group" in o
        ? [<div key={"g:" + o.group} className="menu-group" role="presentation">{o.group}</div>, ...o.options.map(item)]
        : item(o))}
    </div>, host)}
  </>;
}
