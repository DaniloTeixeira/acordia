-- A própria pessoa escalada troca a função dela num evento que ainda não começou, escolhendo entre as funções
-- do seu cadastro no grupo (group_members.role) ou as que já tem na escala. Mantém a resposta, o motivo e
-- quem cobre. O "*" depois de uma função do cadastro marca favorita e é ignorado aqui. Quem não está na escala não consegue (quem escala é o líder).
-- Pode rodar de novo sem problema.
create or replace function public.set_my_event_roles(eid uuid, new_roles text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  ev group_events;
  me text := my_email();
  mine event_roster;
  allowed text[];
  picked text[];
begin
  select * into ev from group_events where id = eid;
  if ev.id is null or not is_member(ev.group_id) then raise exception 'acordia: not member'; end if;
  if ev.starts_at <= now() then raise exception 'acordia: event started'; end if;
  select * into mine from event_roster where event_id = eid and email = me order by role limit 1;
  if mine.email is null then raise exception 'acordia: not on roster'; end if;
  select coalesce(array_agg(lower(trim(x))), '{}') into allowed from (
    select unnest(string_to_array(replace((select role from group_members where group_id = ev.group_id and email = me), '*', ''), ',')) as x
    union all select role from event_roster where event_id = eid and email = me) s where trim(x) <> '';
  select coalesce(array_agg(distinct left(trim(x), 40)), '{}') into picked from unnest(new_roles) x where trim(x) <> '';
  if cardinality(picked) = 0 then raise exception 'acordia: no role'; end if;
  if exists (select 1 from unnest(picked) p where lower(p) <> all (allowed)) then raise exception 'acordia: role not allowed'; end if;
  delete from event_roster where event_id = eid and email = me;
  insert into event_roster (event_id, email, role, status, reason, covered_by)
    select eid, me, p, mine.status, mine.reason, mine.covered_by from unnest(picked) p;
end $$;
revoke execute on function public.set_my_event_roles(uuid, text[]) from anon, public;
grant execute on function public.set_my_event_roles(uuid, text[]) to authenticated;
