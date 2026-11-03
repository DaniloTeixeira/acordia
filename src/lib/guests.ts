// Convidado de um evento: membro temporário do grupo (group_members.guest_until). O banco deixa de tratar a pessoa
// como membro depois do prazo (is_member); aqui ficam a regra do prazo e o filtro das listas.

// O prazo é o início do evento mais 12 h, a mesma janela da chamada dos ensaios.
export const GUEST_GRACE_MS = 12 * 3600 * 1000;

// Prazo de quem é convidado para estes eventos: o último deles (evento repetido) mais a folga.
export const guestUntil = (starts: string[]) => new Date(Math.max(...starts.map(s => new Date(s).getTime())) + GUEST_GRACE_MS).toISOString();

// Convidado que já passou do prazo: sai das listas (escalar, chamada, membros), mas o histórico guarda.
export const guestGone = (m: {guest_until?: string | null}, now = Date.now()) => !!m.guest_until && new Date(m.guest_until).getTime() <= now;
export const isGuest = (m: {guest_until?: string | null}) => !!m.guest_until;

// Separa quem ainda é do grupo de quem era convidado e já saiu.
export function splitGuests<T extends {guest_until?: string | null}>(list: T[], now = Date.now()){
  return {current: list.filter(m => !guestGone(m, now)), gone: list.filter(m => guestGone(m, now))};
}

// Prazo que o evento pede, se for além do que a pessoa já tem (senão null: nada a estender).
export const extendedUntil = (current: string | null | undefined, wanted: string) => current && new Date(wanted) > new Date(current) ? wanted : null;

// Dia do último evento do convidado (o prazo menos a folga), para mostrar "Convidado · 10 de nov.".
export const guestDay = (m: {guest_until?: string | null}) => m.guest_until ? new Date(new Date(m.guest_until).getTime() - GUEST_GRACE_MS) : null;
