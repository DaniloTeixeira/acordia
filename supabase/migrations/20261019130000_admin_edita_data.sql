-- Admin do app muda também a data de nascimento de qualquer pessoa, mesmo a que ela já preencheu no próprio
-- perfil (antes só ela mudava). E-mail e foto continuam só da pessoa. Grava na lista de acesso e no perfil, se a
-- pessoa já tiver conta. Pode rodar de novo sem problema (não apaga dados).

create or replace function public.admin_set_person(person_email text, person_name text, person_phone text, person_birthday date)
returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(person_email)); n text := left(trim(coalesce(person_name, '')), 80); ph text := left(trim(coalesce(person_phone, '')), 30);
begin
  if not (is_allowed() and is_admin()) then raise exception 'acordia: not app admin'; end if;
  update allowed_emails set name = n, phone = ph, birthday = person_birthday where email = e;
  update profiles set name = n, phone = ph, birthday = person_birthday where email = e;
end $$;
grant execute on function public.admin_set_person(text, text, text, date) to authenticated;
revoke execute on function public.admin_set_person(text, text, text, date) from anon, public;
