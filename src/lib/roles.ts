// Funções de cada membro do grupo (Vocal, Violão, Teclado...). Uma pessoa pode ter várias: ficam juntas
// num texto só, separadas por vírgula (group_members.role, até 200 caracteres).
export const ROLES_MAX = 200;

// "Vocal, Violão" → ["Vocal", "Violão"], sem vazias nem repetidas (maiúsculas não contam).
export function splitRoles(s: string): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for(const r of s.split(",").map(x => x.trim().replace(/\s+/g, " ")).filter(Boolean)){
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
