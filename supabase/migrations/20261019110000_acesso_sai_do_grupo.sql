-- Tirou da lista de acesso: sai também de todos os grupos (sem acesso, a pessoa nem entra no app).
-- É o espelho de on_allowed_join (20261018200000_equipe.sql). Tirar só do grupo continua não tirando o acesso.
-- Pode rodar de novo sem problema.

create or replace function public.on_allowed_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from group_members where email = old.email;
  return old;
end $$;
drop trigger if exists acordia_allowed_leave on public.allowed_emails;
create trigger acordia_allowed_leave after delete on public.allowed_emails
  for each row execute function public.on_allowed_leave();
revoke execute on function public.on_allowed_leave() from anon, public, authenticated;

-- Quem já foi tirado da lista antes desta regra e ficou no grupo sai agora.
delete from public.group_members m where not exists (select 1 from public.allowed_emails a where a.email = m.email);
