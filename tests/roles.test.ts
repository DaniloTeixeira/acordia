// Funções dos membros do grupo: separar, juntar e ligar/desligar.
import { test } from "vitest";
import assert from "node:assert/strict";
import { splitRoles, joinRoles, toggleRole, sortRoles, ROLES_MAX } from "../src/lib/roles";

test("separa as funções, sem vazias nem repetidas", () => {
  assert.deepEqual(splitRoles(""), []);
  assert.deepEqual(splitRoles("Violão"), ["Violão"]);
  assert.deepEqual(splitRoles(" Vocal ,violão,, Vocal , Mesa  de som "), ["Vocal", "violão", "Mesa de som"]);
  assert.deepEqual(splitRoles("Vocal, vocal"), ["Vocal"]);
});

test("junta com vírgula e respeita o limite", () => {
  assert.equal(joinRoles(["Vocal", "Violão"]), "Vocal, Violão");
  assert.equal(joinRoles([]), "");
  const many = Array.from({length: 30}, (_, i) => "Função número " + i);
  const s = joinRoles(many);
  assert.ok(s.length <= ROLES_MAX);
  assert.deepEqual(splitRoles(s), many.slice(0, splitRoles(s).length));
});

test("liga e desliga uma função", () => {
  assert.deepEqual(toggleRole(["Vocal"], "Violão"), ["Vocal", "Violão"]);
  assert.deepEqual(toggleRole(["Vocal", "Violão"], "vocal"), ["Violão"]);
});

test("sortRoles: ordem alfabética sem diferenciar maiúsculas e acentos", () => {
  assert.deepEqual(sortRoles(["Vocal", "baixo", "Violão", "Áudio", "Teclado"]), ["Áudio", "baixo", "Teclado", "Violão", "Vocal"]);
});
