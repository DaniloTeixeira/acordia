# Medley Generator PWA

App instalável que monta folhas A4 com cifras, graus e só letra, com biblioteca de músicas.
Funciona offline depois do primeiro acesso. Tudo fica salvo no próprio aparelho (localStorage).

## Rodar localmente

Service worker só funciona em `http://localhost` ou HTTPS, então não abra o `index.html` direto do disco.

```bash
npx serve .
# ou
python3 -m http.server 8080
```

## Testes

```bash
npm test
```

Cobrem o parser, a detecção de acordes, graus, transposição, detecção de tom e a validação da importação.
Não precisa instalar nada além do Node 18 ou mais novo.

## Publicar (grátis)

**GitHub Pages:** crie um repositório, envie estes arquivos para a branch `main` e ative
Settings > Pages > Deploy from a branch > `main` / root.

**Vercel ou Netlify:** arraste a pasta no painel ou conecte o repositório. Não precisa de build.

## Instalar

Abra o endereço publicado no Chrome ou Edge e clique no ícone de instalar na barra de endereço.
No Android: menu > Instalar app. No iPhone (Safari): Compartilhar > Adicionar à Tela de Início.

## Trazer a biblioteca do Claude

1. Na ferramenta do Claude, seção Biblioteca, clique em **Exportar biblioteca** (gera um `.json`).
2. No app, seção Biblioteca, clique em **Importar biblioteca** e escolha esse arquivo.

Como os dados ficam só no aparelho, exporte um backup de vez em quando.

## Atualizar o app

Depois de mudar qualquer arquivo, rode:

```bash
npm run bump
```

O script calcula um hash dos arquivos listados em `sw.js` e troca a versão do cache.
Sem isso, quem já instalou pode continuar vendo a versão antiga. Se criar um arquivo novo,
inclua-o na lista `FILES` do `sw.js`.

## Estrutura

- `index.html`: interface, layout das folhas (`layout`, `fit`), pré-visualização em SVG, PDF (jsPDF) e biblioteca.
- `js/core.js`: funções puras (`parseSong`, `dedupeBlocks`, `chordToDegree`, `detectKey`, `transposeChord`,
  `sanitizeEntry`). Roda no navegador (`window.Cifras`) e no Node, para os testes.
- `fonts/`: Atkinson Hyperlegible, Atkinson Hyperlegible Mono e Lexend (licença OFL), em TTF.
  A tela usa direto; o PDF só busca as fontes na primeira vez que alguém baixa.
- `sw.js`: cache para funcionar offline.
- `scripts/bump-cache.mjs`: gera a versão do cache.
- `tests/`: testes com `node:test`.
- `vendor/jspdf.umd.min.js`: jsPDF 2.5.1 local, para não depender de CDN.
