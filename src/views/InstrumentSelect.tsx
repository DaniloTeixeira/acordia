// Escolha do instrumento (preferência global: estudo, acordes, afinador e sugestão de capo).
import { INSTRUMENT_IDS } from "../lib/instruments";
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
