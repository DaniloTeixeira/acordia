-- Quem cobre: a pessoa que marcou "Não posso" num evento pode indicar quem vai cobrir a vaga dela.
-- É só um aviso para o grupo (não escala ninguém sozinho). Voltar para "Confirmar" ou "Sem resposta" limpa a indicação.
-- Pode rodar de novo sem problema (só acrescenta a coluna e troca funções).

alter table public.event_roster add column if not exists covered_by text not null default '' check (char_length(covered_by) <= 200);

-- Igual à anterior, e agora também limpa quem cobre quando a resposta deixa de ser "não posso".
create or replace function public.respond_event(eid uuid, answer text, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(event_group(eid)) then raise exception 'acordia: not member'; end if;
  if answer not in ('pending', 'yes', 'no') then raise exception 'acordia: bad answer'; end if;
  update event_roster set status = answer, reason = case when answer = 'no' then left(coalesce(why, ''), 200) else '' end,
    covered_by = case when answer = 'no' then covered_by else '' end
    where event_id = eid and email = my_email();
end $$;

-- A própria pessoa (que já disse "não posso") indica quem cobre; vazio tira a indicação.
-- Quem cobre precisa ser membro ativo do grupo e não pode ser ela mesma.
create or replace function public.set_event_cover(eid uuid, cover text) returns void
language plpgsql security definer set search_path = public as $$
declare who text := lower(trim(coalesce(cover, '')));
begin
  if not is_member(event_group(eid)) then raise exception 'acordia: not member'; end if;
  if not exists (select 1 from event_roster where event_id = eid and email = my_email() and status = 'no') then
    raise exception 'acordia: not declined';
  end if;
  if who <> '' then
    if who = my_email() then raise exception 'acordia: cannot cover yourself'; end if;
    if not exists (select 1 from group_members where group_id = event_group(eid) and email = who and active) then
      raise exception 'acordia: cover not an active member';
    end if;
  end if;
  update event_roster set covered_by = who where event_id = eid and email = my_email();
end $$;

grant execute on function public.respond_event(uuid, text, text) to authenticated;
grant execute on function public.set_event_cover(uuid, text) to authenticated;
revoke execute on function public.respond_event(uuid, text, text) from anon, public;
revoke execute on function public.set_event_cover(uuid, text) from anon, public;
