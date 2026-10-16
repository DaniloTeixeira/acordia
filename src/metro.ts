// Um só metrônomo para o app (Ferramentas e modo palco), com as preferências salvas.
import * as audio from "./lib/audio";
import { createMetronome, type MetroState } from "./lib/metronome";
import * as store from "./lib/store";
import { debounce } from "./lib/util";

export const metro = createMetronome(audio);

export function initMetro(){
  const saved = store.data.settings.metro as Partial<MetroState> | undefined;
  if(saved) metro.set(saved);
  metro.onChange(debounce((s: MetroState) => store.setSetting("metro", s), 500));
}
