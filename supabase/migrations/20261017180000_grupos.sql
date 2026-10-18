-- Acordia, etapa 3: grupos (equipes de louvor), repertórios compartilhados com o grupo, agenda com
-- escalas, confirmação, presença nos ensaios e datas em que cada pessoa não pode.
-- Aplicado sozinho pela integração do Supabase com o GitHub a cada push no main (pasta migrations).
-- Pode rodar de novo sem problema (não apaga dados).

-- Grupo. Só os admins do app criam grupos (quem administra um grupo pode dar acesso ao app a novas
-- pessoas, então não dá para qualquer um criar o seu).
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

-- Membros, pelo e-mail (assim dá para incluir quem ainda nem entrou no app).
-- role: o que a pessoa costuma fazer (Voz, Violão, Teclado...), sugerido ao escalar.
create table if not exists public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  email text not null check (email = lower(email)),
  is_admin boolean not null default false,
  role text not null default '' check (char_length(role) <= 40),
  created_at timestamptz not null default now(),
  primary key (group_id, email)
);
create index if not exists group_members_email on public.group_members (email);

create or replace function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_allowed() and (is_admin() or exists(select 1 from group_members where group_id = gid and email = my_email()))
$$;
-- Admin do grupo (os admins do app também administram todos os grupos).
create or replace function public.is_group_admin(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_allowed() and (is_admin() or exists(select 1 from group_members where group_id = gid and email = my_email() and is_admin))
$$;

-- Repertório compartilhado: o mesmo código do link de compartilhar (#m=...), já validado pelo app ao
-- abrir. source_id é o repertório de origem: compartilhar de novo atualiza em vez de duplicar.
create table if not exists public.group_setlists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  source_id text not null check (char_length(source_id) <= 64),
  name text not null check (char_length(name) between 1 and 80),
  songs integer not null default 0,
  code text not null check (char_length(code) <= 200000),
  shared_by text not null default my_email(),
  updated_at timestamptz not null default now(),
  unique (group_id, source_id)
);

-- Evento da agenda: culto/apresentação ("service") ou ensaio ("rehearsal").
-- call_at: hora de chegada da equipe; setlist_id: repertório do grupo para tocar.
create table if not exists public.group_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  kind text not null check (kind in ('service', 'rehearsal')),
  title text not null default '' check (char_length(title) <= 80),
  starts_at timestamptz not null,
  call_at timestamptz,
  place text not null default '' check (char_length(place) <= 120),
  notes text not null default '' check (char_length(notes) <= 1000),
  setlist_id uuid references public.group_setlists on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists group_events_when on public.group_events (group_id, starts_at);

-- Escala: quem toca o quê em cada evento, e a resposta da pessoa.
create table if not exists public.event_roster (
  event_id uuid not null references public.group_events on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default '' check (char_length(role) <= 40),
  status text not null default 'pending' check (status in ('pending', 'yes', 'no')),
  reason text not null default '' check (char_length(reason) <= 200),
  primary key (event_id, email, role)
);

-- Presença nos ensaios. by_admin: marcado pelo admin (a pessoa não desfaz).
create table if not exists public.event_attendance (
  event_id uuid not null references public.group_events on delete cascade,
  email text not null check (email = lower(email)),
  status text not null check (status in ('present', 'absent', 'excused')),
  by_admin boolean not null default false,
  marked_at timestamptz not null default now(),
  primary key (event_id, email)
);

-- Datas em que a pessoa não pode tocar (vale para todos os grupos dela).
create table if not exists public.unavailable (
  email text not null check (email = lower(email)),
  day date not null,
  note text not null default '' check (char_length(note) <= 120),
  primary key (email, day)
);

create or replace function public.event_group(eid uuid) returns uuid
language sql stable security definer set search_path = public as $$ select group_id from group_events where id = eid $$;

-- ---------- regras de acesso ----------
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_setlists enable row level security;
alter table public.group_events enable row level security;
alter table public.event_roster enable row level security;
alter table public.event_attendance enable row level security;
alter table public.unavailable enable row level security;

drop policy if exists "grupos: membros veem" on public.groups;
create policy "grupos: membros veem" on public.groups for select using (is_member(id));
drop policy if exists "grupos: admins do app criam" on public.groups;
create policy "grupos: admins do app criam" on public.groups for insert with check (is_allowed() and is_admin());
drop policy if exists "grupos: admins do grupo renomeiam" on public.groups;
create policy "grupos: admins do grupo renomeiam" on public.groups for update using (is_group_admin(id)) with check (is_group_admin(id));
drop policy if exists "grupos: admins do app excluem" on public.groups;
create policy "grupos: admins do app excluem" on public.groups for delete using (is_allowed() and is_admin());

-- Membros entram pela função add_group_member (que também libera o acesso ao app).
drop policy if exists "membros: o grupo ve" on public.group_members;
create policy "membros: o grupo ve" on public.group_members for select using (is_member(group_id));
drop policy if exists "membros: admins do grupo mudam" on public.group_members;
create policy "membros: admins do grupo mudam" on public.group_members for update using (is_group_admin(group_id)) with check (is_group_admin(group_id));
drop policy if exists "membros: admins do grupo tiram" on public.group_members;
create policy "membros: admins do grupo tiram" on public.group_members for delete using (is_group_admin(group_id));

drop policy if exists "repertorios do grupo: membros veem" on public.group_setlists;
create policy "repertorios do grupo: membros veem" on public.group_setlists for select using (is_member(group_id));
drop policy if exists "repertorios do grupo: admins mudam" on public.group_setlists;
create policy "repertorios do grupo: admins mudam" on public.group_setlists for all using (is_group_admin(group_id)) with check (is_group_admin(group_id));

drop policy if exists "eventos: membros veem" on public.group_events;
create policy "eventos: membros veem" on public.group_events for select using (is_member(group_id));
drop policy if exists "eventos: admins mudam" on public.group_events;
create policy "eventos: admins mudam" on public.group_events for all using (is_group_admin(group_id)) with check (is_group_admin(group_id));

-- A resposta da própria pessoa passa pela função respond_event; aqui só os admins mexem.
drop policy if exists "escala: membros veem" on public.event_roster;
create policy "escala: membros veem" on public.event_roster for select using (is_member(event_group(event_id)));
drop policy if exists "escala: admins mudam" on public.event_roster;
create policy "escala: admins mudam" on public.event_roster for all using (is_group_admin(event_group(event_id))) with check (is_group_admin(event_group(event_id)));

drop policy if exists "presenca: membros veem" on public.event_attendance;
create policy "presenca: membros veem" on public.event_attendance for select using (is_member(event_group(event_id)));
drop policy if exists "presenca: admins mudam" on public.event_attendance;
create policy "presenca: admins mudam" on public.event_attendance for all using (is_group_admin(event_group(event_id))) with check (is_group_admin(event_group(event_id)));

-- Indisponibilidade: cada um marca a sua; quem divide um grupo com a pessoa vê (para escalar).
drop policy if exists "indisponivel: o grupo ve" on public.unavailable;
create policy "indisponivel: o grupo ve" on public.unavailable for select using (
  is_allowed() and (email = my_email() or is_admin() or exists(
    select 1 from group_members a join group_members b on a.group_id = b.group_id where a.email = my_email() and b.email = unavailable.email)));
drop policy if exists "indisponivel: cada um marca a sua" on public.unavailable;
create policy "indisponivel: cada um marca a sua" on public.unavailable for all using (email = my_email() and is_allowed()) with check (email = my_email() and is_allowed());

-- ---------- funções ----------
-- Inclui (ou atualiza) um membro. Quem administra o grupo libera o acesso ao app para o e-mail
-- novo, como diz a tela de entrar ("use o e-mail que o responsável pelo seu grupo cadastrou").
create or replace function public.add_group_member(gid uuid, member_email text, admin boolean, member_role text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(member_email));
begin
  if not is_group_admin(gid) then raise exception 'acordia: not group admin'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'acordia: bad email'; end if;
  insert into allowed_emails(email) values (e) on conflict (email) do nothing;
  insert into group_members(group_id, email, is_admin, role) values (gid, e, coalesce(admin, false), left(coalesce(member_role, ''), 40))
    on conflict (group_id, email) do update set is_admin = excluded.is_admin, role = excluded.role;
end $$;

-- Cria o grupo e põe quem criou como admin dele.
create or replace function public.create_group(group_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if not (is_allowed() and is_admin()) then raise exception 'acordia: not admin'; end if;
  insert into groups(name) values (left(trim(group_name), 80)) returning id into gid;
  insert into group_members(group_id, email, is_admin) values (gid, my_email(), true);
  return gid;
end $$;

-- A pessoa escalada confirma ("yes") ou avisa que não pode ("no", com o motivo).
create or replace function public.respond_event(eid uuid, answer text, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(event_group(eid)) then raise exception 'acordia: not member'; end if;
  if answer not in ('pending', 'yes', 'no') then raise exception 'acordia: bad answer'; end if;
  update event_roster set status = answer, reason = case when answer = 'no' then left(coalesce(why, ''), 200) else '' end
    where event_id = eid and email = my_email();
end $$;

-- "Cheguei": a própria pessoa marca presença no ensaio, do começo do dia até 12 h depois do início.
-- on = false desfaz, a não ser que o admin já tenha marcado.
create or replace function public.check_in(eid uuid, on_ boolean) returns void
language plpgsql security definer set search_path = public as $$
declare ev group_events;
begin
  select * into ev from group_events where id = eid;
  if ev.id is null or not is_member(ev.group_id) then raise exception 'acordia: not member'; end if;
  if ev.kind <> 'rehearsal' then raise exception 'acordia: not a rehearsal'; end if;
  if now() < ev.starts_at - interval '12 hours' or now() > ev.starts_at + interval '12 hours' then raise exception 'acordia: outside check-in window'; end if;
  if on_ then
    insert into event_attendance(event_id, email, status) values (eid, my_email(), 'present')
      on conflict (event_id, email) do update set status = 'present', marked_at = now() where not event_attendance.by_admin;
  else
    delete from event_attendance where event_id = eid and email = my_email() and not by_admin;
  end if;
end $$;

-- Cada um ajusta a própria função (Voz, Violão...), sem poder mexer no resto (como virar admin).
create or replace function public.set_my_role(gid uuid, member_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(gid) then raise exception 'acordia: not member'; end if;
  update group_members set role = left(coalesce(member_role, ''), 40) where group_id = gid and email = my_email();
end $$;

-- Nomes dos membros do grupo (o perfil de cada um), para mostrar no lugar do e-mail.
create or replace function public.group_people(gid uuid) returns table(email text, name text)
language sql stable security definer set search_path = public as $$
  select m.email, coalesce(p.name, '') from group_members m left join profiles p on p.email = m.email
  where m.group_id = gid and is_member(gid)
$$;

grant select, insert, update, delete on public.groups, public.group_members, public.group_setlists, public.group_events,
  public.event_roster, public.event_attendance, public.unavailable to authenticated;
grant execute on function public.is_member(uuid), public.is_group_admin(uuid), public.event_group(uuid),
  public.add_group_member(uuid, text, boolean, text), public.create_group(text), public.respond_event(uuid, text, text),
  public.check_in(uuid, boolean), public.set_my_role(uuid, text), public.group_people(uuid) to authenticated;
revoke all on public.groups, public.group_members, public.group_setlists, public.group_events,
  public.event_roster, public.event_attendance, public.unavailable from anon;
revoke execute on function public.is_member(uuid), public.is_group_admin(uuid), public.event_group(uuid),
  public.add_group_member(uuid, text, boolean, text), public.create_group(text), public.respond_event(uuid, text, text),
  public.check_in(uuid, boolean), public.set_my_role(uuid, text), public.group_people(uuid) from anon, public;
