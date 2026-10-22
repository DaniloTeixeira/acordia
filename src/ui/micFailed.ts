// Falha ao abrir o microfone (afinador e aba Voz): o balão avisa na hora e o motivo com o que fazer fica fixo na
// tela (<MicHelp/>), com "Tentar de novo", até o microfone funcionar.
import { create } from "zustand";
import { micErrorKind } from "../lib/tuner";
import { t } from "../lib/i18n";
import { toast } from "../state";

const KEY = {denied: "tuner.denied", nomic: "tuner.noMic", busy: "tuner.busy", unsupported: "tuner.unsupported"} as const;
export const useMicIssue = create<{key: string | null; retry?: () => void}>(() => ({key: null}));
export const micOk = () => useMicIssue.setState({key: null, retry: undefined});
// No app instalado a permissão não aparece em "Permissões do app" (só notificações): fica nas configurações do site no Chrome.
const installed = () => matchMedia("(display-mode: standalone)").matches;
// Estado do microfone para este site. Se o site nunca foi bloqueado ("prompt") e mesmo assim negou, quem bloqueia é
// o Android (Chrome sem permissão de microfone no sistema), e ligar o site não adianta.
async function micState(){
  try{ return (await navigator.permissions.query({name: "microphone" as PermissionName})).state; }
  catch{ return null; }
}
export async function micFailed(e: unknown, retry?: () => void){
  const kind = micErrorKind(e);
  let key: string = KEY[kind];
  if(kind === "denied"){
    const s = await micState();
    key = s === "prompt" ? "tuner.deniedOs" : installed() ? "tuner.deniedApp" : KEY.denied;
  }
  useMicIssue.setState({key, retry});
  toast(t("tuner.failed"));
}
