// Rode com: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/core.js");

test("reconhece acordes reais", () => {
  for (const c of ["C", "Am", "F#m7", "Bb", "G/B", "Am/G", "Cmaj7", "C7M", "C7+", "Cm7b5", "Asus4", "Asus",
    "Cadd9", "C9", "C(9)", "E7(9)", "Cmaj7(#11)", "C#dim", "C°", "Gº7", "C+", "Caug", "D5", "C-", "Bm7(11)", "A/C#"])
    assert.ok(C.CHORD_RE.test(c), c);
});

test("não confunde palavras em português com acordes", () => {
  for (const w of ["Amo", "Dois", "Dia", "Da", "Do", "Ai", "Ama", "Bia", "Cia", "Dim", "Ela", "Fé", "Gol"])
    assert.ok(!C.CHORD_RE.test(w), w);
  assert.equal(C.isChordLine("Ai Ai Ai"), false);
  assert.equal(C.isChordLine("Amo Dois"), false);
  assert.equal(C.isChordLine("  C   G/B   Am  "), true);
});

test("parseSong separa título, pares cifra/letra e remove marcações", () => {
  const s = C.parseSong("Minha Música\n[Intro]\nC  G\nAmo você\n\nAi Ai Ai\n\n(C G Am)");
  assert.equal(s.title, "Minha Música");
  assert.deepEqual(s.blocks[0], [{ kind: "pair", chord: "C  G", lyric: "Amo você" }]);
  assert.deepEqual(s.blocks[1], [{ kind: "lyric", lyric: "Ai Ai Ai" }]);
  assert.equal(s.blocks[2][0].kind, "chord");
});

test("parseSong em modo só letra não procura acordes", () => {
  const s = C.parseSong("T\nC G\nletra", true);
  assert.deepEqual(s.blocks[0].map(i => i.kind), ["lyric", "lyric"]);
});

test("dedupeBlocks remove blocos repetidos", () => {
  const s = C.parseSong("T\nC\nRefrão aqui\n\nG\nVerso\n\nC\nrefrão, aqui!");
  assert.equal(C.dedupeBlocks([s])[0].blocks.length, 2);
});

test("graus básicos", () => {
  assert.equal(C.chordToDegree("E", "E"), "I");
  assert.equal(C.chordToDegree("C#m7", "E"), "vi7");
  assert.equal(C.chordToDegree("B/D#", "E"), "V/VII");
  assert.equal(C.chordToDegree("Bb", "C"), "bVII");
  assert.equal(C.chordToDegree("D#°", "E"), "vii°");
});

test("graus de diminuto com baixo", () => {
  // Baixo na fundamental mantém #V; baixo em outra nota usa o grau do baixo.
  assert.equal(C.chordToDegree("C°/C", "E"), "#v°/#V");
  assert.equal(C.chordToDegree("C°/D", "E"), "#v°/bVII");
  assert.equal(C.chordToDegree("C#°/E", "C"), "#i°/III");
});

test("transposição", () => {
  assert.equal(C.transposeChord("C", 2, "D"), "D");
  assert.equal(C.transposeChord("G/B", 2, "A"), "A/C#");
  assert.equal(C.transposeChord("C", 5, "F"), "F");
  assert.equal(C.transposeChord("A", 1, "Bb"), "Bb");
  assert.equal(C.lineTranspose("C   G   Am", 2, "D"), "D   A   Bm");
});

test("lineToDegrees mantém o alinhamento", () => {
  assert.equal(C.lineToDegrees("E       A", "E"), "I       IV");
});

test("detecção de tom", () => {
  assert.equal(C.detectKey(C.parseSong("T\nG  D  Em  C\nletra\n\nG\nfim")), "G");
  assert.equal(C.detectKey(C.parseSong("T\nsó letra")), "E");
});

test("sanitizeEntry valida campos importados", () => {
  assert.equal(C.sanitizeEntry(null), null);
  assert.equal(C.sanitizeEntry({ text: 42 }), null);
  assert.equal(C.sanitizeEntry({ text: "   \n  " }), null);
  const r = C.sanitizeEntry({ id: 7, title: 3, text: "Nome\nC\nletra", type: "x", key: "H", target: "Bb", updatedAt: "ontem" });
  assert.equal(r.id, "");
  assert.equal(r.title, "Nome");
  assert.equal(r.type, "");
  assert.equal(r.key, "");
  assert.equal(r.target, "Bb");
  assert.ok(Number.isFinite(r.updatedAt));
  assert.equal(C.sanitizeEntry({ id: "a1", text: "X\ny", type: "letra", updatedAt: 5 }).type, "letra");
});
