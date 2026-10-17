// Regras da sincronização: vale a mudança mais recente.
import { test } from "vitest";
import assert from "node:assert/strict";
import { decide, isAutoSetlist, type Remote } from "../src/lib/syncrules";

const r = (updated_at: number, deleted = false): Remote => ({id: "s1", data: deleted ? null : {}, updated_at, deleted, server_at: ""});

test("versão da nuvem mais nova substitui a daqui", () => {
  assert.equal(decide(r(200), 100, undefined), "apply");
  assert.equal(decide(r(200), undefined, undefined), "apply");
});

test("nada a fazer quando aqui já está igual ou mais novo", () => {
  assert.equal(decide(r(100), 100, undefined), "skip");
  assert.equal(decide(r(100), 150, undefined), "skip");
});

test("mudança daqui ainda não enviada e mais nova fica", () => {
  assert.equal(decide(r(100), 150, {op: "put", at: 150}), "keep");
  assert.equal(decide(r(100, true), 150, {op: "put", at: 150}), "keep");
  assert.equal(decide(r(100), undefined, {op: "del", at: 150}), "keep");
});

test("mudança daqui mais velha que a da nuvem perde", () => {
  assert.equal(decide(r(300), 150, {op: "put", at: 150}), "apply");
  assert.equal(decide(r(300), undefined, {op: "del", at: 150}), "apply");
});

test("exclusão vinda da nuvem", () => {
  assert.equal(decide(r(300, true), 100, undefined), "remove");
  assert.equal(decide(r(300, true), undefined, undefined), "skip");
});

test("repertório vazio criado sozinho não sobe", () => {
  assert.ok(isAutoSetlist({kind: "setlist", name: "Meu repertório", items: []}));
  assert.ok(!isAutoSetlist({kind: "setlist", name: "Meu repertório", items: [1]}));
  assert.ok(!isAutoSetlist({kind: "setlist", name: "Domingo", items: []}));
});
