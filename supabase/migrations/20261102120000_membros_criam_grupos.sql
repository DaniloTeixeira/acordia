-- Qualquer pessoa com acesso ao app pode criar o próprio grupo. Quem cria vira o líder dele (admins do app
-- continuam entrando como membro comum, como antes) e pode excluí-lo. O grupo só aparece para quem é membro
-- (as regras de leitura não mudam: is_member), além dos admins do app.
-- Pode rodar de novo sem problema (não apaga dados).

-- Quem criou o grupo (vazio nos grupos antigos).
alter table public.groups add column if not exists created_by text not null default '';

create or replace function public.create_group(group_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if not is_allowed() then raise exception 'acordia: not allowed'; end if;
  insert into groups(name, created_by) values (left(trim(group_name), 80), my_email()) returning id into gid;
  insert into group_members(group_id, email, is_admin) values (gid, my_email(), not is_admin());
  return gid;
end $$;
grant execute on function public.create_group(text) to authenticated;
revoke execute on function public.create_group(text) from anon, public;

-- Excluir: admins do app, ou quem criou o grupo (e ainda o lidera).
drop policy if exists "grupos: admins do app excluem" on public.groups;
drop policy if exists "grupos: admins do app ou criador excluem" on public.groups;
create policy "grupos: admins do app ou criador excluem" on public.groups for delete
  using (is_allowed() and (is_admin() or (created_by = my_email() and is_group_admin(id))));

-- Foto e formato da marca: admins do app, ou quem criou o grupo (e ainda o lidera).
create or replace function public.on_group_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.photo is distinct from old.photo or new.photo_round is distinct from old.photo_round)
     and not (is_allowed() and (is_admin() or (old.created_by = my_email() and is_group_admin(old.id)))) then
    raise exception 'acordia: only app admins or the group creator change the group photo';
  end if;
  return new;
end $$;
revoke execute on function public.on_group_photo() from anon, public, authenticated;

-- Pasta groups/<id do grupo>/ no bucket: vê a lista, envia e apaga quem pode mudar a foto desse grupo.
create or replace function public.can_edit_group_photo(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_allowed() and (is_admin() or exists(
    select 1 from groups g where g.id::text = folder and g.created_by = my_email() and is_group_admin(g.id)))
$$;
grant execute on function public.can_edit_group_photo(text) to authenticated;
revoke execute on function public.can_edit_group_photo(text) from anon, public;

drop policy if exists "foto do grupo: admins veem a pasta" on storage.objects;
drop policy if exists "foto do grupo: quem cria veem a pasta" on storage.objects;
create policy "foto do grupo: quem cria veem a pasta" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'groups' and public.can_edit_group_photo((storage.foldername(name))[2]));
drop policy if exists "foto do grupo: admins enviam" on storage.objects;
drop policy if exists "foto do grupo: quem cria envia" on storage.objects;
create policy "foto do grupo: quem cria envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'groups' and public.can_edit_group_photo((storage.foldername(name))[2]));
drop policy if exists "foto do grupo: admins apagam" on storage.objects;
drop policy if exists "foto do grupo: quem cria apaga" on storage.objects;
create policy "foto do grupo: quem cria apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'groups' and public.can_edit_group_photo((storage.foldername(name))[2]));

-- Convite só para quem já foi cadastrado por um admin do app: quem lidera um grupo (sem ser admin) não cria
-- acesso novo ao app. Fica no gatilho para valer em todas as versões de add_group_member. Quem muda a lista
-- por SQL (sem login) não é barrado.
create or replace function public.on_allowed_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not (is_allowed() and is_admin())
     and not exists(select 1 from allowed_emails where email = new.email) then
    raise exception 'acordia: email not registered';
  end if;
  return new;
end $$;
drop trigger if exists acordia_allowed_invite on public.allowed_emails;
create trigger acordia_allowed_invite before insert on public.allowed_emails
  for each row execute function public.on_allowed_invite();
revoke execute on function public.on_allowed_invite() from anon, public, authenticated;
