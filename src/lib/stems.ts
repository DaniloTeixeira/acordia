// Separar faixas (voz, bateria, baixo, violão/guitarra, piano e o resto) com o HT-Demucs de 6 faixas,
// rodando no próprio aparelho. Aqui ficam as contas sem rede nem áudio (testadas em
// tests/stems.test.ts): pedaços com sobreposição, a emenda entre eles e o arquivo WAV.

// Modelo: HT-Demucs 6s (Meta, licença MIT) em ONNX, na versão ajustada para rodar no navegador tanto na
// placa de vídeo quanto no processador (kramp/htdemucs-6s-webgpu-onnx; a de pesos em 16 bits aborta no
// processador). Baixado uma vez do Hugging Face e guardado no aparelho.
export const MODEL = {
  url: "https://huggingface.co/kramp/htdemucs-6s-webgpu-onnx/resolve/main/htdemucs_6s.onnx",
  mb: 272,
  rate: 44100,
  // 7,8 s por pedaço, como o modelo foi exportado.
  segment: 343980,
  // Ordem das faixas na saída do modelo.
  stems: ["drums", "bass", "other", "vocals", "guitar", "piano"] as const,
};
export type StemName = typeof MODEL.stems[number];
// Ordem na tela: o que mais se tira primeiro.
export const STEM_ORDER: StemName[] = ["vocals", "guitar", "piano", "bass", "drums", "other"];

// Pedaços de `segment` amostras com 1/4 de sobreposição. O último pode passar do fim (completa com
// silêncio e só o começo dele vale).
export interface Chunk { start: number; len: number }
export function chunkPlan(total: number, segment = MODEL.segment): {chunks: Chunk[]; overlap: number} {
  const overlap = Math.floor(segment / 4), stride = segment - overlap;
  const chunks: Chunk[] = [];
  for(let start = 0; start < total; start += stride){
    chunks.push({start, len: Math.min(segment, total - start)});
    if(start + segment >= total) break;
  }
  return {chunks, overlap};
}

// Peso de cada amostra do pedaço na emenda: sobe devagar onde o anterior ainda toca e desce onde o
// próximo começa. As rampas se completam (somam 1), então não é preciso dividir no fim. O primeiro
// pedaço não sobe e o último não desce: o começo e o fim da música ficam com o volume inteiro.
export function chunkWindow(segment: number, overlap: number, first: boolean, last: boolean): Float32Array {
  const w = new Float32Array(segment).fill(1);
  for(let i = 0; i < overlap; i++){
    const up = overlap > 1 ? i / (overlap - 1) : 1;
    if(!first) w[i] = up;
    if(!last) w[segment - overlap + i] = 1 - up;
  }
  return w;
}

// Soma o pedaço separado (planar, [faixa][canal][amostra]) nas faixas completas, já com o peso.
export function overlapAdd(out: Float32Array[][], piece: Float32Array, chunk: Chunk, w: Float32Array, segment: number){
  const stems = out.length, ch = out[0].length;
  for(let s = 0; s < stems; s++) for(let c = 0; c < ch; c++){
    const dst = out[s][c], off = (s * ch + c) * segment;
    for(let i = 0; i < chunk.len; i++) dst[chunk.start + i] += piece[off + i] * w[i];
  }
}

// Pedaço da música de entrada no formato do modelo: [canal][amostra], completo com silêncio.
export function chunkInput(left: Float32Array, right: Float32Array, chunk: Chunk, segment: number): Float32Array {
  const x = new Float32Array(2 * segment);
  x.set(left.subarray(chunk.start, chunk.start + chunk.len), 0);
  x.set(right.subarray(chunk.start, chunk.start + chunk.len), segment);
  return x;
}

// Mistura as faixas com o volume de cada uma (0 = tirada), em estéreo.
export function mixStems(stems: Float32Array[][], gains: number[]): [Float32Array, Float32Array] {
  const n = stems[0][0].length, L = new Float32Array(n), R = new Float32Array(n);
  stems.forEach((st, s) => {
    const g = gains[s]; if(!g) return;
    const l = st[0], r = st[1] || st[0];
    for(let i = 0; i < n; i++){ L[i] += l[i] * g; R[i] += r[i] * g; }
  });
  return [L, R];
}

// WAV 16 bits (o que todo aparelho e programa abre).
export function encodeWav(channels: Float32Array[], rate: number): ArrayBuffer {
  const ch = channels.length, n = channels[0].length, bytes = n * ch * 2;
  const buf = new ArrayBuffer(44 + bytes), v = new DataView(buf);
  const str = (o: number, s: string) => { for(let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + bytes, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, bytes, true);
  let o = 44;
  for(let i = 0; i < n; i++) for(let c = 0; c < ch; c++){
    const s = Math.max(-1, Math.min(1, channels[c][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return buf;
}

// Link que dá para baixar direto (o navegador não baixa o áudio do YouTube nem de páginas).
export function linkKind(url: string): "youtube" | "ok" | "bad" {
  let u: URL; try{ u = new URL(url.trim()); }catch(e){ return "bad"; }
  if(!/^https?:$/.test(u.protocol)) return "bad";
  if(/(^|\.)(youtube\.com|youtu\.be|music\.youtube\.com|spotify\.com|deezer\.com|music\.apple\.com|soundcloud\.com)$/i.test(u.hostname)) return "youtube";
  return "ok";
}
// Dropbox e Google Drive têm um jeito de pedir o arquivo em vez da página.
export function directLink(url: string){
  const s = url.trim();
  const drive = /drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/.exec(s);
  if(drive) return "https://drive.google.com/uc?export=download&id=" + drive[1];
  if(/^https:\/\/(www\.)?dropbox\.com\//.test(s)){ const u = new URL(s); u.searchParams.set("dl", "1"); return u.toString(); }
  return s;
}
