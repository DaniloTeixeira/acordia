// Rode com: npm test
import { test } from "vitest";
import assert from "node:assert/strict";
import { chunkPlan, chunkWindow, chunkInput, overlapAdd, mixStems, encodeWav, linkKind, directLink } from "../src/lib/stems";

test("pedaços cobrem a música inteira, com 1/4 de sobreposição", () => {
  const seg = 100;
  const {chunks, overlap} = chunkPlan(330, seg);
  assert.equal(overlap, 25);
  assert.deepEqual(chunks, [{start: 0, len: 100}, {start: 75, len: 100}, {start: 150, len: 100}, {start: 225, len: 100}, {start: 300, len: 30}].slice(0, chunks.length));
  assert.ok(chunks[chunks.length - 1].start + chunks[chunks.length - 1].len >= 330);
  assert.deepEqual(chunkPlan(60, seg).chunks, [{start: 0, len: 60}]);
  assert.deepEqual(chunkPlan(100, seg).chunks, [{start: 0, len: 100}]);
});

test("emenda: os pesos somam 1 em toda a música (sem buraco nem degrau nas pontas)", () => {
  for(const total of [60, 100, 101, 330, 1000]){
    const seg = 100, {chunks, overlap} = chunkPlan(total, seg);
    const sum = new Float32Array(total);
    chunks.forEach((c, i) => { const w = chunkWindow(seg, overlap, i === 0, i === chunks.length - 1); for(let k = 0; k < c.len; k++) sum[c.start + k] += w[k]; });
    sum.forEach((v, i) => assert.ok(Math.abs(v - 1) < 1e-5, `total ${total}, amostra ${i}: ${v}`));
  }
});

test("separar com um modelo que só copia devolve a própria música", () => {
  const total = 330, seg = 100, stems = 2;
  const L = Float32Array.from({length: total}, (_, i) => Math.sin(i / 7)), R = Float32Array.from({length: total}, (_, i) => Math.cos(i / 5));
  const out = Array.from({length: stems}, () => [new Float32Array(total), new Float32Array(total)]);
  const {chunks, overlap} = chunkPlan(total, seg);
  chunks.forEach((c, i) => {
    const x = chunkInput(L, R, c, seg);
    // "modelo": cada faixa recebe metade da entrada
    const piece = new Float32Array(stems * 2 * seg);
    for(let s = 0; s < stems; s++) for(let ch = 0; ch < 2; ch++) for(let k = 0; k < seg; k++) piece[(s * 2 + ch) * seg + k] = x[ch * seg + k] / 2;
    overlapAdd(out, piece, c, chunkWindow(seg, overlap, i === 0, i === chunks.length - 1), seg);
  });
  const [ml, mr] = mixStems(out, [1, 1]);
  for(let i = 0; i < total; i++){ assert.ok(Math.abs(ml[i] - L[i]) < 1e-5); assert.ok(Math.abs(mr[i] - R[i]) < 1e-5); }
  const [vl] = mixStems(out, [1, 0]);
  assert.ok(Math.abs(vl[10] - L[10] / 2) < 1e-6);
});

test("WAV 16 bits: cabeçalho e amostras", () => {
  const buf = encodeWav([Float32Array.from([0, 1, -1]), Float32Array.from([0.5, 2, -2])], 44100), v = new DataView(buf);
  assert.equal(buf.byteLength, 44 + 3 * 2 * 2);
  assert.equal(String.fromCharCode(...new Uint8Array(buf, 0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...new Uint8Array(buf, 8, 4)), "WAVE");
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getInt16(44 + 2, true), Math.trunc(0.5 * 0x7fff));
  assert.equal(v.getInt16(44 + 4, true), 0x7fff);
  assert.equal(v.getInt16(44 + 10, true), -0x8000); // -2 vira -1
});

test("links: YouTube e Spotify não dão; Drive e Dropbox viram download direto", () => {
  assert.equal(linkKind("https://www.youtube.com/watch?v=abc"), "youtube");
  assert.equal(linkKind("https://youtu.be/abc"), "youtube");
  assert.equal(linkKind("https://open.spotify.com/track/1"), "youtube");
  assert.equal(linkKind("ftp://x.com/a.mp3"), "bad");
  assert.equal(linkKind("não é link"), "bad");
  assert.equal(linkKind("https://exemplo.com/musica.mp3"), "ok");
  assert.equal(directLink("https://drive.google.com/file/d/AbC_12-x/view?usp=sharing"), "https://drive.google.com/uc?export=download&id=AbC_12-x");
  assert.equal(directLink("https://www.dropbox.com/s/xyz/musica.mp3?dl=0"), "https://www.dropbox.com/s/xyz/musica.mp3?dl=1");
  assert.equal(directLink("https://exemplo.com/a.mp3"), "https://exemplo.com/a.mp3");
});
