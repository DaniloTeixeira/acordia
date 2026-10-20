-- O membro passa a poder mudar a própria presença mesmo quando o líder marcou (por exemplo, falta marcada
-- por engano ou ensaio a que ele foi): "Eu estava presente" vira Presente e desfazer apaga a marcação.
-- A marcação deixa de ser "do líder" (by_admin = false) e o líder ainda pode refazer a chamada depois.
-- Pode rodar de novo sem problema.
create or replace function public.check_in(eid uuid, on_ boolean) returns void
language plpgsql security definer set search_path = public as $$
declare ev group_events;
begin
  select * into ev from group_events where id = eid;
  if ev.id is null or not is_member(ev.group_id) then raise exception 'acordia: not member'; end if;
  if ev.kind <> 'rehearsal' then raise exception 'acordia: not a rehearsal'; end if;
  if now() < ev.starts_at - interval '12 hours' then raise exception 'acordia: outside check-in window'; end if;
  if on_ then
    insert into event_attendance(event_id, email, status) values (eid, my_email(), 'present')
      on conflict (event_id, email) do update set status = 'present', by_admin = false, marked_at = now();
  else
    delete from event_attendance where event_id = eid and email = my_email();
  end if;
end $$;
grant execute on function public.check_in(uuid, boolean) to authenticated;
revoke execute on function public.check_in(uuid, boolean) from anon, public;
