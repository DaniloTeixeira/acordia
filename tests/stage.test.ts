// Rode com: npm test
import { test } from "vitest";
import assert from "node:assert/strict";
import { focusPlatform } from "../src/lib/util";

test("palco: dica de tocar sem interrupções conforme o aparelho", () => {
  assert.equal(focusPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15"), "ios");
  assert.equal(focusPlatform("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)"), "ios");
  // iPad em modo "site para computador" se apresenta como Mac, mas tem tela de toque.
  assert.equal(focusPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", 5), "ios");
  assert.equal(focusPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", 0), "other");
  assert.equal(focusPlatform("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"), "android");
  assert.equal(focusPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"), "other");
});
