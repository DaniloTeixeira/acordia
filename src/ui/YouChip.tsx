// Chip "Você" ao lado do nome da própria pessoa, igual em todas as telas. O tamanho fica em .chip.you no app.scss.
import { t } from "../lib/i18n";

export function YouChip(){
  return <span className="chip current you">{t("people.you")}</span>;
}
