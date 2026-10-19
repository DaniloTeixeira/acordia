// Rode com: npm test
import { test } from "vitest";
import assert from "node:assert/strict";
import * as C from "../src/lib/core";
import { setLang } from "../src/lib/i18n";

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

test("parseSong em modo só letra tira as linhas de cifra e limpa a letra", () => {
  const s = C.parseSong("T\nC G\nobede_cer   a   Ti\n\nAmo Te Dia", true);
  assert.deepEqual(s.blocks.map(b => b.map(i => [i.kind, i.lyric])), [[["lyric", "obedecer a Ti"]], [["lyric", "Amo Te Dia"]]]);
});

test("parseSong marca o refrão pela marcação [Refrão] (e não pelo [Pré-refrão])", () => {
  const s = C.parseSong("T\n[Primeira Parte]\nC\nverso um\n[Pré-Refrão]\nG\npré\n\n[Refrão 2x]\nC  G\nrefrão um\nrefrão dois\n\n[Coro]\nAm\noutro");
  assert.deepEqual(s.blocks.map(b => b.map(it => it.lyric).join("/")), ["verso um", "pré", "refrão um/refrão dois", "outro"]);
  assert.deepEqual(s.chorus, [false, false, true, true]);
});

test("parseSong: com o fim marcado, o refrão vai até ele (mesmo com linhas vazias no meio)", () => {
  const txt = (end: string) => `T\nC\nverso\n\n[Refrão]\nG\nref a\n\nD\nref b\n${end}\nEm\nponte\n\nC\nfim`;
  for(const end of ["[/Refrão]", "[Fim do refrão]", "[fim refrao]", "[End of chorus]", "[/Coro]"])
    assert.deepEqual(C.parseSong(txt(end)).chorus, [false, true, true, false, false], end);
  // Sem o fim marcado, continua só o bloco seguinte; outra marcação também encerra.
  assert.deepEqual(C.parseSong(txt("")).chorus, [false, true, false, false, false]);
  assert.deepEqual(C.parseSong("T\n[Refrão]\nG\na\n\nD\nb\n[Ponte]\nEm\nc\n[/Refrão]").chorus, [true, true, false]);
});

test("parseSong: cifra dividida em partes, o refrão vai até a próxima marcação", () => {
  const s = C.parseSong("T\n[Primeira Parte]\nC\nverso\n\n[Refrão]\nF\nref a\nref b\n\nG\nref c\nref d\n\n( C G )\n\n[Segunda Parte]\nAm\nponte\n\n[Refrão]\nF\nref a\nref b");
  assert.deepEqual(s.chorus, [false, true, true, false, false, true]);
  // Refrão repetido sem marcação também é refrão.
  assert.deepEqual(C.parseSong("T\n[Primeira Parte]\nC\nverso\n\n[Refrão]\nF\nref a\nref b\n\n[Ponte]\nG\nponte\n\nF\nref a\nref b").chorus, [false, true, false, true]);
});

test("parseSong sem marcação trata como refrão o bloco de letra que se repete", () => {
  const s = C.parseSong("T\nC\nverso\nsegue\n\nG\nSanto, santo\né o Senhor\n\nAm\noutro verso\nfim\n\nG\nsanto santo\nÉ o Senhor!\n\nC\nverso");
  assert.deepEqual(s.chorus, [false, true, false, true, false]);
  // Com [Refrão] em algum lugar, vale só a marcação.
  assert.deepEqual(C.parseSong("T\n[Refrão]\nC\nlá\n\nG\nverso a\nverso b\n\nG\nverso a\nverso b").chorus, [true, false, false]);
});

test("dedupeBlocks mantém o refrão junto dos blocos que ficam", () => {
  const s = C.parseSong("T\nC\nverso\n\nG\nrefrão a\nrefrão b\n\nAm\nponte\n\nG\nrefrão a\nrefrão b");
  const d = C.dedupeBlocks([s])[0];
  assert.equal(d.blocks.length, 3);
  assert.deepEqual(d.chorus, [false, true, false]);
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

test("detectKey não confunde o tom maior com a relativa menor (começar no vi ou no ii)", () => {
  // Músicas reais do repertório: começam no vi ou no ii e são em E.
  assert.equal(C.detectKey(C.parseSong("T\nC#m  A\nla\n\nE  B\nla\n\nA  B\nla\n\nE\nfim")), "E");
  assert.equal(C.detectKey(C.parseSong("T\nF#m7  E/G#  A2\nla\n\nB  E\nla")), "E");
  // vi-IV-I-V é tom maior; com o V maior da menor harmônica, é menor.
  assert.equal(C.detectKey(C.parseSong("T\nAm  F  C  G\nla\n\nAm  F  C  G\nla")), "C");
  assert.equal(C.detectKey(C.parseSong("T\nAm  F\nla\n\nE7\nla\n\nAm\nfim")), "Am");
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
  for (const kind of ["grau","qualGrau","nota","relativa","ouvido","grauOuvido","misto"]) for (const level of ["facil","medio","dificil"]) {
    const rng = seeded(7 + kind.length + level.length);
    for (let i = 0; i < 40; i++) {
      const q = C.makeQuestion(kind, level, rng);
      assert.ok(q.prompt && q.answer, kind);
      assert.ok(q.options.includes(q.answer), `${kind}: ${q.prompt} -> ${q.answer} em ${q.options}`);
      assert.equal(new Set(q.options).size, q.options.length, "opções repetidas");
      assert.ok(q.options.length >= 2 && q.options.length <= 4);
    }
  }
  // No modo lista completa, toda resposta precisa existir entre as opções oferecidas.
  const notes = C.NOTE_GRID.flat();
  for (const kind of ["grau","qualGrau","nota","relativa","ouvido","grauOuvido"]) for (const level of ["facil","medio","dificil"]) {
    const rng = seeded(11 + kind.length * 3 + level.length);
    for (let i = 0; i < 60; i++) {
      const q = C.makeQuestion(kind, level, rng);
      if (q.full.type === "notes") assert.ok(notes.includes(q.answer), q.answer);
      else if (q.full.type === "chord") assert.ok(notes.some(n => C.CHORD_QUALITIES.some(s => n + s === q.answer)), q.answer);
      else assert.ok(q.full.options.includes(q.answer), `${kind}: ${q.answer} fora de ${q.full.options}`);
    }
  }
  const q = C.makeQuestion("grau", "facil", seeded(3));
  assert.match(q.prompt, /^No tom de /);
});

test("grau de ouvido: a nota tocada corresponde ao grau da resposta", () => {
  const rng = seeded(5);
  for (const level of ["facil","medio","dificil"]) for (let i = 0; i < 80; i++) {
    const q = C.makeQuestion("grauOuvido", level, rng), n = +q.answer;
    assert.ok(q.ear && q.autoplay);
    if (level === "facil") assert.ok([1,3,5].includes(n));
    if (!q.ear.minor || level !== "dificil") assert.equal(q.ear.minor, level === "dificil" ? q.ear.minor : false);
    const steps = C.DEGREE_STEPS[q.ear.minor ? "menor" : "maior"];
    assert.equal(q.ear.note % 12, steps[n - 1]);
  }
  // Cadência: quatro acordes, o último igual ao primeiro (volta à tônica), terça certa no maior e no menor.
  assert.deepEqual(C.cadence(false)[0], [-12, 0, 4, 7]);
  assert.deepEqual(C.cadence(true)[0], [-12, 0, 3, 7]);
  assert.deepEqual(C.cadence(false)[3], C.cadence(false)[0]);
});

test("voz: classificação pela extensão, transposição e tom sugerido", () => {
  assert.equal(C.voiceType(43, 67), "baritono");   // G2–G4
  assert.equal(C.voiceType(48, 72), "tenor");      // C3–C5
  assert.equal(C.voiceType(60, 84), "soprano");    // C4–C6
  assert.equal(C.voiceType(53, 76), "contralto");
  // A diferença é dobrada para -6..+5 (o cantor escolhe a oitava).
  assert.equal(C.voiceShift(74, 69), -5);          // agudo D5, cantor até A4: descer 5
  assert.equal(C.voiceShift(62, 69), -5);          // mesma nota uma oitava abaixo: idem
  assert.equal(C.voiceShift(64, 69), 5);
  assert.equal(C.voiceShift(63, 69), -6);
  assert.equal(C.voiceShift(69, 69), 0);
  assert.equal(C.transposeKey("G", 3), "Bb");
  assert.equal(C.transposeKey("Em", -2), "Dm");
  assert.equal(C.transposeKey("A", -5), "E");
  assert.equal(C.transposeKey("D", 4), "F#");
  assert.equal(C.transposeKey("xyz", 2), "");
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
  assert.equal(r.target, undefined);
  assert.equal(r.bpm, "");
  assert.ok(Number.isFinite(r.updatedAt));
  assert.equal(C.sanitizeEntry({ id: "a1", text: "X\ny", type: "letra", key: "F#m", bpm: 72.4, updatedAt: 5 }).key, "F#m");
  assert.equal(C.sanitizeEntry({ text: "X\ny", bpm: 72.4 }).bpm, "72");
  // Dó sustenido maior salvo antes vira Ré bemol; o menor continua C#m.
  assert.equal(C.sanitizeEntry({ text: "X\ny", key: "C#" }).key, "Db");
  assert.equal(C.sanitizeEntry({ text: "X\ny", key: "C#m" }).key, "C#m");
  assert.equal(C.sanitizeItem({ target: "C#" }).target, "Db");
});

test("links de referência e YouTube", () => {
  assert.equal(C.sanitizeUrl("javascript:alert(1)"), "");
  assert.equal(C.sanitizeUrl("data:text/html,x"), "");
  assert.equal(C.sanitizeUrl(42), "");
  assert.equal(C.sanitizeUrl("youtu.be/dQw4w9WgXcQ"), "https://youtu.be/dQw4w9WgXcQ");
  assert.equal(C.sanitizeUrl(" https://example.com/a b "), "https://example.com/a%20b");
  for (const u of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42", "https://youtu.be/dQw4w9WgXcQ?si=x", "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://music.youtube.com/watch?v=dQw4w9WgXcQ"])
    assert.equal(C.youtubeId(u), "dQw4w9WgXcQ", u);
  assert.equal(C.youtubeId("https://vimeo.com/123"), "");
  assert.equal(C.youtubeId("https://youtube.com/watch?v=curto"), "");
  assert.equal(C.youtubeStart("https://youtu.be/dQw4w9WgXcQ?t=1m30s"), 90);
  assert.equal(C.youtubeStart("https://youtu.be/dQw4w9WgXcQ?t=42"), 42);
  assert.equal(C.sanitizeEntry({text:"A\nb", ref:"javascript:x"}).ref, "");
  assert.equal(C.sanitizeEntry({text:"A\nb", ref:"youtu.be/dQw4w9WgXcQ"}).ref, "https://youtu.be/dQw4w9WgXcQ");
});

test("sanitizeOptions e sanitizeItem", () => {
  assert.deepEqual(C.sanitizeOptions(null), C.DEFAULT_OPTIONS);
  assert.deepEqual(C.sanitizeOptions({columns: 3, maxPages: 9, minFont: 2, degreeStyle: "x", dedupe: "s"}),
    Object.assign({}, C.DEFAULT_OPTIONS, {columns: "auto", maxPages: 2, minFont: 7}));
  assert.deepEqual(C.sanitizeItem({target: "Q", capo: "14", singer: 5, notes: "ok"}), {target: "", capo: "", singer: "", solo: "", notes: "ok", arrangementId: "", moment: ""});
  assert.deepEqual(C.sanitizeItem({target: "Am", capo: 3, arrangementId: "a1", moment: "pos"}), {target: "Am", capo: "3", singer: "", solo: "", notes: "", arrangementId: "a1", moment: "pos"});
  assert.equal(C.sanitizeItem({solo: "x".repeat(90)}).solo.length, 80);
});

test("arranjos importados são validados", () => {
  assert.deepEqual(C.sanitizeArrangements("x"), []);
  const list = C.sanitizeArrangements([{id: "a1", name: " Acústico ", target: "G", capo: 2, notes: "leve"}, {name: "sem id"}, null, {id: "a2", target: "Z", capo: 40}]);
  assert.deepEqual(list, [{id: "a1", name: "Acústico", target: "G", capo: "2", notes: "leve"}, {id: "a2", name: "—", target: "", capo: "", notes: ""}]);
  assert.equal(C.sanitizeEntry({text: "A\nb", arrangements: [{id: "x", name: "Banda", target: "A"}]}).arrangements[0].target, "A");
});

test("treino com os acordes do repertório", () => {
  assert.equal(C.makeRepertoireQuestion([]), null);
  assert.equal(C.makeRepertoireQuestion([{title: "Só letra", key: "", chords: []}]), null);
  const entries = [{title: "Grande é o Senhor", key: "A", chords: ["A", "E/G#", "F#m7", "D", "Bm", "E7(9)"]}];
  for (let i = 0; i < 60; i++) {
    const q = C.makeRepertoireQuestion(entries, seeded(5 + i));
    assert.ok(q.prompt.includes("Grande é o Senhor"));
    assert.ok(q.options.includes(q.answer), q.prompt + " " + q.answer);
    if (q.full.type === "list") assert.ok(q.full.options.includes(q.answer));
    else assert.ok(["A","E","F#m","D","Bm"].includes(q.answer), q.answer);
  }
  const graus = new Set(Array.from({length: 80}, (_, i) => C.makeRepertoireQuestion(entries, seeded(100 + i))).filter(q => q.full.type === "list").map(q => q.answer));
  for (const g of graus) assert.ok(["I","V","vi","IV","ii"].includes(g), g);
});

test("opções: transpor tudo e desenhos do capo", () => {
  assert.equal(C.sanitizeOptions({transpose: 3}).transpose, 3);
  assert.equal(C.sanitizeOptions({transpose: 40}).transpose, 0);
  assert.equal(C.sanitizeOptions({transpose: 1.5}).transpose, 0);
  assert.equal(C.sanitizeOptions({capoShapes: true}).capoShapes, true);
  assert.equal(C.sanitizeOptions({capoShapes: "sim"}).capoShapes, false);
});
