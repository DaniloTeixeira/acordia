// Grade de tempo do metrônomo: com ele tocando, o swell do pad entra na próxima semicolcheia, para não ficar
// descompassado. Sem o metrônomo, entra na hora.
import { metro } from "./metro";

// Um toque até 30 ms depois de um ponto já está no tempo: sai na hora, sem esperar o próximo.
const LATE = 0.03;
export function quantize(t: number){
  const g = metro.grid(); if(!g) return t;
  const dt = 60 / metro.state.bpm / 4;
  return Math.max(t, g.nextBeatAt + Math.ceil((t - LATE - g.nextBeatAt) / dt) * dt);
}
