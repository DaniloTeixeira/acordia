// Rode com: npm test
import { test } from "vitest";
import assert from "node:assert/strict";
import { monthGrid, weekly, warningsFor, monthLoad, attendanceRate, attendanceHistory, rehearsalStanding, canCheckIn, pendingCheckIn, waNumber, waLink, fmtPhone, maskPhone, capFirst, toICS, splitEvents, dayKey, upcomingBirthdays, birthdayNotice, birthdayKey, rosterByPerson, needsCover, pendingReplies, streakLevel, comebackProgress, soundOnly, skipsRehearsal, type GEvent, type RosterRow, onRoster } from "../src/lib/calendar";

const ev = (id: string, starts: Date, kind: GEvent["kind"] = "service"): GEvent =>
  ({id, group_id: "g", kind, title: id, starts_at: starts.toISOString(), call_at: null, place: "", notes: "", setlist_id: null});
const r = (event_id: string, email: string, status: RosterRow["status"] = "pending", role = ""): RosterRow => ({event_id, email, role, status, reason: ""});

test("grade do mês: começa no domingo, semanas completas", () => {
  const g = monthGrid(2026, 9); // outubro de 2026 começa numa quinta
  assert.equal(g[0].findIndex(d => d !== null), 4);
  assert.ok(g.every(w => w.length === 7));
  assert.equal(g.flat().filter(Boolean).length, 31);
  assert.equal(g.flat().filter(Boolean)[30]!.getDate(), 31);
});

test("evento repetido: mesma hora local toda semana, até 52", () => {
  const ds = weekly(new Date(2026, 9, 18, 19, 30), 4);
  assert.deepEqual(ds.map(d => [d.getDate(), d.getHours(), d.getMinutes()]), [[18, 19, 30], [25, 19, 30], [1, 19, 30], [8, 19, 30]]);
  assert.equal(weekly(new Date(), 100).length, 52);
  assert.equal(weekly(new Date(), 0).length, 1);
});

test("avisos ao escalar: não pode no dia, outro evento no dia, já recusou", () => {
  const day = new Date(2026, 9, 18, 19), a = ev("a", day), b = ev("b", new Date(2026, 9, 18, 9)), c = ev("c", new Date(2026, 9, 19, 9));
  const all = {events: [a, b, c], roster: [r("b", "x@a.com"), r("c", "x@a.com"), r("a", "y@a.com", "no")], unavail: [{email: "z@a.com", day: dayKey(day), note: "viagem"}]};
  assert.deepEqual(warningsFor("x@a.com", a, all, e => e.title), [{kind: "busy", title: "b"}]);
  assert.deepEqual(warningsFor("y@a.com", a, all, e => e.title), [{kind: "declined"}]);
  assert.deepEqual(warningsFor("z@a.com", a, all, e => e.title), [{kind: "unavailable", note: "viagem"}]);
  assert.deepEqual(warningsFor("w@a.com", a, all, e => e.title), []);
});

test("escalas no mês: conta cada evento uma vez por pessoa, mesmo com duas funções", () => {
  const a = ev("a", new Date(2026, 9, 4)), b = ev("b", new Date(2026, 9, 11)), c = ev("c", new Date(2026, 10, 1));
  const load = monthLoad("2026-10-20", [a, b, c], [r("a", "x", "pending", "Voz"), r("a", "x", "pending", "Violão"), r("b", "x"), r("c", "x"), r("b", "y")]);
  assert.equal(load.get("x"), 2);
  assert.equal(load.get("y"), 1);
});

test("frequência: só ensaios passados com chamada; justificada fica fora", () => {
  const now = new Date(2026, 9, 20).getTime();
  const e1 = ev("e1", new Date(2026, 9, 1), "rehearsal"), e2 = ev("e2", new Date(2026, 9, 8), "rehearsal"), e3 = ev("e3", new Date(2026, 9, 15), "rehearsal");
  const e4 = ev("e4", new Date(2026, 9, 22), "rehearsal"), s = ev("s", new Date(2026, 9, 2));
  const att = [
    {event_id: "e1", email: "x", status: "present" as const, by_admin: true},
    {event_id: "e2", email: "y", status: "present" as const, by_admin: true}, // x sem marcação: falta
    {event_id: "e3", email: "x", status: "excused" as const, by_admin: true},
    {event_id: "e4", email: "x", status: "present" as const, by_admin: false},
    {event_id: "s", email: "x", status: "present" as const, by_admin: true},
  ];
  assert.deepEqual(attendanceRate("x", [e1, e2, e3, e4, s], att, now), {present: 1, total: 2});
  assert.deepEqual(attendanceRate("z", [e1], [], now), {present: 0, total: 0});
});

test("regra dos ensaios: 8 faltas seguidas tiram dos cultos até 4 presenças", () => {
  const now = new Date(2027, 0, 1).getTime();
  // 14 ensaios semanais; em cada um a chamada marca alguém (o "outro"), então todos contam.
  const evs = Array.from({length: 14}, (_, i) => ev("e" + i, new Date(2026, 6, 1 + 7 * i), "rehearsal"));
  const att = (marks: Record<number, "present" | "absent" | "excused" | "paused">) => evs.flatMap((e, i) => [
    {event_id: e.id, email: "outro", status: "present" as const, by_admin: true},
    ...(marks[i] ? [{event_id: e.id, email: "x", status: marks[i], by_admin: true}] : []),
  ]);
  const st = (marks: Record<number, "present" | "absent" | "excused" | "paused">, n = 14) => rehearsalStanding("x", evs.slice(0, n), att(marks), now);
  // 7 faltas seguidas: ainda pode tocar, com a sequência à mostra.
  assert.deepEqual(st({}, 7), {out: false, streak: 7, need: 0, called: 7});
  // A 8ª falta seguida tira dos cultos; 2 presenças depois: faltam 2.
  assert.deepEqual(st({8: "present", 9: "present"}, 10), {out: true, streak: 0, need: 2, called: 10});
  // Faltas durante a volta não zeram o que já fez; com a 4ª presença volta.
  assert.deepEqual(st({8: "present", 10: "present", 11: "present", 13: "present"}), {out: false, streak: 0, need: 0, called: 14});
  // Uma presença no meio zera a sequência; justificada não conta nem interrompe.
  assert.deepEqual(st({3: "present", 6: "excused"}, 12), {out: false, streak: 7, need: 0, called: 11});
  // Pausa na chamada também fica fora da conta; quem só é Mesa de som não entra na regra.
  assert.deepEqual(st({3: "present", 6: "paused"}, 12), {out: false, streak: 7, need: 0, called: 11});
  assert.equal(rehearsalStanding("x", evs, att({}), now, {since: "", need: 0, exempt: true}).streak, 0);
  assert.ok(soundOnly("Mesa de som") && soundOnly("Sound desk, mesa de som") && !soundOnly("Vocal, Mesa de som") && !soundOnly(""));
  assert.ok(skipsRehearsal("rehearsal", "Mesa de som") && !skipsRehearsal("service", "Mesa de som") && !skipsRehearsal("rehearsal", "Vocal, Mesa de som"));
  // Ensaio futuro ou sem chamada não conta.
  assert.deepEqual(rehearsalStanding("x", evs, [], now), {out: false, streak: 0, need: 0, called: 0});
  // Marcado pelo líder (faltas de antes do app): fora desde a marcação; só as presenças depois contam.
  const mark = (i: number, need: number) => ({since: evs[i].starts_at, need});
  assert.deepEqual(rehearsalStanding("x", evs.slice(0, 6), att({1: "present", 4: "present"}), now, mark(3, 4)), {out: true, streak: 0, need: 3, called: 6, marked: true});
  // Marcado depois do último ensaio: fora com tudo por fazer.
  assert.deepEqual(rehearsalStanding("x", evs.slice(0, 3), att({0: "present"}), now, {since: "2999-01-01T00:00:00Z", need: 2}), {out: true, streak: 0, need: 2, called: 3, marked: true});
  // Cumpriu os ensaios da volta: em dia, e a marcação deixa de valer.
  assert.deepEqual(rehearsalStanding("x", evs.slice(0, 5), att({3: "present", 4: "present"}), now, mark(3, 2)), {out: false, streak: 0, need: 0, called: 5});
});

test("Cheguei: só em ensaio, a partir de 12 h antes, sem limite depois", () => {
  const at = new Date(2026, 9, 18, 19).getTime();
  const e = ev("e", new Date(at), "rehearsal");
  assert.ok(canCheckIn(e, at));
  assert.ok(canCheckIn(e, at - 11 * 3600e3));
  assert.ok(!canCheckIn(e, at - 13 * 3600e3));
  assert.ok(canCheckIn(e, at + 7 * 24 * 3600e3));
  assert.ok(!canCheckIn({...e, kind: "service"}, at));
});

test("chamada aberta: pendente até 12 h depois; depois vira falta", () => {
  const at = new Date(2026, 9, 18, 19).getTime();
  const e = ev("e", new Date(at), "rehearsal"), other = {event_id: "e", email: "y", status: "present" as const, by_admin: false};
  // Antes de começar ninguém está pendente; durante a chamada, só quem não marcou.
  assert.deepEqual(pendingCheckIn(e, ["x", "y"], [other], at - 3600e3), []);
  assert.deepEqual(pendingCheckIn(e, ["x", "y"], [other], at + 2 * 3600e3), ["x"]);
  assert.deepEqual(pendingCheckIn(e, ["x", "y"], [other], at + 12 * 3600e3), []);
  assert.deepEqual(pendingCheckIn({...e, kind: "service"}, ["x"], [], at + 3600e3), []);
  // Enquanto pendente não conta; com a chamada fechada, conta como falta.
  assert.deepEqual(attendanceRate("x", [e], [other], at + 11 * 3600e3), {present: 0, total: 0});
  assert.deepEqual(attendanceRate("x", [e], [other], at + 12 * 3600e3), {present: 0, total: 1});
  assert.equal(rehearsalStanding("x", [e], [other], at + 11 * 3600e3).called, 0);
  assert.equal(rehearsalStanding("x", [e], [other], at + 12 * 3600e3).streak, 1);
  // Falta só conta para quem estava na escala; quem não estava fica fora da conta (mas a presença vale).
  const scaled = [{event_id: "e", email: "x", role: "", status: "yes" as const, reason: ""}], end = at + 12 * 3600e3;
  assert.deepEqual(attendanceRate("x", [e], [other], end, []), {present: 0, total: 0});
  assert.equal(rehearsalStanding("x", [e], [other], end, null, []).streak, 0);
  assert.deepEqual(attendanceRate("x", [e], [other], end, scaled), {present: 0, total: 1});
  assert.equal(rehearsalStanding("x", [e], [other], end, null, scaled).streak, 1);
  const here = {...other, email: "x"};
  assert.deepEqual(attendanceRate("x", [e], [here], end, []), {present: 1, total: 1});
});

test("WhatsApp: número com o país e mensagem no link", () => {
  assert.equal(waNumber("(11) 91234-5678"), "5511912345678");
  assert.equal(waNumber("011 91234-5678"), "5511912345678");
  assert.equal(waNumber("(21) 3456-7890"), "552134567890");
  assert.equal(waNumber("+353 87 123 4567"), "353871234567");
  assert.equal(waNumber("00351 912 345 678"), "351912345678");
  assert.equal(waNumber("1234"), "");
  assert.equal(waNumber(""), "");
  assert.equal(waLink("Oi & tchau", "(11) 91234-5678"), "https://wa.me/5511912345678?text=Oi%20%26%20tchau");
  assert.equal(waLink("Oi"), "https://wa.me/?text=Oi");
});

test("próximos e anteriores", () => {
  const now = new Date(2026, 9, 18, 12).getTime();
  const {upcoming, past} = splitEvents([ev("b", new Date(2026, 9, 25)), ev("a", new Date(2026, 9, 18, 9)), ev("p", new Date(2026, 9, 1)), ev("q", new Date(2026, 9, 10))], now);
  assert.deepEqual(upcoming.map(e => e.id), ["a", "b"]);
  assert.deepEqual(past.map(e => e.id), ["q", "p"]);
});

test(".ics: formato do calendário, com escape, lembretes e linhas dobradas", () => {
  const ics = toICS([{id: "1", title: "Culto; domingo, manhã", start: new Date(Date.UTC(2026, 9, 18, 22, 0)), place: "Templo", description: "Voz: Ana\n" + "x".repeat(120)}], new Date(Date.UTC(2026, 0, 1)));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.includes("DTSTART:20261018T220000Z"));
  assert.ok(ics.includes("DTEND:20261019T000000Z"));
  assert.ok(ics.includes("SUMMARY:Culto\\; domingo\\, manhã"));
  assert.ok(ics.includes("TRIGGER:-P1D") && ics.includes("TRIGGER:-PT2H"));
  for(const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("aniversariantes: próximos 30 dias, do mais perto ao mais longe, virando o ano", () => {
  const ppl = [{email: "a", birthday: "1990-10-18"}, {email: "b", birthday: "1985-11-05"}, {email: "c", birthday: "2000-12-31"},
    {email: "d", birthday: null}, {email: "e", birthday: "1999-10-17"}, {email: "f", birthday: "x"}];
  assert.deepEqual(upcomingBirthdays(ppl, "2026-10-18").map(p => [p.email, p.in]), [["a", 0], ["b", 18]]);
  assert.deepEqual(upcomingBirthdays(ppl, "2026-12-20").map(p => [p.email, p.in]), [["c", 11]]);
  assert.equal(upcomingBirthdays([{email: "e", birthday: "1999-10-17"}], "2026-10-18", 400)[0].in, 364);
});

test("aviso de aniversário: só hoje, e dispensar vale até o ano seguinte", () => {
  const ppl = [{email: "a", birthday: "1990-10-18"}, {email: "b", birthday: "1985-10-19"}, {email: "c", birthday: "2000-10-18"}];
  assert.deepEqual(birthdayNotice(ppl, "2026-10-18", []).map(p => p.email), ["a", "c"]);
  assert.deepEqual(birthdayNotice(ppl, "2026-10-18", [birthdayKey("a", "2026-10-18")]).map(p => p.email), ["c"]);
  assert.deepEqual(birthdayNotice(ppl, "2027-10-18", [birthdayKey("a", "2026-10-18")]).map(p => p.email), ["a", "c"]);
});

test("aniversariantes: 29/02 vira 28/02 em ano não bissexto", () => {
  assert.equal(upcomingBirthdays([{birthday: "2000-02-29"}], "2027-02-20")[0].in, 8);
  assert.equal(upcomingBirthdays([{birthday: "2000-02-29"}], "2028-02-20")[0].in, 9);
});

test("escala por pessoa: junta as funções de quem toca e canta", () => {
  const rows = [{email: "a", role: "Vocal", status: "yes" as const, reason: ""}, {email: "b", role: "Bateria", status: "pending" as const, reason: ""},
    {email: "a", role: "Violão", status: "yes" as const, reason: ""}, {email: "c", role: "", status: "no" as const, reason: "viagem"}];
  assert.deepEqual(rosterByPerson(rows), [
    {email: "a", roles: ["Vocal", "Violão"], status: "yes", reason: ""},
    {email: "b", roles: ["Bateria"], status: "pending", reason: ""},
    {email: "c", roles: [], status: "no", reason: "viagem"}]);
});

test("celular para mostrar: formato do Brasil, outros como vieram", () => {
  assert.equal(fmtPhone("11964160074"), "(11) 96416-0074");
  assert.equal(fmtPhone("+55 11 96416-0074"), "(11) 96416-0074");
  assert.equal(fmtPhone("011 3456-7890"), "(11) 3456-7890");
  assert.equal(fmtPhone("+353 87 123 4567"), "+353 87 123 4567");
  assert.equal(fmtPhone("123"), "123");
});

test("maskPhone formata o celular enquanto digita; capFirst deixa a primeira letra maiúscula", () => {
  assert.equal(maskPhone(""), "");
  assert.equal(maskPhone("1"), "(1");
  assert.equal(maskPhone("119"), "(11) 9");
  assert.equal(maskPhone("1196416"), "(11) 9641-6");
  assert.equal(maskPhone("1112345678"), "(11) 1234-5678");
  assert.equal(maskPhone("11964160074"), "(11) 96416-0074");
  assert.equal(maskPhone("(11) 96416-00745"), "(11) 96416-0074");
  assert.equal(maskPhone("+353 87 123"), "+353 87 123");
  assert.equal(capFirst("danilo"), "Danilo");
  assert.equal(capFirst(" élio"), " Élio");
  assert.equal(capFirst("Ana"), "Ana");
});

test("needsCover: quem disse não e ainda não indicou quem cobre, uma vez por pessoa", () => {
  const rows = [{email: "a", status: "no" as const}, {email: "a", status: "no" as const}, {email: "b", status: "no" as const, cover: "c"}, {email: "d", status: "yes" as const}];
  assert.deepEqual(needsCover(rows), ["a"]);
  assert.deepEqual(rosterByPerson([{email: "b", role: "", status: "no", reason: "", cover: "c"}]), [{email: "b", roles: [], status: "no", reason: "", cover: "c"}]);
});

test("pendingReplies: quem não disse sim nem não, uma vez por pessoa", () => {
  const rows = [r("e", "a"), r("e", "a"), r("e", "b", "yes"), r("e", "c", "no"), r("e", "d", "pending"), r("e", "d", "yes")];
  assert.deepEqual(pendingReplies(rows), ["a"]);
  assert.deepEqual(pendingReplies([]), []);
});

test("streakLevel: neutro até 2 faltas, laranja na 3ª e vermelho na 7ª", () => {
  assert.equal(streakLevel(1), null);
  assert.equal(streakLevel(2), null);
  assert.equal(streakLevel(3), 0);
  assert.equal(streakLevel(5), 50);
  assert.equal(streakLevel(7), 100);
});

test("comebackProgress: quanto falta para sair da pausa, contra o total pedido", () => {
  assert.deepEqual(comebackProgress({need: 4}), {done: 0, total: 4, pct: 0});
  assert.deepEqual(comebackProgress({need: 1}), {done: 3, total: 4, pct: 75});
  assert.deepEqual(comebackProgress({need: 6, marked: true}, {since: "", need: 6}), {done: 0, total: 6, pct: 0});
  assert.deepEqual(comebackProgress({need: 3, marked: true}, {since: "", need: 6}), {done: 3, total: 6, pct: 50});
});

test("histórico: ensaios com chamada fechada, do mais recente ao mais antigo; sem marcação é falta; fora da escala não entra", () => {
  const at = (d: number) => new Date(2026, 8, d, 19);
  const a = ev("a", at(1), "rehearsal"), b = ev("b", at(8), "rehearsal"), c = ev("c", at(15), "rehearsal"), d = ev("d", at(22), "rehearsal"), s = ev("s", at(10));
  const att = [
    {event_id: "a", email: "x", status: "present" as const, by_admin: false}, {event_id: "b", email: "y", status: "present" as const, by_admin: false},
    {event_id: "c", email: "x", status: "excused" as const, by_admin: true}, {event_id: "d", email: "y", status: "present" as const, by_admin: false},
  ];
  const now = at(30).getTime();
  const rows = attendanceHistory("x", [a, b, c, d, s], att, now);
  assert.deepEqual(rows.map(h => [h.event.id, h.status]), [["d", "absent"], ["c", "excused"], ["b", "absent"], ["a", "present"]]);
  assert.deepEqual(attendanceHistory("x", [a, b, c, d], att, now, [r("a", "x"), r("c", "x")]).map(h => h.event.id), ["c", "a"]);
  assert.equal(attendanceHistory("x", [a, b, c, d], att, now, undefined, 2).length, 2);
});

test("onRoster: está escalado em qualquer função, só neste evento", () => {
  const roster = [{event_id: "e1", email: "a@x.com"}, {event_id: "e1", email: "a@x.com"}, {event_id: "e2", email: "b@x.com"}];
  assert.equal(onRoster(roster, "e1", "a@x.com"), true);
  assert.equal(onRoster(roster, "e1", "b@x.com"), false);
  assert.equal(onRoster(roster, "e3", "a@x.com"), false);
});
