-- Editar nome, celular e data de uma pessoa do grupo que ainda não está na lista de acesso (allowed_emails):
-- antes o update não achava a linha, não gravava nada e a função dizia que deu certo (o nome sumia ao recarregar).
-- Agora a pessoa entra na lista com os dados, como já acontece em add_group_member. Pode rodar de novo sem problema.
create or replace function public.admin_set_person(person_email text, person_name text, person_phone text, person_birthday date)
returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(person_email)); n text := left(trim(coalesce(person_name, '')), 80); ph text := left(trim(coalesce(person_phone, '')), 30);
begin
  if not (is_allowed() and is_admin()) then raise exception 'acordia: not app admin'; end if;
  if e <> my_email() and exists(select 1 from allowed_emails where email = e and is_owner) then raise exception 'acordia: owner is protected'; end if;
  insert into allowed_emails(email, name, phone, birthday) values (e, n, ph, person_birthday)
    on conflict (email) do update set name = excluded.name, phone = excluded.phone, birthday = excluded.birthday;
  update profiles set name = n, phone = ph, birthday = person_birthday where email = e;
end $$;
grant execute on function public.admin_set_person(text, text, text, date) to authenticated;
revoke execute on function public.admin_set_person(text, text, text, date) from anon, public;
