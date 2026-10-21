-- Extensão vocal no perfil: a nota mais grave e a mais aguda (número MIDI) que a pessoa mede na aba Voz do
-- Estudo. Quem tem acesso já lê todos os perfis (política "perfil: quem tem acesso ve") e cada um já edita só
-- o seu ("perfil: cada um edita o seu"), então o grupo vê a extensão de cada cantor sem função nova.
-- Pode rodar de novo sem problema (só acrescenta colunas).

alter table public.profiles add column if not exists voice_low smallint;
alter table public.profiles add column if not exists voice_high smallint;
do $$ begin
  alter table public.profiles add constraint profiles_voice_range check (
    (voice_low is null or voice_low between 24 and 108)
    and (voice_high is null or voice_high between 24 and 108)
    and (voice_low is null or voice_high is null or voice_low <= voice_high));
exception when duplicate_object then null; end $$;
