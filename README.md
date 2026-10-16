# Acordia

**Sua música. Um só lugar.** App instalável (PWA) para músicos montarem repertórios com cifras, graus ou só a
letra, tocarem no palco e estudarem teoria, ritmo e ouvido. Funciona offline, em português e inglês, e guarda
tudo no próprio aparelho.

**Abrir o app:** https://daniloteixeira.github.io/acordia/

## O que dá para fazer

- **Repertório:** cole as músicas (título na primeira linha), troque o tom de cada uma, reordene e veja a folha
  na hora. A folha alterna entre **Cifras**, **Graus** e **Só letra**, ajusta o tamanho da letra para
  ocupar a página e usa 1 ou 2 colunas e até 2 páginas.
- **Medleys:** dentro de um repertório, um bloco de músicas emendadas. A folha mostra o nome do medley, a mudança
  de tom e o acorde de passagem (o V7 do tom seguinte). O mesmo medley pode entrar em vários repertórios.
- **Arranjos:** versões nomeadas de uma música (por exemplo, "Acústico em G" ou "Banda em A", com tom, capotraste
  e observações) para reaproveitar entre repertórios.
- **Detalhes por música:** tom original, tom para tocar, capotraste (com sugestão para cordas), BPM, quem canta,
  observações e um link de referência. Vídeos do YouTube tocam dentro do app, com loop A–B e velocidade reduzida.
- **Transpor tudo:** muda o tom do repertório inteiro na folha, sem alterar as músicas; opção de mostrar os
  desenhos do capotraste ("soa em…").
- **Acordes clicáveis:** na folha e no palco, cada acorde mostra o grau, a função, as notas e o desenho no
  instrumento escolhido (teclado, violão/guitarra, baixo, ukulele ou cavaquinho).
- **Biblioteca:** músicas, repertórios e medleys salvos, com busca, filtros, edição, duplicação e backup
  (exportar e importar em JSON).
- **Compartilhar por link:** o repertório inteiro, com medleys, vai compactado no próprio link (`#m=...`), sem
  servidor. Quem abre pode salvar na própria biblioteca.
- **Modo palco:** tela cheia, letra grande, tela sempre acesa, metrônomo no BPM da música, avança por toque,
  teclado ou pedal Bluetooth.
- **Estudo:**
  - **Escalas:** maior, menores e pentatônicas no teclado ou no braço do instrumento, que tocam ao clicar; campo
    harmônico com tríades ou tétrades, diagramas de acordes e as funções explicadas.
  - **Treino:** 6 jogos (acorde do grau, qual é o grau, notas da escala, relativas, ouvido e "do meu
    repertório"), 3 níveis, respostas com 4 alternativas ou lista completa, sequência de acertos e recorde.
  - **Mãos:** 10 exercícios de independência das mãos com metrônomo e precisão por mão.
- **Ferramentas:** metrônomo (compasso, subdivisão, acento, tap tempo) e afinador pelo microfone, com as cordas
  do instrumento e A4 ajustável.
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
| [js/hands.js](js/hands.js), [js/metronome.js](js/metronome.js) | Independência das mãos e metrônomo |
| [js/instruments.js](js/instruments.js), [js/chordview.js](js/chordview.js) | Afinações, leitura de acordes, posições para cordas, diagramas e braço |
| [js/tuner.js](js/tuner.js) | Afinador (detecção de altura) |
| [js/i18n.js](js/i18n.js) | Textos em português e inglês |
| [sw.js](sw.js) | Cache offline |
| [scripts/build.mjs](scripts/build.mjs) | Build do deploy |

Os dados ficam no IndexedDB do navegador. Na primeira abertura, o app migra a biblioteca e a sequência da
versão anterior (localStorage). Como nada sai do aparelho, exporte um backup de vez em quando.

## Licença

Código sob [MIT](LICENSE). Fontes Atkinson Hyperlegible, Atkinson Hyperlegible Mono e Lexend sob a
[SIL Open Font License 1.1](fonts/OFL.txt). jsPDF 2.5.1 sob MIT.
