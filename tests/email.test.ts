// Validação do e-mail na tela de entrar e na lista de quem pode entrar.
import { test } from "vitest";
import assert from "node:assert/strict";
import { validEmail } from "../src/lib/password";

test("aceita e-mails comuns", () => {
  for (const e of ["danilo@gmail.com", "Maria.Silva@outlook.com.br", "a+louvor@igreja.org", " joao@x.io "]) assert.ok(validEmail(e), e);
});

test("recusa e-mails incompletos", () => {
  for (const e of ["", "danilo", "danilo@", "danilo@gmail", "danilo@gmail.", "danilo@gmail.c", "@gmail.com", "da nilo@gmail.com", "danilo@@gmail.com"]) assert.ok(!validEmail(e), e);
});
