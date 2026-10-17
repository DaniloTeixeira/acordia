// Grade de tempo comum: os loops do ritmo (ou, sem eles, o metrônomo) dizem onde caem as semicolcheias, e os efeitos
// soltos na mão entram no próximo ponto dela, para não ficarem descompassados. Sem nada tocando, entram na hora.
import { metro } from "./metro";

// Um ponto conhecido da grade (`at`, relógio do áudio) e a distância entre semicolcheias (`dt`).
type Anchor = {at: number; dt: number};
let loopAnchor: Anchor | null = null;
export function setLoopAnchor(a: Anchor | null){ loopAnchor = a; }

// Um toque até 30 ms depois de um ponto já está no tempo: sai na hora, sem esperar o próximo.
const LATE = 0.03;
export function quantize(t: number){
  const g = metro.grid(), a = loopAnchor ?? (g ? {at: g.nextBeatAt, dt: 60 / metro.state.bpm / 4} : null);
  if(!a) return t;
  return Math.max(t, a.at + Math.ceil((t - LATE - a.at) / a.dt) * a.dt);
}
