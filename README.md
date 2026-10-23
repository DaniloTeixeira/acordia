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
- [ ] **Navegação** entre Início, Agenda, Biblioteca (Repertórios, Músicas e Medleys) e Mais (Membros, Usuários só para admin, Estudo e Ferramentas): barra de abas no celular. No topo do celular, a foto do perfil fica à esquerda (abre o Perfil) e o menu (⋯) à direita reúne instalar, idioma, volume e tema; a ajuda (?) fica solta ao lado dele. No computador o trilho
      lateral mostra tudo direto (Início, Agenda, Biblioteca, Membros, Estudo e Ferramentas), sem o Mais. Membros, Estudo, Ferramentas, Perfil e Usuários têm o link "Voltar para <tela>" no topo, que leva à tela de onde a pessoa veio (sem histórico, ao Mais ou ao Início). No celular ele fica fixo no topo e continua visível ao rolar. Cada página tem endereço próprio, então o "voltar" do navegador (e do mouse) funciona e fecha primeiro a janela ou o Palco abertos. O repertório aberto conta como Grupo e o voltar leva aos Repertórios. Tocar de novo na
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
  - **estado da nuvem** (só quando há algo a saber): "Sincronizando…", mudanças esperando, sem internet ou erro, com
    "Sincronizar agora";
  - **Sair**: tenta subir o que falta, avisa se algo vai se perder e apaga os dados deste aparelho.
- [ ] **Usuários** do app (só admins, pelo card no Perfil ou pela aba Usuários do menu lateral da tela larga; é a lista de todos com acesso, com ou sem grupo): cadastrar usuário sem grupo (no celular o card de cadastro abre fechado; nome, e-mail, celular e nascimento; depois dá para colocar em um grupo em Grupo → Membros), todos com acesso ao app, com busca e ordem; editar os dados,
      tornar ou tirar admin (só o Dono, com confirmação ao dar) e excluir a pessoa do sistema (acesso, grupos e conta de login). A lista mostra só a pessoa
      (nome, e-mail, celular e uma linha de chips: "Acessou" ou "Não acessou" (ainda não fez login) e "Sem grupo" para quem não está em nenhum grupo); as ações ficam na janela de detalhes, em "Acesso ao app".
- [ ] **Músicas e repertórios na nuvem**, iguais em todos os aparelhos da conta:
  - funciona sem internet, e as mudanças sobem depois;
  - no primeiro login de um aparelho, o que já estava nele sobe para a conta;
  - se a mesma coisa mudou em dois lugares, vale a mudança mais recente.

### Início
- [ ] Primeira página depois de entrar: "Olá, nome" e a data de hoje. No computador os blocos ficam em duas colunas
      (quando sobra um, ele ocupa a linha toda); no celular, em uma, na mesma ordem.
- [ ] **Aviso de aniversário**: no dia, um cartão no topo lembra de enviar uma mensagem de parabéns ("Hoje é aniversário de Ana e
      Pedro!"). O próprio aniversariante vê um "Feliz aniversário". Fechar (X) vale até o aniversário do ano seguinte e fica neste aparelho.
- [ ] **Próximo compromisso** em destaque, com **Confirmar / Não posso** e **Estudar repertório** (abre a folha) ou Palco, sem sair do Início.
- [ ] **Precisam de substituto** (só quem lidera): ao lado do destaque, os eventos em que alguém disse que
      não pode.
- [ ] **Próximos 7 dias**: a semana com um ponto nos dias com evento (destacado quando a pessoa está escalada).
      Embaixo, **Minhas escalas**: as outras escalas em linhas (data, título, hora, "em 3 dias", função) com
      Confirmar / Não posso. Tocar abre o evento na agenda.
- [ ] Quem lidera vê "3 de 5 confirmaram" no próximo compromisso e em cada escala, o bloco **Faltam respostas**
      (os próximos eventos com gente que ainda não respondeu) e o botão **Novo evento** embaixo da semana.
- [ ] **Para estudar**, ao lado de **Grupos**: só os repertórios do grupo ligados a um evento que ainda vai acontecer (menos o do próximo
      compromisso), até cinco; sem nenhum, o bloco some.
- [ ] **Grupos** (com mais de um grupo, ou para o admin): nome, próximos eventos e membros; leva à agenda.
      Fixar põe um grupo em primeiro. O admin cria um grupo novo por aqui.
- [ ] **Aniversariantes** do grupo nos próximos 7 dias, por último. O card fica sempre, com um aviso quando
      ninguém faz aniversário na semana.

### Repertório
- [ ] **Nome editável** e subtítulo com o número de músicas e a transposição.
- [ ] **Novo**: cria outro repertório. O anterior continua salvo.
- [ ] **Palco**.
- [ ] **Editar / Ver folha**: alterna os painéis no celular; no computador ficam lado a lado.
- [ ] **Adicionar**: "Adicionar música" (cole a cifra ou a letra; o tipo "Só letra" é detectado sozinho: texto sem nenhum acorde), "Biblioteca" (escolha várias, com busca) e "Medley".
- [ ] **Cartão de cada música**:
  - **arrastar o cartão** para outro lugar (menos pelos botões e campos): no mouse, clicar e arrastar (só clicar
    abre e fecha); no celular, segurar ~¼ s e arrastar; Esc cancela; no teclado, Tab até o número e ↑ ↓;
  - tirar do repertório (com Desfazer);
  - chips: tom → tom para tocar, BPM e solo;
  - tipo detectado sozinho ("Só letra" quando não há acorde);
  - texto: título na primeira linha, depois cifra e letra;
  - os mesmos campos no repertório e no medley: **Tom** (automático ou um dos 24), Solo, BPM e link de
    **Referência** (▶ para ouvir).
- [ ] **Louvor | Pós-pregação** em cada música e em cada medley do repertório (Louvor é o padrão). O medley
      define uma vez para todas as músicas dele. Pós-pregação aparece como chip no cartão e na folha/Palco.
- [ ] **Medley**: bloco de músicas emendadas dentro do repertório, com o chip "Medley · N músicas | Editar" e
      "Voltar para…".
- [ ] **Voltar para Repertórios** e **Excluir** (lixeira) no topo do repertório.
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
- [ ] Refrão destacado (fundo claro e rótulo REFRÃO): `[Refrão]` antes e `[/Refrão]` depois fazem um bloco só,
      mesmo com várias estrofes. Sem marcação, o bloco de letra que se repete é o refrão.
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
- [ ] **Caber na tela**: a letra encolhe até a música inteira caber sem rolar; botão ligado fica preenchido.
      No celular o botão some nos medleys (não cabem numa tela), e eles rolam normalmente.
- [ ] **Metrônomo** compacto, no BPM da primeira música.
- [ ] **−/+ por música**: meio tom abaixo ou acima. Muda o tom para tocar no repertório.
- [ ] Acordes clicáveis, ▶ referência, dados da música, aviso de transição e rótulo de medley.
- [ ] Toque embaixo avança, toque em cima volta.
- [ ] Atalhos: setas / PageDown / espaço avançam e voltam, + e − mudam a fonte, Esc sai.

### Músicas e repertórios do grupo
Tudo é do grupo, nas abas **Repertórios** e **Músicas** do Grupo: todos os membros veem e baixam para o aparelho
(abre sem internet); só quem lidera o grupo e os admins do app criam, editam e excluem. Quem só lê abre o repertório
direto na folha, sem Editar, e não vê os botões de mudar.
- [ ] Abas **Repertórios** (com **Medleys** ao lado quando houver) e **Músicas**, com busca.
- [ ] Músicas: busca e ordem A–Z ou Recentes.
- [ ] **Cartão de música**: tom, BPM, em quantos repertórios está, trecho da letra e quando foi
      editada; Adicionar ao repertório, ▶, Editar e Excluir.
- [ ] **Cartão de repertório/medley**: Abrir, **Duplicar** ("(cópia)") e Excluir.
- [ ] **Janela da música**:
  - Montar cifra (só em música nova);
  - **Transpor a cifra** (−/+), que reescreve os acordes;
  - tom, BPM e referência;
  - com alterações, clicar fora não descarta o texto.
- [ ] **Alterações não salvas (qualquer janela ou formulário)**: Cancelar, X, Esc, voltar, clicar fora ou trocar de
  página com algo editado e não salvo abre "Alterações não salvas" (Descartar / Continuar editando); sem
  alterações, fecha direto. Fechar ou recarregar a aba mostra o aviso do navegador.

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
Abre pelo Início (cartão do grupo ou de uma escala). Os admins do app criam grupos; quem lidera um grupo inclui os membros pelo e-mail (o que
também libera o acesso ao app para eles).
- [ ] **Agenda**:
  - calendário do mês com cultos e ensaios, os dias em que a pessoa está escalada e os dias em que não pode;
  - tocar num dia mostra os eventos dele e a chave **"Não posso neste dia"** (indisponibilidade);
  - **Seu próximo compromisso** no topo: as suas funções, Confirmar / Não posso de cada escala (e quem cobre, para quem não pode), sem abrir o evento;
  - lista de próximos e anteriores; cada evento abre com a data, o título e os chips no topo do card, sem bloco "Detalhes"; quem está na escala de um evento futuro também responde ali, em "Sua resposta" (o mesmo bloco do topo da Agenda). No ensaio, nas 12 h antes do início, a resposta e a presença viram um estado só para quem está na escala: o selo mostra Presente, Você confirmou ou Você não vai, com um único "Alterar resposta" e as opções **Cheguei** (também confirma a resposta) e **Não posso** (desmarca a presença); quem está na escala também tem ali **Adicionar ao calendário**, com a explicação.
- [ ] **Evento** (só quem lidera cria e edita; Editar e Excluir ficam um em cada ponta no celular e juntos à direita no computador):
  - tipo Culto ou Ensaio, título, data, início, **hora de chegada**, local, repertório do grupo e observações;
  - **repetir** toda semana (2 a 26 vezes);
  - **escala**: quem toca o quê, com funções sugeridas e "Escalar todos"; no computador é uma tabela (pessoa e funções
    numa linha, "Outra função" como link à direita), no celular cada pessoa é um cartão;
  - tocar numa pessoa da escala abre os detalhes dela e, para quem lidera, o botão **Escalar neste evento** (ou **Tirar da escala**, com confirmação), que grava na hora e mostra os avisos de conflito sem bloquear;
  - **Detalhes** e **Escala** abrem e fecham pelo título: no computador os dois abrem abertos; no celular só a Escala;
  - avisos ao escalar: marcou que não pode no dia, já está em outro evento no dia ou já recusou; cada pessoa
    mostra quantas vezes já foi escalada no mês.
- [ ] **Resposta da escala**: abas "Confirmar" e "Não posso" (gravam na hora, com spinner). Quem marca "Não posso" pode indicar
      **quem cobre** a vaga (só um aviso para o grupo); quem lidera vê "não pode ir · falta substituto" enquanto ninguém foi indicado.
- [ ] **Aviso de entrada no grupo**: quando alguém é adicionado ao grupo, os outros membros veem ao abrir o app um aviso fixo ("Fulano entrou em Grupo", ou "Fulano e mais 2 entraram") que fecham no ×. Vale até 14 dias, aparece uma vez por aparelho e não vai para quem adicionou nem para a própria pessoa. É só dentro do app, sem notificação push.
- [ ] **Membro ativo ou inativo**: em Membros, quem lidera deixa alguém inativo ("Afastar", olho cortado) sem tirar do grupo.
      O inativo some da escala e da chamada dos ensaios, mas o histórico fica; voltar é pelo mesmo botão ("Reintegrar"). O líder não fica inativo.
- [ ] **Presença nos ensaios**: "Cheguei" (de 12 h antes do início em diante; em ensaio que já começou o membro escolhe entre "Estive" e "Não estive", ou volta a sem marcação; a própria marcação o membro muda quando quiser, mas o que o líder marcou ele não troca direto: usa "Pedir alteração" (dá para cancelar) e o líder aceita ou recusa na chamada; enquanto não marcou, "Sua resposta" sobe para o topo do card) e a chamada de quem lidera
      (presente, falta, justificada), que vale por cima do "Cheguei".
      Em Membros, o botão de check na linha da pessoa marca presença ou falta dos últimos ensaios sem abrir a agenda.
      A lista do ensaio é uma tabela zebrada (pessoa e resposta, só texto colorido) com os escalados e, logo abaixo, os não escalados (quem marcou presença sem estar escalado, como "Não escalado"), em dois blocos (**Escalados** e **Não escalados**, cada um com sua ordem; o subtítulo só aparece quando existem os dois) e com o nome dos não escalados em cinza (discreto); enquanto o ensaio não tem escala, aparecem todos os membros ativos, e quem está em pausa fica de fora. A Chamada segue a mesma regra. Quem não foi escalado (inclui quem está em pausa) só vê "Presente" ao marcar a própria presença: a falta não conta para ele, e o banco também recusa. Tocar no título de **Pessoa** ou **Resposta** ordena a lista (de novo, inverte); a resposta do evento vem antes da escala.
      Tocar na linha de uma pessoa abre os detalhes dela, com o **histórico nos ensaios** (os últimos 12: Presente, Falta ou Justificada).
      Ao alterar a resposta, o link "Alterar resposta" vira "Cancelar" no mesmo lugar e a linha mantém a altura.
- [ ] **Adicionar ao calendário** (.ics): todas as suas escalas de uma vez (botão no card "Suas próximas escalas"), com lembrete 1 dia e 2 h antes.
- [ ] **Repertórios do grupo**: quem lidera compartilha um repertório seu (compartilhar de novo atualiza);
      todos abrem ("Salvar e abrir" ou "Atualizar") ou vão direto ao **Palco**.
- [ ] **Copiar e-mail e celular**: ao lado de cada e-mail e celular (Membros, Usuários e janela da pessoa) há um botão que copia o texto e mostra "✓" por um instante.
- [ ] **Membros**: nome, e-mail, funções (várias, como Vocal e Violão; cada um edita as suas), selo Líder, **frequência nos ensaios** (6 meses)
      e escalas no mês. Quem lidera inclui, torna líder e tira do grupo; admins do app renomeiam, criam e
      excluem grupos.
- [ ] **Em pausa**: quem falta a 8 ensaios seguidos fica em pausa até participar de 4. Quem só tem a função Mesa de som fica fora dessa regra (quase não vai aos ensaios). Na chamada do ensaio há também a opção **Pausa**, que deixa a pessoa fora da conta daquele ensaio, e a lista de escala passa a mostrar Presente/Falta/Pausa assim que a chamada é marcada. No cadastro de Membros, a chave "Em pausa" já inclui a pessoa em pausa (para quem está há mais de 8 ensaios sem participar). Na janela do membro, "Ajustar retorno" abre um quadro para marcar a pausa à mão ("Pausar"), mudar quantos ensaios faltam ou "Tirar da pausa"; em pausa, a frequência mostra o progresso da volta (0% até 100%) em vez da presença.
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

### Ferramentas
- [ ] **Metrônomo**:
  - BPM de 30 a 240, com o nome do andamento;
  - compasso 2/4, 3/4, 4/4 ou 6/8;
  - subdivisão;
  - acento no 1º tempo;
  - **Descobrir BPM**;
  - atalhos: espaço, setas e T.
- [ ] **Afinador**: pelo microfone, com A4 de 432 a 446 Hz, ponteiro em cents e a corda mais próxima; a falha do microfone usa o mesmo aviso fixo da Voz.
- [ ] **Pad infinito**:
  - tom, 6 estilos (Original, Discreto, Quente, Brilhante, Etéreo, Profundo), volume e filtro;
  - swell em 4 ou 8 compassos;
  - entrar e sair devagar;
  - troca de tom suave;
  - continua tocando fora da página.
- [ ] **Voz, Minha extensão** (aba Voz das Ferramentas, ao lado do Afinador):
  - mede a nota mais grave e a mais aguda e diz a classificação vocal;
  - basta **segurar a mesma nota por ~2 segundos**: uma barra enche e a nota é salva sozinha ("✓ Salvo"), sem apertar botão; durante a medição o botão vira Cancelar;  - a extensão fica no **perfil** (na nuvem, com a classificação vocal em um card próprio do perfil, com atalho para medir) e o grupo vê a **classificação vocal** (chip Baixo, Barítono, Tenor, Contralto, Mezzo-soprano, Soprano) em **Membros** e na **escala** do evento; a faixa (ex.: F2–C4) não aparece para o grupo;
  - passo a passo e o para-que-serve na tela (na tela larga fica sempre aberto; no celular abre até medir a primeira vez e depois recolhe);
  - se o microfone falhar, um balão curto avisa na hora e um aviso fixo na tela (Voz e Afinador) diz o motivo (negado no site, bloqueado pelo Android, sem microfone, em uso, navegador sem suporte), ensina a liberar e tem "Tentar de novo"; some quando o microfone funciona.
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

- **Dois projetos:** `acordia` é a produção (o site e quem usa o app); `acordia-dev` é para desenvolver e
  testar. Rodando local, o app usa sempre o dev.
- **Chaves:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY` (a chave *publishable*/anon, que pode ficar no site).
  Para rodar local, ficam num `.env.local` com as chaves do **dev**, que não vai para o Git. No GitHub, ficam
  nas variáveis do repositório `SUPABASE_URL` e `SUPABASE_KEY` com as chaves da **produção**, que o deploy
  usa no build.
- **Banco:** as tabelas e as regras de acesso ficam em [supabase/migrations/](supabase/migrations/). Com a
  integração do Supabase com o GitHub ("Deploy to production", ligada só na produção), cada merge na `main`
  aplica as migrações novas. No dev, aplique antes com `npx supabase db push` (CLI ligada ao dev com
  `npx supabase link --project-ref <ref do dev>`). O primeiro admin entra uma vez à mão, com
  [supabase/primeiro-admin.sql](supabase/primeiro-admin.sql).
- **Migração nova** (o app instalado no celular continua na versão antiga por um tempo, usando o banco já
  migrado):
  - só acrescentar: tabela, coluna com valor padrão, função, regra de acesso;
  - apagar ou renomear coluna, ou mudar o que uma função devolve, só num PR seguinte, quando a versão que
    usa o novo já estiver no ar;
  - escrever para poder rodar de novo (`if not exists`, `create or replace`, `drop ... if exists`);
  - nunca editar uma migração que já foi para a `main`: corrigir com outra.
- **Sem `supabase/config.toml` no repositório:** a integração com o GitHub aplicaria esse arquivo na produção
  (login, URLs). As configurações do painel ficam só no painel.
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

A `main` é o que está no ar e é protegida: nada entra sem PR e sem o CI passar.

1. Branch a partir da `main`: `feat/<assunto>` (novidade) ou `fix/<assunto>` (correção).
2. Testar local (com o banco dev) e, se tiver migração nova, `npx supabase db push` no dev.
3. Push e PR para a `main`. O CI ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) roda
   typecheck, testes, build e aplica todas as migrações num Supabase vazio.
4. Com tudo verde, **Squash and merge**. O merge publica no GitHub Pages, aplica as migrações na produção e
   marca a versão com uma tag `vAAAA.MM.DD-N`.

**Voltar uma versão:** Actions > Testar e publicar > Run workflow, com a tag no campo "versao" (ex.:
`v2026.10.18-1`). Publica de novo aquele código em uns 2 minutos. O banco não volta: se o problema for uma
migração, corrigir com uma migração nova. Depois, corrigir na `main` por PR (o próximo merge publica a `main`
de novo).

Em cada deploy, o CI roda typecheck, testes, `npm run build` e publica no GitHub Pages. O build lista todos os arquivos no service worker
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
