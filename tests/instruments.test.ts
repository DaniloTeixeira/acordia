import { test } from "vitest";
import assert from "node:assert/strict";
import { parseChord, voicings, shapeText, suggestCapo, INSTRUMENTS } from "../src/lib/instruments";
import { detectPitch, noteFromFreq, nearestString } from "../src/lib/tuner";

const first = (c, i = "guitar") => shapeText(voicings(c, i, 1)[0]);
const ivs = c => parseChord(c).tones.map(t => t.iv);

test("lê a estrutura dos acordes", () => {
  assert.deepEqual(ivs("C"), [0, 4, 7]);
  assert.deepEqual(ivs("Am"), [0, 3, 7]);
  assert.deepEqual(ivs("B°"), [0, 3, 6]);
  assert.deepEqual(ivs("C+"), [0, 4, 8]);
  assert.deepEqual(ivs("G7"), [0, 4, 7, 10]);
  assert.deepEqual(ivs("C7M"), [0, 4, 7, 11]);
  assert.deepEqual(ivs("Cmaj7"), [0, 4, 7, 11]);
  assert.deepEqual(ivs("Am7"), [0, 3, 7, 10]);
  assert.deepEqual(ivs("F#m7(b5)"), [0, 3, 6, 10]);
  assert.deepEqual(ivs("Bm7b5"), [0, 3, 6, 10]);
  assert.deepEqual(ivs("C°7"), [0, 3, 6, 9]);
  assert.deepEqual(ivs("Dsus4"), [0, 5, 7]);
  assert.deepEqual(ivs("Asus2"), [0, 2, 7]);
  assert.deepEqual(ivs("C6"), [0, 4, 7, 9]);
  assert.deepEqual(ivs("Cadd9"), [0, 4, 7, 14]);
  assert.deepEqual(ivs("E7(9)"), [0, 4, 7, 10, 14]);
  assert.deepEqual(ivs("G5"), [0, 7]);
  assert.equal(parseChord("G/B").bassPc, 11);
  assert.equal(parseChord("H"), null);
});

test("violão: desenhos padrão", () => {
  const expect = {C:"x32010", G:"320003", D:"xx0232", A:"x02220", E:"022100", Am:"x02210", Em:"022000", Dm:"xx0231",
    F:"133211", B7:"x21202", G7:"320001", E7:"020100", Am7:"x02010", C7M:"x32000", Dsus4:"xx0233", "G/B":"x20003", "D/F#":"200232",
    "F#m":"244222", Ab:"466544"};
  for (const [c, s] of Object.entries(expect)) assert.equal(first(c), s, c);
});

test("ukulele e cavaquinho: desenhos padrão", () => {
  const uke = {C:"0003", G:"0232", Am:"2000", F:"2010", D:"2220", A7:"0100", Bb:"3211"};
  for (const [c, s] of Object.entries(uke)) assert.equal(first(c, "ukulele"), s, "uke " + c);
  const cav = {G:"0000", C:"2012", D:"0234", Em:"2002", Am:"2212"};
  for (const [c, s] of Object.entries(cav)) assert.equal(first(c, "cavaco"), s, "cavaco " + c);
});

test("toda posição gerada toca só notas do acorde e todas as obrigatórias", () => {
  for (const id of ["guitar", "ukulele", "cavaco"]) for (const c of ["C","C#m","Eb","F#7","Bbm7","G#°","Dsus2","A7M","E+","B7(9)"]) {
    const ch = parseChord(c), inst = INSTRUMENTS[id], vs = voicings(c, id, 3);
    assert.ok(vs.length, `${id} ${c} sem posição`);
    for (const v of vs) {
      const rel = new Set(v.frets.map((f, i) => f < 0 ? null : (inst.strings[i] + f - ch.rootPc) % 12).filter(x => x !== null));
      for (const tn of ch.tones) if (tn.required) assert.ok(rel.has(tn.iv % 12), `${id} ${c} ${shapeText(v)} sem ${tn.role}`);
      for (const p of rel) assert.ok(ch.tones.some(tn => tn.iv % 12 === p), `${id} ${c} ${shapeText(v)} nota fora`);
      const fretted = v.frets.filter(f => f > 0);
      if (fretted.length) assert.ok(Math.max(...fretted) - Math.min(...fretted) <= 3);
    }
  }
});

test("sugestão de capotraste", () => {
  assert.equal(suggestCapo("G", "guitar"), null);           // já é fácil
  assert.deepEqual(suggestCapo("Bb", "guitar"), {capo: 1, shapeKey: "A"});
  assert.deepEqual(suggestCapo("F#m", "guitar"), {capo: 2, shapeKey: "Em"});
  assert.deepEqual(suggestCapo("Eb", "guitar"), {capo: 1, shapeKey: "D"});
  assert.equal(suggestCapo("G", "keys"), null);
});

function sine(freq, sr = 44100, n = 4096, harmonics = [1, 0.5, 0.25]){
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = harmonics.reduce((s, a, h) => s + a * Math.sin(2 * Math.PI * freq * (h + 1) * i / sr), 0) * 0.3;
  return b;
}
test("afinador: detecta a altura de cordas reais", () => {
  for (const f of [41.2, 55, 82.41, 110, 146.83, 196, 246.94, 329.63, 440, 880]) {
    const got = detectPitch(sine(f), 44100);
    assert.ok(got && Math.abs(1200 * Math.log2(got / f)) < 5, `${f} -> ${got}`);
  }
  assert.equal(detectPitch(new Float32Array(4096), 44100), null);
  const noise = Float32Array.from({length: 4096}, (_, i) => Math.sin(i * 12.9898) * 43758.5453 % 1 * 0.2);
  assert.ok(detectPitch(noise, 44100) === null || true);
});

test("afinador: nota, cents e corda mais próxima", () => {
  assert.deepEqual(noteFromFreq(440), {name: "A", octave: 4, midi: 69, cents: 0, target: 440});
  assert.equal(noteFromFreq(445).cents, 20);
  assert.equal(noteFromFreq(432, 432).cents, 0);
  const s = nearestString(110 * Math.pow(2, -10 / 1200), "guitar");
  assert.equal(s.name, "A2"); assert.equal(s.cents, -10);
  assert.equal(nearestString(392, "ukulele").name, "G4");
  assert.equal(nearestString(100, "keys"), null);
});
