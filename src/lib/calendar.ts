// Regras da agenda do grupo, sem rede nem tela (testadas em tests/calendar.test.ts): grade do mês,
// avisos ao escalar, frequência nos ensaios, repetição semanal, "Cheguei" e o arquivo .ics.

export type EventKind = "service" | "rehearsal";
export type Answer = "pending" | "yes" | "no";
export type Presence = "present" | "absent" | "excused";
export interface GEvent {
  id: string; group_id: string; kind: EventKind; title: string; starts_at: string; call_at: string | null;
  place: string; notes: string; setlist_id: string | null; updated_at?: string;
}
export interface RosterRow { event_id: string; email: string; role: string; status: Answer; reason: string }
export interface AttendanceRow { event_id: string; email: string; status: Presence; by_admin: boolean }
export interface Unavail { email: string; day: string; note: string }

// Dia local "AAAA-MM-DD" de uma data (a agenda pensa no dia de quem está olhando).
export function dayKey(d: Date){
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export const eventDay = (e: Pick<GEvent, "starts_at">) => dayKey(new Date(e.starts_at));

// Semanas do mês para a grade (começando no domingo), com os dias de fora do mês em null.
export function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1), days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({length: first.getDay()}, () => null);
  for(let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while(cells.length % 7) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for(let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Mesma hora em várias semanas seguidas (evento repetido). A hora local se mantém mesmo quando o
// horário de verão muda no meio.
export function weekly(start: Date, weeks: number): Date[] {
  return Array.from({length: Math.max(1, Math.min(52, weeks))}, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * i, start.getHours(), start.getMinutes()));
}

// Avisos ao escalar uma pessoa num evento: marcou que não pode nesse dia, já está em outro evento no
// mesmo dia, ou já recusou este.
export type Warning = {kind: "unavailable"; note: string} | {kind: "busy"; title: string} | {kind: "declined"};
export function warningsFor(email: string, ev: Pick<GEvent, "id" | "starts_at">, all: {events: GEvent[]; roster: RosterRow[]; unavail: Unavail[]}, titleOf: (e: GEvent) => string): Warning[] {
  const day = eventDay(ev), out: Warning[] = [];
  const u = all.unavail.find(x => x.email === email && x.day === day);
  if(u) out.push({kind: "unavailable", note: u.note});
  const mine = new Set(all.roster.filter(r => r.email === email && r.event_id !== ev.id).map(r => r.event_id));
  all.events.filter(e => e.id !== ev.id && mine.has(e.id) && eventDay(e) === day).forEach(e => out.push({kind: "busy", title: titleOf(e)}));
  if(all.roster.some(r => r.email === email && r.event_id === ev.id && r.status === "no")) out.push({kind: "declined"});
  return out;
}

// Quantas vezes cada pessoa foi escalada no mês do evento (para dividir a escala entre todos).
export function monthLoad(day: string, events: GEvent[], roster: RosterRow[]): Map<string, number> {
  const ym = day.slice(0, 7), ids = new Set(events.filter(e => eventDay(e).slice(0, 7) === ym).map(e => e.id));
  const load = new Map<string, number>(), seen = new Set<string>();
  roster.forEach(r => {
    const k = r.event_id + "|" + r.email;
    if(!ids.has(r.event_id) || seen.has(k)) return;
    seen.add(k); load.set(r.email, (load.get(r.email) || 0) + 1);
  });
  return load;
}

// Frequência nos ensaios que já aconteceram: presente conta, falta não, justificada fica fora da conta.
// Sem marcação nenhuma num ensaio que teve chamada, conta como falta; ensaio sem chamada nenhuma não conta.
export function attendanceRate(email: string, events: GEvent[], att: AttendanceRow[], now = Date.now()): {present: number; total: number} {
  const past = events.filter(e => e.kind === "rehearsal" && new Date(e.starts_at).getTime() < now);
  let present = 0, total = 0;
  past.forEach(e => {
    const rows = att.filter(a => a.event_id === e.id); if(!rows.length) return;
    const mine = rows.find(a => a.email === email);
    if(mine?.status === "excused") return;
    total++; if(mine?.status === "present") present++;
  });
  return {present, total};
}

// "Cheguei" vale de 12 h antes a 12 h depois do início (a mesma regra do banco, em check_in).
export const CHECKIN_MS = 12 * 3600 * 1000;
export function canCheckIn(e: Pick<GEvent, "kind" | "starts_at">, now = Date.now()){
  const at = new Date(e.starts_at).getTime();
  return e.kind === "rehearsal" && now >= at - CHECKIN_MS && now <= at + CHECKIN_MS;
}

// Evento no formato do calendário do celular (.ics), com lembrete um dia antes e duas horas antes.
// end: sem hora de fim, vale 2 h depois do início.
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
// Linhas com mais de 75 bytes continuam na seguinte começando com espaço (regra do formato).
function fold(line: string){
  const bytes = new TextEncoder().encode(line); if(bytes.length <= 75) return line;
  const out: string[] = []; let cur = "", n = 0;
  for(const ch of line){
    const b = new TextEncoder().encode(ch).length;
    if(n + b > (out.length ? 74 : 75)){ out.push(cur); cur = ""; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
export function toICS(events: {id: string; title: string; start: Date; end?: Date; place: string; description: string}[], stamp = new Date()){
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Acordia//Agenda//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  events.forEach(e => {
    lines.push("BEGIN:VEVENT", "UID:" + e.id + "@acordia", "DTSTAMP:" + icsDate(stamp), "DTSTART:" + icsDate(e.start),
      "DTEND:" + icsDate(e.end || new Date(e.start.getTime() + 2 * 3600 * 1000)), "SUMMARY:" + icsText(e.title));
    if(e.place) lines.push("LOCATION:" + icsText(e.place));
    if(e.description) lines.push("DESCRIPTION:" + icsText(e.description));
    ["-P1D", "-PT2H"].forEach(tr => lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsText(e.title), "TRIGGER:" + tr, "END:VALARM"));
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// Ordem da lista: próximos primeiro (do mais perto ao mais longe); passados depois, do mais recente.
export function splitEvents(events: GEvent[], now = Date.now()){
  // Um evento continua em "próximos" até 6 h depois do início (está acontecendo).
  const upcoming = events.filter(e => new Date(e.starts_at).getTime() >= now - 6 * 3600 * 1000).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = events.filter(e => !upcoming.includes(e)).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return {upcoming, past};
}

// ---------- aniversários ----------
// Quem faz aniversário de hoje até daqui a `days` dias, do mais próximo ao mais distante. `in` é quantos
// dias faltam (0 = hoje). Quem nasceu em 29/02 comemora em 28/02 nos anos que não são bissextos.
export function upcomingBirthdays<T extends {birthday?: string | null}>(people: T[], today: string, days = 30){
  const [ty, tm, td] = today.split("-").map(Number), t0 = Date.UTC(ty, tm - 1, td);
  const on = (y: number, m: number, d: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return Date.UTC(y, m - 1, m === 2 && d === 29 && !leap ? 28 : d);
  };
  return people.flatMap(p => {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(p.birthday || ""); if(!m) return [];
    let at = on(ty, +m[1], +m[2]); if(at < t0) at = on(ty + 1, +m[1], +m[2]);
    const n = Math.round((at - t0) / 864e5);
    return n <= days ? [{...p, in: n, day: +m[2], month: +m[1]}] : [];
  }).sort((a, b) => a.in - b.in);
}

// ---------- escala por pessoa ----------
// A escala guarda uma linha por função (a mesma pessoa pode tocar e cantar). Para mostrar, junta as
// linhas de cada pessoa, na ordem em que aparecem. A resposta é a mesma em todas as linhas da pessoa.
export interface PersonOnRoster { email: string; roles: string[]; status: Answer; reason: string }
export function rosterByPerson(rows: Pick<RosterRow, "email" | "role" | "status" | "reason">[]): PersonOnRoster[] {
  const out = new Map<string, PersonOnRoster>();
  rows.forEach(r => {
    const p = out.get(r.email) || {email: r.email, roles: [], status: r.status, reason: r.reason};
    if(r.role && !p.roles.includes(r.role)) p.roles.push(r.role);
    out.set(r.email, p);
  });
  return [...out.values()];
}
