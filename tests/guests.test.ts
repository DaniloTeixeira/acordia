// Convidado de um evento: prazo, quem já saiu e quando estender.
import { test } from "vitest";
import assert from "node:assert/strict";
import { guestUntil, guestGone, isGuest, splitGuests, extendedUntil, GUEST_GRACE_MS } from "../src/lib/guests";

const A = "2026-11-10T19:00:00.000Z", B = "2026-11-17T19:00:00.000Z";

test("o prazo é o último evento mais 12 horas", () => {
  assert.equal(guestUntil([A]), new Date(new Date(A).getTime() + GUEST_GRACE_MS).toISOString());
  assert.equal(guestUntil([B, A]), "2026-11-18T07:00:00.000Z");
});

test("convidado sai depois do prazo; membro fixo nunca", () => {
  const now = new Date("2026-11-18T07:00:00.000Z").getTime();
  assert.equal(guestGone({guest_until: "2026-11-18T07:00:00.000Z"}, now), true);
  assert.equal(guestGone({guest_until: "2026-11-18T07:00:01.000Z"}, now), false);
  assert.equal(guestGone({guest_until: null}, now), false);
  assert.equal(guestGone({}, now), false);
  assert.equal(isGuest({guest_until: A}), true);
  assert.equal(isGuest({guest_until: null}), false);
});

test("separa os atuais dos convidados que já saíram", () => {
  const now = new Date("2026-11-12T00:00:00.000Z").getTime();
  const list = [{id: 1, guest_until: null}, {id: 2, guest_until: "2026-11-11T00:00:00.000Z"}, {id: 3, guest_until: "2026-11-13T00:00:00.000Z"}];
  const s = splitGuests(list, now);
  assert.deepEqual(s.current.map(m => m.id), [1, 3]);
  assert.deepEqual(s.gone.map(m => m.id), [2]);
});

test("só estende o prazo de convidado, e só para depois", () => {
  assert.equal(extendedUntil("2026-11-11T00:00:00.000Z", "2026-11-12T00:00:00.000Z"), "2026-11-12T00:00:00.000Z");
  assert.equal(extendedUntil("2026-11-12T00:00:00.000Z", "2026-11-11T00:00:00.000Z"), null);
  assert.equal(extendedUntil(null, "2026-11-12T00:00:00.000Z"), null);
});
