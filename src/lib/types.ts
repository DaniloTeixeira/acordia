// Formas dos dados guardados no IndexedDB e trocados por link/arquivo.
export type SongType = "" | "letra";

export interface Arrangement { id: string; name: string; target: string; capo: string; notes: string }

export interface Song {
  id: string; title: string; text: string; type: SongType; key: string; bpm: string;
  ref?: string; arrangements?: Arrangement[]; createdAt?: number; updatedAt?: number;
  // Nota mais aguda da melodia (MIDI), para sugerir o tom pela extensão de quem canta.
  high?: number;
}
// Música validada vinda de fora (link compartilhado, arquivo importado).
export interface SongEntry {
  id: string; title: string; text: string; type: SongType; key: string; bpm: string;
  ref: string; arrangements: Arrangement[]; updatedAt: number; high?: number;
}

// Momento do culto: "" é louvor (o padrão); "pos" é pós-pregação.
export type Moment = "" | "pos";
// O que muda só neste repertório: tom, capo, quem canta, quem faz o solo, observações, arranjo escolhido e momento.
export interface ItemFields { target: string; capo: string; singer: string; solo?: string; notes: string; arrangementId: string; moment?: Moment }
export interface SongItem extends ItemFields { id: string; type: "song"; songId: string }
export interface MedleyItem { id: string; type: "medley"; medleyId: string; moment?: Moment }
export type Item = SongItem | MedleyItem;

export interface Options {
  dedupe: boolean; columns: "auto" | 1 | 2; maxPages: 1 | 2; minFont: number; showKey: boolean;
  transitions: boolean; degreeStyle: "roman" | "arabic"; transpose: number; capoShapes: boolean;
}

// kind "setlist" (repertório) ou "medley" (bloco de músicas emendadas dentro de um repertório).
export interface Medley {
  id: string; kind: "setlist" | "medley"; name: string; items: Item[]; options: Options;
  createdAt?: number; updatedAt?: number; sourceId?: string; linkOf?: string;
}

export type Settings = Record<string, unknown>;
