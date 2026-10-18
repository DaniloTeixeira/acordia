-- Formato da marca do grupo: quadrado de cantos arredondados (padrão) ou redondo. Vale para a foto e para as
-- iniciais. Como a foto, só os admins do app mudam. Precisa de 20261019010000_foto_grupo.sql.
-- Pode rodar de novo sem problema (não apaga dados).

alter table public.groups add column if not exists photo_round boolean not null default false;

create or replace function public.on_group_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.photo is distinct from old.photo or new.photo_round is distinct from old.photo_round)
     and not (is_allowed() and is_admin()) then
    raise exception 'acordia: only app admins change the group photo';
  end if;
  return new;
end $$;
drop trigger if exists acordia_group_photo on public.groups;
create trigger acordia_group_photo before update of photo, photo_round on public.groups
  for each row execute function public.on_group_photo();
revoke execute on function public.on_group_photo() from anon, public, authenticated;
