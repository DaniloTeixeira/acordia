// Rode com: npm test
import { test } from "vitest";
import assert from "node:assert/strict";
import { monthGrid, weekly, warningsFor, monthLoad, attendanceRate, canCheckIn, toICS, splitEvents, dayKey, type GEvent, type RosterRow } from "../src/lib/calendar";

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

test("Cheguei: só em ensaio, de 12 h antes a 12 h depois", () => {
  const at = new Date(2026, 9, 18, 19).getTime();
  const e = ev("e", new Date(at), "rehearsal");
  assert.ok(canCheckIn(e, at));
  assert.ok(canCheckIn(e, at - 11 * 3600e3));
  assert.ok(!canCheckIn(e, at + 13 * 3600e3));
  assert.ok(!canCheckIn({...e, kind: "service"}, at));
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
