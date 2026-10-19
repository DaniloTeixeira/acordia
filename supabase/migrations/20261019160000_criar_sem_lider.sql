-- Criar grupo não faz mais de quem criou o líder: a pessoa entra como membro comum e o líder é escolhido
-- depois, em Membros. Admins do app continuam vendo e administrando todos os grupos.
-- Pode rodar de novo sem problema (não apaga dados).

create or replace function public.create_group(group_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if not (is_allowed() and is_admin()) then raise exception 'acordia: not admin'; end if;
  insert into groups(name) values (left(trim(group_name), 80)) returning id into gid;
  insert into group_members(group_id, email, is_admin) values (gid, my_email(), false);
  return gid;
end $$;

-- Nome de grupo não se repete (sem diferenciar maiúsculas e espaços): vale ao criar e ao renomear.
-- O app já avisa antes (e também ignora acentos); aqui é a garantia.
create or replace function public.on_group_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from groups g where g.id <> new.id
      and lower(regexp_replace(trim(g.name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(new.name), '\s+', ' ', 'g'))) then
    raise exception 'acordia: group name taken';
  end if;
  return new;
end $$;
drop trigger if exists acordia_group_name on public.groups;
create trigger acordia_group_name before insert or update of name on public.groups
  for each row execute function public.on_group_name();
revoke execute on function public.on_group_name() from anon, public, authenticated;
