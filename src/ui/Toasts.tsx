// Avisos curtos no canto da tela, com ação opcional (Desfazer, Ver...).
// Os avisos ficam num popover: assim sobem para a camada de cima e aparecem na frente de uma janela aberta
// (as janelas são <dialog> modais, que ficam acima de qualquer z-index).
import { useEffect, useRef } from "react";
import { useUI, closeToast } from "../state";
import { t } from "../lib/i18n";

export function Toasts(){
  const toasts = useUI(s => s.toasts), ref = useRef<HTMLDivElement>(null), last = useRef(0);
  useEffect(() => {
    const el = ref.current; if(!el || !("showPopover" in el)) return;
    const newest = toasts.length ? toasts[toasts.length - 1].id : 0;
    if(!toasts.length){ if(el.matches(":popover-open")) el.hidePopover(); }
    // Aviso novo com uma janela aberta depois do último: mostra de novo para passar à frente dela.
    else if(!el.matches(":popover-open")) el.showPopover();
    else if(newest !== last.current && document.querySelector("dialog[open]")){ el.hidePopover(); el.showPopover(); }
    last.current = newest;
  }, [toasts]);
  return <div className="toasts" id="toasts" role="status" aria-live="polite" popover="manual" ref={ref}>
    {toasts.map(x => <div key={x.id} className={"toast" + (x.out ? " out" : "")}>
      <span>{x.msg}</span>
      {x.action && <button className="btn primary sm" onClick={() => { x.action!.run(); closeToast(x.id); }}>{x.action.label}</button>}
      {x.sticky && <button className="toast-x" aria-label={t("common.close")} onClick={() => closeToast(x.id)}>×</button>}
    </div>)}
  </div>;
}
