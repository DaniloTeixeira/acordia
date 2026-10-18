-- Celular de cada pessoa: quem libera o acesso (lista ou grupo) já pode informar, e a pessoa muda no
-- perfil. Como o nome e a data, o do perfil vale mais; o grupo vê, para achar substituto rápido.
-- Pode rodar de novo sem problema (não apaga dados).

alter table public.allowed_emails add column if not exists phone text not null default '';
alter table public.profiles add column if not exists phone text not null default '';
do $$ begin
  alter table public.allowed_emails add constraint allowed_emails_phone_len check (char_length(phone) <= 30);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_phone_len check (char_length(phone) <= 30);
exception when duplicate_object then null; end $$;

-- Quem cria a conta já começa com o nome, a data e o celular informados por quem liberou o acesso.
create or replace function public.on_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from allowed_emails where email = lower(new.email)) then
    raise exception 'acordia: email not allowed';
  end if;
  insert into profiles(id, email, name, birthday, phone)
    select new.id, lower(new.email), a.name, a.birthday, a.phone from allowed_emails a where a.email = lower(new.email)
    on conflict (id) do nothing;
  return new;
end $$;

-- Quem já tem conta e ainda está sem o dado recebe o informado; o que a pessoa escolheu não muda.
create or replace function public.on_allowed_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name <> '' then update profiles set name = new.name where email = new.email and name = ''; end if;
  if new.birthday is not null then update profiles set birthday = new.birthday where email = new.email and birthday is null; end if;
  if new.phone <> '' then update profiles set phone = new.phone where email = new.email and phone = ''; end if;
  return new;
end $$;
drop trigger if exists acordia_allowed_name on public.allowed_emails;
create trigger acordia_allowed_name after insert or update of name, birthday, phone on public.allowed_emails
  for each row execute function public.on_allowed_name();

-- Adicionar ao grupo com celular também (a versão sem celular continua, para o app antigo em cache).
create or replace function public.add_group_member(gid uuid, member_email text, admin boolean, member_role text, member_name text, member_birthday date, member_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(member_email)); n text := left(trim(coalesce(member_name, '')), 80); ph text := left(trim(coalesce(member_phone, '')), 30);
begin
  if not is_group_admin(gid) then raise exception 'acordia: not group admin'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'acordia: bad email'; end if;
  insert into allowed_emails(email, name, birthday, phone) values (e, n, member_birthday, ph)
    on conflict (email) do update set name = case when n <> '' then n else allowed_emails.name end,
      birthday = coalesce(member_birthday, allowed_emails.birthday),
      phone = case when ph <> '' then ph else allowed_emails.phone end;
  insert into group_members(group_id, email, is_admin, role) values (gid, e, coalesce(admin, false), left(coalesce(member_role, ''), 200))
    on conflict (group_id, email) do update set is_admin = excluded.is_admin, role = excluded.role;
end $$;

-- Nome, aniversário, foto e celular dos membros. A função muda o que devolve, então sai e volta.
drop function if exists public.group_people(uuid);
create function public.group_people(gid uuid) returns table(email text, name text, birthday date, photo text, phone text)
language sql stable security definer set search_path = public as $$
  select m.email, coalesce(nullif(p.name, ''), a.name, ''), coalesce(p.birthday, a.birthday), coalesce(p.photo, ''),
    coalesce(nullif(p.phone, ''), a.phone, '')
  from group_members m left join profiles p on p.email = m.email left join allowed_emails a on a.email = m.email
  where m.group_id = gid and is_member(gid)
$$;

grant execute on function public.add_group_member(uuid, text, boolean, text, text, date, text), public.group_people(uuid) to authenticated;
revoke execute on function public.add_group_member(uuid, text, boolean, text, text, date, text), public.group_people(uuid) from anon, public;
revoke execute on function public.on_allowed_name() from anon, public, authenticated;
