# Medley Generator PWA

App instalável para montar medleys em folhas A4 com cifras, graus ou só letra. Funciona offline,
em português e inglês, e guarda tudo no próprio aparelho.

**Abrir o app:** https://daniloteixeira.github.io/medley-generator-pwa/

## O que dá para fazer

- **Medley:** cole as músicas (título na primeira linha), troque o tom de cada uma, reordene e veja a folha
  na hora. A folha alterna entre **Cifras**, **Graus** e **Só letra**, ajusta o tamanho da letra para
  ocupar a página e usa 1 ou 2 colunas e até 2 páginas.
- **Transições:** entre uma música e outra, a folha avisa a mudança de tom e sugere o acorde de passagem
  (o V7 do tom seguinte).
- **Detalhes por música:** tom original, tom de execução, capotraste, BPM, quem canta e observações.
- **Biblioteca:** todas as músicas e medleys salvos, com busca, filtros, edição, duplicação e backup
  (exportar e importar em JSON).
- **Compartilhar por link:** o medley inteiro vai compactado no próprio link (`#m=...`), sem servidor.
  Quem abre pode salvar na própria biblioteca.
- **Modo palco:** tela cheia, letra grande, tela sempre acesa, avança por toque, teclado ou pedal Bluetooth.
- **Estudo:** escalas (maior, menores, pentatônicas) com teclado, campo harmônico com tríades ou tétrades
  e funções, tudo com som. O **Treino** tem 5 jogos (acorde do grau, qual é o grau, notas da escala,
  relativas e ouvido), 3 níveis, sequência de acertos e recorde.
- PDF, impressão, tema claro/escuro/sistema e PT/EN.

## Rodar localmente

Módulos ES e service worker precisam de `http://localhost` ou HTTPS; não abra o `index.html` direto do disco.

```bash
npx serve .
# ou
python3 -m http.server 8080
```

## Testes

```bash
npm test
```

Usam só o `node:test` (Node 22 ou mais novo, sem dependências). Cobrem parser, detecção de acordes e tom,
graus, transposição, transições, teoria (escalas, campo harmônico, relativas), perguntas do treino,
layout das folhas, links de compartilhamento, validação de importação e traduções.

## Publicar

Cada push na `main` roda o GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)):
testes, `npm run build` e deploy no GitHub Pages. O build monta a pasta `_site` só com os arquivos da lista
`FILES` do `sw.js` e grava no `sw.js` publicado uma versão de cache calculada pelo conteúdo, então quem já
instalou recebe a versão nova e vê o aviso **Nova versão disponível**.

Ao criar um arquivo novo que o app carrega, inclua-o na lista `FILES` do [sw.js](sw.js).

## Estrutura

| Arquivo | Papel |
|---|---|
| [index.html](index.html) | Estrutura da interface e ícones (SVG) |
| [css/app.css](css/app.css) | Design system: tokens, temas, layouts desktop/celular, animações |
| [js/app.js](js/app.js) | Interface: medley, folha, biblioteca, compartilhamento, palco, instalação |
| [js/core.js](js/core.js) | Funções puras: parser, graus, transposição, tom, teoria, treino, validação |
| [js/layout.js](js/layout.js) | Montagem das folhas A4 (sem DOM) e SVG da pré-visualização |
| [js/pdf.js](js/pdf.js) | PDF com jsPDF; as fontes só são baixadas na primeira exportação |
| [js/store.js](js/store.js) | IndexedDB (músicas, medleys, preferências) e migração da versão antiga |
| [js/share.js](js/share.js) | Links de medley compactados |
| [js/study.js](js/study.js), [js/audio.js](js/audio.js) | Modo Estudo e síntese de som (Web Audio) |
| [js/i18n.js](js/i18n.js) | Textos em português e inglês |
| [sw.js](sw.js) | Cache offline |
| [scripts/build.mjs](scripts/build.mjs) | Build do deploy |

Os dados ficam no IndexedDB do navegador. Na primeira abertura, o app migra a biblioteca e a sequência da
versão anterior (localStorage). Como nada sai do aparelho, exporte um backup de vez em quando.

## Licença

Código sob [MIT](LICENSE). Fontes Atkinson Hyperlegible, Atkinson Hyperlegible Mono e Lexend sob a
[SIL Open Font License 1.1](fonts/OFL.txt). jsPDF 2.5.1 sob MIT.
