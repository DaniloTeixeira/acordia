-- Membro ativo ou inativo em cada grupo: quem está afastado continua no grupo (com histórico de escalas e
-- presença), mas deixa de aparecer para escalar e na chamada dos ensaios. O líder não pode ficar inativo.
-- Pode rodar de novo sem problema (não apaga dados).

alter table public.group_members add column if not exists active boolean not null default true;

create or replace function public.acordia_leader_stays_active() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.is_admin and not new.active then raise exception 'acordia: leader must stay active'; end if;
  return new;
end $$;

drop trigger if exists acordia_leader_active on public.group_members;
create trigger acordia_leader_active before insert or update of active, is_admin on public.group_members
  for each row execute function public.acordia_leader_stays_active();
