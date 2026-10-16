// Rode com: npm test
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../js/core.js";
import { setLang } from "../js/i18n.js";

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

test("graus romanos", () => {
  assert.equal(C.chordToDegree("E", "E"), "I");
  assert.equal(C.chordToDegree("C#m7", "E"), "vi7");
  assert.equal(C.chordToDegree("B/D#", "E"), "V/VII");
  assert.equal(C.chordToDegree("Bb", "C"), "bVII");
  assert.equal(C.chordToDegree("D#°", "E"), "vii°");
});

test("graus em números", () => {
  assert.equal(C.chordToDegree("E", "E", "arabic"), "1");
  assert.equal(C.chordToDegree("C#m7", "E", "arabic"), "6m7");
  assert.equal(C.chordToDegree("B/D#", "E", "arabic"), "5/7");
  assert.equal(C.chordToDegree("Bb", "C", "arabic"), "b7");
  assert.equal(C.chordToDegree("D#°", "E", "arabic"), "7°");
});

test("graus de diminuto com baixo", () => {
  assert.equal(C.chordToDegree("C°/C", "E"), "#v°/#V");
  assert.equal(C.chordToDegree("C°/D", "E"), "#v°/bVII");
  assert.equal(C.chordToDegree("C#°/E", "C"), "#i°/III");
});

test("graus em tom menor usam a tônica menor", () => {
  assert.equal(C.chordToDegree("Am", "Am"), "i");
  assert.equal(C.chordToDegree("C", "Am"), "bIII");
  assert.equal(C.chordToDegree("E7", "Am"), "V7");
});

test("transposição", () => {
  assert.equal(C.transposeChord("C", 2, "D"), "D");
  assert.equal(C.transposeChord("G/B", 2, "A"), "A/C#");
  assert.equal(C.transposeChord("C", 5, "F"), "F");
  assert.equal(C.transposeChord("A", 1, "Bb"), "Bb");
  assert.equal(C.transposeChord("Am", 5, "Dm"), "Dm");
  assert.equal(C.transposeChord("E", 6, "Bbm"), "Bb");
  assert.equal(C.lineTranspose("C   G   Am", 2, "D"), "D   A   Bm");
  assert.equal(C.keyShift("Am", "Bm"), 2);
});

test("lineToDegrees mantém o alinhamento", () => {
  assert.equal(C.lineToDegrees("E       A", "E"), "I       IV");
});

test("detecção de tom maior e menor", () => {
  assert.equal(C.detectKey(C.parseSong("T\nG  D  Em  C\nletra\n\nG\nfim")), "G");
  assert.equal(C.detectKey(C.parseSong("T\nAm  F  C  G\nletra\n\nE7\nmais\n\nAm\nfim")), "Am");
  assert.equal(C.detectKey(C.parseSong("T\nsó letra")), "E");
});

test("transições entre tons", () => {
  setLang("pt");
  assert.deepEqual(C.transition("G", "G"), {semitones:0, same:true, text:"mesmo tom", passing:null});
  const up = C.transition("G", "A");
  assert.equal(up.text, "sobe 1 tom"); assert.equal(up.passing, "E7");
  assert.equal(C.transition("A", "G").text, "desce 1 tom");
  assert.equal(C.transition("C", "F").text, "sobe 2 tons e ½");
  assert.equal(C.transition("C", "Bb").passing, "F7");
  assert.equal(C.transition("A", "Am").text, "mesma tônica");
  assert.equal(C.transition("", "A"), null);
  setLang("en");
  assert.equal(C.transition("G", "A").text, "up a whole step");
  setLang("pt");
});

test("escalas com grafia correta", () => {
  assert.deepEqual(C.spellScale("C", "maior"), ["C","D","E","F","G","A","B"]);
  assert.deepEqual(C.spellScale("F", "maior"), ["F","G","A","Bb","C","D","E"]);
  assert.deepEqual(C.spellScale("F#", "maior"), ["F#","G#","A#","B","C#","D#","E#"]);
  assert.deepEqual(C.spellScale("A", "harmonica"), ["A","B","C","D","E","F","G#"]);
  assert.deepEqual(C.spellScale("E", "pentaMenor"), ["E","G","A","B","D"]);
  assert.deepEqual(C.scaleDegrees("menor"), ["1","2","b3","4","5","b6","b7"]);
});

test("campo harmônico", () => {
  setLang("pt");
  const c = C.harmonicField("C", "maior");
  assert.deepEqual(c.map(x => x.name), ["C","Dm","Em","F","G","Am","B°"]);
  assert.deepEqual(c.map(x => x.degree), ["I","ii","iii","IV","V","vi","vii°"]);
  assert.deepEqual(c.map(x => x.fn), ["T","SD","T","SD","D","T","D"]);
  assert.deepEqual(C.harmonicField("G", "maior", true).map(x => x.name), ["G7M","Am7","Bm7","C7M","D7","Em7","F#m7(b5)"]);
  assert.deepEqual(C.harmonicField("A", "harmonica").map(x => x.name), ["Am","B°","C+","Dm","E","F","G#°"]);
  assert.deepEqual(C.harmonicField("A", "menor").map(x => x.degree), ["i","ii°","bIII","iv","v","bVI","bVII"]);
  assert.deepEqual(C.harmonicField("C", "maior")[4].pcs, [7, 11, 14]);
  assert.equal(C.harmonicField("C", "pentaMaior").length, 0);
  setLang("en");
  assert.equal(C.harmonicField("C", "maior", true)[0].name, "Cmaj7");
  setLang("pt");
});

test("relativas", () => {
  assert.equal(C.relativeKey("C"), "Am");
  assert.equal(C.relativeKey("F"), "Dm");
  assert.equal(C.relativeKey("Bb"), "Gm");
  assert.equal(C.relativeKey("Em"), "G");
  assert.equal(C.relativeKey("C#m"), "E");
});

// RNG determinístico para os testes do treino.
function seeded(s){ return () => (s = (s * 16807) % 2147483647) / 2147483647; }

test("perguntas do treino são coerentes", () => {
  for (const kind of ["grau","qualGrau","nota","relativa","ouvido","misto"]) for (const level of ["facil","medio","dificil"]) {
    const rng = seeded(7 + kind.length + level.length);
    for (let i = 0; i < 40; i++) {
      const q = C.makeQuestion(kind, level, rng);
      assert.ok(q.prompt && q.answer, kind);
      assert.ok(q.options.includes(q.answer), `${kind}: ${q.prompt} -> ${q.answer} em ${q.options}`);
      assert.equal(new Set(q.options).size, q.options.length, "opções repetidas");
      assert.ok(q.options.length >= 2 && q.options.length <= 4);
    }
  }
  const q = C.makeQuestion("grau", "facil", seeded(3));
  assert.match(q.prompt, /^No tom de /);
});

test("sanitizeEntry valida campos importados", () => {
  assert.equal(C.sanitizeEntry(null), null);
  assert.equal(C.sanitizeEntry({ text: 42 }), null);
  assert.equal(C.sanitizeEntry({ text: "   \n  " }), null);
  const r = C.sanitizeEntry({ id: 7, title: 3, text: "Nome\nC\nletra", type: "x", key: "H", target: "Bb", bpm: "abc", updatedAt: "ontem" });
  assert.equal(r.id, "");
  assert.equal(r.title, "Nome");
  assert.equal(r.type, "");
  assert.equal(r.key, "");
  assert.equal(r.target, "Bb");
  assert.equal(r.bpm, "");
  assert.ok(Number.isFinite(r.updatedAt));
  assert.equal(C.sanitizeEntry({ id: "a1", text: "X\ny", type: "letra", key: "F#m", bpm: 72.4, updatedAt: 5 }).key, "F#m");
  assert.equal(C.sanitizeEntry({ text: "X\ny", bpm: 72.4 }).bpm, "72");
});

test("sanitizeOptions e sanitizeItem", () => {
  assert.deepEqual(C.sanitizeOptions(null), C.DEFAULT_OPTIONS);
  assert.deepEqual(C.sanitizeOptions({columns: 3, maxPages: 9, minFont: 2, degreeStyle: "x", dedupe: "s"}),
    Object.assign({}, C.DEFAULT_OPTIONS, {columns: "auto", maxPages: 2, minFont: 7}));
  assert.deepEqual(C.sanitizeItem({target: "Q", capo: "14", singer: 5, notes: "ok"}), {target: "", capo: "", singer: "", notes: "ok"});
  assert.deepEqual(C.sanitizeItem({target: "Am", capo: 3}), {target: "Am", capo: "3", singer: "", notes: ""});
});
