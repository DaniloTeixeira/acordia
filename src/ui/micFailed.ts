// Aviso de falha ao abrir o microfone (afinador e aba Voz): diz o motivo e oferece "Tentar de novo".
import { micErrorKind } from "../lib/tuner";
import { t } from "../lib/i18n";
import { toast } from "../state";

const KEY = {denied: "tuner.denied", nomic: "tuner.noMic", busy: "tuner.busy", unsupported: "tuner.unsupported"} as const;
export function micFailed(e: unknown, retry?: () => void){
  toast(t(KEY[micErrorKind(e)]), retry ? {label: t("common.retry"), run: retry} : undefined);
}
