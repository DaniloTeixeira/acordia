-- Acordia: cada membro do grupo pode ter várias funções (ex.: "Vocal, Violão"), guardadas juntas em
-- group_members.role, separadas por vírgula. O limite sobe de 40 para 200 caracteres.
-- Pode rodar de novo sem problema (não apaga dados).

alter table public.group_members drop constraint if exists group_members_role_check;
alter table public.group_members add constraint group_members_role_check check (char_length(role) <= 200);

create or replace function public.add_group_member(gid uuid, member_email text, admin boolean, member_role text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(member_email));
begin
  if not is_group_admin(gid) then raise exception 'acordia: not group admin'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'acordia: bad email'; end if;
  insert into allowed_emails(email) values (e) on conflict (email) do nothing;
  insert into group_members(group_id, email, is_admin, role) values (gid, e, coalesce(admin, false), left(coalesce(member_role, ''), 200))
    on conflict (group_id, email) do update set is_admin = excluded.is_admin, role = excluded.role;
end $$;

create or replace function public.set_my_role(gid uuid, member_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(gid) then raise exception 'acordia: not member'; end if;
  update group_members set role = left(coalesce(member_role, ''), 200) where group_id = gid and email = my_email();
end $$;
