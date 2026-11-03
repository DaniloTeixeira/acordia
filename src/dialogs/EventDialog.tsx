// Criar ou editar um evento da agenda do grupo (só quem lidera o grupo): tipo, data, horários, local,
// repertório, observações, repetição semanal e a escala, com avisos de quem não pode, já está em
// outro evento no dia ou já recusou. Na escala, cada pessoa pode ter mais de uma função (tocar e cantar).
import { useEffect, useRef, useState } from "react";
import { t, tn } from "../lib/i18n";
import { useGroups, saveEvent, addGuest, personName, outMark, isActive, type RosterInput } from "../lib/groups";
import { useAuth, validEmail, listAllowed, type Allowed } from "../lib/cloud";
import { warningsFor, rehearsalStanding, monthLoad, weekly, dayKey, rosterByPerson, soundOnly, type EventKind, type GEvent } from "../lib/calendar";
import { reduced } from "../lib/util";
import { toast, confirmDialog, requestClose, type DialogProps } from "../state";
import { Dialog, DialogHead } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { DateInput } from "../ui/DateInput";
import { eventTitle, roleOptions } from "../views/Group";
import { splitRoles, sortRoles, toggleRole } from "../lib/roles";
import { Spin, PersonFields, useEmailCheck } from "../views/Account";
import { FoldCard } from "../ui/FoldCard";

const hhmm = (iso: string | null) => { if(!iso) return ""; const d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
// Data do campo (AAAA-MM-DD) + hora (HH:MM), na hora local de quem preenche.
const at = (day: string, time: string) => { const [y, m, d] = day.split("-").map(Number), [h, mi] = (time || "00:00").split(":").map(Number); return new Date(y, m - 1, d, h, mi); };

// Escala em ordem alfabética pelo nome; linhas ainda sem pessoa ficam no fim.
type Row = {email: string; roles: string[]};
const byName = (rs: Row[]) => [...rs.filter(r => r.email).sort((a, b) => personName(a.email).localeCompare(personName(b.email))), ...rs.filter(r => !r.email)];

export function EventDialog({id, day}: DialogProps["event"]){
  const g = useGroups(), ev = id ? g.events.find(e => e.id === id) : undefined;
  const [kind, setKind] = useState<EventKind>(ev?.kind || "rehearsal");
  const [title, setTitle] = useState(ev?.title || "");
  const [date, setDate] = useState(ev ? dayKey(new Date(ev.starts_at)) : day);
  const [time, setTime] = useState(ev ? hhmm(ev.starts_at) : "19:00");
  // A chegada não tem mais campo: eventos antigos mantêm o valor ao salvar.
  const [call] = useState(ev ? hhmm(ev.call_at) : "");
  const [place, setPlace] = useState(ev?.place || "");
  const [notes, setNotes] = useState(ev?.notes || "");
  const [setlist, setSetlist] = useState(ev?.setlist_id || "");
  const [weeks, setWeeks] = useState("1");
  // Uma linha por pessoa, com as funções dela neste evento; ao salvar vira uma linha por função.
  const [roster, setRoster] = useState<Row[]>(() => ev ? byName(rosterByPerson(g.roster.filter(r => r.event_id === ev.id)).map(p => ({email: p.email, roles: p.roles}))) : []);
  const [busy, setBusy] = useState(false), [inviting, setInviting] = useState(false);
  // Alterado = diferente de quando abriu (voltar ao que era não conta). done: salvou ou cancelou.
  const snap = () => JSON.stringify([kind, title, date, time, call, place, notes, setlist, weeks, roster]);
  const start = useRef<string | null>(null); if(start.current === null) start.current = snap();
  const done = useRef(false), dirty = () => !done.current && snap() !== start.current;
  const form = useRef<HTMLFormElement>(null), rosterEnd = useRef<HTMLDivElement>(null);
  // Ao abrir a Escala, rola a janela até o fim dela (a lista e os botões de escalar e convidar ficam embaixo dos detalhes).
  const toEnd = () => requestAnimationFrame(() => rosterEnd.current?.scrollIntoView({block: "end", behavior: reduced() ? "auto" : "smooth"}));
  // Evento novo sempre abre os Detalhes (é onde se preenche); ao editar, só na tela larga (no celular ficam a um toque).
  const wide = !id || window.matchMedia("(min-width: 900px)").matches;
  const starts = date && time ? at(date, time) : null;
  const probe: Pick<GEvent, "id" | "starts_at"> = {id: id || "new", starts_at: (starts || new Date()).toISOString()};
  const load = monthLoad(date || dayKey(new Date()), g.events, g.roster);
  // Ao escalar, a função sugerida é a primeira da pessoa; as outras dela aparecem para marcar também.
  const rolesOf = (email: string) => splitRoles(g.members.find(m => m.email === email)?.role || "");
  const firstRole = (email: string) => rolesOf(email).slice(0, 1);
  const memberOpts = [{value: "", label: t("group.pickPerson")}, ...g.members.filter(m => isActive(m) || roster.some(r => r.email === m.email)).map(m => ({value: m.email,
    label: personName(m.email),
    sub: [m.role ? sortRoles(splitRoles(m.role)).join(", ") : "", (load.get(m.email) || 0) ? tn("group.load", load.get(m.email)!) : ""].filter(Boolean).join(" · ") || undefined}))];
  const free = g.members.filter(m => isActive(m) && !roster.some(r => r.email === m.email));
  // Quem está em pausa (ou só tem Mesa de som, em qualquer evento) não é convocado: fica de fora do "Escalar todos" (o líder ainda pode escalar à mão).
  const callable = free.filter(m => !soundOnly(m.role || "") && !rehearsalStanding(m.email, g.events, g.attendance, Date.now(), outMark(m), g.roster).out);
  // Datas do evento (com a repetição semanal), que dão o prazo do convidado.
  const guestDates = () => starts ? (id ? [starts] : weekly(starts, +weeks)).map(d => d.toISOString()) : [];
  const save = async () => {
    if(!starts) return toast(t("group.needDate"));
    setBusy(true);
    const callAt = call ? at(date, call) : null;
    const input = {kind, title: title.trim().slice(0, 80), starts_at: starts.toISOString(), call_at: callAt ? callAt.toISOString() : null, place: place.trim(), notes: notes.trim(), setlist_id: setlist || null};
    const n = id ? 1 : +weeks;
    const dates = n > 1 ? weekly(starts, n).map((s, i) => ({starts_at: s.toISOString(), call_at: callAt ? new Date(callAt.getFullYear(), callAt.getMonth(), callAt.getDate() + 7 * i, callAt.getHours(), callAt.getMinutes()).toISOString() : null})) : undefined;
    const rows: RosterInput[] = roster.filter(r => r.email).flatMap(r => r.roles.length ? r.roles.map(role => ({email: r.email, role})) : [{email: r.email, role: ""}]);
    const ok = await saveEvent(g.gid, id, input, rows, dates).finally(() => setBusy(false));
    if(!ok) return toast(t("profile.saveFail"));
    toast(n > 1 ? tn("group.eventsCreated", n) : t("group.eventSaved"));
    done.current = true;
    form.current?.closest("dialog")?.close("ok");
  };
  return <Dialog name="event" id="dlg-event" className="event-dlg" labelledBy="event-h" dirty={dirty}>
    <form method="dialog" className="dlg" ref={form} onSubmit={e => {
      // O X do cabeçalho (value="cancel") também envia o formulário: esse fecha sem salvar.
      if((e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "cancel") return;
      e.preventDefault(); if(!busy) save();
    }}>
      <DialogHead id="event-h" title={t(id ? "group.editEvent" : "group.newEvent")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        <FoldCard id="event-data" title={t("group.details")} defaultOpen={wide} boxed>
        <Seg className="block" id="event-kind" aria={t("group.kindLabel")} value={kind} onChange={setKind}
          options={[{v: "service", label: t("group.kind.service")}, {v: "rehearsal", label: t("group.kind.rehearsal")}]}/>
        <label className="field"><span>{t("group.eventTitle")}</span><input className="input" id="event-title" maxLength={80} placeholder={t(kind === "service" ? "group.titlePhService" : "group.titlePhRehearsal")} value={title} onChange={e => setTitle(e.target.value)}/></label>
        <div className="event-row">
          <label className="field"><span>{t("group.date")}</span><DateInput id="event-date" aria={t("group.date")} value={date} onChange={v => setDate(v)}/></label>
          <label className="field"><span>{t("group.time")}</span><input className="input" id="event-time" type="time" required value={time} onChange={e => setTime(e.target.value)}/></label>
          <label className="field"><span>{t("group.place")}</span><input className="input" id="event-place" maxLength={120} placeholder={t("group.placePh")} value={place} onChange={e => setPlace(e.target.value)}/></label>
        </div>
        {/* Repertório e Repetir lado a lado (empilham no celular). */}
        <div className="event-pair">
          <label className="field"><span>{t("group.setlist")}</span><Select id="event-setlist" value={setlist} onChange={setSetlist}
            options={[{value: "", label: t("group.noSetlist")}, ...g.setlists.map(s => ({value: s.id, label: s.name}))]}/></label>
          {!id && <label className="field"><span>{t("group.repeat")}</span><Select id="event-repeat" value={weeks} onChange={setWeeks}
            options={["1", "2", "4", "8", "12", "26"].map(n => ({value: n, label: n === "1" ? t("group.repeatNo") : t("group.repeatWeeks", {n})}))}/></label>}
        </div>
        {!g.setlists.length && <p className="sub">{t("group.setlistHint")}</p>}
        <label className="field"><span>{t("group.notes")}</span><textarea className="input" id="event-notes" rows={3} maxLength={1000} placeholder={t("group.notesPh")} value={notes} onChange={e => setNotes(e.target.value)}/></label>
        </FoldCard>

        <FoldCard id="event-roster" onToggle={open => { if(open) toEnd(); }} title={t("group.roster")} aside={<span className="sub">{tn("group.people", roster.filter(r => r.email).length)}</span>} defaultOpen boxed
          after={<>
          <datalist id="event-roles">{roleOptions().map(r => <option key={r} value={r}/>)}</datalist>
          <div className="roster-add">
            <button type="button" className="btn soft sm" id="event-add-person" disabled={!free.length} onClick={() => { setRoster(rs => [...rs, {email: "", roles: []}]); }}><Icon name="plus" sm/> {t("group.addPerson")}</button>
            {callable.length > 0 && <button type="button" className="btn ghost sm" onClick={() => { setRoster(rs => byName([...rs.filter(r => r.email), ...callable.map(m => ({email: m.email, roles: firstRole(m.email)}))])); }}><Icon name="users" sm/> {t("group.addEveryone")}</button>}
            <button type="button" className="btn ghost sm" id="event-add-guest" aria-expanded={inviting} onClick={() => { setInviting(!inviting); if(!inviting) toEnd(); }}><Icon name="user" sm/> {t("group.inviteGuest")}</button>
          </div>
          {inviting && <GuestBox dates={guestDates} onDone={email => { setInviting(false); setRoster(rs => byName([...rs.filter(r => r.email && r.email !== email), {email, roles: []}])); }} onCancel={() => setInviting(false)}/>}
          <div ref={rosterEnd}/>
          </>}>
        {roster.length > 0 && <ul className="roster-edit">
          {/* Cabeçalho da tabela: só na tela larga (no celular cada pessoa é um cartão). */}
          {roster.some(r => r.email) && <li className="roster-head" aria-hidden="true"><span>{t("people.colPerson")}</span><span>{t("group.roles")}</span><span/></li>}
          {roster.map((r, i) => {
          const warns = r.email ? warningsFor(r.email, probe, {events: g.events, roster: g.roster, unavail: g.unavail}, eventTitle) : [];
          // Culto: quem está fora pela regra dos ensaios ganha um aviso (o líder ainda decide).
          const sd = r.email && kind === "service" ? rehearsalStanding(r.email, g.events, g.attendance, Date.now(), outMark(g.members.find(m => m.email === r.email)), g.roster) : null;
          const upd = (p: Partial<Row>) => { setRoster(rs => byName(rs.map((x, k) => k === i ? {...x, ...p} : x))); };
          // Quem já está em outra linha não aparece de novo na lista de pessoas.
          const opts = memberOpts.filter(o => !o.value || o.value === r.email || !roster.some(x => x.email === o.value));
          const chips = sortRoles(splitRoles([...rolesOf(r.email), ...r.roles].join(",")));
          const n = load.get(r.email) || 0;
          // Pessoa já escolhida vira um cartão com o nome em destaque; a lista só aparece na linha nova.
          return <li key={i} className={"roster-card" + (r.email ? " set" : "")}>
            <div className="roster-row">
              {r.email
                ? <div className="roster-who"><strong>{personName(r.email)}</strong>{n > 0 && <span className="sub">{tn("group.load", n)}</span>}</div>
                : <Select value={r.email} aria={t("group.person")} onChange={v => upd({email: v, roles: firstRole(v)})} options={opts}/>}
              <button type="button" className="icon-btn sm danger" aria-label={t("group.removeFromRoster")} title={t("group.removeFromRoster")} onClick={async () => {
                // Linha ainda sem pessoa escolhida sai direto; com pessoa, confirma antes.
                if(r.email && !await confirmDialog({title: t("group.removeFromRosterTitle"), message: t("group.removeFromRosterMsg", {name: personName(r.email)}), confirm: t("group.removeFromRoster")})) return;
                setRoster(rs => rs.filter(x => x !== r));
              }}><Icon name="x" sm/></button>
            </div>
            {r.email && <RoleChips roles={chips} value={r.roles} onChange={roles => upd({roles})}/>}
            {sd?.out && <p className="roster-warn declined" role="status"><Icon name="x" sm/>{tn("group.warnOut", sd.need)}</p>}
            {warns.map((w, k) => <p key={k} className={"roster-warn " + w.kind} role="status"><Icon name={w.kind === "busy" ? "calendar" : "x"} sm/>
              {w.kind === "unavailable" ? t("group.warnOff") + (w.note ? ": " + w.note : "") : w.kind === "busy" ? t("group.warnBusy", {title: w.title}) : t("group.warnDeclined")}</p>)}
          </li>;
        })}</ul>}
        {!roster.length && <div className="empty-state"><Icon name="users"/><strong>{t("group.noRoster")}</strong></div>}
        </FoldCard>
      </div>
      <div className="dlg-foot"><button type="button" className="btn ghost" onClick={() => { const d = form.current?.closest("dialog"); if(d) requestClose(d); }}>{t("common.cancel")}</button>
        <button className="btn primary" id="event-save" aria-busy={busy}>{busy && <Spin/>}{t("common.save")}</button></div>
    </form>
  </Dialog>;
}

// Funções da pessoa neste evento: as dela no grupo como botões de marcar (pode marcar mais de uma) e
// um campo para uma função que ela não tem cadastrada.
function RoleChips({roles, value, onChange}: {roles: string[]; value: string[]; onChange: (v: string[]) => void}){
  const [other, setOther] = useState(""), [adding, setAdding] = useState(false);
  const has = (r: string) => value.some(x => x.toLocaleLowerCase() === r.toLocaleLowerCase());
  const add = () => { const r = other.trim().replace(/,/g, " ").slice(0, 40); if(r && !has(r)) onChange([...value, r]); setOther(""); setAdding(false); };
  // O campo de função avulsa só aparece quando pedido, para não repetir uma caixa de texto em cada pessoa.
  return <div className="roster-roles">
    <div className="role-chips" role="group" aria-label={t("group.roles")}>{roles.map(r =>
      <button type="button" key={r} className="role-chip" aria-pressed={has(r)} onClick={() => onChange(toggleRole(value, r))}>{r}</button>)}
      {adding
        ? <div className="role-add"><input className="input role-input" list="event-roles" maxLength={40} autoFocus placeholder={t("group.roleOther")} aria-label={t("group.roleOther")} value={other}
            onChange={e => setOther(e.target.value)} onBlur={add} onKeyDown={e => { if(e.key === "Enter"){ e.preventDefault(); add(); } }}/>
          {/* O mouse/toque no botão não tira o foco do campo antes do clique (senão o blur adicionaria e sumiria com o botão). */}
          <button type="button" className="btn primary" onMouseDown={e => e.preventDefault()} onClick={add}>{t("common.add")}</button></div>
        : <button type="button" className="link-btn role-other" onClick={() => setAdding(true)}>{t("group.roleOther")}</button>}
    </div>
  </div>;
}

// Convidar alguém de fora do grupo só para este evento: entra como convidado até o evento acabar e já fica escalado.
// Admin do app cadastra a pessoa aqui mesmo (nome, celular e nascimento, sem sair do evento) ou escolhe entre quem já está em Usuários. Sem <form>: está
// dentro do formulário do evento, então o Enter dos campos convida.
function GuestBox({dates, onDone, onCancel}: {dates: () => string[]; onDone: (email: string) => void; onCancel: () => void}){
  const g = useGroups(), appAdmin = useAuth(s => s.admin);
  const [email, setEmail] = useState(""), [name, setName] = useState(""), [phone, setPhone] = useState(""), [birthday, setBirthday] = useState(""), [busy, setBusy] = useState(false), check = useEmailCheck(email);
  const [allowed, setAllowed] = useState<Allowed[] | null>(null);
  useEffect(() => { if(appAdmin) listAllowed().then(r => setAllowed(a => r || a || [])); }, [appAdmin]);
  // Quem já tem acesso e ainda não é do grupo (nem convidado vigente).
  const outside = (allowed || []).filter(a => !g.members.some(m => m.email === a.email));
  const pick = (v: string) => { const a = outside.find(x => x.email === v); if(a){ setEmail(a.email); setName(a.profileName || a.name); setPhone(a.profilePhone || a.phone); setBirthday(a.profileBirthday || a.birthday || ""); } };
  const invite = async () => {
    if(busy) return;
    const v = email.trim().toLowerCase(), when = dates();
    if(!validEmail(v)){ check.fail(); document.getElementById("guest-email")?.focus(); return; }
    if(!when.length) return toast(t("group.needDate"));
    setBusy(true);
    const res = await addGuest(g.gid, v, "", name, phone, birthday, when).finally(() => setBusy(false));
    if(res === "ok"){ toast(t("group.guestAdded", {email: v})); return onDone(v); }
    toast(t(res === "unregistered" ? "group.notRegistered" : "profile.saveFail"), res === "fail" ? {label: t("common.retry"), run: invite} : undefined);
  };
  return <div className="people-add-box guest-box" onKeyDown={e => { if(e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT"){ e.preventDefault(); invite(); } }}>
    <p className="sub">{t("group.guestHelp")}</p>
    {appAdmin && (allowed === null ? <Select id="guest-pick" aria={t("auth.loading")} disabled value="" onChange={() => {}} options={[{value: "", label: t("auth.loading")}]}/>
      : outside.length > 0 && <Select id="guest-pick" aria={t("group.pickUser")} value={outside.some(a => a.email === email) ? email : ""} onChange={pick}
        options={[{value: "", label: t("group.pickUser")}, ...outside.map(a => ({value: a.email, label: a.profileName || a.name || a.email, sub: (a.profileName || a.name) ? a.email : undefined}))]}/>)}
    <div className="people-add"><PersonFields idp="guest" name={name} onName={setName} email={email} onEmail={setEmail} check={check}
      {...(appAdmin ? {phone, onPhone: setPhone, birthday, onBirthday: setBirthday} : {})}/></div>
    <small className="sub">{t(appAdmin ? "group.guestAdminHelp" : "group.inviteHelp")}</small>
    <div className="member-roles-foot">
      <button type="button" className="btn ghost" onClick={onCancel}>{t("common.cancel")}</button>
      <button type="button" className="btn primary" aria-busy={busy} disabled={busy} onClick={invite}>{busy ? <Spin/> : <Icon name="plus" sm/>} {t("group.inviteGuestGo")}</button>
    </div>
  </div>;
}
