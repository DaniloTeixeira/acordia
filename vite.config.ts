// Build do app: React + TypeScript, PWA (Workbox) e cópia dos ícones (a pasta icons/ fica onde está).
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "_site";

// Ícones e licenças vão para o build com o mesmo caminho; o manifesto aponta para icons/.
function staticFiles(): Plugin {
  return {
    name: "acordia-static",
    apply: "build",
    writeBundle(){
      cpSync("icons", join(OUT, "icons"), {recursive: true});
      cpSync("LICENSE", join(OUT, "LICENSE"));
      cpSync("fonts/OFL.txt", join(OUT, "fonts/OFL.txt"));
      writeFileSync(join(OUT, ".nojekyll"), "");
    }
  };
}

export default defineConfig({
  base: "/acordia/",
  build: {outDir: OUT, emptyOutDir: true, target: "es2022"},
  plugins: [
    react(),
    staticFiles(),
    VitePWA({
      // Service worker próprio (src/sw.ts); o build só preenche a lista de arquivos.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: null,
      manifest: JSON.parse(readFileSync("manifest.webmanifest", "utf8")),
      includeAssets: ["icons/*"],
      injectManifest: {
        globPatterns: ["**/*.{html,js,css,svg,png,ttf}"],
        // O html2canvas e o DOMPurify só entram no jsPDF para HTML, que o app não usa.
        globIgnores: ["**/html2canvas*", "**/purify*", "**/index.es*"]
      }
    })
  ],
  test: {include: ["tests/**/*.test.ts"]}
});
