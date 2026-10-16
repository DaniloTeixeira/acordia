// Avisos curtos no canto da tela, com ação opcional (Desfazer, Ver...).
import { useUI, closeToast } from "../state";
import { t } from "../lib/i18n";

export function Toasts(){
  const toasts = useUI(s => s.toasts);
  return <div className="toasts" id="toasts" role="status" aria-live="polite">
    {toasts.map(x => <div key={x.id} className={"toast" + (x.out ? " out" : "")}>
      <span>{x.msg}</span>
      {x.action && <button onClick={() => { x.action!.run(); closeToast(x.id); }}>{x.action.label}</button>}
      {x.sticky && <button className="toast-x" aria-label={t("common.close")} onClick={() => closeToast(x.id)}>×</button>}
    </div>)}
  </div>;
}
