-- O líder pode liberar o grupo: com "Todos podem editar" ligado (groups.members_edit), qualquer membro faz o que o
-- líder faz (repertórios, músicas, agenda, escala, presença, membros). Tudo o que já checava is_group_admin passa
-- a valer para os membros sozinho. Só o líder (ou admin do app) liga/desliga a opção, passa a liderança, exclui o
-- grupo e troca a foto; membros não tiram o líder do grupo.
-- Pode rodar de novo sem problema (não apaga dados).

alter table public.groups add column if not exists members_edit boolean not null default false;

-- Líder de verdade (ou admin do app): a regra de antes de is_group_admin.
create or replace function public.is_group_leader(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_allowed() and (is_admin() or exists(select 1 from group_members where group_id = gid and email = my_email() and is_admin))
$$;
grant execute on function public.is_group_leader(uuid) to authenticated;
revoke execute on function public.is_group_leader(uuid) from anon, public;

-- Quem pode editar o grupo: o líder, ou qualquer membro se o líder liberou.
create or replace function public.is_group_admin(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_allowed() and (is_admin() or exists(
    select 1 from group_members m join groups g on g.id = m.group_id
    where m.group_id = gid and m.email = my_email() and (m.is_admin or g.members_edit)))
$$;

-- Só o líder muda a opção.
create or replace function public.on_group_members_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.members_edit is distinct from old.members_edit and auth.uid() is not null and not is_group_leader(old.id) then
    raise exception 'acordia: only the group leader changes who can edit';
  end if;
  return new;
end $$;
revoke execute on function public.on_group_members_edit() from anon, public, authenticated;
drop trigger if exists acordia_group_members_edit on public.groups;
create trigger acordia_group_members_edit before update on public.groups
  for each row execute function public.on_group_members_edit();

-- Liderança: só o líder cria, passa ou tira; e ninguém além dele (ou do admin do app) remove o líder do grupo.
-- Quem muda por SQL (sem login) não é barrado. O primeiro membro de um grupo novo (o criador) entra como líder.
create or replace function public.on_member_leader() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.is_admin and exists(select 1 from groups where id = old.group_id) and not is_group_leader(old.group_id) then
      raise exception 'acordia: only the group leader removes the leader';
    end if;
    return old;
  elsif tg_op = 'INSERT' then
    if new.is_admin and exists(select 1 from group_members where group_id = new.group_id) and not is_group_leader(new.group_id) then
      raise exception 'acordia: only the group leader makes a leader';
    end if;
    return new;
  end if;
  if new.is_admin is distinct from old.is_admin and not is_group_leader(new.group_id) then
    raise exception 'acordia: only the group leader changes the leader';
  end if;
  return new;
end $$;
revoke execute on function public.on_member_leader() from anon, public, authenticated;
drop trigger if exists acordia_member_leader on public.group_members;
create trigger acordia_member_leader before insert or update or delete on public.group_members
  for each row execute function public.on_member_leader();

create or replace function public.set_group_leader(gid uuid, leader_email text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(leader_email, '')));
begin
  if not is_group_leader(gid) then raise exception 'acordia: not group leader'; end if;
  if e <> '' and not exists(select 1 from group_members where group_id = gid and email = e) then raise exception 'acordia: not a member'; end if;
  update group_members set is_admin = false where group_id = gid and is_admin and email <> e;
  if e <> '' then update group_members set is_admin = true where group_id = gid and email = e; end if;
end $$;
grant execute on function public.set_group_leader(uuid, text) to authenticated;
revoke execute on function public.set_group_leader(uuid, text) from anon, public;

-- Excluir o grupo e trocar a foto: admins do app, ou quem criou e ainda é o líder (membro com edição liberada não).
drop policy if exists "grupos: admins do app ou criador excluem" on public.groups;
create policy "grupos: admins do app ou criador excluem" on public.groups for delete
  using (is_allowed() and (is_admin() or (created_by = my_email() and is_group_leader(id))));

create or replace function public.on_group_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.photo is distinct from old.photo or new.photo_round is distinct from old.photo_round)
     and not (is_allowed() and (is_admin() or (old.created_by = my_email() and is_group_leader(old.id)))) then
    raise exception 'acordia: only app admins or the group creator change the group photo';
  end if;
  return new;
end $$;
revoke execute on function public.on_group_photo() from anon, public, authenticated;

create or replace function public.can_edit_group_photo(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_allowed() and (is_admin() or exists(
    select 1 from groups g where g.id::text = folder and g.created_by = my_email() and is_group_leader(g.id)))
$$;
grant execute on function public.can_edit_group_photo(text) to authenticated;
revoke execute on function public.can_edit_group_photo(text) from anon, public;
