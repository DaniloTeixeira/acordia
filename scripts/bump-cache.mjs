// Atualiza a versão do cache em sw.js com um hash dos arquivos que ele guarda.
// Rode antes de publicar: node scripts/bump-cache.mjs
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const swPath = join(root, "sw.js");
const sw = readFileSync(swPath, "utf8");

const list = sw.match(/const FILES = \[([\s\S]*?)\];/);
if (!list) throw new Error("Lista FILES não encontrada em sw.js");
const files = [...list[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(f => f !== "./");

const hash = createHash("sha256");
hash.update(sw.replace(/const CACHE = "[^"]*";/, ""));
for (const f of files) { hash.update(f); hash.update(readFileSync(join(root, f))); }
const version = "medley-generator-pwa-" + hash.digest("hex").slice(0, 10);

const next = sw.replace(/const CACHE = "[^"]*";/, `const CACHE = "${version}";`);
if (next === sw) console.log("Sem mudanças:", version);
else { writeFileSync(swPath, next); console.log("Cache atualizado para", version); }
