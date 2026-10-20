// Rótulo de campo de formulário: só o campo obrigatório ganha "obrigatório" ao lado (os outros ficam sem marca);
// quem esquece é avisado embaixo do campo, nunca com o botão desabilitado. O estilo fica só em .field-req.
import { t } from "../lib/i18n";

export function FieldLabel({htmlFor, required, children}: {htmlFor: string; required?: boolean; children: React.ReactNode}){
  return <label htmlFor={htmlFor}>{children}{required && <small className="field-req"> {t("common.required")}</small>}</label>;
}
