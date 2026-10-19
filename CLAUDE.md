# Acordia

PWA (React 18 + TypeScript + Vite + Zustand + SCSS) para equipes de louvor: repertórios com cifras, palco,
estudo, e grupos com agenda, escalas e presença. Login obrigatório (Supabase). Publicado no GitHub Pages em
`/acordia/`. O [README.md](README.md) tem a lista de funcionalidades tela por tela e o fluxo de deploy.

## Comandos

```sh
npm run dev        # http://localhost:5173/acordia/ (usa o banco dev via .env.local)
npm run typecheck  # tsc estrito (noUnusedLocals/Parameters: sobra de variável quebra o CI)
npm test           # Vitest, tests/**/*.test.ts
npm run build      # typecheck + build em _site/ (falha sem VITE_SUPABASE_URL/KEY)
```

Antes de dar uma tarefa por terminada: `npm run typecheck` e `npm test`. O CI roda os dois, o build e aplica
todas as migrações num Supabase vazio.

## Usuários e UI

- **Mobile first.** Quase todos usam no celular (referência: ~393px e 360px de largura). Toda tela começa pela
  largura de celular: sem scroll lateral, alvos de toque grandes, texto legível sem zoom; a tela larga é
  melhoria. Nada importante pode depender de hover ou tooltip (no toque não existem).
- **Feedback sempre, em qualquer tela.** Toda ação mostra que está acontecendo, que deu certo e que falhou;
  nada que vai à rede fica mudo. Carregando: `<Spin/>` + `aria-busy` no botão (desabilitado enquanto roda),
  "Carregando…" na lista. Campo que grava ao sair dele: `useFieldSave` ([src/views/Account.tsx](src/views/Account.tsx))
  mostra "Salvando…" com o spinner e depois o "✓ Salvo" (`flashSaved`). Falha: `toast` com o motivo e, quando
  der, "Tentar de novo". Lista vazia ou que não carregou diz o porquê. Estado normal (tudo certo) não precisa
  de aviso fixo.
- **Hover mantém a cor do elemento.** Botão colorido (vermelho de parar, perigo etc.) continua da sua cor no
  `:hover`; use o `filter: brightness(.92)` compartilhado, nunca trocar o fundo. Elementos suaves (`.btn.soft`,
  chips) escurecem no tema claro e clareiam (`brightness(1.25)`) no escuro.
- **Tooltip só em controle ativo.** [src/ui/tooltips.ts](src/ui/tooltips.ts) ignora `:disabled` e
  `[aria-disabled=true]`; controle que parece desativado sem esses atributos recebe `aria-disabled="true"`.
  Dica vem de `data-tip-key` (chave traduzida), `data-tip` ou do `aria-label` de botão só com ícone.
- **Tema** claro/escuro: toda cor nova é token em `:root` de [src/styles/app.scss](src/styles/app.scss) e
  precisa da versão escura (`@media (prefers-color-scheme: dark)` e `[data-theme="dark"]`).
- Breakpoints usados: `max-width: 899px` (celular/tablet: barra de abas em vez do trilho), `599px`, `420px`,
  `360px`; também `(pointer: coarse)`, `(hover: hover)` e `prefers-reduced-motion`.

## Estrutura e padrões de código

- [src/state.ts](src/state.ts): estado da interface (Zustand `useUI`): página, avisos, janelas. Dados locais
  (músicas, repertórios, preferências) ficam em [src/lib/store.ts](src/lib/store.ts) (IndexedDB + memória) e a
  interface redesenha com `useData()`.
- [src/lib/](src/lib/): lógica sem interface. Regras puras ficam separadas da rede para serem testadas
  (ex.: `syncrules.ts`, `calendar.ts`, `roles.ts`). Lógica nova com regra de negócio vai para `lib/` com teste em
  `tests/`.
- [src/lib/cloud.ts](src/lib/cloud.ts) (login, perfil, lista de acesso, `useAuth`), [src/lib/groups.ts](src/lib/groups.ts)
  (grupos, membros, agenda, `useGroups`, com cópia no `localStorage` para abrir offline),
  [src/lib/sync.ts](src/lib/sync.ts) (músicas/repertórios na nuvem), [src/publish.ts](src/publish.ts)
  (repertórios do líder publicados no grupo sozinhos).
- [src/views/](src/views/) páginas, [src/dialogs/](src/dialogs/) janelas, [src/ui/](src/ui/) peças reutilizáveis
  (`Dialog`, `Select`, `Seg`, `Fold`, `DateInput`, `Range`, `Icon`, `Toasts`). Usar as peças existentes antes de
  criar outra.
- **Janela nova:** acrescentar o nome e os dados em `DialogProps` ([src/state.ts](src/state.ts)), renderizar em
  [src/dialogs/Dialogs.tsx](src/dialogs/Dialogs.tsx) (`{d.nome && <X {...d.nome}/>}`), abrir com
  `openDialog("nome", dados)`. Dentro: `<Dialog name id labelledBy dirty?>` + `<form method="dialog" className="dlg">`
  + `<DialogHead>` + `.dlg-body`. Confirmação de exclusão: `await confirmDialog({...})`. Avisos: `toast(msg, ação?)`.
- **Ícones:** sprite SVG no [index.html](index.html) (`<symbol id="i-nome">`), usado com `<Icon name="nome"/>`.
  Ícone novo entra no sprite.
- **Navegação:** `go(view)`; cada página tem `#hash` (o repertório fica sem hash). Página nova: `View`/`VIEWS`
  em `state.ts`.
- **Estilo do código:** 2 espaços, aspas duplas, ponto e vírgula, `if(` / `catch(e){` sem espaço, funções
  curtas em uma linha quando cabem. Componentes funcionais com props tipadas inline. Sem ESLint/Prettier:
  imitar o arquivo ao redor.
- **Comentários em português**, explicando o porquê ou a regra de negócio (cabeçalho de arquivo diz o papel
  dele). Nomes de código em inglês.

## Textos (i18n)

- Todo texto visível passa por `t("chave", {param})` ou `tn("chave", n)` (plural com `.one`/`.other`) de
  [src/lib/i18n.ts](src/lib/i18n.ts). Nada de texto fixo no JSX.
- Chave nova entra nos **três** dicionários (`pt`, `en`, `es`), no mesmo grupo de chaves (`area.coisa`, ex.:
  `group.leader`, `common.save`). O teste `tests/i18n.test.ts` falha se faltar ou sobrar chave em algum.
- Reaproveitar `common.*` (Salvar, Cancelar, Excluir...) antes de criar chave nova. Guia "Como usar" de cada
  página fica em `help.<página>.*`.
- Português do Brasil, frases curtas e diretas; o mesmo tom em inglês e espanhol.

## Permissões

- Níveis: **Dono** (`allowed_emails.is_owner`) > **admin do app** > **líder do grupo** (`group_members.is_admin`,
  no máximo um por grupo) > membro.
- Só o Dono liga/desliga admin. Ninguém tira acesso/admin do Dono nem edita os dados dele. Quem é Dono só
  muda por SQL.
- Cadastro de pessoas só em Grupo → Membros (a página Usuários, só admin, aberta pelo Perfil, é só a lista).
- A regra vale no banco (RLS, funções `security definer`, triggers); a interface só esconde. Toda permissão nova
  é garantida no SQL, não só no app.
- O app é sempre com login: não reintroduzir caminho sem login nem `if(!cloud)`. Funcionalidades removidas de
  propósito (link de compartilhar `#m=`, backup JSON, separar faixas, pads de bateria, ritmo) só voltam se o
  usuário pedir.

## Banco (Supabase)

Dois projetos, ambos em `ca-central-1`:

- **dev** `whmzmbgnsuksjpcmitae` (acordia-dev): o que o `.env.local` aponta e o app local usa. É o projeto **linkado** na CLI.
- **produção** `jxuephertoncitarnwqx` (acordia): tem usuários de verdade. Nunca escrever nele sem o usuário pedir.

As senhas do banco ficam em `.env.dev-db.local` e `.env.prod-db.local` (`SUPABASE_DB_PASSWORD=`). Para
conferir o banco pela API (colunas, bucket), use a URL e a chave só do `.env.local` (dev).

### Rodar migrações

A CLI já está logada (`npx supabase projects list` funciona) e linkada ao dev. Não precisa de psql nem de URL do pooler. O host direto `db.<ref>.supabase.co` não resolve nesta máquina (só tem IPv6), então use `--linked`:

```sh
PW=$(sed -n 's/^SUPABASE_DB_PASSWORD=//p' .env.dev-db.local | tr -d '\r"')
npx supabase db push --linked -p "$PW" --dry-run   # confere o que está pendente
npx supabase db push --linked -p "$PW" --yes       # aplica no dev
```

Toda migração nova vai primeiro para o dev. Produção só depois que o usuário confirmar no dev e pedir
(normalmente pelo merge na `main`, que aplica as migrações na produção pela integração do GitHub).

### Escrever migrações

- Arquivo `supabase/migrations/AAAAMMDDHHMMSS_assunto.sql` (assunto curto em português, `snake_case`),
  com timestamp depois do último existente.
- Começa com comentário em português dizendo o que muda e "Pode rodar de novo sem problema".
- Idempotente: `create or replace`, `if not exists`, `drop ... if exists`.
- Só acrescentar (tabela, coluna com padrão, função, regra). Apagar/renomear coluna ou mudar o retorno de uma
  função só num PR seguinte, depois que a versão nova do app estiver no ar (o app instalado demora a atualizar).
- Nunca editar migração que já foi para a `main`: corrigir com outra.
- Funções: `language plpgsql security definer set search_path = public`, checar permissão no começo
  (`is_allowed()`, `is_admin()`, `is_group_admin(gid)`, `my_email()`) e falhar com
  `raise exception 'acordia: <motivo>'`; depois `grant execute ... to authenticated` e
  `revoke execute ... from anon, public`. E-mails sempre `lower(trim(...))`.
- O app tolera o banco ainda sem a migração: se a chamada nova falha, tenta a forma antiga (ver
  `add_group_member` em `groups.ts` e a leitura do perfil em `cloud.ts`).
- Sem `supabase/config.toml` no repositório (a integração aplicaria na produção).

## Git e PR

- Branch a partir da `main`: `feat/<assunto>` ou `fix/<assunto>`. A `main` é protegida: só por PR com CI verde,
  **Squash and merge**. O merge publica, aplica migrações na produção e cria a tag `vAAAA.MM.DD-N`.
- Mensagens de commit e PR em português, dizendo o que mudou para quem usa (ex.: "Um líder só por grupo; chip
  Líder com coroa, logo depois do nome").
- Funcionalidade nova ou mudança visível: atualizar a lista de funcionalidades do [README.md](README.md).
- Commit e push só quando o usuário pedir.
