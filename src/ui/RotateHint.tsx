// Aviso para deitar o celular quando o teclado ou o braço não cabem com ele em pé.
import { Icon } from "./Icon";
import { t } from "../lib/i18n";

export function RotateHint({show, what}: {show: boolean; what: "keyboard" | "neck"}){
  return show ? <p className="rotate-hint"><Icon name="rotate" sm/> {t("rotate." + what)}</p> : null;
}
