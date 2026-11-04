-- Quem de fato confirmou o e-mail ou entrou (Google): a lista de acesso usava "tem perfil",
-- que nasce já no começo do cadastro, antes de confirmar. Só admin consulta.
-- Pode rodar de novo sem problema.
create or replace function public.confirmed_emails() returns setof text
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'acordia: only admin'; end if;
  return query select lower(u.email)::text from auth.users u where u.email_confirmed_at is not null;
end $$;
revoke execute on function public.confirmed_emails() from anon, public;
grant execute on function public.confirmed_emails() to authenticated;
