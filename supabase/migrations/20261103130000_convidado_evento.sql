-- Convidado de um evento: entra no grupo só até o evento acabar (group_members.guest_until). Passada a data, o
-- banco deixa de tratar a pessoa como membro (sem rotina agendada: is_member confere a data). O cadastro dela
-- em allowed_emails continua, então ela segue na página Usuários; a escala e a presença do evento ficam no histórico.
-- Convidado nunca edita o grupo (nem com "Todos podem editar") e não gera aviso de "entrou no grupo".
-- Pode rodar de novo sem problema (não apaga dados).

alter table public.group_members add column if not exists guest_until timestamptz;

-- Membro vale enquanto não tiver prazo ou o prazo não passou.
create or replace function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_allowed() and (is_admin() or exists(
    select 1 from group_members where group_id = gid and email = my_email() and (guest_until is null or guest_until > now())))
$$;

-- Edita o grupo: o líder, ou qualquer membro fixo se o líder liberou (convidado não).
create or replace function public.is_group_admin(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_allowed() and (is_admin() or exists(
    select 1 from group_members m join groups g on g.id = m.group_id
    where m.group_id = gid and m.email = my_email() and m.guest_until is null and (m.is_admin or g.members_edit)))
$$;

-- Quem entrou como convidado não gera o aviso de entrada.
create or replace function public.on_member_joined() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.guest_until is null and exists(select 1 from group_members where group_id = new.group_id and email <> new.email) then
    insert into group_notices(group_id, kind, email, by_email) values (new.group_id, 'joined', new.email, coalesce(my_email(), ''));
  end if;
  return new;
end $$;

-- Convida alguém só até "until". Quem já é membro fixo continua fixo; quem já é convidado fica com o prazo mais
-- distante. O e-mail precisa estar cadastrado (o gatilho on_allowed_invite barra quem não é admin do app).
create or replace function public.add_group_guest(gid uuid, guest_email text, guest_role text, guest_name text, guest_phone text, guest_birthday date, until timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(guest_email)); n text := left(trim(coalesce(guest_name, '')), 80); ph text := left(trim(coalesce(guest_phone, '')), 30);
begin
  if not is_group_admin(gid) then raise exception 'acordia: not group admin'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'acordia: bad email'; end if;
  if until is null or until <= now() then raise exception 'acordia: bad guest date'; end if;
  -- Cadastro novo leva nome, celular e nascimento; quem já está cadastrado só ganha o que ainda faltava.
  insert into allowed_emails(email, name, birthday, phone) values (e, n, guest_birthday, ph)
    on conflict (email) do update set
      name = case when allowed_emails.name = '' then n else allowed_emails.name end,
      birthday = coalesce(allowed_emails.birthday, guest_birthday),
      phone = case when allowed_emails.phone = '' then ph else allowed_emails.phone end;
  insert into group_members(group_id, email, is_admin, role, guest_until) values (gid, e, false, left(coalesce(guest_role, ''), 200), until)
    on conflict (group_id, email) do update set guest_until = case
      when group_members.guest_until is null then null
      else greatest(group_members.guest_until, excluded.guest_until) end;
end $$;
grant execute on function public.add_group_guest(uuid, text, text, text, text, date, timestamptz) to authenticated;
revoke execute on function public.add_group_guest(uuid, text, text, text, text, date, timestamptz) from anon, public;
