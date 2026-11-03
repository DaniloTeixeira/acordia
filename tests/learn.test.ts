import { describe, it, expect } from "vitest";
import { cleanLearn, canChangeLearn, matchLearn, LEARN_MAX } from "../src/lib/learn";
import { norm } from "../src/lib/util";

describe("Para aprender", () => {
  it("sem título não grava", () => {
    expect(cleanLearn({title: "   ", artist: "X", url: "", note: ""})).toBeNull();
  });
  it("limpa espaços, corta no limite e arruma o link", () => {
    const r = cleanLearn({title: "  Bondade   de Deus ", artist: "a".repeat(200), url: "youtu.be/abc", note: " ouvir ao vivo "})!;
    expect(r.title).toBe("Bondade de Deus");
    expect(r.artist).toHaveLength(LEARN_MAX.artist);
    expect(r.url).toBe("https://youtu.be/abc");
    expect(r.note).toBe("ouvir ao vivo");
  });
  it("link que não é http(s) vira vazio", () => {
    expect(cleanLearn({title: "A", artist: "", url: "javascript:alert(1)", note: ""})!.url).toBe("");
  });
  it("quem sugeriu ou quem edita o grupo muda; os outros não", () => {
    const i = {suggested_by: "a@x.com"};
    expect(canChangeLearn(i, "a@x.com", false)).toBe(true);
    expect(canChangeLearn(i, "b@x.com", false)).toBe(false);
    expect(canChangeLearn(i, "b@x.com", true)).toBe(true);
    expect(canChangeLearn(i, "", false)).toBe(false);
  });
  it("busca por título, artista ou nota sem acento", () => {
    const i = {title: "Graça Sublime", artist: "Fernandinho", url: "", note: "versão acústica"};
    expect(matchLearn(i, norm("graca"))).toBe(true);
    expect(matchLearn(i, norm("fernand"))).toBe(true);
    expect(matchLearn(i, norm("acustica"))).toBe(true);
    expect(matchLearn(i, norm("outra"))).toBe(false);
    expect(matchLearn(i, "")).toBe(true);
  });
});
