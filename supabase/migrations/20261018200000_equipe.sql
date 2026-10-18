-- Equipe automática: quem é cadastrado já entra no grupo, e os repertórios dos admins do grupo
-- aparecem para a equipe sozinhos (o app publica a cada mudança), sempre na versão mais nova.
-- Aplicado sozinho pela integração do Supabase com o GitHub a cada push no main (pasta migrations).
-- Pode rodar de novo sem problema (não apaga dados).

-- Cadastrou na lista de acesso: entra como membro no grupo. Só quando há um grupo só (com mais de
-- um, não dá para saber qual; aí quem administra inclui pela página Grupo).
create or replace function public.on_allowed_join() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from groups) = 1 then
    insert into group_members(group_id, email) select id, new.email from groups on conflict (group_id, email) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists acordia_allowed_join on public.allowed_emails;
create trigger acordia_allowed_join after insert on public.allowed_emails
  for each row execute function public.on_allowed_join();

-- Quem já estava cadastrado e ficou fora do grupo entra agora.
do $$ begin
  if (select count(*) from public.groups) = 1 then
    insert into public.group_members(group_id, email)
      select g.id, a.email from public.groups g cross join public.allowed_emails a
      on conflict (group_id, email) do nothing;
  end if;
end $$;

-- Publica (ou atualiza) um repertório em todos os grupos que a pessoa administra. Não grava por cima
-- do que outro admin publicou com a mesma origem (ex.: uma cópia importada). Devolve em quantos
-- grupos ficou publicado, ou -1 quando a pessoa não administra nenhum grupo (o app para de tentar).
create or replace function public.publish_setlist(src text, setlist_name text, n integer, setlist_code text) returns integer
language plpgsql security definer set search_path = public as $$
declare k integer;
begin
  if not is_allowed() then raise exception 'acordia: not allowed'; end if;
  if not exists(select 1 from groups g where is_group_admin(g.id)) then return -1; end if;
  insert into group_setlists as s (group_id, source_id, name, songs, code, shared_by, updated_at)
    select g.id, src, left(trim(setlist_name), 80), greatest(coalesce(n, 0), 0), setlist_code, my_email(), now()
    from groups g where is_group_admin(g.id)
  on conflict (group_id, source_id) do update
    set name = excluded.name, songs = excluded.songs, code = excluded.code, updated_at = now()
    where s.shared_by = my_email();
  get diagnostics k = row_count;
  return k;
end $$;

-- Tira dos grupos o repertório que a pessoa publicou (excluído ou esvaziado).
create or replace function public.unpublish_setlist(src text) returns integer
language plpgsql security definer set search_path = public as $$
declare k integer;
begin
  if not is_allowed() then raise exception 'acordia: not allowed'; end if;
  delete from group_setlists where source_id = src and shared_by = my_email() and is_group_admin(group_id);
  get diagnostics k = row_count;
  return k;
end $$;

-- Foto da conta Google no perfil (o app grava a cada login), para o grupo ver a foto de cada um.
alter table public.profiles add column if not exists photo text not null default '';
do $$ begin
  alter table public.profiles add constraint profiles_photo_https check (photo = '' or (photo ~ '^https://' and char_length(photo) <= 1000));
exception when duplicate_object then null; end $$;

-- Nome, aniversário e foto dos membros. A função muda o que devolve, então sai e volta.
drop function if exists public.group_people(uuid);
create function public.group_people(gid uuid) returns table(email text, name text, birthday date, photo text)
language sql stable security definer set search_path = public as $$
  select m.email, coalesce(nullif(p.name, ''), a.name, ''), coalesce(p.birthday, a.birthday), coalesce(p.photo, '')
  from group_members m left join profiles p on p.email = m.email left join allowed_emails a on a.email = m.email
  where m.group_id = gid and is_member(gid)
$$;

grant execute on function public.group_people(uuid) to authenticated;
revoke execute on function public.group_people(uuid) from anon, public;
grant execute on function public.publish_setlist(text, text, integer, text), public.unpublish_setlist(text) to authenticated;
revoke execute on function public.publish_setlist(text, text, integer, text), public.unpublish_setlist(text), public.on_allowed_join() from anon, public;
