import test from "node:test";
import assert from "node:assert/strict";
import { KEY_EXERCISES, buildExercise, degSemis, required, checkStep, scoreNotes, baseFor } from "../js/keys.js";

const ex = id => KEY_EXERCISES.find(e => e.id === id);

test("graus da escala maior viram semitons", () => {
  assert.deepEqual([0,1,2,3,4,5,6,7].map(degSemis), [0,2,4,5,7,9,11,12]);
  assert.equal(degSemis(-1), -1);
  assert.equal(degSemis(-3), -5);   // G abaixo do C
  assert.equal(degSemis(9), 16);
});

test("todo exercício é coerente em todos os tons", () => {
  for (const e of KEY_EXERCISES) for (let pc = 0; pc < 12; pc++) {
    const b = buildExercise(e, pc);
    assert.ok(b.steps.length > 0, e.id);
    for (const ev of b.events) {
      assert.equal(ev.midis.length, ev.fingers.length, `${e.id} dedos`);
      assert.ok(ev.fingers.every(f => f >= 1 && f <= 5), `${e.id} dedo inválido`);
      assert.ok(ev.t >= 0 && ev.t + ev.dur <= b.beats + 1e-9, `${e.id} fora do compasso`);
    }
    assert.ok(b.lo >= 28 && b.hi <= 96, `${e.id} extensão ${b.lo}-${b.hi}`);
    // As duas mãos cobrem o exercício inteiro.
    for (const h of ["rh", "lh"]) { const evs = b.events.filter(x => x.hand === h); assert.ok(evs.length, `${e.id} sem ${h}`); }
  }
});

test("escala em C e em G com nomes e dedilhado", () => {
  const c = buildExercise(ex("escala"), 0);
  assert.deepEqual(c.events.filter(e => e.hand === "rh").slice(0, 8).map(e => e.midis[0]), [60,62,64,65,67,69,71,72]);
  assert.deepEqual(c.events.filter(e => e.hand === "rh").slice(0, 8).map(e => e.fingers[0]), [1,2,3,1,2,3,4,5]);
  const g = buildExercise(ex("escala"), 7);
  assert.deepEqual(g.events.filter(e => e.hand === "rh").slice(0, 8).map(e => e.names[0]), ["G","A","B","C","D","E","F#","G"]);
  assert.equal(g.fingering, true);
  assert.equal(buildExercise(ex("escala"), 5).fingering, false);
  assert.equal(baseFor(7), 55);
});

test("acordes: esquerda em bloco, I–IV–V–I", () => {
  const b = buildExercise(ex("acordes"), 0);
  assert.deepEqual(b.events.filter(e => e.hand === "lh").map(e => e.names.join("")), ["CEG", "CFA", "BDG", "CEG"]);
});

test("baixo de Alberti cobre os 4 compassos", () => {
  const lh = buildExercise(ex("alberti"), 0).events.filter(e => e.hand === "lh");
  assert.equal(lh.length, 32);
  assert.deepEqual(lh.slice(0, 4).map(e => e.names[0]), ["C","G","E","G"]);
  assert.equal(lh.at(-1).t, 15.5);
});

test("passos: notas exigidas por mão e checagem", () => {
  const s = buildExercise(ex("cinco"), 0).steps[0];
  assert.deepEqual(required(s, "rh"), [60]);
  assert.deepEqual(required(s, "lh"), [48]);
  assert.deepEqual(required(s, "both").sort(), [48, 60]);
  assert.deepEqual(checkStep([48, 60], [60], 60), {done: false, wrong: false});
  assert.deepEqual(checkStep([48, 60], [60, 48], 48), {done: true, wrong: false});
  assert.equal(checkStep([48, 60], [61], 61).wrong, true);
});

test("pontuação no tempo por altura", () => {
  const exp = [{midi: 60, t: 1}, {midi: 62, t: 2}, {midi: 64, t: 3}];
  const r = scoreNotes(exp, [{midi: 60, t: 1.02}, {midi: 61, t: 2}, {midi: 64, t: 2.95}], 0.1);
  assert.equal(r.hits, 2); assert.equal(r.misses, 1); assert.equal(r.extras, 1);
  assert.equal(r.accuracy, 50);
});
