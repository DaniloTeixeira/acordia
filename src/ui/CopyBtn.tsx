// Botão de copiar um texto (e-mail, celular) para a área de transferência, ao lado de um link que liga ou envia e-mail.
// Depois de copiar, o ícone vira ✓ por um instante: no celular o aviso fica longe do botão.
import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { toast } from "../state";
import { Icon } from "./Icon";

export function CopyBtn({text, kind}: {text: string; kind: "email" | "phone"}){
  const K = kind === "email" ? "Email" : "Phone";
  const [done, setDone] = useState(false), timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    try{
      await navigator.clipboard.writeText(text); toast(t("common.copied" + K));
      setDone(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setDone(false), 1500);
    }
    catch{ toast(t("sheet.copyFail")); }
  };
  return <button type="button" className={"icon-btn sm copy-btn" + (done ? " done" : "")} aria-label={t(done ? "common.copied" + K : "common.copy" + K)} data-tip-side="right" onClick={copy}><Icon name={done ? "check" : "copy"} sm/></button>;
}
