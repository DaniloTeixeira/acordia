-- Dono do app: um nível acima de admin. Só o Dono liga e desliga o admin dos outros; ninguém (fora o próprio
-- Dono) tira o admin dele, tira o acesso dele ou muda os dados dele. Quem é Dono não muda pelo app: na primeira
-- vez, vira Dono o admin mais antigo da lista; depois, só direto no banco (SQL do Supabase).
-- Pode rodar de novo sem problema (não apaga dados).

alter table public.allowed_emails add column if not exists is_owner boolean not null default false;

-- Ainda sem Dono: o admin mais antigo vira Dono (e continua admin).
update allowed_emails set is_owner = true, is_admin = true
where email = (select email from allowed_emails where is_admin order by created_at, email limit 1)
  and not exists (select 1 from allowed_emails where is_owner);

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from allowed_emails where email = my_email() and is_owner)
$$;

-- O app pergunta isto ao abrir: a pessoa ainda tem acesso? é admin? é o Dono?
create or replace function public.my_access() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('allowed', is_allowed(), 'admin', is_admin(), 'owner', is_owner())
$$;

-- As regras do Dono valem no banco (também dentro das funções do app). Sem login (SQL do Supabase), passa.
create or replace function public.guard_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.is_owner then raise exception 'acordia: owner is protected'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.is_owner then raise exception 'acordia: owner is set in the database'; end if;
    if new.is_admin and not is_owner() then raise exception 'acordia: only the owner makes admins'; end if;
    return new;
  end if;
  if new.is_owner is distinct from old.is_owner then raise exception 'acordia: owner is set in the database'; end if;
  if old.is_owner and new.is_admin is distinct from old.is_admin then raise exception 'acordia: owner is protected'; end if;
  if new.is_admin is distinct from old.is_admin and not is_owner() then raise exception 'acordia: only the owner makes admins'; end if;
  return new;
end $$;
drop trigger if exists acordia_guard_owner on public.allowed_emails;
create trigger acordia_guard_owner before insert or update or delete on public.allowed_emails
  for each row execute function public.guard_owner();

-- Admin muda os dados de qualquer pessoa, menos os do Dono (esses, só ele).
create or replace function public.admin_set_person(person_email text, person_name text, person_phone text, person_birthday date)
returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(person_email)); n text := left(trim(coalesce(person_name, '')), 80); ph text := left(trim(coalesce(person_phone, '')), 30);
begin
  if not (is_allowed() and is_admin()) then raise exception 'acordia: not app admin'; end if;
  if e <> my_email() and exists(select 1 from allowed_emails where email = e and is_owner) then raise exception 'acordia: owner is protected'; end if;
  update allowed_emails set name = n, phone = ph, birthday = person_birthday where email = e;
  update profiles set name = n, phone = ph, birthday = person_birthday where email = e;
end $$;

grant execute on function public.is_owner(), public.admin_set_person(text, text, text, date) to authenticated;
revoke execute on function public.is_owner(), public.admin_set_person(text, text, text, date) from anon, public;
revoke execute on function public.guard_owner() from anon, public, authenticated;
