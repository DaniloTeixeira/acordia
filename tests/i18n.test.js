// Rode com: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { detectLang } from "../js/i18n.js";

test("idioma inicial: primeiro idioma do navegador que o app tem", () => {
  assert.equal(detectLang(["pt-BR", "en"], ""), "pt");
  assert.equal(detectLang(["es-MX"], ""), "es");
  assert.equal(detectLang(["en-US", "pt-BR"], "America/Sao_Paulo"), "en");
  assert.equal(detectLang(["fr-FR", "it", "pt-PT"], ""), "pt");
  assert.equal(detectLang(["ES"], ""), "es");
});

test("idioma inicial: fuso horário decide quando nenhum idioma serve", () => {
  assert.equal(detectLang(["fr-FR"], "America/Sao_Paulo"), "pt");
  assert.equal(detectLang(["de"], "Europe/Lisbon"), "pt");
  assert.equal(detectLang(["ja"], "America/Argentina/Buenos_Aires"), "es");
  assert.equal(detectLang(["it"], "Europe/Madrid"), "es");
  assert.equal(detectLang(["fr"], "Europe/Paris"), "en");
  assert.equal(detectLang([""], ""), "en");
});
