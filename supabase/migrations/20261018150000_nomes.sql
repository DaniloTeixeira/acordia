-- Nome e data de nascimento ao adicionar alguém: quem libera o acesso (lista ou grupo) já pode
-- informar os dois. Ficam na lista de acesso e passam para o perfil enquanto a pessoa não escolher
-- outros. A data de nascimento mostra os aniversariantes do grupo na página Início.
-- Pode rodar de novo sem problema (não apaga dados).

alter table public.allowed_emails add column if not exists name text not null default '';
alter table public.allowed_emails add column if not exists birthday date;
alter table public.profiles add column if not exists birthday date;
do $$ begin
  alter table public.allowed_emails add constraint allowed_emails_name_len check (char_length(name) <= 80);
exception when duplicate_object then null; end $$;

-- Quem cria a conta já começa com o nome informado por quem liberou o acesso.
create or replace function public.on_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from allowed_emails where email = lower(new.email)) then
    raise exception 'acordia: email not allowed';
  end if;
  insert into profiles(id, email, name, birthday)
    select new.id, lower(new.email), a.name, a.birthday from allowed_emails a where a.email = lower(new.email)
    on conflict (id) do nothing;
  return new;
end $$;

-- Quem já tem conta mas ainda está sem nome (ou sem data) recebe o informado; o que a pessoa
-- escolheu no perfil não muda.
create or replace function public.on_allowed_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name <> '' then update profiles set name = new.name where email = new.email and name = ''; end if;
  if new.birthday is not null then update profiles set birthday = new.birthday where email = new.email and birthday is null; end if;
  return new;
end $$;
drop trigger if exists acordia_allowed_name on public.allowed_emails;
create trigger acordia_allowed_name after insert or update of name, birthday on public.allowed_emails
  for each row execute function public.on_allowed_name();

-- Adicionar ao grupo com nome e data de nascimento. Vazios não apagam o que já estava na lista.
create or replace function public.add_group_member(gid uuid, member_email text, admin boolean, member_role text, member_name text, member_birthday date) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(member_email)); n text := left(trim(coalesce(member_name, '')), 80);
begin
  if not is_group_admin(gid) then raise exception 'acordia: not group admin'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'acordia: bad email'; end if;
  insert into allowed_emails(email, name, birthday) values (e, n, member_birthday)
    on conflict (email) do update set name = case when n <> '' then n else allowed_emails.name end,
      birthday = coalesce(member_birthday, allowed_emails.birthday);
  insert into group_members(group_id, email, is_admin, role) values (gid, e, coalesce(admin, false), left(coalesce(member_role, ''), 200))
    on conflict (group_id, email) do update set is_admin = excluded.is_admin, role = excluded.role;
end $$;

-- Nome e aniversário no grupo: os do perfil; sem perfil (ainda não entrou) ou sem o dado, os
-- informados ao adicionar. A função muda o que devolve, então sai e volta.
drop function if exists public.group_people(uuid);
create function public.group_people(gid uuid) returns table(email text, name text, birthday date)
language sql stable security definer set search_path = public as $$
  select m.email, coalesce(nullif(p.name, ''), a.name, ''), coalesce(p.birthday, a.birthday)
  from group_members m left join profiles p on p.email = m.email left join allowed_emails a on a.email = m.email
  where m.group_id = gid and is_member(gid)
$$;

grant execute on function public.add_group_member(uuid, text, boolean, text, text, date), public.group_people(uuid) to authenticated;
revoke execute on function public.add_group_member(uuid, text, boolean, text, text, date), public.group_people(uuid) from anon, public;
revoke execute on function public.on_allowed_name() from anon, public, authenticated;
