import test from "node:test";
import assert from "node:assert/strict";
import { parseSong, DEFAULT_OPTIONS } from "../js/core.js";
import { fit, layout, lyricsOnly, toSVG } from "../js/layout.js";
import { setLang } from "../js/i18n.js";

setLang("pt");
function song(title, verses, key = "G", target = ""){
  const body = Array.from({length: verses}, (_, i) => `G        D\nVerso ${i} com algumas palavras aqui\nEm       C\nE mais uma linha para medir ${i}`).join("\n\n");
  const s = parseSong(title + "\n" + body);
  return Object.assign(s, {key, target, shift: 0, meta: {}});
}
const opts = extra => Object.assign({}, DEFAULT_OPTIONS, {mode: "cifras"}, extra);
const texts = pages => pages.flat().filter(o => o.t === "text").map(o => o.txt);

test("um medley curto cabe em uma página com fonte grande", () => {
  const r = fit([song("Curta", 2)], opts());
  assert.equal(r.pages.length, 1);
  assert.equal(r.warn, null);
  assert.ok(r.fs >= 12, "fonte " + r.fs);
});

test("medley longo passa para 2 páginas quando permitido", () => {
  const songs = [song("A", 14), song("B", 14), song("C", 14)];
  const one = fit(songs, opts({maxPages: 1}));
  assert.ok(one.warn, "deveria avisar que não coube");
  const two = fit(songs, opts({maxPages: 2}));
  assert.equal(two.pages.length, 2);
  assert.equal(two.warn, null);
});

test("prefere uma página menor a duas maiores", () => {
  const r = fit([song("A", 10), song("B", 10)], opts({maxPages: 2}));
  assert.equal(r.pages.length, 1);
});

test("1 coluna não desenha divisória e 2 colunas desenham", () => {
  const songs = [song("A", 12), song("B", 12)];
  const vlines = p => p.flat().filter(o => o.t === "line" && o.v).length;
  assert.equal(vlines(fit(songs, opts({columns: 1, maxPages: 2})).pages), 0);
  assert.ok(vlines(fit(songs, opts({columns: 2})).pages) >= 1);
});

test("tom no título, metadados e transição", () => {
  const a = song("Primeira", 1, "G"), b = song("Segunda", 1, "A");
  a.meta = {bpm: "72", capo: "2", singer: "Ana", notes: "Só violão"};
  const all = texts(layout([a, b], 12, 1, opts()).pages);
  assert.ok(all.includes("PRIMEIRA  (G)"));
  assert.ok(all.some(x => x.includes("72 bpm") && x.includes("Capo 2") && x.includes("Voz: Ana") && x.includes("Só violão")));
  assert.ok(all.some(x => x.startsWith("→ A: sobe 1 tom") && x.includes("passagem E7")));
  const graus = texts(layout([a, b], 12, 1, opts({mode: "graus"})).pages);
  assert.ok(graus.some(x => x.includes("passagem V7")));
  assert.ok(graus.includes("I        V"));
  const off = texts(layout([a, b], 12, 1, opts({showKey: false, transitions: false})).pages);
  assert.ok(off.includes("PRIMEIRA"));
  assert.ok(!off.some(x => x.startsWith("→")));
});

test("só letra remove cifras e não mostra tom", () => {
  const all = texts(fit(lyricsOnly([song("Letra", 2)]), opts({mode: "letra"})).pages);
  assert.ok(!all.some(x => /^G\s+D$/.test(x)));
  assert.ok(all.includes("LETRA"));
});

test("colunas automáticas: 1 coluna para pouco texto, 2 para muito", () => {
  assert.equal(fit([song("Curta", 2)], opts({columns: "auto"})).columns, 1);
  assert.equal(fit([song("A", 10), song("B", 10)], opts({columns: "auto"})).columns, 2);
});

test("toSVG escapa texto", () => {
  const svg = toSVG([{t:"text", x:0, y:0, s:10, f:"sans", b:false, c:[0,0,0], txt:"<b>&"}], "x");
  assert.ok(svg.includes("&lt;b&gt;&amp;"));
});
