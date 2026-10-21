// Extensão vocal do perfil: validação, ordem das pontas e texto da faixa.
import { test } from "vitest";
import assert from "node:assert/strict";
import { cleanNote, cleanRange, rangeLabel, rangeType } from "../src/lib/voice";

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
