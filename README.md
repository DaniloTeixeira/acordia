# Acordia

**Aprenda. Crie. Toque.** App instalável (PWA) para músicos montarem repertórios com cifras, graus ou só a
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
  - **Treino:** 7 jogos (acorde do grau, qual é o grau, notas da escala, relativas, ouvido, grau pelo ouvido
    e "do meu repertório"), 3 níveis, respostas com 4 alternativas ou lista completa, sequência de acertos e recorde.
  - **Mãos:** 10 exercícios de independência das mãos com metrônomo e precisão por mão, e exercícios de teclado.
  - **Voz:** "Cante o grau" (o microfone confere a afinação) e "Minha extensão" (mede a voz e sugere o tom de
    cada música do repertório para quem canta).
- **Timbres:** piano, Rhodes, órgão, sintetizador, vibrafone e pad para as notas e acordes do app.
- **Ferramentas:** metrônomo (compasso, subdivisão, acento, tap tempo) e afinador pelo microfone, com as cordas
  do instrumento e A4 ajustável.
- PDF, impressão, tema claro/escuro/sistema e português, inglês e espanhol.

## Rodar localmente

Feito em React + TypeScript com Vite. Precisa do Node 22 ou mais novo.

```bash
npm install
npm run dev        # servidor de desenvolvimento em http://localhost:5173/acordia/
npm run build      # checa os tipos e gera a pasta _site (o que vai para o ar)
npm run preview    # serve o _site, para testar o modo offline e a instalação
```

## Testes

```bash
npm test           # Vitest
npm run typecheck  # TypeScript estrito
```

Cobrem parser, detecção de acordes e tom, graus, transposição, transições, teoria (escalas, campo
harmônico, relativas), perguntas do treino, layout das folhas, links de compartilhamento, instrumentos,
afinador, exercícios das mãos e do teclado, validação de importação e traduções.

## Publicar

Cada push na `main` roda o GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)):
testes, `npm run build` e deploy no GitHub Pages. O build lista todos os arquivos no service worker
([src/sw.ts](src/sw.ts)), que guarda o app inteiro na instalação; quem já instalou recebe a versão nova no
próximo carregamento e vê o aviso **Nova versão disponível**.

## Estrutura

| Arquivo | Papel |
|---|---|
| [index.html](index.html) | Página base e ícones (sprite SVG) |
| [src/main.tsx](src/main.tsx), [src/App.tsx](src/App.tsx) | Início, navegação, menus de idioma/volume/tema, instalação e atualização |
| [src/state.ts](src/state.ts) | Estado da interface (Zustand): página, idioma, avisos e janelas |
| [src/repertoire.ts](src/repertoire.ts) | Regras do repertório aberto: medleys, arranjos, músicas da folha |
| [src/views/](src/views/) | Páginas: Repertório e folha, Biblioteca, Estudo, Ferramentas, Palco |
| [src/dialogs/](src/dialogs/) | Janelas: biblioteca, música, compartilhar, link recebido, acorde, vídeo... |
| [src/ui/](src/ui/) | Peças da interface: lista suspensa, controle segmentado, janela, avisos, dicas |
| [src/lib/](src/lib/) | Lógica sem interface: cifras e teoria, folhas A4, PDF, IndexedDB, links, áudio, metrônomo, afinador, instrumentos, exercícios, traduções |
| [src/styles/app.scss](src/styles/app.scss) | Design system: tokens, temas, layouts desktop/celular, animações |
| [src/sw.ts](src/sw.ts) | Cache offline |

Os dados ficam no IndexedDB do navegador. Como nada sai do aparelho, exporte um backup de vez em quando.

## Licença

Código sob [MIT](LICENSE). Fontes Atkinson Hyperlegible, Atkinson Hyperlegible Mono e Lexend sob a
[SIL Open Font License 1.1](fonts/OFL.txt). jsPDF 2.5.1 sob MIT.
