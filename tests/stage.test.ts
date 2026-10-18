// Rode com: npm test
import { test } from "vitest";
import assert from "node:assert/strict";
import { focusPlatform } from "../src/lib/util";
import { wrapCols } from "../src/lib/layout";

test("palco: cifra quebra na largura da tela com o acorde em cima da sua sílaba", () => {
  const ch = "C           G          Am        F", ly = "Quão grande é o meu Deus, cantarei quão grande";
  assert.deepEqual(wrapCols(ch, ly, 100), [[0, ly.length]]);
  const parts = wrapCols(ch, ly, 24);
  assert.ok(parts.length > 1);
  parts.forEach(([a, z], i) => {
    assert.ok(z - a <= 24 || i === parts.length - 1);
    // Corta no começo de uma palavra, nunca no meio de um acorde.
    if(a){ assert.equal(ly[a - 1], " "); if(a < ch.length) assert.equal(ch[a - 1], " "); }
  });
  assert.equal(parts.map(([a, z]) => ly.slice(a, z)).join(""), ly);
  // Sem espaço para cortar (palavra enorme), corta mesmo assim: nenhum pedaço passa da largura.
  const long = "Aleluiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  wrapCols("D", long, 10).forEach(([a, z]) => assert.ok(z - a <= 10));
});

test("palco: dica de tocar sem interrupções conforme o aparelho", () => {
  assert.equal(focusPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15"), "ios");
  assert.equal(focusPlatform("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)"), "ios");
  // iPad em modo "site para computador" se apresenta como Mac, mas tem tela de toque.
  assert.equal(focusPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", 5), "ios");
  assert.equal(focusPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", 0), "other");
  assert.equal(focusPlatform("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"), "android");
  assert.equal(focusPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"), "other");
});
