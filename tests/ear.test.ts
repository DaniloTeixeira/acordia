// Montar cifra de ouvido (graus digitados, quadradinhos) e transpor o texto da música.
import { test } from "vitest";
import assert from "node:assert/strict";
import * as C from "../src/lib/core";

test("graus arábicos viram o acorde do campo harmônico", () => {
  const got = ["1", "2", "3", "4", "5", "6", "7", "57", "27", "77", "2M", "b7", "#4°", "5/7", "4sus2"].map(x => C.degreeToChord(x, "C"));
  assert.deepEqual(got, ["C", "Dm", "Em", "F", "G", "Am", "B°", "G7", "Dm7", "Bm7(b5)", "D", "Bb", "F#°", "G/B", "Fsus2"]);
  // No menor, a escala é a do menor natural; o 5 maior se escreve em romano.
  assert.deepEqual(["1", "3", "5", "7", "V7"].map(x => C.degreeToChord(x, "Am")), ["Am", "C", "Em", "G", "E7"]);
  assert.equal(C.degreeToChord("4", "F"), "Bb");
  assert.equal(C.degreeToChord("7", "F#"), "E#°");
});

test("graus romanos: a caixa diz a qualidade", () => {
  assert.deepEqual(["I", "ii", "II7", "IV", "iv", "bVII", "vii°", "viiø", "V/vi"].map(x => C.degreeToChord(x, "G")).slice(0, 8),
    ["G", "Am", "A7", "C", "Cm", "F", "F#°", "F#m7(b5)"]);
  assert.equal(C.degreeToChord("V/3", "G"), "D/B");
});

test("o que não é grau fica de fora", () => {
  for (const x of ["8", "x", "Amo", "", "I/", "2//3"]) assert.equal(C.degreeToChord(x, "C"), null, x);
  assert.equal(C.resolveEarToken("Am7", "C"), "Am7");
  assert.equal(C.earBad("2 G7", "C"), false);
  assert.equal(C.earBad("2 oi", "C"), true);
});

test("acorde volta a grau e o grau volta ao mesmo acorde", () => {
  for (const key of ["C", "Eb", "Am", "F#m"]) for (const ch of ["1", "2", "3", "4", "5", "6", "7", "57", "27", "77", "17M", "II7", "bVII", "iv", "5/7", "vii°7", "5sus4", "#iv°"]) {
    const chord = C.degreeToChord(ch, key)!;
    assert.ok(chord, ch + " em " + key);
    assert.equal(C.degreeToChord(C.chordToEarDegree(chord, key), key), chord, ch + " em " + key);
  }
  assert.equal(C.chordToEarDegree("Dm7", "C"), "27");
  assert.equal(C.chordToEarDegree("D7", "C"), "II7");
  assert.equal(C.chordToEarDegree("G/B", "C"), "5/7");
});

test("letra vira linhas com quadradinhos e volta com os acordes no lugar", () => {
  const text = "Minha música\n\n[Refrão]\nC       G\nPrimeira linha da letra\nSegunda linha\n\nAm  F";
  const rows = C.earRows(text);
  assert.equal(rows[0], "Minha música");
  assert.equal(rows[2], "[Refrão]");
  const r1 = rows[3] as C.EarRow, r2 = rows[4] as C.EarRow, r3 = rows[6] as C.EarRow;
  assert.equal(r1.lyric, "Primeira linha da letra");
  assert.equal(r1.cells[0], "C"); assert.equal(r1.cells[2], "G");
  assert.equal(r2.lyric, "Segunda linha"); assert.ok(r2.cells.every(c => !c));
  assert.equal(r3.lyric, null); assert.deepEqual(r3.cells.slice(0, 2), ["Am", "F"]);
  // Sem mudanças, o texto volta igual.
  assert.equal(C.earText(rows, "C"), text);
  // Graus digitados viram acordes na coluna do quadradinho.
  r2.cells[0] = "4"; r2.cells[3] = "57";
  assert.equal(C.earText(rows, "C").split("\n").slice(5, 7).join("\n"), "F           G7\nSegunda linha");
  // Só a letra: cada linha ganha seus quadradinhos vazios.
  const plain = C.earRows("Título\numa linha");
  assert.equal((plain[1] as C.EarRow).lyric, "uma linha");
  assert.equal(C.earText(plain, "C"), "Título\numa linha");
});

test("linha só de acordes (introdução) não gruda na letra seguinte", () => {
  const rows = C.earRows("Música\numa linha\noutra linha");
  rows.splice(1, 0, {cells: ["1", "", "5"], lyric: null});
  const text = C.earText(rows, "C");
  assert.equal(text, "Música\nC       G\n\numa linha\noutra linha");
  // Reabrir não acumula linhas vazias.
  assert.equal(C.earText(C.earRows(text), "C"), text);
  // Com acordes na linha seguinte, não precisa separar.
  (rows[2] as C.EarRow).cells[0] = "4";
  assert.equal(C.earText(rows, "C"), "Música\nC       G\nF\numa linha\noutra linha");
});

test("acordes longos não se sobrepõem", () => {
  assert.equal(C.cellsToLine(["Bm7(b5)", "E7", "", "Am"], "Am"), "Bm7(b5) E7  Am");
  assert.equal(C.earCellAs("2 57", "C", "cifras"), "Dm G7");
  assert.equal(C.earCellAs("Dm G7", "C", "graus"), "2 57");
});

test("transpor reescreve só as linhas de acordes", () => {
  const text = "Dia de sol\nG       D/F#\nDia de sol\n[Refrão]\nEm  C";
  assert.equal(C.transposeText(text, 2, "A"), "Dia de sol\nA       E/G#\nDia de sol\n[Refrão]\nF#m D");
  assert.equal(C.transposeText(text, -2, "F"), "Dia de sol\nF       C/E\nDia de sol\n[Refrão]\nDm  Bb");
  assert.equal(C.transposeText(text, 0, "G"), text);
});

test("linha de acordes que ninguém mexeu volta exatamente igual", () => {
  const text = "Música\nA#  Cmaj7(#11)  D-\numa linha";
  const rows = C.earRows(text);
  // O diálogo mostra em graus e converte de volta; sem mexer, a grafia original fica.
  const shown = rows.map(l => typeof l === "string" ? l : {...l, cells: l.cells.map(c => C.earCellAs(c, "C", "graus"))});
  assert.equal(C.earText(shown, "C"), text);
  // Mexeu na fileira: ela é escrita de novo a partir dos quadradinhos.
  const r = shown[1] as C.EarRow;
  assert.equal(C.earText([shown[0], {cells: r.cells, lyric: r.lyric}], "C"), "Música\nBb  Cmaj7(#11)  D-\numa linha");
});

test("passagem entre parênteses e acordes com parênteses", () => {
  const rows = C.earRows("Música\n(C  G)  Cmaj7(#11)\numa linha");
  const r = rows[1] as C.EarRow;
  assert.deepEqual(r.cells.filter(Boolean), ["(C", "G)", "Cmaj7(#11)"]);
  assert.equal(C.earBad("(1 5)", "C"), false);
  assert.equal(C.earCellAs("(1", "C", "cifras"), "(C");
  assert.equal(C.earCellAs("(C", "C", "graus"), "(1");
});
