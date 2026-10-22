-- A chamada do ensaio ganha a opção "Pausa" (status 'paused'): a pessoa em pausa fica fora da conta de faltas
-- e de presenças, como a falta justificada. Pode rodar de novo sem problema.
alter table public.event_attendance drop constraint if exists event_attendance_status_check;
alter table public.event_attendance add constraint event_attendance_status_check
  check (status in ('present', 'absent', 'excused', 'paused'));
