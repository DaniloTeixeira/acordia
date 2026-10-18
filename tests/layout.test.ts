import { test } from "vitest";
import assert from "node:assert/strict";
import { parseSong, DEFAULT_OPTIONS } from "../src/lib/core";
import { fit, fitSetlist, layout, lyricsOnly, toSVG } from "../src/lib/layout";
import { setLang } from "../src/lib/i18n";

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
  const a = Object.assign(song("Primeira", 1, "G"), {group: "g"}), b = Object.assign(song("Segunda", 1, "A"), {group: "g"});
  a.meta = {bpm: "72", capo: "2", singer: "Ana", notes: "Só violão"};
  const all = texts(layout([a, b], 12, 1, opts()).pages);
  assert.ok(all.includes("PRIMEIRA  (G)"));
  assert.ok(all.some(x => x.includes("72 bpm") && x.includes("Capo 2") && x.includes("Voz: Ana") && x.includes("Só violão")));
  assert.ok(all.some(x => x.startsWith("Próxima em A") && x.includes("acorde de passagem: E7")));
  const graus = texts(layout([a, b], 12, 1, opts({mode: "graus"})).pages);
  assert.ok(graus.some(x => x.includes("acorde de passagem: V7")));
  assert.ok(graus.includes("I        V"));
  const off = texts(layout([a, b], 12, 1, opts({showKey: false, transitions: false})).pages);
  assert.ok(off.includes("PRIMEIRA"));
  assert.ok(!off.some(x => x.startsWith("Próxima")));
  // Entre músicas avulsas (fora de medley) não há dica de transição.
  const loose = texts(layout([song("Um", 1, "G"), song("Dois", 1, "A")], 12, 1, opts()).pages);
  assert.ok(!loose.some(x => x.startsWith("Próxima")));
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

test("acordes clicáveis: posição e acorde que soa", () => {
  const s = Object.assign(parseSong("T\nC     G/B\nletra aqui"), {key: "C", target: "D", shift: 2, meta: {}});
  const ops = layout([s], 12, 1, opts()).pages.flat().filter(o => o.chords);
  assert.equal(ops[0].txt, "D     A/C#");
  assert.deepEqual(ops[0].chords.map(c => [c.pos, c.chord]), [[0, "D"], [6, "A/C#"]]);
  const graus = layout([s], 12, 1, opts({mode: "graus"})).pages.flat().filter(o => o.chords);
  assert.equal(graus[0].txt, "I     V/VII");
  assert.deepEqual(graus[0].chords.map(c => c.chord), ["D", "A/C#"]);
  const svg = toSVG(ops, "x");
  assert.ok(svg.includes('class="hit" data-chord="A/C#" data-key="D"'));
});

test("medley: rótulo antes da primeira música do grupo", () => {
  const a = Object.assign(song("Um", 1), {group: "g1", gname: "Abertura"}), b = Object.assign(song("Dois", 1), {group: "g1", gname: "Abertura"}), c = song("Três", 1);
  const all = texts(layout([a, b, c], 12, 1, opts()).pages);
  assert.equal(all.filter(x => x === "MEDLEY · ABERTURA").length, 1);
  assert.ok(all.indexOf("MEDLEY · ABERTURA") < all.indexOf("UM  (G)"));
});

test("medley: rótulo e título longos quebram dentro da coluna", () => {
  const name = "Toda Terra + Sublime + Tu És + Ah, Jesus + Dá-me um Coração";
  const a = Object.assign(song("Um título de música bem comprido para não caber", 1), {group: "g1", gname: name});
  const ops = layout([a, song("Dois", 1)], 12, 1, opts({columns: 2})).pages.flat().filter(o => o.t === "text" && o.f === "sans" && o.b);
  const colW = (595.28 - 2*17 - 18) / 2;
  assert.ok(ops.filter(o => o.s === 8.5).length > 1, "o rótulo deveria quebrar em mais de uma linha");
  ops.forEach(o => assert.ok(o.txt.length * o.s * 0.52 * 1.08 <= colW + 0.01, "passou da coluna: " + o.txt));
});

test("toSVG escapa texto", () => {
  const svg = toSVG([{t:"text", x:0, y:0, s:10, f:"sans", b:false, c:[0,0,0], txt:"<b>&"}], "x");
  assert.ok(svg.includes("&lt;b&gt;&amp;"));
});

test("no repertório, cada música avulsa vai para uma folha e o medley fica junto", () => {
  const med = (t) => Object.assign(song(t, 1), {group: "g1", gname: "Medley"});
  const r = fitSetlist([song("A", 1), song("B", 1), med("C"), med("D"), song("E", 1)], opts());
  assert.equal(r.pages.length, 4);
  const firstTitle = p => p.find(o => o.t === "text" && o.c && o.s >= 12)?.txt || "";
  assert.ok(texts([r.pages[2]]).some(x => x.startsWith("C")) && texts([r.pages[2]]).some(x => x.startsWith("D")));
  assert.ok(firstTitle(r.pages[3]).startsWith("E"));
  // Um medley sozinho continua igual ao fit normal.
  assert.equal(fitSetlist([med("C"), med("D")], opts()).pages.length, fit([med("C"), med("D")], opts()).pages.length);
});
