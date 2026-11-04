import { test } from "vitest";
import assert from "node:assert/strict";
import { isLinkOnly, parseLinkLines, titleFromChartUrl, shortUrl, LINK_BATCH_MAX } from "../src/lib/links";
import { encodeMedley, decodeMedley } from "../src/lib/share";
import { sanitizeEntry } from "../src/lib/core";

const CC = "https://www.cifraclub.com.br/hillsong-united/oceans/";
const YT = "https://youtu.be/dQw4w9WgXcQ";

test("música só com link: sem texto, com título e algum link", () => {
  assert.equal(isLinkOnly({text: "", title: "Oceanos", chartUrl: CC}), true);
  assert.equal(isLinkOnly({text: "  ", title: "Oceanos", ref: YT}), true);
  assert.equal(isLinkOnly({text: "", title: "", chartUrl: CC}), false);
  assert.equal(isLinkOnly({text: "", title: "Oceanos"}), false);
  assert.equal(isLinkOnly({text: "Oceanos\nC G", title: "Oceanos", chartUrl: CC}), false);
});

test("título vem do endereço do Cifra Club", () => {
  assert.equal(titleFromChartUrl(CC), "Oceans");
  assert.equal(titleFromChartUrl("https://www.cifraclub.com.br/banda/grande-e-o-senhor/simplificada/"), "Grande e o Senhor");
  assert.equal(titleFromChartUrl("https://www.cifraclub.com.br/banda/"), "");
  assert.equal(titleFromChartUrl("https://outro-site.com/banda/musica/"), "");
});

test("endereço curto para a folha", () => {
  assert.equal(shortUrl(CC), "cifraclub.com.br/hillsong-united/oceans");
});

test("lista colada: nome, cifra e vídeo em qualquer ordem", () => {
  const r = parseLinkLines(`Oceanos ${CC} ${YT}\n${YT} Grande é o Senhor\n2) Quão Grande É o Meu Deus - cifraclub.com.br/chris-tomlin/how-great-is-our-god/\n${CC}\n`);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(r.songs[0], {title: "Oceanos", chartUrl: CC, ref: YT});
  assert.deepEqual(r.songs[1], {title: "Grande é o Senhor", chartUrl: "", ref: YT});
  assert.equal(r.songs[2].title, "Quão Grande É o Meu Deus");
  assert.equal(r.songs[2].chartUrl, "https://cifraclub.com.br/chris-tomlin/how-great-is-our-god/");
  assert.deepEqual(r.songs[3], {title: "Oceans", chartUrl: CC, ref: ""});
});

test("linha sem link, ou só com vídeo e sem nome, fica de fora", () => {
  const r = parseLinkLines(`Só o nome\n${YT}\nOutra https://exemplo.com/x`);
  assert.deepEqual(r.skipped, ["Só o nome", YT]);
  assert.deepEqual(r.songs.map(s => s.title), ["Outra"]);
});

test("limite de linhas por colagem", () => {
  const text = Array.from({length: LINK_BATCH_MAX + 5}, (_, i) => `Música ${i} ${CC}`).join("\n");
  const r = parseLinkLines(text);
  assert.equal(r.songs.length, LINK_BATCH_MAX);
  assert.equal(r.extra, 5);
});

test("entrada recebida: sem texto só vale com título e link", () => {
  assert.equal(sanitizeEntry({text: "", title: "Oceanos"}), null);
  assert.equal(sanitizeEntry({text: "", chartUrl: CC}), null);
  const e = sanitizeEntry({text: "", title: "Oceanos", chartUrl: CC, ref: "javascript:alert(1)"})!;
  assert.equal(e.title, "Oceanos");
  assert.equal(e.chartUrl, CC);
  assert.equal(e.ref, "");
});

test("repertório com música só com link vai e volta pelo código do grupo", async () => {
  const code = await encodeMedley({name: "Culto", options: {} as never, songs: [
    {text: "", title: "Oceanos", chartUrl: CC, ref: YT},
    {text: "Segunda\nG  D\nAmo você"}
  ]});
  const back = (await decodeMedley(code))!;
  assert.equal(back.songs.length, 2);
  assert.equal(back.songs[0].title, "Oceanos");
  assert.equal(back.songs[0].text, "");
  assert.equal(back.songs[0].chartUrl, CC);
  assert.equal(back.songs[0].ref, YT);
  assert.equal(back.songs[1].chartUrl, undefined);
});
