// Detalhes de um evento (tocar numa linha de Agenda → Anteriores): o mesmo card da Agenda, com a escala, a resposta
// e as ações, numa janela. Se o evento sumiu (apagado aqui ou por outro aparelho), a janela fecha sozinha.
import { useEffect } from "react";
import { t } from "../lib/i18n";
import { useGroups, amGroupAdmin } from "../lib/groups";
import { closeDialog, type DialogProps } from "../state";
import { Dialog, DialogHead } from "../ui/Dialog";
import { EventCard } from "../views/Group";

export function EventDetailDialog({id}: DialogProps["eventDetail"]){
  const e = useGroups(s => s.events.find(x => x.id === id));
  useEffect(() => { if(!e) closeDialog("eventDetail"); }, [e]);
  if(!e) return null;
  return <Dialog name="eventDetail" id="dlg-event-detail" className="event-detail-dlg" labelledBy="event-detail-h">
    <form method="dialog" className="dlg">
      <DialogHead id="event-detail-h" title={t("group.details")} closeLabel={t("common.close")}/>
      <div className="dlg-body"><ul className="events"><EventCard e={e} canEdit={amGroupAdmin()}/></ul></div>
      <div className="dlg-foot"><button className="btn primary" value="cancel">{t("common.close")}</button></div>
    </form>
  </Dialog>;
}
