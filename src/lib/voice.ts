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
