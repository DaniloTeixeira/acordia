-- Músicas e repertórios passam a ser do grupo, e não de cada pessoa: quem monta (líder do grupo ou admin do
-- app) escreve, e todos os membros leem e baixam para o aparelho. As tabelas songs e medleys (por dono)
-- ficam como estão por enquanto; o app novo deixa de usá-las. Pode rodar de novo sem problema.

-- Cada linha guarda o objeto inteiro como o app usa (data), igual às tabelas por dono. updated_at é a hora
-- da mudança no aparelho (vale a mais recente); deleted marca o que foi excluído; server_at é a hora em que
-- o banco recebeu, para cada aparelho baixar só o que mudou desde a última vez.
create table if not exists public.group_songs (
  group_id uuid not null references public.groups on delete cascade,
  id text not null check (char_length(id) <= 64),
  data jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_at timestamptz not null default clock_timestamp(),
  primary key (group_id, id)
);
create table if not exists public.group_medleys (
  group_id uuid not null references public.groups on delete cascade,
  id text not null check (char_length(id) <= 64),
  data jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_at timestamptz not null default clock_timestamp(),
  primary key (group_id, id)
);
create index if not exists group_songs_pull on public.group_songs (group_id, server_at);
create index if not exists group_medleys_pull on public.group_medleys (group_id, server_at);

drop trigger if exists group_songs_server_at on public.group_songs;
create trigger group_songs_server_at before insert or update on public.group_songs for each row execute function public.touch_server_at();
drop trigger if exists group_medleys_server_at on public.group_medleys;
create trigger group_medleys_server_at before insert or update on public.group_medleys for each row execute function public.touch_server_at();

-- Todo membro lê; só quem lidera o grupo (ou o admin do app) escreve.
alter table public.group_songs enable row level security;
alter table public.group_medleys enable row level security;
drop policy if exists "musicas do grupo: membros veem" on public.group_songs;
create policy "musicas do grupo: membros veem" on public.group_songs for select using (is_member(group_id));
drop policy if exists "musicas do grupo: admins mudam" on public.group_songs;
create policy "musicas do grupo: admins mudam" on public.group_songs for all
  using (is_group_admin(group_id)) with check (is_group_admin(group_id));
drop policy if exists "repertorios do grupo: membros veem" on public.group_medleys;
create policy "repertorios do grupo: membros veem" on public.group_medleys for select using (is_member(group_id));
drop policy if exists "repertorios do grupo: admins mudam" on public.group_medleys;
create policy "repertorios do grupo: admins mudam" on public.group_medleys for all
  using (is_group_admin(group_id)) with check (is_group_admin(group_id));

-- Envia um lote de mudanças para o grupo. Só grava por cima quando a mudança que chega é a mais recente.
-- rows: [{id, data, updated_at, deleted}]. Roda com as permissões de quem chama (as regras acima valem).
create or replace function public.group_sync_push(gid uuid, kind text, rows jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  if kind = 'songs' then
    insert into group_songs as t (group_id, id, data, updated_at, deleted)
      select gid, r.id, r.data, r.updated_at, coalesce(r.deleted, false)
      from jsonb_to_recordset(rows) as r(id text, data jsonb, updated_at bigint, deleted boolean)
    on conflict (group_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
      where t.updated_at <= excluded.updated_at;
  elsif kind = 'medleys' then
    insert into group_medleys as t (group_id, id, data, updated_at, deleted)
      select gid, r.id, r.data, r.updated_at, coalesce(r.deleted, false)
      from jsonb_to_recordset(rows) as r(id text, data jsonb, updated_at bigint, deleted boolean)
    on conflict (group_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
      where t.updated_at <= excluded.updated_at;
  else
    raise exception 'acordia: tipo desconhecido %', kind;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

grant select, insert, update, delete on public.group_songs, public.group_medleys to authenticated;
grant execute on function public.group_sync_push(uuid, text, jsonb) to authenticated;
revoke all on public.group_songs, public.group_medleys from anon;
revoke execute on function public.group_sync_push(uuid, text, jsonb) from anon, public;
