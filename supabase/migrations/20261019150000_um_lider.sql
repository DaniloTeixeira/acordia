-- Um líder só por grupo. Quem já tinha mais de um fica com o que entrou primeiro no grupo; os outros viram
-- membros (continuam no grupo, com as mesmas funções). Passar a liderança para outra pessoa tira de quem era.
-- Pode rodar de novo sem problema (não apaga dados).

update group_members m set is_admin = false
where m.is_admin and exists (
  select 1 from group_members o
  where o.group_id = m.group_id and o.is_admin and (o.created_at, o.email) < (m.created_at, m.email)
);

-- O banco garante: no máximo um líder por grupo.
create unique index if not exists group_members_one_leader on public.group_members (group_id) where is_admin;

-- Passa a liderança: quem era líder vira membro e a pessoa escolhida vira líder, de uma vez só.
-- E-mail vazio: o grupo fica sem líder (só admins do app mexem nele até escolherem outro).
create or replace function public.set_group_leader(gid uuid, leader_email text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(leader_email, '')));
begin
  if not is_group_admin(gid) then raise exception 'acordia: not group admin'; end if;
  if e <> '' and not exists(select 1 from group_members where group_id = gid and email = e) then raise exception 'acordia: not a member'; end if;
  update group_members set is_admin = false where group_id = gid and is_admin and email <> e;
  if e <> '' then update group_members set is_admin = true where group_id = gid and email = e; end if;
end $$;
grant execute on function public.set_group_leader(uuid, text) to authenticated;
revoke execute on function public.set_group_leader(uuid, text) from anon, public;
