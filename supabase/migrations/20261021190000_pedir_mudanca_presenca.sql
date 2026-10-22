-- Presença marcada pelo líder passa a ser dele: o membro não troca direto (presente <-> falta), mas pode
-- pedir a mudança; o líder aceita ou recusa. O pedido fica na própria linha da presença (req_status).
-- Marcação do próprio membro, ou "justificada", continua livre. Pode rodar de novo sem problema.
alter table public.event_attendance add column if not exists req_status text check (req_status in ('present', 'absent'));
alter table public.event_attendance add column if not exists req_at timestamptz;

create or replace function public.set_my_attendance(eid uuid, st text) returns void
language plpgsql security definer set search_path = public as $$
declare ev group_events; cur event_attendance;
begin
  select * into ev from group_events where id = eid;
  if ev.id is null or not is_member(ev.group_id) then raise exception 'acordia: not member'; end if;
  if ev.kind <> 'rehearsal' then raise exception 'acordia: not a rehearsal'; end if;
  if now() < ev.starts_at - interval '12 hours' then raise exception 'acordia: outside check-in window'; end if;
  if st = 'absent' and not exists (select 1 from event_roster where event_id = eid and email = my_email()) then
    raise exception 'acordia: not on roster';
  end if;
  select * into cur from event_attendance where event_id = eid and email = my_email();
  if cur.by_admin and cur.status in ('present', 'absent') and coalesce(st, '') <> cur.status then
    raise exception 'acordia: marked by leader';
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

create or replace function public.check_in(eid uuid, on_ boolean) returns void
language plpgsql security definer set search_path = public as $$
declare ev group_events; cur event_attendance;
begin
  select * into ev from group_events where id = eid;
  if ev.id is null or not is_member(ev.group_id) then raise exception 'acordia: not member'; end if;
  if ev.kind <> 'rehearsal' then raise exception 'acordia: not a rehearsal'; end if;
  if now() < ev.starts_at - interval '12 hours' then raise exception 'acordia: outside check-in window'; end if;
  select * into cur from event_attendance where event_id = eid and email = my_email();
  if cur.by_admin and cur.status in ('present', 'absent') and (case when on_ then 'present' else '' end) <> cur.status then
    raise exception 'acordia: marked by leader';
  end if;
  if on_ then
    insert into event_attendance(event_id, email, status) values (eid, my_email(), 'present')
      on conflict (event_id, email) do update set status = 'present', by_admin = false, marked_at = now();
  else
    delete from event_attendance where event_id = eid and email = my_email();
  end if;
end $$;
grant execute on function public.check_in(uuid, boolean) to authenticated;
revoke execute on function public.check_in(uuid, boolean) from anon, public;

-- Pedido de mudança da própria presença que o líder marcou; st vazio cancela o pedido.
create or replace function public.request_attendance_change(eid uuid, st text) returns void
language plpgsql security definer set search_path = public as $$
declare ev group_events; cur event_attendance;
begin
  select * into ev from group_events where id = eid;
  if ev.id is null or not is_member(ev.group_id) then raise exception 'acordia: not member'; end if;
  select * into cur from event_attendance where event_id = eid and email = my_email();
  if cur.event_id is null or not cur.by_admin then raise exception 'acordia: nothing to change'; end if;
  if coalesce(st, '') = '' then
    update event_attendance set req_status = null, req_at = null where event_id = eid and email = my_email();
  elsif st in ('present', 'absent') and st <> cur.status then
    update event_attendance set req_status = st, req_at = now() where event_id = eid and email = my_email();
  else
    raise exception 'acordia: invalid status';
  end if;
end $$;
grant execute on function public.request_attendance_change(uuid, text) to authenticated;
revoke execute on function public.request_attendance_change(uuid, text) from anon, public;
