import { test } from "vitest";
import assert from "node:assert/strict";
import { PATTERNS, timeline, tolerance, scoreTaps, BARS, COUNT_IN } from "../src/lib/hands";

const P = id => PATTERNS.find(p => p.id === id);

test("padrões válidos: tempos dentro do compasso e em ordem", () => {
  for (const p of PATTERNS) for (const h of ["lh", "rh"]) {
    assert.ok(p[h].length > 0, p.id);
    p[h].forEach((b, i) => { assert.ok(b >= 0 && b < 4, `${p.id} ${b}`); if (i) assert.ok(b > p[h][i-1]); });
  }
  assert.equal(new Set(PATTERNS.map(p => p.id)).size, PATTERNS.length);
});

test("linha do tempo começa depois da contagem", () => {
  const tl = timeline(P("alternadas"), 60, 2, 10);
  assert.equal(tl.length, 2 * (2 + 2));
  assert.equal(tl[0].t, 10 + COUNT_IN);     // 60 bpm = 1 s por tempo
  assert.equal(tl[0].hand, "lh");
  assert.equal(tl[1].t, 10 + COUNT_IN + 1);
  assert.equal(tl.at(-1).t, 10 + COUNT_IN + 4 + 3);
});

test("tolerância encolhe quando as notas ficam próximas", () => {
  assert.equal(tolerance(P("juntas"), 60), 0.09);
  assert.ok(tolerance(P("semis"), 120) < 0.06);
});

test("pontuação: acertos, erros, notas a mais e adiantado/atrasado", () => {
  const exp = timeline(P("alternadas"), 60, BARS, 0);
  const perfect = scoreTaps(exp, exp.map(e => ({hand: e.hand, t: e.t + 0.02})), 0.09);
  assert.equal(perfect.accuracy, 100);
  assert.equal(perfect.misses, 0);
  assert.ok(Math.abs(perfect.meanOffset - 0.02) < 1e-9);

  const taps = exp.filter((_, i) => i % 2 === 0).map(e => ({hand: e.hand, t: e.t - 0.03}));
  taps.push({hand: "rh", t: 999});                                // nota a mais
  taps.push({hand: "lh", t: exp.find(e => e.hand === "rh").t});   // mão errada não conta
  const r = scoreTaps(exp, taps, 0.09);
  assert.equal(r.hits, exp.length / 2);
  assert.equal(r.misses, exp.length / 2);
  assert.equal(r.extras, 2);
  assert.equal(r.accuracy, Math.round(r.hits / (exp.length + 2) * 100));
  assert.ok(r.meanOffset < 0);

  const late = scoreTaps(exp, exp.map(e => ({hand: e.hand, t: e.t + 0.2})), 0.09);
  assert.equal(late.hits, 0);
});
