// Grupos na nuvem (Supabase): membros, repertórios compartilhados, agenda com escala, presença nos
// ensaios e datas em que cada um não pode. As regras de quem vê e muda o quê ficam no banco
// (supabase/migrations/20261017180000_grupos.sql). A última leitura fica guardada no aparelho para a
// agenda abrir sem internet; mudar precisa de internet.
import { create } from "zustand";
import { cloud, useAuth, validBirthday, cleanPhone, uploadPhoto, cleanPhotos } from "./cloud";
import { ROLES_MAX } from "./roles";
import type { GEvent, RosterRow, AttendanceRow, Unavail, Answer, Presence, EventKind } from "./calendar";

// photo: link da foto do grupo (vazio: o app mostra as iniciais do nome). photo_round: marca redonda em vez
// de quadrada (foto e iniciais).
export interface Group { id: string; name: string; photo?: string; photo_round?: boolean }
// out_since/out_need: marcado pelo líder como fora dos cultos (desde quando e quantos ensaios faltam).
export interface Member { email: string; is_admin: boolean; role: string; name: string; birthday?: string | null; photo?: string; phone?: string; out_since?: string | null; out_need?: number; created_at?: string }
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

// ---------- leitura ----------
// Eventos de até 6 meses atrás (frequência) até 1 ano à frente.
const PAST_DAYS = 183, FUTURE_DAYS = 366;
let loading: Promise<void> | null = null;
export function loadGroups(gid?: string): Promise<void> {
  if(useAuth.getState().status !== "in") return Promise.resolve();
  if(!useGroups.getState().loaded) loadCache();
  if(loading && !gid) return loading;
  useGroups.setState({loading: true});
  loading = (async () => {
    try{
      // Banco ainda sem a foto do grupo ou o formato (antes das migrações subirem): lê sem eles.
      const g = await cloud.from("groups").select("id,name,photo,photo_round").order("name")
        .then(r => r.error ? cloud.from("groups").select("id,name,photo").order("name") : r)
        .then(r => r.error ? cloud.from("groups").select("id,name").order("name") : r);
      if(g.error) throw g.error;
      const groups = g.data as Group[];
      const want = gid || useGroups.getState().gid, cur = groups.find(x => x.id === want) ? want : groups[0]?.id || "";
      if(!cur){ useGroups.setState({...EMPTY, groups, loaded: true}); saveCache(); return; }
      const from = new Date(Date.now() - PAST_DAYS * 864e5).toISOString(), to = new Date(Date.now() + FUTURE_DAYS * 864e5).toISOString();
      const [mem, people, sets, evs, un] = await Promise.all([
        // Banco ainda sem a marcação de fora dos cultos (antes da migração subir): lê sem ela.
        cloud.from("group_members").select("email,is_admin,role,out_since,out_need,created_at").eq("group_id", cur).order("email")
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
        const [r, a] = await Promise.all([
          cloud.from("event_roster").select("event_id,email,role,status,reason").in("event_id", part),
          cloud.from("event_attendance").select("event_id,email,status,by_admin").in("event_id", part),
        ]);
        if(r.error) throw r.error; if(a.error) throw a.error;
        roster = roster.concat(r.data as RosterRow[]); attendance = attendance.concat(a.data as AttendanceRow[]);
      }
      const people_ = new Map((people.data as {email: string; name: string; birthday: string | null; photo?: string; phone?: string}[]).map(p => [p.email, p]));
      const members = (mem.data as Omit<Member, "name">[]).map(m => ({...m, name: people_.get(m.email)?.name || "", birthday: people_.get(m.email)?.birthday || null,
        photo: people_.get(m.email)?.photo || "", phone: people_.get(m.email)?.phone || ""}));
      useGroups.setState({groups, gid: cur, members, setlists: sets.data as GroupSetlist[], events: evs.data as GEvent[], roster, attendance,
        unavail: un.data as Unavail[], loading: false, error: false, loaded: true});
      saveCache();
    }catch(e){
      useGroups.setState({loading: false, error: true});
    }finally{ loading = null; }
  })();
  return loading;
}
export function chooseGroup(gid: string){ useGroups.setState({gid}); return loadGroups(gid); }

// Nome para mostrar: o do perfil, senão a parte do e-mail antes do @.
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
  if(ok){ useGroups.setState({gid: ""}); await loadGroups(); }
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
// Fora dos cultos pela regra dos ensaios, marcado à mão: conta a volta a partir de agora. need 0 tira a marcação.
export const setMemberOut = (gid: string, email: string, need: number) => run(() => cloud.from("group_members")
  .update(need > 0 ? {out_since: new Date().toISOString(), out_need: need} : {out_since: null}).eq("group_id", gid).eq("email", email));
export const outMark = (m?: Pick<Member, "out_since" | "out_need">) => m?.out_since ? {since: m.out_since, need: m.out_need || 4} : null;
export const removeMember = (gid: string, email: string) => run(() => cloud.from("group_members").delete().eq("group_id", gid).eq("email", email));


export interface EventInput { kind: EventKind; title: string; starts_at: string; call_at: string | null; place: string; notes: string; setlist_id: string | null }
export interface RosterInput { email: string; role: string }
// Grava o evento e a escala. Quem continua escalado na mesma função mantém a resposta que já deu.
// dates: com mais de uma, cria um evento igual em cada data (evento repetido).
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
      const fresh = unique.filter(r => !old.some(o => o.email === r.email && o.role === r.role)).map(r => ({event_id: eid, email: r.email, role: r.role}));
      if(fresh.length){ const {error} = await cloud.from("event_roster").insert(fresh); if(error) return false; }
    }
    await loadGroups(gid);
    return true;
  }catch(e){ return false; }
}
export const deleteEvent = (id: string) => run(() => cloud.from("group_events").delete().eq("id", id));
export const respond = (eventId: string, answer: Answer, reason = "") => run(() => cloud.rpc("respond_event", {eid: eventId, answer, why: reason}));
export const checkIn = (eventId: string, on: boolean) => run(() => cloud.rpc("check_in", {eid: eventId, on_: on}));
// Chamada feita pelo admin; null tira a marcação.
export const markAttendance = (eventId: string, email: string, status: Presence | null) => status
  ? run(() => cloud.from("event_attendance").upsert({event_id: eventId, email, status, by_admin: true, marked_at: new Date().toISOString()}))
  : run(() => cloud.from("event_attendance").delete().eq("event_id", eventId).eq("email", email));
export const setUnavailable = (day: string, on: boolean, note = "") => on
  ? run(() => cloud.from("unavailable").upsert({email: myEmail(), day, note: note.slice(0, 120)}))
  : run(() => cloud.from("unavailable").delete().eq("email", myEmail()).eq("day", day));
