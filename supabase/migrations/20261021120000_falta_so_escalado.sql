-- Quem marca a própria presença só pode marcar "falta" se estava na escala do ensaio (quem está em pausa não é
-- escalado, e a falta dele não conta em nada). Presença continua livre para todos, e é ela que tira da pausa.
-- O líder segue podendo fazer a chamada de qualquer um. Pode rodar de novo sem problema.
create or replace function public.set_my_attendance(eid uuid, st text) returns void
language plpgsql security definer set search_path = public as $$
declare ev group_events;
begin
  select * into ev from group_events where id = eid;
  if ev.id is null or not is_member(ev.group_id) then raise exception 'acordia: not member'; end if;
  if ev.kind <> 'rehearsal' then raise exception 'acordia: not a rehearsal'; end if;
  if now() < ev.starts_at - interval '12 hours' then raise exception 'acordia: outside check-in window'; end if;
  if st = 'absent' and not exists (select 1 from event_roster where event_id = eid and email = my_email()) then
    raise exception 'acordia: not on roster';
  end if;
  if st in ('present', 'absent') then
    insert into event_attendance(event_id, email, status) values (eid, my_email(), st)
      on conflict (event_id, email) do update set status = st, by_admin = false, marked_at = now();
  elsif coalesce(st, '') = '' then
    delete from event_attendance where event_id = eid and email = my_email();
  else
    raise exception 'acordia: invalid status';
  end if;
end $$;
grant execute on function public.set_my_attendance(uuid, text) to authenticated;
revoke execute on function public.set_my_attendance(uuid, text) from anon, public;
