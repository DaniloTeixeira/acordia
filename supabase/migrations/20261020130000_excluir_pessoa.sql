-- Admin exclui uma pessoa do sistema por completo: sai da lista de acesso (e, pelo gatilho, de todos os grupos)
-- e a conta de login (auth.users) é apagada, junto com o perfil, as músicas e os repertórios dela (on delete cascade).
-- Antes, tirar o acesso deixava a conta de login para trás e o mesmo e-mail dava "já tem conta" ao cadastrar de novo.
-- Ninguém exclui o Dono nem a si mesmo. Pode rodar de novo sem problema.

create or replace function public.admin_delete_user(person_email text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(person_email));
begin
  if not (is_allowed() and is_admin()) then raise exception 'acordia: not app admin'; end if;
  if e = my_email() then raise exception 'acordia: cannot delete yourself'; end if;
  if exists(select 1 from allowed_emails where email = e and is_owner) then raise exception 'acordia: owner is protected'; end if;
  delete from allowed_emails where email = e;
  delete from auth.users where lower(email) = e;
end $$;

grant execute on function public.admin_delete_user(text) to authenticated;
revoke execute on function public.admin_delete_user(text) from anon, public;
