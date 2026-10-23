import { describe, it, expect } from "vitest";
import { unseenJoins } from "../src/lib/notices";

const now = Date.parse("2026-10-23T12:00:00Z");
const row = (email: string, created_at: string) => ({email, created_at});

describe("unseenJoins", () => {
  it("ignora a própria entrada e o que já foi visto", () => {
    const rows = [row("eu@x.com", "2026-10-22T10:00:00Z"), row("a@x.com", "2026-10-21T10:00:00Z"), row("b@x.com", "2026-10-22T11:00:00Z")];
    expect(unseenJoins(rows, "eu@x.com", "2026-10-21T12:00:00Z", undefined, now)).toEqual(["b@x.com"]);
  });
  it("não mostra o que veio antes de a pessoa entrar no grupo", () => {
    const rows = [row("a@x.com", "2026-10-20T10:00:00Z"), row("b@x.com", "2026-10-22T10:00:00Z")];
    expect(unseenJoins(rows, "eu@x.com", "", "2026-10-21T00:00:00Z", now)).toEqual(["b@x.com"]);
  });
  it("esquece o que passou de 14 dias e não repete pessoa", () => {
    const rows = [row("velho@x.com", "2026-09-01T10:00:00Z"), row("a@x.com", "2026-10-22T10:00:00Z"), row("a@x.com", "2026-10-22T11:00:00Z")];
    expect(unseenJoins(rows, "eu@x.com", "", undefined, now)).toEqual(["a@x.com"]);
  });
  it("não avisa quem adicionou a pessoa", () => {
    const rows = [{email: "a@x.com", by_email: "eu@x.com", created_at: "2026-10-22T10:00:00Z"}];
    expect(unseenJoins(rows, "eu@x.com", "", undefined, now)).toEqual([]);
  });
});
