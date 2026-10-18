// Lado da dica: o que couber com menos deslocamento, ou o preferido (data-tip-side) quando couber.
import { test } from "vitest";
import assert from "node:assert/strict";
import { placeTip } from "../src/ui/tooltips";

const rect = (left: number, top: number, w: number, h: number) => ({left, top, width: w, height: h, right: left + w, bottom: top + h} as DOMRect);

test("placeTip: o lado preferido vence quando cabe", () => {
  const r = rect(1200, 700, 38, 38);
  assert.equal(placeTip(r, 120, 30, 1280, 800).side, "top");
  assert.equal(placeTip(r, 120, 30, 1280, 800, 8, 8, "left").side, "left");
});

test("placeTip: o lado preferido que não cabe é ignorado", () => {
  assert.notEqual(placeTip(rect(4, 300, 38, 38), 120, 30, 1280, 800, 8, 8, "left").side, "left");
});
