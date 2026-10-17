-- Acordia, etapa 1: login, perfil e a lista de quem pode entrar.
-- Aplicado sozinho pela integração do Supabase com o GitHub a cada push no main (pasta migrations).
-- Pode rodar de novo sem problema (não apaga dados).

-- Quem pode entrar. O e-mail fica sempre em minúsculas.
create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email)),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Perfil de cada pessoa que já entrou.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  name text not null default '' check (char_length(name) <= 80),
  created_at timestamptz not null default now()
);

create or replace function public.my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from allowed_emails where email = my_email())
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from allowed_emails where email = my_email() and is_admin)
$$;

-- O app pergunta isto ao abrir: a pessoa ainda tem acesso? é admin?
create or replace function public.my_access() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('allowed', is_allowed(), 'admin', is_admin())
$$;

-- Quem não está na lista não consegue nem criar a conta; quem está ganha um perfil.
create or replace function public.on_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from allowed_emails where email = lower(new.email)) then
    raise exception 'acordia: email not allowed';
  end if;
  insert into profiles(id, email) values (new.id, lower(new.email)) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists acordia_new_user on auth.users;
create trigger acordia_new_user after insert on auth.users for each row execute function public.on_new_user();

-- Regras de acesso: valem no banco, então não dá para passar por cima pelo navegador.
alter table public.allowed_emails enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "lista: admins e o proprio e-mail veem" on public.allowed_emails;
create policy "lista: admins e o proprio e-mail veem" on public.allowed_emails
  for select using (is_admin() or email = my_email());
drop policy if exists "lista: admins incluem" on public.allowed_emails;
create policy "lista: admins incluem" on public.allowed_emails for insert with check (is_admin());
drop policy if exists "lista: admins mudam" on public.allowed_emails;
-- Ninguém tira o próprio e-mail nem o próprio admin (assim sempre sobra pelo menos um admin).
create policy "lista: admins mudam" on public.allowed_emails for update using (is_admin() and email <> my_email()) with check (is_admin());
drop policy if exists "lista: admins tiram outros" on public.allowed_emails;
create policy "lista: admins tiram outros" on public.allowed_emails for delete using (is_admin() and email <> my_email());

drop policy if exists "perfil: quem tem acesso ve" on public.profiles;
create policy "perfil: quem tem acesso ve" on public.profiles for select using (is_allowed());
drop policy if exists "perfil: cada um edita o seu" on public.profiles;
create policy "perfil: cada um edita o seu" on public.profiles
  for update using (id = auth.uid() and is_allowed()) with check (id = auth.uid());

-- Permissões explícitas (o projeto não expõe tabelas novas sozinho). Só quem entrou (authenticated)
-- chega nas tabelas, e as regras acima decidem o que cada um vê; sem login (anon) não há acesso.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.allowed_emails to authenticated;
grant select, update on public.profiles to authenticated;
grant execute on function public.my_email(), public.is_allowed(), public.is_admin(), public.my_access() to authenticated;
revoke all on public.allowed_emails, public.profiles from anon;
revoke execute on function public.my_access(), public.is_allowed(), public.is_admin() from anon, public;

-- O primeiro admin entra à mão, uma vez só: veja supabase/primeiro-admin.sql.
