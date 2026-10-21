// Extensão vocal: regras puras (sem rede), para o perfil, a lista de membros e a escala do evento.
import { midiName } from "./tuner";
import { voiceType } from "./core";

export const VOICE_LOWEST = 36, VOICE_HIGHEST = 96; // C2..C7, limites da medição e dos ajustes
export interface VoiceRange { low: number | null; high: number | null }

// Nota válida (MIDI inteiro dentro dos limites) ou null.
export const cleanNote = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= VOICE_LOWEST && v <= VOICE_HIGHEST ? v : null;
// Garante grave <= aguda: se vieram trocadas (medidas fora de ordem), inverte.
export function cleanRange(low: unknown, high: unknown): VoiceRange {
  let l = cleanNote(low), h = cleanNote(high);
  if(l !== null && h !== null && l > h) [l, h] = [h, l];
  return {low: l, high: h};
}
// "F2–C4"; com uma ponta só, "F2–?" / "?–C4"; sem nenhuma, "".
export function rangeLabel(r: {voice_low?: number | null; voice_high?: number | null}): string {
  const {low, high} = cleanRange(r.voice_low, r.voice_high);
  if(low === null && high === null) return "";
  return (low === null ? "?" : midiName(low)) + "–" + (high === null ? "?" : midiName(high));
}
// Tipo de voz aproximado (id de voice.type.*), só com as duas pontas.
export function rangeType(r: {voice_low?: number | null; voice_high?: number | null}): string {
  const {low, high} = cleanRange(r.voice_low, r.voice_high);
  return low !== null && high !== null ? voiceType(low, high) : "";
}

// Medição por "segurar a nota": cada leitura (~60 ms) traz a nota ouvida (MIDI) ou null. Segurar a mesma nota
// por HOLD_TICKS (~2 s) conclui; até GRACE_TICKS leituras fora da nota (vibrato, respiro) não reiniciam a contagem.
export const HOLD_TICKS = 33, GRACE_TICKS = 3;
export interface Hold { note: number | null; run: number; miss: number }
export const newHold = (): Hold => ({note: null, run: 0, miss: 0});
export function holdStep(h: Hold, heard: number | null): Hold {
  const m = cleanNote(heard);
  if(m !== null && (h.note === null || m === h.note)) return {note: m, run: h.run + 1, miss: 0};
  if(h.miss + 1 <= GRACE_TICKS) return {...h, miss: h.miss + 1};
  return m !== null ? {note: m, run: 1, miss: 0} : newHold(); // trocou de nota ou parou de cantar: recomeça
}
export const holdDone = (h: Hold) => h.note !== null && h.run >= HOLD_TICKS;
