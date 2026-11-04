// Música só com link: sem cifra colada, vale pelo título e pelo link da cifra (ex.: Cifra Club) e/ou do vídeo.
// Aqui ficam as regras puras (reconhecer a música, ler uma lista de links colada), sem tela nem rede.
import { sanitizeUrl, youtubeId } from "./core";
import type { Song } from "./types";

// Sem texto, mas com título e algum link: aparece no repertório com os botões Cifra e Ouvir.
export const isLinkOnly = (s: Pick<Song, "text" | "title" | "chartUrl" | "ref">) => !s.text.trim() && !!s.title.trim() && !!(s.chartUrl || s.ref);

export interface LinkSong { title: string; chartUrl: string; ref: string }
export const LINK_TITLE_MAX = 120;
// Quantas linhas uma colagem aceita (o resto é ignorado, com aviso).
export const LINK_BATCH_MAX = 60;

// Endereço curto para mostrar (folha e Palco): sem "https://", sem "www." e sem a barra do fim.
export function shortUrl(url: string): string {
  try{ const u = new URL(url); return (u.hostname.replace(/^(www|m)\./, "") + u.pathname).replace(/\/+$/, ""); }catch(e){ return url; }
}

const SMALL = new Set(["e", "o", "a", "os", "as", "de", "da", "do", "das", "dos", "em", "na", "no", "um", "uma", "que", "por", "para", "com"]);
// O Cifra Club guarda o nome na própria URL (/artista/musica/): "grande-e-o-senhor" vira "Grande e o Senhor".
// Vem sem acento; a pessoa ajusta no campo Nome se quiser.
export function titleFromChartUrl(url: string): string {
  try{
    const u = new URL(url);
    if(!/(^|\.)cifraclub\.com(\.br)?$/i.test(u.hostname)) return "";
    const slug = u.pathname.split("/").filter(Boolean)[1] || "";
    return slug.split("-").filter(Boolean).map((w, i) => i && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1)).join(" ").slice(0, LINK_TITLE_MAX);
  }catch(e){ return ""; }
}

// Pedaço que parece um link: com http(s), com www., ou domínio seguido de caminho (cifraclub.com.br/artista/musica).
const isLinkToken = (w: string) => /^(?:https?:\/\/|www\.)\S+$/i.test(w) || /^[\w-]+(?:\.[\w-]+)+\/\S+$/.test(w);

// Uma linha por música. Cada linha pode ter o nome, um link de cifra e/ou um link do YouTube, em qualquer ordem
// ("Oceanos https://cifraclub... https://youtu.be/..."). Sem nome, tira da URL do Cifra Club; sem nome nem isso, a linha é recusada.
export function parseLinkLines(text: string): {songs: LinkSong[]; skipped: string[]; extra: number} {
  const songs: LinkSong[] = [], skipped: string[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  lines.slice(0, LINK_BATCH_MAX).forEach(line => {
    let chartUrl = "", ref = "";
    const words: string[] = [];
    line.split(/\s+/).forEach(w => {
      if(!isLinkToken(w)){ words.push(w); return; }
      const url = sanitizeUrl(w);
      if(!url){ words.push(w); return; }
      if(youtubeId(url)){ ref ||= url; } else chartUrl ||= url;
    });
    // Sem número de lista no começo ("1." / "2)") nem separador solto nas pontas ("Nome - ", "| Nome").
    const own = words.join(" ").replace(/^\d{1,2}\s*[.)]\s+/, "").replace(/^[\s\-–—|:,;]+|[\s\-–—|:,;]+$/g, "").trim().slice(0, LINK_TITLE_MAX);
    const title = own || (chartUrl && titleFromChartUrl(chartUrl));
    if(!title || !(chartUrl || ref)){ skipped.push(line); return; }
    songs.push({title, chartUrl, ref});
  });
  return {songs, skipped, extra: Math.max(0, lines.length - LINK_BATCH_MAX)};
}
