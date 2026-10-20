-- "Cheguei" passa a valer também depois do ensaio: o membro marca (ou desfaz) a própria presença em
-- qualquer ensaio já passado, por exemplo quando entrou no grupo depois. Continua começando 12 h antes
-- do início; o que o admin marcou na chamada segue valendo por cima. Pode rodar de novo sem problema.
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
      on conflict (event_id, email) do update set status = 'present', marked_at = now() where not event_attendance.by_admin;
  else
    delete from event_attendance where event_id = eid and email = my_email() and not by_admin;
  end if;
end $$;
