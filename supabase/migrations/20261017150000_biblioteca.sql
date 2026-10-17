-- Acordia, etapa 2: músicas e repertórios na nuvem, sincronizados entre os aparelhos de cada pessoa.
-- Aplicado sozinho pela integração do Supabase com o GitHub a cada push no main (pasta migrations).
-- Pode rodar de novo sem problema (não apaga dados).

-- Cada linha guarda o objeto inteiro como o app usa (data). updated_at é a hora da mudança no aparelho
-- (vale a mais recente); deleted marca o que foi excluído, para os outros aparelhos também apagarem;
-- server_at é a hora em que o banco recebeu, para cada aparelho baixar só o que mudou desde a última vez.
create table if not exists public.songs (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null check (char_length(id) <= 64),
  data jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_at timestamptz not null default clock_timestamp(),
  primary key (owner, id)
);
create table if not exists public.medleys (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null check (char_length(id) <= 64),
  data jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_at timestamptz not null default clock_timestamp(),
  primary key (owner, id)
);
create index if not exists songs_pull on public.songs (owner, server_at);
create index if not exists medleys_pull on public.medleys (owner, server_at);

create or replace function public.touch_server_at() returns trigger
language plpgsql as $$ begin new.server_at := clock_timestamp(); return new; end $$;
drop trigger if exists songs_server_at on public.songs;
create trigger songs_server_at before insert or update on public.songs for each row execute function public.touch_server_at();
drop trigger if exists medleys_server_at on public.medleys;
create trigger medleys_server_at before insert or update on public.medleys for each row execute function public.touch_server_at();

-- Cada pessoa só vê e muda o que é dela, e só enquanto estiver na lista de quem pode entrar.
alter table public.songs enable row level security;
alter table public.medleys enable row level security;
drop policy if exists "musicas: so o dono" on public.songs;
create policy "musicas: so o dono" on public.songs for all
  using (owner = auth.uid() and is_allowed()) with check (owner = auth.uid() and is_allowed());
drop policy if exists "repertorios: so o dono" on public.medleys;
create policy "repertorios: so o dono" on public.medleys for all
  using (owner = auth.uid() and is_allowed()) with check (owner = auth.uid() and is_allowed());

-- Envia um lote de mudanças. Só grava por cima quando a mudança que chega é a mais recente:
-- assim um aparelho que ficou sem internet não desfaz o que outro já mudou depois.
-- rows: [{id, data, updated_at, deleted}]. Roda com as permissões de quem chama (as regras acima valem).
create or replace function public.sync_push(kind text, rows jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  if kind = 'songs' then
    insert into songs as t (owner, id, data, updated_at, deleted)
      select auth.uid(), r.id, r.data, r.updated_at, coalesce(r.deleted, false)
      from jsonb_to_recordset(rows) as r(id text, data jsonb, updated_at bigint, deleted boolean)
    on conflict (owner, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
      where t.updated_at <= excluded.updated_at;
  elsif kind = 'medleys' then
    insert into medleys as t (owner, id, data, updated_at, deleted)
      select auth.uid(), r.id, r.data, r.updated_at, coalesce(r.deleted, false)
      from jsonb_to_recordset(rows) as r(id text, data jsonb, updated_at bigint, deleted boolean)
    on conflict (owner, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
      where t.updated_at <= excluded.updated_at;
  else
    raise exception 'acordia: tipo desconhecido %', kind;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

grant select, insert, update, delete on public.songs, public.medleys to authenticated;
grant execute on function public.sync_push(text, jsonb) to authenticated;
revoke all on public.songs, public.medleys from anon;
revoke execute on function public.sync_push(text, jsonb) from anon, public;
