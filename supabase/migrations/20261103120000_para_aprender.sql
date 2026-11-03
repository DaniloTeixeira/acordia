-- Lista "Para aprender" do grupo: músicas que a equipe quer ouvir e pegar no futuro (só título, artista, link e uma
-- nota). Qualquer membro sugere e apaga a própria sugestão; quem pode editar o grupo (líder, ou todos se o líder
-- liberou) edita e apaga qualquer uma, e transforma em música da Biblioteca quando a equipe pegar.
-- Pode rodar de novo sem problema (não apaga dados).

create table if not exists public.group_learn (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  artist text not null default '' check (char_length(artist) <= 80),
  url text not null default '' check (char_length(url) <= 600),
  note text not null default '' check (char_length(note) <= 300),
  suggested_by text not null default my_email(),
  created_at timestamptz not null default now()
);
create index if not exists group_learn_group on public.group_learn (group_id, created_at desc);

alter table public.group_learn enable row level security;

drop policy if exists "para aprender: membros veem" on public.group_learn;
create policy "para aprender: membros veem" on public.group_learn for select using (is_member(group_id));
-- Qualquer membro sugere, sempre em seu próprio nome.
drop policy if exists "para aprender: membros sugerem" on public.group_learn;
create policy "para aprender: membros sugerem" on public.group_learn for insert
  with check (is_member(group_id) and suggested_by = my_email());
-- Muda e apaga: quem sugeriu ou quem edita o grupo.
drop policy if exists "para aprender: autor ou quem edita muda" on public.group_learn;
create policy "para aprender: autor ou quem edita muda" on public.group_learn for update
  using (is_member(group_id) and (suggested_by = my_email() or is_group_admin(group_id)))
  with check (is_member(group_id) and (suggested_by = my_email() or is_group_admin(group_id)));
drop policy if exists "para aprender: autor ou quem edita apaga" on public.group_learn;
create policy "para aprender: autor ou quem edita apaga" on public.group_learn for delete
  using (is_member(group_id) and (suggested_by = my_email() or is_group_admin(group_id)));

-- Só os dados da música mudam; quem sugeriu e o grupo ficam como foram gravados.
grant select, insert, delete on public.group_learn to authenticated;
revoke update on public.group_learn from authenticated;
grant update (title, artist, url, note) on public.group_learn to authenticated;
revoke all on public.group_learn from anon;
