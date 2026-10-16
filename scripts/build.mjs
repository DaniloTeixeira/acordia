// Monta a pasta _site com só os arquivos publicados (os da lista FILES do sw.js) e grava no
// sw.js publicado uma versão de cache calculada pelo conteúdo. Usado pelo deploy no GitHub Actions.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, process.argv[2] || "_site");
const sw = readFileSync(join(root, "sw.js"), "utf8");

const list = sw.match(/const FILES = \[([\s\S]*?)\];/);
if (!list) throw new Error("Lista FILES não encontrada em sw.js");
const files = [...list[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(f => f !== "./");

rmSync(out, { recursive: true, force: true });
const hash = createHash("sha256");
hash.update(sw.replace(/const CACHE = "[^"]*";/, ""));
for (const f of files) {
  // Normaliza quebras de linha para o hash não mudar entre Windows e Linux.
  const buf = readFileSync(join(root, f));
  hash.update(f); hash.update(/\.(png|ttf)$/.test(f) ? buf : Buffer.from(buf.toString("utf8").replace(/\r\n/g, "\n")));
  mkdirSync(dirname(join(out, f)), { recursive: true });
  copyFileSync(join(root, f), join(out, f));
}
const version = "medley-generator-pwa-" + hash.digest("hex").slice(0, 10);
writeFileSync(join(out, "sw.js"), sw.replace(/const CACHE = "[^"]*";/, `const CACHE = "${version}";`));
writeFileSync(join(out, ".nojekyll"), "");
console.log(`${files.length + 1} arquivos em ${out} · cache ${version}`);
