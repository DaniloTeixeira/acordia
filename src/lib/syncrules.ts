// Regras da sincronização com a nuvem, sem rede nem banco (testadas em tests/sync.test.ts).
// Vale a mudança mais recente de cada música ou repertório (hora do aparelho em que mudou).

// Mudança feita aqui e ainda não enviada: "put" grava, "del" exclui; at é a hora da mudança.
export interface Queued { op: "put" | "del"; at: number }
export type Queue = Record<string, Queued>;
// Linha como vem da nuvem.
export interface Remote<T = unknown> { id: string; data: T | null; updated_at: number; deleted: boolean; server_at: string }

// O que fazer com uma linha que chegou da nuvem:
// "apply" grava a versão da nuvem aqui; "remove" apaga daqui; "keep" a daqui é mais nova e vai subir;
// "skip" não há nada a fazer.
export function decide(remote: Remote, localAt: number | undefined, queued: Queued | undefined): "apply" | "remove" | "keep" | "skip" {
  if(queued && queued.at > remote.updated_at) return "keep";
  if(remote.deleted) return localAt !== undefined ? "remove" : "skip";
  if(!queued && localAt !== undefined && localAt >= remote.updated_at) return "skip";
  return "apply";
}

// Chave da fila: "s:" para música, "m:" para repertório ou medley.
export const qkey = (kind: "s" | "m", id: string) => kind + ":" + id;

// Repertório que o app cria sozinho (vazio, com o nome padrão): não sobe no primeiro envio, senão
// cada aparelho novo deixaria um "Meu repertório" vazio a mais na conta.
const DEFAULT_NAMES = new Set(["Meu repertório", "My setlist", "Mi repertorio"]);
export const isAutoSetlist = (m: {kind?: string; name: string; items: unknown[]}) => m.kind !== "medley" && !m.items.length && DEFAULT_NAMES.has(m.name);
