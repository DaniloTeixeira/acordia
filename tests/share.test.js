import test from "node:test";
import assert from "node:assert/strict";
import { encodeMedley, decodeMedley } from "../js/share.js";
import { t, tn, setLang, ordinal } from "../js/i18n.js";

const medley = {
  name: "Culto domingo",
  options: {dedupe: false, columns: 1, maxPages: 2, minFont: 8, showKey: true, transitions: true, degreeStyle: "arabic"},
  songs: [
    {text: "Primeira\nG  D\nAmo você", type: "", key: "G", bpm: "72", ref: "https://youtu.be/dQw4w9WgXcQ", target: "A", capo: "2", singer: "Ana", notes: "suave"},
    {text: "Segunda\nSó a letra aqui", type: "letra"}
  ]
};

test("link de medley vai e volta igual", async () => {
  const code = await encodeMedley(medley);
  assert.match(code, /^[zj][A-Za-z0-9_-]+$/);
  const back = await decodeMedley(code);
  assert.equal(back.name, "Culto domingo");
  assert.deepEqual(back.options, medley.options);
  assert.equal(back.songs.length, 2);
  assert.equal(back.songs[0].title, "Primeira");
  assert.equal(back.songs[0].target, "A");
  assert.equal(back.songs[0].capo, "2");
  assert.equal(back.songs[0].bpm, "72");
  assert.equal(back.songs[0].ref, "https://youtu.be/dQw4w9WgXcQ");
  assert.equal(back.songs[1].type, "letra");
});

test("compressão deixa o link menor que o JSON", async () => {
  const big = Object.assign({}, medley, {songs: Array.from({length: 6}, (_, i) => ({text: `Música ${i}\n` + "G   D   Em   C\nUma linha de letra que se repete bastante\n".repeat(30)}))});
  const code = await encodeMedley(big);
  assert.ok(code.length < JSON.stringify(big).length / 3, code.length + "");
});

test("links inválidos não quebram", async () => {
  for (const bad of ["", "x", "zzzz", "j" + Buffer.from("{}").toString("base64url"), "j!!!", "z" + "A".repeat(50)])
    assert.equal(await decodeMedley(bad), null, bad);
  const evil = "j" + Buffer.from(JSON.stringify({n: 5, o: "x", s: [{t: "Título\nok", target: "Z", capo: 99}, {t: 3}, null]})).toString("base64url");
  const r = await decodeMedley(evil);
  assert.equal(r.songs.length, 1);
  assert.equal(r.songs[0].target, "");
  assert.equal(r.songs[0].capo, "");
});

test("traduções: parâmetros, plural e ordinal", () => {
  setLang("pt");
  assert.equal(tn("song", 1), "1 música");
  assert.equal(tn("song", 3), "3 músicas");
  assert.equal(t("sheet.page", {n: 1, total: 2}), "Página 1 de 2");
  assert.equal(ordinal(3), "3ª");
  setLang("en");
  assert.equal(tn("song", 3), "3 songs");
  assert.equal(ordinal(1), "1st"); assert.equal(ordinal(2), "2nd"); assert.equal(ordinal(3), "3rd"); assert.equal(ordinal(11), "11th");
  assert.equal(t("nao.existe"), "nao.existe");
  setLang("pt");
});
