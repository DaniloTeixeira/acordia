-- Link do repertório do evento (ex.: lista montada no Cifra Club), para o líder colar e a equipe abrir.
-- Só acrescenta uma coluna com padrão vazio; a permissão de editar o evento é a mesma de antes.
-- Pode rodar de novo sem problema.
alter table public.group_events add column if not exists setlist_url text not null default '' check (char_length(setlist_url) <= 600);
