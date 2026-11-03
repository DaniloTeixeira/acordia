// Lista "Para aprender" do grupo: músicas que a equipe quer ouvir e pegar no futuro. Regras sem rede (limpar o que
// foi digitado, quem pode mudar, busca); a leitura e a gravação ficam em groups.ts e as regras de acesso no banco
// (supabase/migrations/20261103120000_para_aprender.sql).
import { sanitizeUrl } from "./core";
import { norm } from "./util";

export interface LearnItem { id: string; group_id: string; title: string; artist: string; url: string; note: string; suggested_by: string; created_at: string }
export interface LearnFields { title: string; artist: string; url: string; note: string }
export const LEARN_MAX = {title: 120, artist: 80, note: 300};

// Campos prontos para gravar; null se não tem título. Link inválido (ou que não é http/https) fica vazio.
export function cleanLearn(f: LearnFields): LearnFields | null {
  const clip = (s: string, n: number) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const title = clip(f.title, LEARN_MAX.title);
  return title ? {title, artist: clip(f.artist, LEARN_MAX.artist), url: sanitizeUrl(f.url), note: clip(f.note, LEARN_MAX.note)} : null;
}
// Muda ou apaga: quem sugeriu, ou quem edita o grupo (o banco confere igual).
export const canChangeLearn = (i: Pick<LearnItem, "suggested_by">, me: string, canEdit: boolean) => canEdit || (!!me && i.suggested_by === me);
// Busca por título, artista ou nota, sem diferenciar maiúsculas e acentos (q já vem normalizada).
export const matchLearn = (i: LearnFields, q: string) => !q || norm(i.title).includes(q) || norm(i.artist).includes(q) || norm(i.note).includes(q);
