// Extensão vocal do perfil: validação, ordem das pontas e texto da faixa.
import { test } from "vitest";
import assert from "node:assert/strict";
import { cleanNote, cleanRange, rangeLabel, rangeType, newHold, holdStep, holdDone, HOLD_TICKS, GRACE_TICKS } from "../src/lib/voice";

test("nota fora dos limites ou não inteira é descartada", () => {
  assert.equal(cleanNote(41), 41);
  assert.equal(cleanNote(35), null);
  assert.equal(cleanNote(97), null);
  assert.equal(cleanNote(60.5), null);
  assert.equal(cleanNote("60"), null);
  assert.equal(cleanNote(null), null);
});

test("pontas trocadas voltam à ordem", () => {
  assert.deepEqual(cleanRange(72, 48), {low: 48, high: 72});
  assert.deepEqual(cleanRange(48, null), {low: 48, high: null});
  assert.deepEqual(cleanRange(10, 200), {low: null, high: null});
});

test("texto da faixa e tipo de voz", () => {
  assert.equal(rangeLabel({voice_low: 41, voice_high: 60}), "F2–C4");
  assert.equal(rangeLabel({voice_low: 41, voice_high: null}), "F2–?");
  assert.equal(rangeLabel({voice_low: null, voice_high: 60}), "?–C4");
  assert.equal(rangeLabel({}), "");
  assert.equal(rangeType({voice_low: 43, voice_high: 67}), "baritono");
  assert.equal(rangeType({voice_low: 43, voice_high: null}), "");
});

test("segurar a mesma nota por ~2 s conclui; trocar de nota recomeça", () => {
  let h = newHold();
  for(let i = 0; i < HOLD_TICKS - 1; i++) h = holdStep(h, 53);
  assert.equal(holdDone(h), false);
  h = holdStep(h, 53);
  assert.equal(holdDone(h), true);
  assert.equal(h.note, 53);
  // Passar por outra nota (glissando) não conclui: depois da tolerância, a contagem recomeça na nota nova.
  h = newHold();
  for(let n = 50; n < 60; n++) for(let i = 0; i < 10; i++) h = holdStep(h, n);
  assert.equal(holdDone(h), false);
});

test("poucas leituras fora da nota (vibrato, respiro) não reiniciam; muitas, sim", () => {
  let h = newHold();
  for(let i = 0; i < 20; i++) h = holdStep(h, 60);
  for(let i = 0; i < GRACE_TICKS; i++) h = holdStep(h, null);
  assert.equal(h.run, 20);
  h = holdStep(h, 60);
  assert.equal(h.run, 21);
  for(let i = 0; i <= GRACE_TICKS; i++) h = holdStep(h, null);
  assert.deepEqual(h, newHold());
  assert.equal(holdStep(newHold(), 20).note, null); // fora dos limites não conta
});
