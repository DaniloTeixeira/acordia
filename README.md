# Acordia

**Aprenda. Crie. Toque.** App instalável (PWA) para músicos montarem repertórios com cifras, graus ou só a
letra, tocarem no palco e estudarem teoria, ouvido e voz. Funciona offline, em português, inglês e espanhol.
Só entra quem o administrador convidar, e as músicas e repertórios de cada pessoa ficam na nuvem, iguais em todos
os aparelhos dela. Equipes (grupos de louvor) têm agenda com escalas, confirmação e
presença nos ensaios, e repertórios compartilhados.

**Abrir o app:** https://daniloteixeira.github.io/acordia/

## Funcionalidades

Lista completa, tela por tela, para testar e decidir o que fica. Marque `[x]` no que já foi conferido.

### Em todas as telas
- [ ] **Navegação** entre Repertório, Biblioteca, Grupo, Estudo e Ferramentas: trilho lateral no computador, barra de
      abas no celular. Cada página tem endereço próprio, então o "voltar" do navegador funciona. Tocar de novo na
      página atual volta ao topo.
- [ ] **Tema** claro ou escuro. Até a primeira escolha, segue o aparelho.
- [ ] **Idioma**: português, inglês e espanhol. O inicial vem do navegador ou do fuso horário.
- [ ] **Volume**:
  - controle de 0 a 100%, silenciar e acorde de teste;
  - roda do mouse muda de 5 em 5%;
  - chave "Sons de retorno";
  - **timbre**: Piano, Rhodes, Órgão, Sintetizador, Vibrafone ou Pad.
- [ ] **Instalar app**: o botão só aparece quando dá para instalar. No iPhone, abre uma janela com os passos.
- [ ] **Offline e atualização**: funciona sem internet e avisa quando há versão nova ("Atualizar").
- [ ] **Como usar**: guia de cada página pelo botão "?". Na primeira visita a uma página aparece um aviso
      oferecendo o guia.
- [ ] **Dicas** ao passar o mouse, ou com toque longo no celular.
- [ ] **Avisos** com "Desfazer" ou "Ver" quando faz sentido.

### Entrar, Perfil e nuvem
O app só abre depois de entrar (ver [Conta e nuvem](#conta-e-nuvem-supabase)).
- [ ] **Tela de entrar**:
  - visual: notas musicais no fundo, borda animada, idioma e tema no canto;
  - formas de entrar: **Entrar com Google**, ou **e-mail e senha**;
  - campo de senha: olho para mostrar (esconde sozinho ao enviar, ao sair do app e ao trocar de tela) e aviso de
    Caps Lock;
  - e-mail validado embaixo do campo;
  - avisos (erro, informação, confirmar e-mail) sempre no mesmo lugar, abaixo do título;
  - botões com indicador de carregamento, sem enviar duas vezes;
  - nota "O acesso é por convite".
- [ ] **Criar conta** (só para e-mails convidados):
  - requisitos da senha ficam verdes conforme a pessoa digita: 8 caracteres, minúscula, maiúscula, número e
    símbolo;
  - quadro **Confirme seu e-mail**, com "Reenviar e-mail" (a cada 60 s). Ele continua aparecendo mesmo depois de
    sair e voltar ao app.
- [ ] **Esqueci minha senha**: o link do e-mail abre a tela **Senha nova**.
- [ ] **Sem acesso**: quem entra com um e-mail que não está na lista vê o aviso e o botão Sair.
- [ ] **Perfil** (bolinha no topo):
  - foto do Google ou iniciais, nome editável, selo Admin e instrumento;
  - **estado da nuvem**: "Tudo salvo", "Sincronizando…", mudanças esperando, sem internet ou erro, com
    "Sincronizar agora";
  - **Sair**: tenta subir o que falta, avisa se algo vai se perder e apaga os dados deste aparelho.
- [ ] **Quem pode entrar** (só admins): incluir e-mail, tornar ou tirar admin e tirar acesso.
- [ ] **Músicas e repertórios na nuvem**, iguais em todos os aparelhos da conta:
  - funciona sem internet, e as mudanças sobem depois;
  - no primeiro login de um aparelho, o que já estava nele sobe para a conta;
  - se a mesma coisa mudou em dois lugares, vale a mudança mais recente.

### Repertório
- [ ] **Nome editável** e subtítulo com o número de músicas e a transposição.
- [ ] **Novo**: cria outro repertório. O anterior continua na Biblioteca.
- [ ] **Palco**.
- [ ] **Editar / Ver folha**: alterna os painéis no celular; no computador ficam lado a lado.
- [ ] **Adicionar**: "Música com cifra", "Só a letra", "Da biblioteca" (escolha várias, com busca) e "Medley".
- [ ] **Cartão de cada música**:
  - mover para cima ou para baixo e tirar do repertório (com Desfazer);
  - chips: tom → tom para tocar, arranjo, capo, BPM e quem canta;
  - tipo "Com cifra" ou "Só letra";
  - texto: título na primeira linha, depois cifra e letra;
  - **Tom original**: automático ou um dos 24;
  - **Tom para tocar**;
  - **Capotraste** de 1 a 11, com **sugestão de capo** para cordas ("Usar");
  - BPM, Quem canta, Observações e link de **Referência** (▶ para ouvir).
- [ ] **Arranjos**: "Salvar como arranjo" guarda tom, capo e observações com um nome, para reaproveitar em outros
      repertórios.
- [ ] **Medley**: bloco de músicas emendadas dentro do repertório, com "Editar medley" e "Voltar para…".
- [ ] **Montar cifra** (tirar de ouvido):
  - quadradinhos acima de cada linha da letra, onde vai um acorde (C, Am, G7) ou um grau (1, 4, 5, 2m, IV,
    bVII…);
  - escolha do tom, e escrever em Graus ou Acordes;
  - acordes do tom que tocam e preenchem o quadradinho;
  - "Linha de acordes" para introdução ou solo;
  - quadradinho inválido fica vermelho;
  - **Aplicar** escreve a cifra no texto.

### Folha
- [ ] Modos **Cifras**, **Graus** e **Só letra**.
- [ ] Folha A4 que se ajusta sozinha, com aviso quando não cabe, e "Página n de N".
- [ ] Rótulo dos medleys, aviso de mudança de tom entre músicas e acorde de passagem.
- [ ] Acordes clicáveis (abrem a janela do acorde).
- [ ] **Imprimir** e **PDF**.
- [ ] **Ajustes da folha**:
  - remover partes repetidas, mostrar o tom no título, avisar mudança de tom, permitir 2 páginas e desenhos do
    capotraste ("C · soa em D");
  - **Transpor tudo** (½ tom, só na folha);
  - colunas Auto, 1 ou 2;
  - graus "I IV V" ou "1 4 5";
  - tamanho mínimo da letra (7 a 12 pt).

### Palco
- [ ] Tela cheia, com a tela sempre acesa.
- [ ] Modos Cifras, Graus ou Letra.
- [ ] Fonte **A− / A+** (fica salva).
- [ ] **Metrônomo** compacto, no BPM da primeira música.
- [ ] **−/+ por música**: meio tom abaixo ou acima. Muda o tom para tocar no repertório.
- [ ] Acordes clicáveis, ▶ referência, dados da música, aviso de transição e rótulo de medley.
- [ ] Toque embaixo avança, toque em cima volta.
- [ ] Atalhos: setas / PageDown / espaço avançam e voltam, + e − mudam a fonte, Esc sai.

### Biblioteca
- [ ] Abas **Músicas**, **Repertórios** e **Medleys**, com busca.
- [ ] Músicas: filtro Todas / Com cifra / Só letra e ordem A–Z ou Recentes.
- [ ] **Cartão de música**: tom, BPM, arranjos, em quantos repertórios está, trecho da letra e quando foi
      editada; Adicionar ao repertório, ▶, Editar e Excluir.
- [ ] **Cartão de repertório/medley**: Abrir, **Duplicar** ("(cópia)") e Excluir.
- [ ] **Janela da música**:
  - tipo e Montar cifra;
  - **Transpor a cifra** (−/+), que reescreve os acordes;
  - tom, BPM e referência;
  - com alterações, clicar fora não descarta o texto.

### Janela do acorde
- [ ] Grau e função no tom (Tônica, Subdominante, Dominante ou fora do campo) e notas com os graus.
- [ ] Desenho no instrumento:
  - teclado com teclas clicáveis;
  - violão, ukulele e cavaquinho: até 6 posições;
  - baixo: arpejo no braço.
- [ ] Toca ao abrir. Seletores de instrumento e timbre.

### Player de referência (YouTube)
- [ ] Vídeo dentro do app.
- [ ] **Loop A–B** (fica salvo por vídeo).
- [ ] **Velocidade** 0,5×, 0,75× ou 1×.
- [ ] "Abrir no YouTube". Link que não é do YouTube abre numa aba nova.

### Grupo
Os admins do app criam grupos; quem lidera um grupo inclui os membros pelo e-mail (o que
também libera o acesso ao app para eles).
- [ ] **Agenda**:
  - calendário do mês com cultos e ensaios, os dias em que a pessoa está escalada e os dias em que não pode;
  - tocar num dia mostra os eventos dele e a chave **"Não posso neste dia"** (indisponibilidade);
  - **Suas próximas escalas** no topo, com a função e a resposta;
  - lista de próximos e anteriores.
- [ ] **Evento** (só quem lidera cria e edita):
  - tipo Culto ou Ensaio, título, data, início, **hora de chegada**, local, repertório do grupo e observações;
  - **repetir** toda semana (2 a 26 vezes);
  - **escala**: quem toca o quê, com funções sugeridas e "Escalar todos";
  - avisos ao escalar: marcou que não pode no dia, já está em outro evento no dia ou já recusou; cada pessoa
    mostra quantas vezes já foi escalada no mês.
- [ ] **Resposta da escala**: "Confirmar" ou "Não posso" com o motivo; quem lidera vê "precisa de substituto".
- [ ] **Presença nos ensaios**: "Cheguei" (de 12 h antes a 12 h depois do início) e a chamada de quem lidera
      (presente, falta, justificada), que vale por cima do "Cheguei".
- [ ] **Adicionar ao calendário** (.ics): um evento ou todas as suas escalas, com lembrete 1 dia e 2 h antes.
- [ ] **Repertórios do grupo**: quem lidera compartilha um repertório seu (compartilhar de novo atualiza);
      todos abrem ("Salvar e abrir" ou "Atualizar") ou vão direto ao **Palco**.
- [ ] **Membros**: nome, e-mail, função (cada um edita a sua), selo Líder, **frequência nos ensaios** (6 meses)
      e escalas no mês. Quem lidera inclui, torna líder e tira do grupo; admins do app renomeiam, criam e
      excluem grupos.
- [ ] **Sem internet**: mostra a última versão baixada; mudar precisa de internet.

### Estudo
- [ ] **Escalas**:
  - escalas: maior, menor natural, harmônica, melódica, pentatônica maior e menor;
  - teclado ou braço (teclado, violão, baixo, ukulele, cavaquinho);
  - oitava, tônica e tétrades;
  - tocar a escala, botões das notas com o grau;
  - teclas que soam ao arrastar e "Tecla tocada" com a função.
- [ ] **Campo harmônico** com funções T/SD/D e a explicação **Funções harmônicas**.
- [ ] **Treino** (10 perguntas):
  - 8 tipos: Misturado, Acorde do grau, Qual é o grau, Notas da escala, Relativas, Ouvido, Grau de ouvido e Do
    meu repertório;
  - 3 níveis;
  - respostas em 4 alternativas ou lista completa;
  - sequência de acertos e recorde;
  - atalhos 1–4 / 1–7 e Enter.
- [ ] **Voz, Minha extensão**:
  - mede a nota mais grave e a mais aguda e diz o tipo de voz;
  - guarda vários cantores;
  - sugere o tom de cada música do repertório ("Usar este tom").

### Ferramentas
- [ ] **Metrônomo**:
  - BPM de 30 a 240, com o nome do andamento;
  - compasso 2/4, 3/4, 4/4 ou 6/8;
  - subdivisão;
  - acento no 1º tempo;
  - **Descobrir BPM**;
  - atalhos: espaço, setas e T.
- [ ] **Afinador**: pelo microfone, com A4 de 432 a 446 Hz, ponteiro em cents e a corda mais próxima.
- [ ] **Pad infinito**:
  - tom, 6 estilos (Original, Discreto, Quente, Brilhante, Etéreo, Profundo), volume e filtro;
  - swell em 4 ou 8 compassos;
  - entrar e sair devagar;
  - troca de tom suave;
  - continua tocando fora da página.
## Rodar localmente

Feito em React + TypeScript com Vite. Precisa do Node 22 ou mais novo e das chaves do Supabase num `.env.local`
(ver [Conta e nuvem](#conta-e-nuvem-supabase)).

```bash
npm install
npm run dev        # servidor de desenvolvimento em http://localhost:5173/acordia/
npm run build      # checa os tipos e gera a pasta _site (o que vai para o ar)
npm run preview    # serve o _site, para testar o modo offline e a instalação
```

## Conta e nuvem (Supabase)

O login e a nuvem usam o [Supabase](https://supabase.com). O app só funciona com login: sem as chaves, o build
para com um aviso.

- **Chaves:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY` (a chave *publishable*/anon, que pode ficar no site).
  Para rodar local, ficam num `.env.local`, que não vai para o Git. No GitHub, ficam nas variáveis do
  repositório `SUPABASE_URL` e `SUPABASE_KEY`, que o deploy usa no build.
- **Banco:** as tabelas e as regras de acesso ficam em [supabase/migrations/](supabase/migrations/). Com a
  integração do Supabase com o GitHub ("Deploy to production"), cada push na `main` aplica as migrações novas.
  O primeiro admin entra uma vez à mão, com [supabase/primeiro-admin.sql](supabase/primeiro-admin.sql).
- **No painel do Supabase:**
  - Email ligado com "Confirm email", mínimo de 8 caracteres e exigência de minúscula, maiúscula, número e
    símbolo;
  - Google ligado com o Client ID e a Secret do Google Cloud;
  - em Redirect URLs, o endereço do site e `http://localhost:5173/acordia/**`.

## Testes

```bash
npm test           # Vitest
npm run typecheck  # TypeScript estrito
```

Cobrem parser, detecção de acordes e tom, graus, transposição, transições, teoria (escalas, campo
harmônico, relativas), perguntas do treino, layout das folhas, repertórios compactados para o grupo,
instrumentos, afinador, traduções, requisitos de senha, validação de e-mail, as regras da sincronização com a
nuvem e a agenda do grupo (calendário, avisos da escala, frequência, repetição, .ics).

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
| [src/views/](src/views/) | Páginas: Repertório e folha, Biblioteca, Grupo, Estudo, Ferramentas, Palco |
| [src/dialogs/](src/dialogs/) | Janelas: biblioteca, música, repertório recebido do grupo, acorde, vídeo, evento... |
| [src/ui/](src/ui/) | Peças da interface: lista suspensa, controle segmentado, janela, avisos, dicas |
| [src/lib/](src/lib/) | Lógica sem interface: cifras e teoria, folhas A4, PDF, IndexedDB, repertórios compactados, áudio, metrônomo, afinador, instrumentos, traduções, conta (cloud.ts), sincronização (sync.ts), grupos (groups.ts), e regras da agenda (calendar.ts) |
| [supabase/](supabase/) | Banco na nuvem: tabelas e regras de acesso (migrations) |
| [src/styles/app.scss](src/styles/app.scss) | Design system: tokens, temas, layouts desktop/celular, animações |
| [src/sw.ts](src/sw.ts) | Cache offline |

Os dados ficam na nuvem e também no IndexedDB do navegador, para o app funcionar sem internet.

## Licença

Código sob [MIT](LICENSE). Fontes Atkinson Hyperlegible, Atkinson Hyperlegible Mono e Lexend sob a
[SIL Open Font License 1.1](fonts/OFL.txt). jsPDF 2.5.1 sob MIT.
