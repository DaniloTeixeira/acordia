// Grupos na nuvem (Supabase): membros, repertórios compartilhados, agenda com escala, presença nos
// ensaios e datas em que cada um não pode. As regras de quem vê e muda o quê ficam no banco
// (supabase/migrations/20261017180000_grupos.sql). A última leitura fica guardada no aparelho para a
// agenda abrir sem internet; mudar precisa de internet.
import { norm } from "./util";
import { create } from "zustand";
import { cleanRange, type VoiceRange } from "./voice";
import { cloud, useAuth, validBirthday, cleanPhone, uploadPhoto, cleanPhotos } from "./cloud";
import { ROLES_MAX } from "./roles";
import { soundOnly, type GEvent, type RosterRow, type AttendanceRow, type Unavail, type Answer, type Presence, type EventKind, type OutMark } from "./calendar";

// photo: link da foto do grupo (vazio: o app mostra as iniciais do nome). photo_round: marca redonda em vez
// de quadrada (foto e iniciais).
// stats: os números do card de cada grupo no Início (próximos eventos, repertórios e membros).
export interface Group { id: string; name: string; photo?: string; photo_round?: boolean; stats?: {events: number; setlists: number; members: number} }
// out_since/out_need: marcado pelo líder como em pausa (desde quando e quantos ensaios faltam).
export interface Member { email: string; is_admin: boolean; role: string; name: string; birthday?: string | null; photo?: string; phone?: string; out_since?: string | null; out_need?: number; active?: boolean; created_at?: string; voice_low?: number | null; voice_high?: number | null }
export interface GroupSetlist { id: string; group_id: string; source_id: string; name: string; songs: number; code: string; shared_by: string; updated_at: string }

interface GroupState {
  groups: Group[]; gid: string; members: Member[]; setlists: GroupSetlist[]; events: GEvent[];
  roster: RosterRow[]; attendance: AttendanceRow[]; unavail: Unavail[];
  loading: boolean; error: boolean; loaded: boolean;
}
const EMPTY: GroupState = {groups: [], gid: "", members: [], setlists: [], events: [], roster: [], attendance: [], unavail: [], loading: false, error: false, loaded: false};
export const useGroups = create<GroupState>(() => ({...EMPTY}));

// ---------- cópia no aparelho ----------
const CACHE = "acordia-groups";
function saveCache(){
  const s = useGroups.getState(), email = useAuth.getState().email; if(!email) return;
  const {loading: _l, error: _e, ...rest} = s;
  try{ localStorage.setItem(CACHE, JSON.stringify({email, ...rest})); }catch(e){ /* sem espaço: só não guarda */ }
}
function loadCache(){
  try{
    const v = JSON.parse(localStorage.getItem(CACHE) || "null");
    if(v && v.email === useAuth.getState().email){ delete v.email; useGroups.setState({...v, loading: false, error: false}); }
  }catch(e){ /* cópia estragada: ignora */ }
}
// Ao sair da conta (ou perder o acesso), a agenda desta pessoa sai do aparelho. Enquanto a sessão
// ainda carrega ao abrir o app, a cópia fica.
useAuth.subscribe(s => {
  if(s.status !== "out" && s.status !== "denied") return;
  try{ localStorage.removeItem(CACHE); }catch(e){ /* sem armazenamento */ }
  useGroups.setState({...EMPTY});
});

export const myEmail = () => useAuth.getState().email;
export const amGroupAdmin = () => {
  const {admin} = useAuth.getState(), me = myEmail();
  return admin || useGroups.getState().members.some(m => m.email === me && m.is_admin);
};
// Pode mudar músicas e repertórios do grupo (líder ou admin do app)? Redesenha quando isso muda.
export function useCanEdit(){ useGroups(s => s.members); useAuth(s => s.admin); useAuth(s => s.email); return amGroupAdmin(); }

// ---------- leitura ----------
// Eventos de até 6 meses atrás (frequência) até 1 ano à frente.
const PAST_DAYS = 183, FUTURE_DAYS = 366;
let loading: Promise<void> | null = null;
// Leituras podem terminar fora de ordem: só a última iniciada grava no estado (senão uma leitura antiga, feita antes de
// uma marcação, desfaz na tela o que acabou de ser salvo).
let seq = 0;
export function loadGroups(gid?: string): Promise<void> {
  if(useAuth.getState().status !== "in") return Promise.resolve();
  if(!useGroups.getState().loaded) loadCache();
  if(loading && !gid) return loading;
  useGroups.setState({loading: true});
  const my = ++seq;
  const p = loading = (async () => {
    try{
      // Banco ainda sem a foto do grupo ou o formato (antes das migrações subirem): lê sem eles.
      const g = await cloud.from("groups").select("id,name,photo,photo_round").order("name")
        .then(r => r.error ? cloud.from("groups").select("id,name,photo").order("name") : r)
        .then(r => r.error ? cloud.from("groups").select("id,name").order("name") : r);
      if(g.error) throw g.error;
      const groups = g.data as Group[];
      // Os números de cada grupo para os cards do Início (só as colunas de grupo; se falhar, o card fica sem eles).
      const now = new Date().toISOString(), tally = (rows: {group_id: string}[] | null) => {
        const m = new Map<string, number>(); (rows || []).forEach(r => m.set(r.group_id, (m.get(r.group_id) || 0) + 1)); return m;
      };
      const [cm, cs, ce] = await Promise.all([
        cloud.from("group_members").select("group_id"),
        cloud.from("group_setlists").select("group_id"),
        cloud.from("group_events").select("group_id").gte("starts_at", now),
      ]);
      if(!cm.error && !cs.error && !ce.error){
        const [nm, ns, ne] = [tally(cm.data), tally(cs.data), tally(ce.data)];
        groups.forEach(x => x.stats = {members: nm.get(x.id) || 0, setlists: ns.get(x.id) || 0, events: ne.get(x.id) || 0});
      }
      const want = gid || useGroups.getState().gid, cur = groups.find(x => x.id === want) ? want : groups[0]?.id || "";
      if(!cur){ useGroups.setState({...EMPTY, groups, loaded: true}); saveCache(); return; }
      const from = new Date(Date.now() - PAST_DAYS * 864e5).toISOString(), to = new Date(Date.now() + FUTURE_DAYS * 864e5).toISOString();
      const [mem, people, sets, evs, un] = await Promise.all([
        // Banco ainda sem o ativo/inativo ou sem a marcação de em pausa (antes da migração subir): lê sem eles.
        cloud.from("group_members").select("email,is_admin,role,out_since,out_need,active,created_at").eq("group_id", cur).order("email")
          .then(r => r.error ? cloud.from("group_members").select("email,is_admin,role,out_since,out_need,created_at").eq("group_id", cur).order("email") : r)
          .then(r => r.error ? cloud.from("group_members").select("email,is_admin,role,created_at").eq("group_id", cur).order("email") : r),
        cloud.rpc("group_people", {gid: cur}),
        cloud.from("group_setlists").select("id,group_id,source_id,name,songs,code,shared_by,updated_at").eq("group_id", cur).order("updated_at", {ascending: false}),
        cloud.from("group_events").select("id,group_id,kind,title,starts_at,call_at,place,notes,setlist_id,updated_at").eq("group_id", cur).gte("starts_at", from).lte("starts_at", to).order("starts_at"),
        cloud.from("unavailable").select("email,day,note").gte("day", from.slice(0, 10)),
      ]);
      for(const r of [mem, people, sets, evs, un]) if(r.error) throw r.error;
      const ids = (evs.data as GEvent[]).map(e => e.id);
      let roster: RosterRow[] = [], attendance: AttendanceRow[] = [];
      // Em lotes, para o endereço da consulta não ficar grande demais.
      for(let i = 0; i < ids.length; i += 100){
        const part = ids.slice(i, i + 100);
        // Banco ainda sem a coluna "covered_by": lê a escala na forma antiga.
        const readRoster = async () => {
          const n = await cloud.from("event_roster").select("event_id,email,role,status,reason,cover:covered_by").in("event_id", part);
          return n.error ? cloud.from("event_roster").select("event_id,email,role,status,reason").in("event_id", part) : n;
        };
        // Banco ainda sem o pedido de mudança de presença: lê sem ele.
        const readAtt = async () => {
          const n = await cloud.from("event_attendance").select("event_id,email,status,by_admin,req_status").in("event_id", part);
          return n.error ? cloud.from("event_attendance").select("event_id,email,status,by_admin").in("event_id", part) : n;
        };
        const [r, a] = await Promise.all([readRoster(), readAtt()]);
        if(r.error) throw r.error; if(a.error) throw a.error;
        roster = roster.concat(r.data as RosterRow[]); attendance = attendance.concat(a.data as AttendanceRow[]);
      }
      // Extensão vocal de cada um (perfil). Banco ainda sem as colunas (antes da migração subir): segue sem ela.
      const emails = (mem.data as {email: string}[]).map(m => m.email);
      const vr = emails.length ? await cloud.from("profiles").select("email,voice_low,voice_high").in("email", emails) : null;
      const voices = new Map(((vr && !vr.error ? vr.data : []) as {email: string; voice_low: number | null; voice_high: number | null}[]).map(v => [v.email, cleanRange(v.voice_low, v.voice_high)]));
      const people_ = new Map((people.data as {email: string; name: string; birthday: string | null; photo?: string; phone?: string}[]).map(p => [p.email, p]));
      const members = (mem.data as Omit<Member, "name">[]).map(m => ({...m, name: people_.get(m.email)?.name || "", birthday: people_.get(m.email)?.birthday || null,
        photo: people_.get(m.email)?.photo || "", phone: people_.get(m.email)?.phone || "", voice_low: voices.get(m.email)?.low ?? null, voice_high: voices.get(m.email)?.high ?? null}));
      if(my !== seq) return;
      useGroups.setState({groups, gid: cur, members, setlists: sets.data as GroupSetlist[], events: evs.data as GEvent[], roster, attendance,
        unavail: un.data as Unavail[], loading: false, error: false, loaded: true});
      saveCache();
    }catch(e){
      if(my === seq) useGroups.setState({loading: false, error: true});
    }finally{ if(my === seq) loading = null; }
  })();
  return p;
}
// Extensão vocal (aba Voz): grava as duas pontas no perfil; o grupo vê em Membros e na escala. Atualiza a cópia
// em memória (perfil e lista de membros) para a tela refletir sem recarregar.
export async function saveVoiceRange(r: VoiceRange){
  const p = useAuth.getState().profile; if(!p) return false;
  const {error} = await cloud.from("profiles").update({voice_low: r.low, voice_high: r.high}).eq("id", p.id);
  if(error) return false;
  useAuth.setState({profile: {...p, voice_low: r.low, voice_high: r.high}});
  useGroups.setState(st => ({members: st.members.map(m => m.email === p.email ? {...m, voice_low: r.low, voice_high: r.high} : m)}));
  return true;
}
// Já existe um grupo com esse nome (sem diferenciar maiúsculas, acentos e espaços)? except: o próprio, ao renomear.
export const groupNameTaken = (name: string, except = "") => !!norm(name) && useGroups.getState().groups.some(x => x.id !== except && norm(x.name) === norm(name));
export function chooseGroup(gid: string){ useGroups.setState({gid}); return loadGroups(gid); }

// Nome para mostrar: o do perfil, senão a parte do e-mail antes do @.
// Extensão vocal de quem está no grupo aberto (vazia se não mediu).
export const voiceOf = (email: string) => { const m = useGroups.getState().members.find(x => x.email === email); return {voice_low: m?.voice_low, voice_high: m?.voice_high}; };
export function personName(email: string){
  const m = useGroups.getState().members.find(x => x.email === email);
  return m?.name || email.split("@")[0];
}
// Foto: a do perfil; a própria pessoa usa a da sessão (aparece mesmo antes de o grupo recarregar).
export function personPhoto(email: string){
  const me = useAuth.getState();
  if(email === me.email && me.profile) return me.profile.photo || "";
  return useGroups.getState().members.find(x => x.email === email)?.photo || "";
}

// ---------- mudanças ----------
// Cada uma devolve true quando deu certo e recarrega o grupo.
async function run(fn: () => PromiseLike<{error: unknown}>, reload = true){
  try{
    const {error} = await fn();
    if(error) return false;
    if(reload) await loadGroups(useGroups.getState().gid);
    return true;
  }catch(e){ return false; }
}
export async function createGroup(name: string){
  const {data, error} = await cloud.rpc("create_group", {group_name: name.trim().slice(0, 80)});
  if(error) return false;
  await loadGroups(data as string);
  return true;
}
// Foto do grupo (só admins do app; o banco recusa os demais). Sem foto, o grupo aparece com as iniciais.
const groupFolder = (gid: string) => "groups/" + gid;
const setGroupPhoto = (gid: string, v: Partial<Group>) => useGroups.setState(s => ({groups: s.groups.map(x => x.id === gid ? {...x, ...v} : x)}));
export async function saveGroupPhoto(gid: string, img: Blob, round: boolean){
  // Banco ainda sem o formato (antes da migração subir): salva só a foto, que fica no formato quadrado.
  let shaped = true;
  const photo = await uploadPhoto(groupFolder(gid), img, async url => {
    const r = await cloud.from("groups").update({photo: url, photo_round: round}).eq("id", gid);
    if(!r.error) return r;
    shaped = false;
    return cloud.from("groups").update({photo: url}).eq("id", gid);
  });
  if(photo){ setGroupPhoto(gid, {photo, photo_round: shaped && round}); saveCache(); }
  return !!photo;
}
export async function setGroupRound(gid: string, round: boolean){
  const {error} = await cloud.from("groups").update({photo_round: round}).eq("id", gid);
  if(error) return false;
  setGroupPhoto(gid, {photo_round: round}); saveCache();
  return true;
}
export async function removeGroupPhoto(gid: string){
  const {error} = await cloud.from("groups").update({photo: ""}).eq("id", gid);
  if(error) return false;
  setGroupPhoto(gid, {photo: ""}); saveCache();
  cleanPhotos(groupFolder(gid)).then(() => {}, () => {});
  return true;
}
export const renameGroup =(gid: string, name: string) => run(() => cloud.from("groups").update({name: name.trim().slice(0, 80)}).eq("id", gid));
export async function deleteGroup(gid: string){
  const ok = await run(() => cloud.from("groups").delete().eq("id", gid), false);
  // Excluir outro grupo (pelo card do Início) não troca o grupo aberto.
  if(ok){ if(useGroups.getState().gid === gid) useGroups.setState({gid: ""}); await loadGroups(); }
  return ok;
}
export const addMember = (gid: string, email: string, admin: boolean, role: string, name = "", birthday = "", phone = "") => run(async () => {
  const base = {gid, member_email: email.trim().toLowerCase(), admin, member_role: role.trim().slice(0, ROLES_MAX)};
  const info = {...base, member_name: name.trim().slice(0, 80), member_birthday: validBirthday(birthday) || null};
  let r = await cloud.rpc("add_group_member", {...info, member_phone: cleanPhone(phone)});
  // Banco ainda sem a versão com celular, ou com nome e data (antes da migração subir): adiciona com o que der.
  if(r.error) r = await cloud.rpc("add_group_member", info);
  return r.error ? cloud.rpc("add_group_member", base) : r;
});
// Passa a liderança (um líder só por grupo): quem era vira membro e a pessoa escolhida vira líder. Banco ainda
// sem set_group_leader (antes da migração subir): faz os dois passos à mão.
export const setGroupLeader = (gid: string, email: string) => run(async () => {
  const r = await cloud.rpc("set_group_leader", {gid, leader_email: email});
  if(!r.error || !/set_group_leader|function/i.test(r.error.message || "")) return r;
  const off = await cloud.from("group_members").update({is_admin: false}).eq("group_id", gid).eq("is_admin", true).neq("email", email);
  return off.error ? off : cloud.from("group_members").update({is_admin: true}).eq("group_id", gid).eq("email", email);
});
export const setMemberAdmin = (gid: string, email: string, admin: boolean) => run(() => cloud.from("group_members").update({is_admin: admin}).eq("group_id", gid).eq("email", email));
export const setMemberRole = (gid: string, email: string, role: string) => email === myEmail() && !amGroupAdmin()
  ? run(() => cloud.rpc("set_my_role", {gid, member_role: role.trim().slice(0, ROLES_MAX)}))
  : run(() => cloud.from("group_members").update({role: role.trim().slice(0, ROLES_MAX)}).eq("group_id", gid).eq("email", email));
// Em pausa pela regra dos ensaios, marcado à mão: conta a volta a partir de agora. need 0 tira a marcação.
export const setMemberOut = (gid: string, email: string, need: number) => run(() => cloud.from("group_members")
  .update(need > 0 ? {out_since: new Date().toISOString(), out_need: need} : {out_since: null}).eq("group_id", gid).eq("email", email));
export const outMark = (m?: Pick<Member, "out_since" | "out_need" | "role">): OutMark | null => m && soundOnly(m.role || "") ? {since: "", need: 0, exempt: true} : m?.out_since ? {since: m.out_since, need: m.out_need || 4} : null;
// Inativo: afastado do grupo, sem sair dele. Não aparece para escalar nem na chamada; o histórico fica.
export const isActive = (m: Pick<Member, "active">) => m.active !== false;
export const setMemberActive = (gid: string, email: string, active: boolean) => run(() => cloud.from("group_members").update({active}).eq("group_id", gid).eq("email", email));
export const removeMember = (gid: string, email: string) => run(() => cloud.from("group_members").delete().eq("group_id", gid).eq("email", email));
// E-mails que estão em algum grupo. O admin do app lê os membros de todos os grupos (is_member vale para ele); a página
// Usuários usa isto para marcar quem está sem grupo. null se falhar: aí ela não marca ninguém.
export async function listGroupedEmails(): Promise<Set<string> | null> {
  const {data, error} = await cloud.from("group_members").select("email");
  return error || !data ? null : new Set((data as {email: string}[]).map(r => r.email));
}


export interface EventInput { kind: EventKind; title: string; starts_at: string; call_at: string | null; place: string; notes: string; setlist_id: string | null }
export interface RosterInput { email: string; role: string }
// Grava o evento e a escala. Quem continua escalado na mesma função mantém a resposta que já deu.
// dates: com mais de uma, cria um evento igual em cada data (evento repetido).
// Escala ou tira uma pessoa da escala de um evento já salvo, sem mexer nas outras (roles null = tirar).
export const setOnRoster = (eventId: string, email: string, roles: string[] | null) => roles
  ? run(() => cloud.from("event_roster").insert(roles.map(role => ({event_id: eventId, email, role}))))
  : run(() => cloud.from("event_roster").delete().eq("event_id", eventId).eq("email", email));
export async function saveEvent(gid: string, id: string | null, ev: EventInput, roster: RosterInput[], dates?: {starts_at: string; call_at: string | null}[]){
  try{
    const clean = roster.filter(r => r.email).map(r => ({email: r.email, role: r.role.trim().slice(0, 40)}));
    const unique = [...new Map(clean.map(r => [r.email + "|" + r.role, r])).values()];
    const when = id || !dates?.length ? [{starts_at: ev.starts_at, call_at: ev.call_at}] : dates;
    for(const w of when){
      const row = {...ev, ...w, group_id: gid, updated_at: new Date().toISOString()};
      let eid = id;
      if(eid){ const {error} = await cloud.from("group_events").update(row).eq("id", eid); if(error) return false; }
      else { const {data, error} = await cloud.from("group_events").insert(row).select("id").single(); if(error) return false; eid = (data as {id: string}).id; }
      const old = useGroups.getState().roster.filter(r => r.event_id === eid);
      const keep = new Set(unique.map(r => r.email + "|" + r.role));
      const gone = old.filter(r => !keep.has(r.email + "|" + r.role));
      for(const r of gone){ const {error} = await cloud.from("event_roster").delete().eq("event_id", eid).eq("email", r.email).eq("role", r.role); if(error) return false; }
      // Quem continua na escala mas troca de função mantém a resposta (e quem cobre): só entra "pendente" quem é novo no evento.
      const fresh = unique.filter(r => !old.some(o => o.email === r.email && o.role === r.role)).map(r => {
        const had = old.find(o => o.email === r.email);
        return {event_id: eid, email: r.email, role: r.role, ...(had ? {status: had.status, reason: had.reason, ...(had.cover ? {covered_by: had.cover} : {})} : {})};
      });
      if(fresh.length){ const {error} = await cloud.from("event_roster").insert(fresh); if(error) return false; }
    }
    await loadGroups(gid);
    return true;
  }catch(e){ return false; }
}
export const deleteEvent = (id: string) => run(() => cloud.from("group_events").delete().eq("id", id));
export const respond = (eventId: string, answer: Answer, reason = "") => run(() => cloud.rpc("respond_event", {eid: eventId, answer, why: reason}));
// Quem disse "não posso" indica quem cobre a vaga (vazio tira a indicação).
export const setCover = (eventId: string, email: string) => run(() => cloud.rpc("set_event_cover", {eid: eventId, cover: email}));
export const checkIn = (eventId: string, on: boolean) => run(() => cloud.rpc("check_in", {eid: eventId, on_: on}));
// A própria presença ou falta (null volta a "sem marcação"). Banco sem a função nova: presente e desfazer ainda
// funcionam pelo check_in; marcar falta só existe com a migração.
export async function setMyAttendance(eventId: string, status: "present" | "absent" | null){
  if(await run(() => cloud.rpc("set_my_attendance", {eid: eventId, st: status || ""}))) return true;
  return status === "absent" ? false : checkIn(eventId, status === "present");
}
// Chamada feita pelo admin; null tira a marcação. Marcar de novo encerra o pedido de mudança que a pessoa tinha feito.
// Banco sem as colunas do pedido: grava sem elas.
export const markAttendance = (eventId: string, email: string, status: Presence | null) => status
  ? run(async () => {
    const row = {event_id: eventId, email, status, by_admin: true, marked_at: new Date().toISOString()};
    const r = await cloud.from("event_attendance").upsert({...row, req_status: null, req_at: null});
    return r.error ? cloud.from("event_attendance").upsert(row) : r;
  })
  : run(() => cloud.from("event_attendance").delete().eq("event_id", eventId).eq("email", email));
// Presença marcada pelo líder: a pessoa não troca direto, pede a mudança (null cancela o pedido).
export const requestAttendanceChange = (eventId: string, status: "present" | "absent" | null) => run(() => cloud.rpc("request_attendance_change", {eid: eventId, st: status || ""}));
// O líder recusa o pedido e a marcação dele fica como está.
export const declineAttendanceChange = (eventId: string, email: string) => run(() => cloud.from("event_attendance").update({req_status: null, req_at: null}).eq("event_id", eventId).eq("email", email));
export const setUnavailable = (day: string, on: boolean, note = "") => on
  ? run(() => cloud.from("unavailable").upsert({email: myEmail(), day, note: note.slice(0, 120)}))
  : run(() => cloud.from("unavailable").delete().eq("email", myEmail()).eq("day", day));
