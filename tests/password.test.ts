// Requisitos da senha e leitura das mensagens do Supabase.
import { test } from "vitest";
import assert from "node:assert/strict";
import * as P from "../src/lib/password";

test("por padrão: 8 caracteres, minúscula, maiúscula, número e símbolo", () => {
  assert.deepEqual(P.missing(P.DEFAULT_POLICY, "curta"), ["length", "upper", "digit", "symbol"]);
  assert.deepEqual(P.missing(P.DEFAULT_POLICY, "Louvor-2026"), []);
  // Letra com acento não conta como símbolo (o Supabase também não aceita).
  assert.deepEqual(P.missing(P.DEFAULT_POLICY, "Canção2026"), ["symbol"]);
});
const LENGTH_ONLY: P.PwPolicy = {rules: ["length"], min: 8};

test("lê o que o Supabase exige na mensagem de erro", () => {
  const all = P.fromError("Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~");
  assert.deepEqual(all.rules, ["length", "lower", "upper", "digit", "symbol"]);
  assert.deepEqual(P.missing(all, "senhaforte"), ["upper", "digit", "symbol"]);
  assert.deepEqual(P.missing(all, "Senha-forte1"), []);
  const letters = P.fromError("Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789", LENGTH_ONLY);
  assert.deepEqual(letters.rules, ["length", "letter", "digit"]);
  assert.deepEqual(P.missing(letters, "12345678"), ["letter"]);
  const longer = P.fromError("Password should be at least 10 characters.", LENGTH_ONLY);
  assert.equal(longer.min, 10);
  assert.deepEqual(P.missing(longer, "nove chars"), []);
  assert.deepEqual(P.missing(longer, "8 chars!"), ["length"]);
});

test("reconhece senha vazada", () => {
  assert.ok(P.isPwned("Password is known to be weak and easy to guess, please choose a different one."));
  assert.ok(!P.isPwned("Password should be at least 8 characters."));
});
