// Aviso de quem entrou no grupo. Regra pura (sem rede): quais entradas a pessoa ainda não viu.
export interface JoinNotice { email: string; created_at: string; by_email?: string }

// Só vale o que entrou depois da última vez que a pessoa viu (e depois de ela mesma entrar no grupo), até 14
// dias atrás; a própria entrada dela e o que ela mesma adicionou não contam. Do mais antigo para o mais novo, sem repetir pessoa.
export function unseenJoins(rows: JoinNotice[], me: string, seen: string, mine: string | undefined, now = Date.now()): string[] {
  const floor = Math.max(Date.parse(seen) || 0, Date.parse(mine || "") || 0, now - 14 * 864e5);
  const out: string[] = [];
  for(const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))){
    if(r.email === me || r.by_email === me || !(Date.parse(r.created_at) > floor) || out.includes(r.email)) continue;
    out.push(r.email);
  }
  return out;
}
