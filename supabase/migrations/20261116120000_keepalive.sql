-- Atividade de verdade para o banco dev não ser pausado: uma tabela de uma linha e uma função que só
-- grava a hora nela. É a ÚNICA função chamável sem login (anon), de propósito: o workflow "Manter o banco
-- dev ativo" só tem a chave pública. Não recebe argumento, não lê nem devolve dado de ninguém.
-- Pode rodar de novo sem problema.
create table if not exists public.keepalive (
  id boolean primary key default true check (id),
  pinged_at timestamptz not null default now()
);
alter table public.keepalive enable row level security;

create or replace function public.keepalive() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into keepalive (id, pinged_at) values (true, now())
  on conflict (id) do update set pinged_at = excluded.pinged_at;
end $$;
revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
