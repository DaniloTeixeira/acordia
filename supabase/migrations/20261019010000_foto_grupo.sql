-- Foto do grupo: só os admins do app trocam (os líderes do grupo, não). Fica em
-- avatars/groups/<id do grupo>/<arquivo>.jpg e o link vai em groups.photo (os membros já leem a tabela groups).
-- Sem foto, o app mostra as iniciais do nome. Precisa do bucket avatars (20261019000000_foto.sql).
-- Pode rodar de novo sem problema (não apaga dados).

alter table public.groups add column if not exists photo text not null default '';
do $$ begin
  alter table public.groups add constraint groups_photo_https check (photo = '' or (photo ~ '^https://' and char_length(photo) <= 1000));
exception when duplicate_object then null; end $$;

-- Os líderes podem renomear o grupo (update na tabela), mas a foto só o admin do app muda.
create or replace function public.on_group_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.photo is distinct from old.photo and not (is_allowed() and is_admin()) then
    raise exception 'acordia: only app admins change the group photo';
  end if;
  return new;
end $$;
drop trigger if exists acordia_group_photo on public.groups;
create trigger acordia_group_photo before update of photo on public.groups
  for each row execute function public.on_group_photo();
revoke execute on function public.on_group_photo() from anon, public, authenticated;

-- Pasta das fotos de grupo no bucket: só os admins do app veem a lista, enviam e apagam (o link público
-- continua abrindo para todos, como a foto do perfil).
drop policy if exists "foto do grupo: admins veem a pasta" on storage.objects;
create policy "foto do grupo: admins veem a pasta" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'groups' and public.is_allowed() and public.is_admin());
drop policy if exists "foto do grupo: admins enviam" on storage.objects;
create policy "foto do grupo: admins enviam" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'groups' and public.is_allowed() and public.is_admin());
drop policy if exists "foto do grupo: admins apagam" on storage.objects;
create policy "foto do grupo: admins apagam" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'groups' and public.is_allowed() and public.is_admin());
