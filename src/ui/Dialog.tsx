// Janela modal nativa (<dialog>). Abre ao montar; os botões com value= fecham com esse valor
// (form method="dialog"). Clicar fora fecha como Cancelar, a não ser que haja alterações (dirty): aí a
// janela treme e o rodapé mostra, à esquerda, que há alterações não salvas (some se elas forem desfeitas).
import { useEffect, useRef, type ReactNode } from "react";
import { closeDialog, type DialogName } from "../state";
import { t } from "../lib/i18n";

export function Dialog({name, id, className, labelledBy, onClose, dirty, children, onOpen}: {
  name: DialogName; id: string; className?: string; labelledBy: string;
  onClose?: (returnValue: string) => void; dirty?: () => boolean; onOpen?: (d: HTMLDialogElement) => void; children: ReactNode;
}){
  const ref = useRef<HTMLDialogElement>(null);
  const cb = useRef({onClose, dirty}); cb.current = {onClose, dirty};
  useEffect(() => {
    const d = ref.current!;
    d.returnValue = "";
    if(!d.open) d.showModal();
    onOpen?.(d);
    // Só conta o clique que começou e terminou fora, para não fechar quando alguém seleciona texto
    // e solta o mouse do lado de fora.
    const outside = (e: MouseEvent) => { const r = d.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
    let downOutside = false;
    const down = (e: PointerEvent) => { downOutside = e.target === d && outside(e); };
    const click = (e: MouseEvent) => {
      if(!downOutside || e.target !== d || !outside(e)) return;
      downOutside = false;
      if(cb.current.dirty?.()){
        d.style.setProperty("--unsaved", JSON.stringify(t("dialog.unsaved")));
        d.classList.remove("nudge"); void d.offsetWidth; d.classList.add("nudge", "unsaved"); return;
      }
      d.close("cancel");
    };
    const close = () => { cb.current.onClose?.(d.returnValue); closeDialog(name); };
    d.addEventListener("pointerdown", down); d.addEventListener("click", click); d.addEventListener("close", close);
    return () => { d.removeEventListener("pointerdown", down); d.removeEventListener("click", click); d.removeEventListener("close", close); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A cada mudança no conteúdo: se as alterações foram desfeitas, o aviso do rodapé some.
  useEffect(() => { const d = ref.current; if(d?.classList.contains("unsaved") && !cb.current.dirty?.()) d.classList.remove("unsaved"); });
  return <dialog ref={ref} id={id} className={className} aria-labelledby={labelledBy}>{children}</dialog>;
}

// Cabeçalho padrão com título e botão de fechar.
export function DialogHead({id, title, closeLabel}: {id: string; title: ReactNode; closeLabel: string}){
  return <div className="dlg-head"><h2 id={id}>{title}</h2>
    <button className="icon-btn" value="cancel" aria-label={closeLabel}><svg className="i"><use href="#i-x"/></svg></button></div>;
}
