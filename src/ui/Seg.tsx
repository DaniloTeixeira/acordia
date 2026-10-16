// Controle segmentado com indicador deslizante (as variáveis --x e --w posicionam o fundo no CSS).
import { useLayoutEffect, useRef, type ReactNode, type CSSProperties } from "react";

export interface SegOption<V extends string> { v: V; label: ReactNode; aria?: string; title?: string; tip?: string; disabled?: boolean }

export function Seg<V extends string>({value, options, onChange, className = "", id, aria, disabled, style}: {
  value: V; options: SegOption<V>[]; onChange?: (v: V) => void; className?: string; id?: string; aria?: string; disabled?: boolean; style?: CSSProperties;
}){
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if(!el) return;
    const paint = () => {
      const b = el.querySelector<HTMLElement>('[aria-pressed="true"]');
      if(!b || !b.offsetWidth) return;
      el.style.setProperty("--x", b.offsetLeft + "px"); el.style.setProperty("--w", b.offsetWidth + "px");
    };
    paint();
    const ro = new ResizeObserver(paint); ro.observe(el);
    // As fontes podem mudar a largura dos botões depois do primeiro desenho.
    document.fonts?.ready.then(paint).catch(() => {});
    return () => ro.disconnect();
  });
  return <div className={"seg" + (className ? " " + className : "")} id={id} role="group" aria-label={aria} ref={ref} style={style}>
    {options.map(o => <button key={o.v} type="button" data-v={o.v} aria-pressed={String(o.v === value) as "true" | "false"} aria-label={o.aria} title={o.title}
      data-tip-key={o.tip} disabled={disabled || o.disabled}
      onClick={e => { e.preventDefault(); onChange?.(o.v); }}>{o.label}</button>)}
  </div>;
}
