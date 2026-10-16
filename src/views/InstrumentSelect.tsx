// Escolha do instrumento (preferência global: estudo, acordes, afinador e sugestão de capo) e do
// timbre do som (acordes, escalas, teclado; o metrônomo não muda). Todas as listas mostram o mesmo valor.
import { INSTRUMENT_IDS } from "../lib/instruments";
import { TIMBRES, getTimbre, setTimbre, playChord } from "../lib/audio";
import { t } from "../lib/i18n";
import * as store from "../lib/store";
import { useData } from "../state";
import { Select } from "../ui/Select";
import { instrument } from "./Repertoire";

export function InstrumentSelect(){
  useData();
  return <label className="field inst-field"><span>{t("inst.label")}</span>
    <Select dataInstrument value={instrument()} onChange={v => store.setSetting("instrument", v)}
      options={INSTRUMENT_IDS.map(id => ({value: id, label: t("inst." + id)}))}/></label>;
}

// Troca o timbre e toca um acorde de amostra.
export function chooseTimbre(v: string){
  setTimbre(v); store.setSetting("timbre", getTimbre());
  playChord([0, 4, 7, 12], {base: 60, dur: 1.2});
}
export function TimbreSelect(){
  useData();
  return <label className="field inst-field"><span>{t("timbre.title")}</span>
    <Select value={getTimbre()} onChange={chooseTimbre} options={TIMBRES.map(id => ({value: id, label: t("timbre." + id)}))}/></label>;
}
