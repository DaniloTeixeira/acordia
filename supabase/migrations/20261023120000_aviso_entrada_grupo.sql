-- Aviso de quem entrou no grupo: cada entrada de membro grava um aviso que os outros membros leem ao abrir o
-- app. Só o gatilho grava (ninguém insere à mão); o grupo recém-criado (primeiro membro) não gera aviso.
-- by_email: quem adicionou (não recebe o aviso do que ele mesmo fez).
-- Pode rodar de novo sem problema (não apaga dados).

create table if not exists public.group_notices (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  kind text not null default 'joined',
  email text not null,
  by_email text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists group_notices_group_idx on public.group_notices(group_id, created_at desc);
alter table public.group_notices enable row level security;
drop policy if exists "avisos: membros veem" on public.group_notices;
create policy "avisos: membros veem" on public.group_notices for select using (is_member(group_id));

create or replace function public.on_member_joined() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists(select 1 from group_members where group_id = new.group_id and email <> new.email) then
    insert into group_notices(group_id, kind, email, by_email) values (new.group_id, 'joined', new.email, coalesce(my_email(), ''));
  end if;
  return new;
end $$;
drop trigger if exists acordia_member_joined on public.group_members;
create trigger acordia_member_joined after insert on public.group_members
  for each row execute function public.on_member_joined();

revoke execute on function public.on_member_joined() from anon, public, authenticated;
