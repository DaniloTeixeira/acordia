// Regras da agenda do grupo, sem rede nem tela (testadas em tests/calendar.test.ts): grade do mês,
// avisos ao escalar, frequência nos ensaios, repetição semanal, "Cheguei" e o arquivo .ics.

export type EventKind = "service" | "rehearsal";
export type Answer = "pending" | "yes" | "no";
export type Presence = "present" | "absent" | "excused" | "paused";
export interface GEvent {
  id: string; group_id: string; kind: EventKind; title: string; starts_at: string; call_at: string | null;
  place: string; notes: string; setlist_id: string | null; updated_at?: string;
}
// cover: e-mail de quem cobre a vaga de quem disse "não posso" (vazio ou ausente = ninguém indicado).
export interface RosterRow { event_id: string; email: string; role: string; status: Answer; reason: string; cover?: string }
export interface AttendanceRow { event_id: string; email: string; status: Presence; by_admin: boolean; req_status?: "present" | "absent" | null }
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

// A chamada fecha junto com o "Cheguei" (12 h depois do início). Antes disso, quem não marcou está
// pendente; depois, conta como falta.
export const callClosed = (e: Pick<GEvent, "starts_at">, now = Date.now()) => new Date(e.starts_at).getTime() + CHECKIN_MS <= now;

// Frequência nos ensaios com a chamada fechada: presente conta, falta não, justificada fica fora da conta.
// Sem marcação nenhuma num ensaio que teve chamada, conta como falta; ensaio sem chamada nenhuma não conta.
// Falta só vale para quem estava na escala do ensaio (roster); sem a escala informada, vale para todos.
// Justificada e pausa ficam fora da conta (nem falta, nem presença).
const skipped = (status?: Presence) => status === "excused" || status === "paused";
const notCalled = (e: GEvent, email: string, status: Presence | undefined, roster?: RosterRow[]) =>
  !!roster && status !== "present" && !roster.some(r => r.event_id === e.id && r.email === email);
export function attendanceRate(email: string, events: GEvent[], att: AttendanceRow[], now = Date.now(), roster?: RosterRow[]): {present: number; total: number} {
  const past = events.filter(e => e.kind === "rehearsal" && callClosed(e, now));
  let present = 0, total = 0;
  past.forEach(e => {
    const rows = att.filter(a => a.event_id === e.id); if(!rows.length) return;
    const mine = rows.find(a => a.email === email);
    if(skipped(mine?.status) || notCalled(e, email, mine?.status, roster)) return;
    total++; if(mine?.status === "present") present++;
  });
  return {present, total};
}

// Histórico da pessoa nos ensaios com a chamada fechada, do mais recente ao mais antigo (mesmas regras de
// attendanceRate: ensaio sem chamada ou em que ela não era chamada não entra; sem marcação vira falta).
export interface HistoryRow { event: GEvent; status: Presence }
export function attendanceHistory(email: string, events: GEvent[], att: AttendanceRow[], now = Date.now(), roster?: RosterRow[], limit = 12): HistoryRow[] {
  const out: HistoryRow[] = [];
  events.filter(e => e.kind === "rehearsal" && callClosed(e, now)).sort((a, b) => b.starts_at.localeCompare(a.starts_at)).forEach(e => {
    if(out.length >= limit) return;
    const rows = att.filter(a => a.event_id === e.id); if(!rows.length) return;
    const st = rows.find(a => a.email === email)?.status;
    if(notCalled(e, email, st, roster)) return;
    out.push({event: e, status: st || "absent"});
  });
  return out;
}

// Regra da equipe: quem falta a 8 ensaios seguidos fica em pausa até participar de 4 ensaios.
// Conta os ensaios com a chamada fechada e que tiveram chamada, em ordem; falta justificada não conta nem
// para a sequência nem para a volta. Os 4 da volta não precisam ser seguidos.
// streak: faltas seguidas até agora (em pausa, zera); need: ensaios que faltam para voltar.
// mark: o líder marcou a pessoa em pausa (faltas de antes do app); a partir de "since" ela
// está fora e precisa de "need" ensaios para voltar, como se tivesse chegado à 8ª falta ali.
export const MISS_LIMIT = 8, COMEBACK = 4;
// Quanto o chip de faltas seguidas deve chamar atenção: 0 até 2 faltas é neutro (null); da 3ª em diante vai
// de 0 (laranja) a 100 (vermelho) na última antes de ficar fora (MISS_LIMIT - 1 = 7 faltas).
export const STREAK_WARN_FROM = 3;
export function streakLevel(streak: number): number | null {
  if(streak < STREAK_WARN_FROM) return null;
  const last = MISS_LIMIT - 1;
  return Math.round(100 * Math.min(1, (streak - STREAK_WARN_FROM) / Math.max(1, last - STREAK_WARN_FROM)));
}
export interface Standing { out: boolean; streak: number; need: number; called: number; marked?: boolean }
// exempt: quem só tem a função Mesa de som quase não vai aos ensaios, então não entra na regra das faltas.
export interface OutMark { since: string; need: number; exempt?: boolean }
const SOUND_ONLY = ["mesa de som", "sound desk", "mesa de sonido"];
export const soundOnly = (role: string) => { const r = role.split(",").map(x => x.trim().toLocaleLowerCase()).filter(Boolean); return r.length > 0 && r.every(x => SOUND_ONLY.includes(x)); };
// Ensaio não convoca quem só tem Mesa de som (no "Escalar todos"); o líder ainda pode escalar à mão. Culto convoca.
export const skipsRehearsal = (kind: EventKind, role: string) => kind === "rehearsal" && soundOnly(role);
// Quanto da volta da pausa já foi cumprido: total é o que foi pedido (a marcação à mão ou COMEBACK), need o que falta.
export function comebackProgress(sd: Pick<Standing, "need" | "marked">, mark?: OutMark | null){
  const total = Math.max(sd.need, sd.marked && mark ? mark.need : COMEBACK), done = total - sd.need;
  return {done, total, pct: Math.round(100 * done / total)};
}
export function rehearsalStanding(email: string, events: GEvent[], att: AttendanceRow[], now = Date.now(), mark?: OutMark | null, roster?: RosterRow[]): Standing {
  const past = events.filter(e => e.kind === "rehearsal" && callClosed(e, now))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const s: Standing = {out: false, streak: 0, need: 0, called: 0};
  if(mark?.exempt) return s;
  let pending = !!mark && mark.need > 0;
  const applyMark = () => { pending = false; s.out = true; s.need = mark!.need; s.streak = 0; s.marked = true; };
  past.forEach(e => {
    if(pending && e.starts_at >= mark!.since) applyMark();
    const rows = att.filter(a => a.event_id === e.id); if(!rows.length) return;
    const st = rows.find(a => a.email === email)?.status;
    if(skipped(st) || notCalled(e, email, st, roster)) return;
    s.called++;
    if(st === "present"){
      if(s.out){ s.need--; if(!s.need) s.out = false; }
      s.streak = 0;
    }else if(!s.out && ++s.streak >= MISS_LIMIT){ s.out = true; s.need = COMEBACK; s.streak = 0; }
  });
  if(pending) applyMark();
  // Já cumpriu a volta: a marcação não vale mais.
  if(!s.out) delete s.marked;
  return s;
}

// "Cheguei" vale a partir de 12 h antes do início, sem limite depois, para ajustar ensaios passados
// (a mesma regra do banco, em check_in).
export const CHECKIN_MS = 12 * 3600 * 1000;
export function canCheckIn(e: Pick<GEvent, "kind" | "starts_at">, now = Date.now()){
  const at = new Date(e.starts_at).getTime();
  return e.kind === "rehearsal" && now >= at - CHECKIN_MS;
}

// Quem ainda não tem marcação num ensaio que já começou e está com a chamada aberta: o líder avisa
// no WhatsApp antes que vire falta.
export function pendingCheckIn(e: Pick<GEvent, "id" | "kind" | "starts_at">, emails: string[], att: AttendanceRow[], now = Date.now()): string[] {
  if(e.kind !== "rehearsal" || now < new Date(e.starts_at).getTime() || callClosed(e, now)) return [];
  const marked = new Set(att.filter(a => a.event_id === e.id).map(a => a.email));
  return emails.filter(m => !marked.has(m));
}

// Número para o link do WhatsApp (wa.me): só dígitos, com o código do país. Com "+" ou "00" na frente
// já vem com o país; sem isso, 10 ou 11 dígitos (DDD + número, com ou sem o 0 da operadora) é do
// Brasil e ganha o 55. Curto demais para ser celular: sem número.
export function waNumber(phone: string){
  const s = (phone || "").trim(), d = s.replace(/\D/g, "");
  if(d.length < 8) return "";
  if(s.startsWith("+")) return d;
  if(d.startsWith("00")) return d.slice(2);
  const local = d.replace(/^0(?=\d{10,11}$)/, "");
  return local.length === 10 || local.length === 11 ? "55" + local : d;
}
// Celular para mostrar: número do Brasil (com ou sem +55/0) vira "(11) 91234-5678"; outros ficam como foram digitados.
export function fmtPhone(phone: string){
  const s = (phone || "").trim(), n = waNumber(s);
  const br = n.startsWith("55") && (n.length === 12 || n.length === 13) ? n.slice(2) : "";
  if(!br) return s;
  return "(" + br.slice(0, 2) + ") " + br.slice(2, -4) + "-" + br.slice(-4);
}
// Máscara do campo de celular, enquanto digita: (11) 91234-5678 (ou (11) 1234-5678 com 10 números). Número com
// + (de fora) fica como foi digitado.
export function maskPhone(v: string){
  if(/^\s*\+/.test(v)) return v.replace(/[^\d+()\- ]/g, "").slice(0, 30);
  const d = v.replace(/\D/g, "").slice(0, 11);
  if(!d) return "";
  if(d.length <= 2) return "(" + d;
  const rest = d.slice(2), cut = d.length === 11 ? 5 : 4;
  return "(" + d.slice(0, 2) + ") " + (rest.length > cut ? rest.slice(0, cut) + "-" + rest.slice(cut) : rest);
}
// Nome com a primeira letra maiúscula, mesmo digitado em minúscula ("danilo" → "Danilo").
export const capFirst = (v: string) => v.replace(/^(\s*)(\p{L})/u, (_, sp: string, c: string) => sp + c.toLocaleUpperCase());
// Abre o WhatsApp com a mensagem já escrita: para a pessoa, ou sem número para escolher a conversa
// (o grupo da equipe, por exemplo).
export const waLink = (text: string, phone = "") => "https://wa.me/" + waNumber(phone) + "?text=" + encodeURIComponent(text);

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
export interface PersonOnRoster { email: string; roles: string[]; status: Answer; reason: string; cover?: string }
// A pessoa está na escala deste evento (em qualquer função)?
export const onRoster = (roster: Pick<RosterRow, "event_id" | "email">[], eventId: string, email: string) => roster.some(r => r.event_id === eventId && r.email === email);
export function rosterByPerson(rows: Pick<RosterRow, "email" | "role" | "status" | "reason" | "cover">[]): PersonOnRoster[] {
  const out = new Map<string, PersonOnRoster>();
  rows.forEach(r => {
    const p = out.get(r.email) || {email: r.email, roles: [], status: r.status, reason: r.reason, ...(r.cover ? {cover: r.cover} : {})};
    if(r.role && !p.roles.includes(r.role)) p.roles.push(r.role);
    out.set(r.email, p);
  });
  return [...out.values()];
}

// Quem disse "não posso" e ainda não indicou quem cobre (uma vez por pessoa, mesmo com várias funções).
export function needsCover(rows: Pick<RosterRow, "email" | "status" | "cover">[]): string[] {
  return [...new Set(rows.filter(r => r.status === "no" && !r.cover).map(r => r.email))];
}
// Quem está escalado e ainda não respondeu (nenhuma linha dele com sim ou não), uma vez por pessoa.
export function pendingReplies(rows: Pick<RosterRow, "email" | "status">[]): string[] {
  const answered = new Set(rows.filter(r => r.status !== "pending").map(r => r.email));
  return [...new Set(rows.map(r => r.email))].filter(e => !answered.has(e));
}
