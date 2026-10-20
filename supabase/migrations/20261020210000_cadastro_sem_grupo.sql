-- Cadastrar um usuário na página Usuários não coloca mais a pessoa no grupo: tira o gatilho que incluía
-- quem entrava na lista de acesso no grupo único (equipe automática). Em Grupo → Membros nada muda,
-- pois add_group_member já insere a pessoa no grupo. Quem já está em grupo continua nele.
-- Pode rodar de novo sem problema (não apaga dados).

drop trigger if exists acordia_allowed_join on public.allowed_emails;
drop function if exists public.on_allowed_join();
