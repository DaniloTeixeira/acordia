-- Fora dos cultos marcado pelo líder: para quem já tinha faltado aos ensaios antes de a chamada estar
-- no app. out_since: desde quando (a volta conta a partir daí); out_need: quantos ensaios para voltar.
-- Só os líderes do grupo mudam (a regra "membros: admins do grupo mudam" já cobre).
-- Pode rodar de novo sem problema (não apaga dados).
alter table public.group_members add column if not exists out_since timestamptz;
alter table public.group_members add column if not exists out_need smallint not null default 4;
do $$ begin
  alter table public.group_members add constraint group_members_out_need check (out_need between 1 and 20);
exception when duplicate_object then null; end $$;
