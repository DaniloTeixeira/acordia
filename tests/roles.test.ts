// Funções dos membros do grupo: separar, juntar e ligar/desligar.
import { test } from "vitest";
import assert from "node:assert/strict";
import { splitRoles, joinRoles, toggleRole, sortRoles, rosterRoles, parseRoleSel, selString, toggleFav, toggleSelRole, ROLES_MAX } from "../src/lib/roles";

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

test("rosterRoles: sem marca vale a primeira função; com marca, as favoritas; sem função, linha vazia", () => {
  assert.deepEqual(rosterRoles("Vocal, Violão"), ["Vocal"]);
  assert.deepEqual(rosterRoles("Vocal*, Violão*, Baixo"), ["Vocal", "Violão"]);
  assert.deepEqual(rosterRoles(""), [""]);
});

test("favoritas: no máximo uma voz e um instrumento, nunca dois instrumentos", () => {
  assert.deepEqual(parseRoleSel("Violão*, Baixo*, Vocal").favs, ["Violão"]);
  assert.deepEqual(parseRoleSel("Violão*, Vocal*").favs, ["Violão", "Vocal"]);
  assert.deepEqual(splitRoles("Vocal*, Violão"), ["Vocal", "Violão"]);
  let sel = parseRoleSel("Vocal, Violão, Baixo");
  sel = toggleFav(sel, "Baixo");
  assert.deepEqual(sel.favs, ["Vocal", "Baixo"]);
  sel = toggleFav(sel, "Violão");
  assert.deepEqual(sel.favs, ["Vocal", "Violão"]);
  sel = toggleFav(sel, "Vocal");
  assert.deepEqual(sel.favs, ["Violão"]);
});

test("favoritas: mesa de som é só mesa, nunca com outra coisa", () => {
  assert.deepEqual(parseRoleSel("Mesa de som*, Vocal*").favs, ["Mesa de som"]);
  let sel = parseRoleSel("Vocal, Violão, Mesa de som");
  sel = toggleFav(sel, "Mesa de som");
  assert.deepEqual(sel.favs, ["Mesa de som"]);
  sel = toggleFav(sel, "Violão");
  assert.deepEqual(sel.favs, ["Violão"]);
  assert.deepEqual(rosterRoles(selString(toggleFav(parseRoleSel("Vocal, Mesa de som"), "Mesa de som"))), ["Mesa de som"]);
});

test("selString: formato antigo quando só a primeira é favorita, marcas quando há mais", () => {
  assert.equal(selString(parseRoleSel("Vocal, Violão")), "Vocal, Violão");
  assert.equal(selString(toggleFav(parseRoleSel("Vocal, Violão"), "Violão")), "Vocal*, Violão*");
  assert.deepEqual(parseRoleSel(selString(toggleFav(parseRoleSel("Vocal, Violão"), "Violão"))).favs, ["Vocal", "Violão"]);
});

test("tirar uma função tira também a favorita", () => {
  const sel = toggleSelRole(parseRoleSel("Vocal*, Violão*"), "Violão");
  assert.deepEqual(sel, {roles: ["Vocal"], favs: ["Vocal"]});
});
