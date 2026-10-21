// Janela modal nativa (<dialog>). Abre ao montar; os botões com value= fecham com esse valor
// (form method="dialog"). Com alterações não salvas (dirty), Cancelar, o X, Esc, o voltar e clicar fora
// perguntam antes de descartar (requestClose em state.ts); sem alterações fecham direto.
import { useEffect, useRef, type ReactNode } from "react";
import { closeDialog, dialogUnsaved, requestClose, watchDialog, type DialogName } from "../state";

export function Dialog({name, id, className, labelledBy, onClose, dirty, children, onOpen}: {
  name: DialogName; id: string; className?: string; labelledBy: string;
  onClose?: (returnValue: string) => void; dirty?: () => boolean; onOpen?: (d: HTMLDialogElement) => void; children: ReactNode;
}){
  const ref = useRef<HTMLDialogElement>(null);
  const cb = useRef({onClose, dirty}); cb.current = {onClose, dirty};
  useEffect(() => {
    const d = ref.current!;
    d.returnValue = "";
    watchDialog(d, () => !!cb.current.dirty?.());
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
      requestClose(d);
    };
    // Cancelar e o X enviam o formulário com value="cancel": com alterações, trocados pela pergunta.
    const cancelBtn = (e: MouseEvent) => {
      const b = (e.target as Element).closest?.("button[value=cancel]");
      if(b && d.contains(b) && !b.hasAttribute("disabled") && dialogUnsaved(d)){ e.preventDefault(); requestClose(d); }
    };
    // Esc
    const esc = (e: Event) => { if(dialogUnsaved(d)){ e.preventDefault(); requestClose(d); } };
    const close = () => { cb.current.onClose?.(d.returnValue); closeDialog(name); };
    d.addEventListener("pointerdown", down); d.addEventListener("click", click); d.addEventListener("click", cancelBtn, true);
    d.addEventListener("cancel", esc); d.addEventListener("close", close);
    return () => { d.removeEventListener("pointerdown", down); d.removeEventListener("click", click); d.removeEventListener("click", cancelBtn, true); d.removeEventListener("cancel", esc); d.removeEventListener("close", close); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <dialog ref={ref} id={id} className={className} aria-labelledby={labelledBy}>{children}</dialog>;
}

// Cabeçalho padrão com título e botão de fechar.
export function DialogHead({id, title, closeLabel}: {id: string; title: ReactNode; closeLabel: string}){
  return <div className="dlg-head"><h2 id={id}>{title}</h2>
    <button className="icon-btn" value="cancel" aria-label={closeLabel}><svg className="i"><use href="#i-x"/></svg></button></div>;
}
