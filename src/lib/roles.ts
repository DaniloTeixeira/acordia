import { SOUND_ONLY } from "./calendar";

// Funções de cada membro do grupo (Vocal, Violão, Teclado...). Uma pessoa pode ter várias: ficam juntas
// num texto só, separadas por vírgula (group_members.role, até 200 caracteres).
export const ROLES_MAX = 200;

// "Vocal, Violão" → ["Vocal", "Violão"], sem vazias nem repetidas (maiúsculas não contam).
export function splitRoles(s: string): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for(const r of s.split(",").map(x => x.trim().replace(/\*+$/, "").trim().replace(/\s+/g, " ")).filter(Boolean)){
    const k = r.toLocaleLowerCase();
    if(!seen.has(k)){ seen.add(k); out.push(r.slice(0, 40)); }
  }
  return out;
}
// Junta de volta; as que não cabem no limite ficam de fora.
export function joinRoles(roles: string[]): string {
  let out = "";
  for(const r of splitRoles(roles.join(","))){
    const next = out ? out + ", " + r : r;
    if(next.length > ROLES_MAX) break;
    out = next;
  }
  return out;
}
// Em ordem alfabética para mostrar ("Baixo, Teclado, Vocal"), sem diferenciar maiúsculas nem acentos.
// O que fica guardado mantém a ordem em que foram marcadas (a primeira é a sugerida na escala).
export function sortRoles(roles: string[]): string[] {
  return [...roles].sort((a, b) => a.localeCompare(b, undefined, {sensitivity: "base"}));
}
// Liga ou desliga uma função na lista.
export function toggleRole(roles: string[], role: string): string[] {
  const k = role.trim().toLocaleLowerCase();
  return roles.some(r => r.toLocaleLowerCase() === k) ? roles.filter(r => r.toLocaleLowerCase() !== k) : [...roles, role.trim()];
}
// Favoritas: as funções que já vêm marcadas ao escalar a pessoa. Ficam no mesmo texto, com "*" depois do nome
// ("Vocal*, Violão*, Baixo"). Sem nenhum "*" vale a primeira (como era antes). No máximo duas, e sempre uma voz
// e um instrumento: nunca dois instrumentos (nem duas vozes) e nunca Mesa de som com outra coisa (mesa é só mesa).
const VOICE = ["vocal", "vocals", "voz", "vozes", "voice", "voices", "vocalista", "back vocal", "backing vocal", "backing vocals", "backvocal"];
export const isSoundRole = (r: string) => SOUND_ONLY.includes(r.trim().replace(/\*+$/, "").toLocaleLowerCase());
export const isVoiceRole = (r: string) => VOICE.includes(r.trim().replace(/\*+$/, "").toLocaleLowerCase());
const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

export interface RoleSel { roles: string[]; favs: string[] }
export const emptySel: RoleSel = {roles: [], favs: []};
// Só as favoritas que existem, uma voz e um instrumento no máximo; sem nenhuma, a primeira função.
function cleanFavs(roles: string[], favs: string[]): string[] {
  const picked = roles.filter(r => favs.some(f => same(f, r)));
  const out: string[] = [];
  if(picked.length && isSoundRole(picked[0])) out.push(picked[0]);
  else for(const r of picked) if(!isSoundRole(r) && !out.some(o => isVoiceRole(o) === isVoiceRole(r))) out.push(r);
  return out.length || !roles.length ? out : [roles[0]];
}
export function parseRoleSel(s: string): RoleSel {
  const raw = s.split(",").map(x => x.trim()).filter(Boolean);
  const roles = splitRoles(s), favs = raw.filter(x => x.endsWith("*")).map(x => x.replace(/\*+$/, "").trim());
  return {roles, favs: cleanFavs(roles, favs)};
}
// Texto para guardar. Só a primeira como favorita é o formato antigo: sem marcas.
export function selString(sel: RoleSel): string {
  const favs = cleanFavs(sel.roles, sel.favs), legacy = favs.length === 1 && sel.roles.length > 0 && same(favs[0], sel.roles[0]);
  let out = "";
  for(const r of sel.roles){
    const next = (out ? out + ", " : "") + r + (!legacy && favs.some(f => same(f, r)) ? "*" : "");
    if(next.length > ROLES_MAX) break;
    out = next;
  }
  return out;
}
export function toggleSelRole(sel: RoleSel, role: string): RoleSel {
  const roles = toggleRole(sel.roles, role);
  return {roles, favs: cleanFavs(roles, sel.favs.filter(f => roles.some(r => same(r, f))))};
}
export function addSelRole(sel: RoleSel, role: string): RoleSel {
  const roles = [...sel.roles, role];
  return {roles, favs: cleanFavs(roles, sel.favs)};
}
// Favorita ou tira de favorita. Escolher uma do mesmo tipo (voz ou instrumento) troca a que já era favorita.
export function toggleFav(sel: RoleSel, role: string): RoleSel {
  const cur = cleanFavs(sel.roles, sel.favs);
  const favs = cur.some(f => same(f, role)) ? cur.filter(f => !same(f, role))
    : isSoundRole(role) ? [role] : [...cur.filter(f => !isSoundRole(f) && isVoiceRole(f) !== isVoiceRole(role)), role];
  return {roles: sel.roles, favs: cleanFavs(sel.roles, favs)};
}
// Funções com que a pessoa entra numa escala por atalho: as favoritas, ou uma linha sem função.
export function rosterRoles(s: string): string[] {
  const {roles, favs} = parseRoleSel(s);
  return roles.length ? favs : [""];
}
