// Aviso fixo de que o microfone não abriu: diz o motivo, o que fazer e deixa "Tentar de novo" à mão.
// Some quando o microfone passa a funcionar (micOk) ou ao sair da tela.
import { useEffect } from "react";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";
import { micOk, useMicIssue } from "./micFailed";

export function MicHelp(){
  const {key, retry} = useMicIssue();
  useEffect(() => micOk, []);
  if(!key) return null;
  return <div className="mic-help" role="alert">
    <p><Icon name="sound" sm/> {t(key)}</p>
    {retry && <button className="btn soft sm" onClick={() => { micOk(); retry(); }}>{t("common.retry")}</button>}
  </div>;
}
