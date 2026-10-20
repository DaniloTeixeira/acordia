-- O membro passa a poder marcar a própria presença ou falta num ensaio ("Eu estava presente" / "Não estive"),
-- ou voltar a "sem marcação". Vale na mesma janela do check_in (a partir de 12h antes do ensaio) e a marcação
-- deixa de ser "do líder" (by_admin = false); o líder ainda pode refazer a chamada depois.
-- Pode rodar de novo sem problema.
create or replace function public.set_my_attendance(eid uuid, st text) returns void
language plpgsql security definer set search_path = public as $$
declare ev group_events;
begin
  select * into ev from group_events where id = eid;
  if ev.id is null or not is_member(ev.group_id) then raise exception 'acordia: not member'; end if;
  if ev.kind <> 'rehearsal' then raise exception 'acordia: not a rehearsal'; end if;
  if now() < ev.starts_at - interval '12 hours' then raise exception 'acordia: outside check-in window'; end if;
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
