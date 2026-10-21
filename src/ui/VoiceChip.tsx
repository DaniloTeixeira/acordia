// Chip com a classificação vocal de quem mediu a extensão (Baixo, Barítono, Tenor, Contralto...). Igual em todas as
// telas do grupo; sem as duas pontas medidas não há tipo e nada aparece.
import { t } from "../lib/i18n";
import { rangeType } from "../lib/voice";

export function VoiceChip({voice_low, voice_high}: {voice_low?: number | null; voice_high?: number | null}){
  const type = rangeType({voice_low, voice_high});
  if(!type) return null;
  const name = t("voice.type." + type);
  return <span className="chip voice">{name.charAt(0).toLocaleUpperCase() + name.slice(1)}</span>;
}
