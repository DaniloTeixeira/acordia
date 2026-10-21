// Aviso de falha ao abrir o microfone (afinador e aba Voz): diz o motivo e oferece "Tentar de novo".
import { micErrorKind } from "../lib/tuner";
import { t } from "../lib/i18n";
import { toast } from "../state";

const KEY = {denied: "tuner.denied", nomic: "tuner.noMic", busy: "tuner.busy", unsupported: "tuner.unsupported"} as const;
// No app instalado a permissão não aparece em "Permissões do app" (só notificações): fica nas configurações do site no Chrome.
const installed = () => matchMedia("(display-mode: standalone)").matches;
export function micFailed(e: unknown, retry?: () => void){
  const kind = micErrorKind(e);
  toast(t(kind === "denied" && installed() ? "tuner.deniedApp" : KEY[kind]), retry ? {label: t("common.retry"), run: retry} : undefined);
}
