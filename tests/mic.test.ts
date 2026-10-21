// Motivo da falha do microfone: cada erro do getUserMedia vira a mensagem certa.
import { test } from "vitest";
import assert from "node:assert/strict";
import { micErrorKind } from "../src/lib/tuner";

test("erro do microfone vira o motivo certo", () => {
  const k = (name?: string) => micErrorKind(name ? {name} : new TypeError("x"));
  assert.equal(k("NotAllowedError"), "denied");
  assert.equal(k("SecurityError"), "denied");
  assert.equal(k("NotFoundError"), "nomic");
  assert.equal(k("NotReadableError"), "busy");
  assert.equal(k(), "unsupported"); // navigator.mediaDevices indefinido
  assert.equal(micErrorKind(null), "unsupported");
});
