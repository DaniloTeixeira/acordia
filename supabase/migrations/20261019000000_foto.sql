-- Foto do perfil enviada pelo app: cada pessoa guarda a sua em avatars/<id da conta>/<arquivo>.jpg.
-- O bucket é público (o link vai em profiles.photo, como a foto do Google, e o grupo abre sem login no
-- Storage); só a própria pessoa, com acesso liberado, grava ou apaga na pasta dela.
-- Pode rodar de novo sem problema (não apaga dados).

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/webp'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "foto: cada um ve a sua pasta" on storage.objects;
create policy "foto: cada um ve a sua pasta" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "foto: cada um envia na sua pasta" on storage.objects;
create policy "foto: cada um envia na sua pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.is_allowed());
drop policy if exists "foto: cada um apaga a sua" on storage.objects;
create policy "foto: cada um apaga a sua" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
