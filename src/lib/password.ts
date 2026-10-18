// Requisitos da senha nova. Devem combinar com o Supabase (Authentication → Sign In / Providers →
// Email: "Minimum password length" e "Password requirements"). Se o Supabase passar a exigir mais,
// a resposta dele diz o quê (fromError) e a tela passa a mostrar também.
export type PwRule = "length" | "letter" | "lower" | "upper" | "digit" | "symbol";
export const MIN_PASSWORD = 8;
export const PASSWORD_RULES: PwRule[] = ["length", "lower", "upper", "digit", "symbol"];
export interface PwPolicy { rules: PwRule[]; min: number }
export const DEFAULT_POLICY: PwPolicy = {rules: PASSWORD_RULES, min: MIN_PASSWORD};

const TESTS: Record<PwRule, (pw: string, min: number) => boolean> = {
  length: (pw, min) => pw.length >= min,
  letter: pw => /[A-Za-z]/.test(pw),
  lower: pw => /[a-z]/.test(pw),
  upper: pw => /[A-Z]/.test(pw),
  digit: pw => /\d/.test(pw),
  // Os mesmos símbolos que o Supabase aceita (letra com acento, como ç ou é, não conta).
  symbol: pw => /[!@#$%^&*()_+\-=[\]{};'\:"|<>?,./`~]/.test(pw)
};
export const passes = (rule: PwRule, pw: string, min = MIN_PASSWORD) => TESTS[rule](pw, min);
export const missing = (p: PwPolicy, pw: string) => p.rules.filter(r => !TESTS[r](pw, p.min));

// Mensagens do Supabase: "Password should be at least 10 characters." e "Password should contain at
// least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#...".
// Na opção "letras e números", minúsculas e maiúsculas vêm juntas (qualquer letra serve).
export function fromError(msg: string, base: PwPolicy = DEFAULT_POLICY): PwPolicy {
  const rules = new Set(base.rules); let min = base.min;
  const n = /at least (\d+) characters/i.exec(msg);
  if(n){ rules.add("length"); min = Math.max(min, +n[1]); }
  const lower = "abcdefghijklmnopqrstuvwxyz", upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if(msg.includes(lower + upper)) rules.add("letter");
  else { if(msg.includes(lower)) rules.add("lower"); if(msg.includes(upper)) rules.add("upper"); }
  if(msg.includes("0123456789")) rules.add("digit");
  if(/[!@#$%^&*]{3,}/.test(msg)) rules.add("symbol");
  const order: PwRule[] = ["length", "letter", "lower", "upper", "digit", "symbol"];
  return {rules: order.filter(r => rules.has(r)), min};
}
// Senha que aparece em vazamentos conhecidos (proteção que o Supabase pode ligar).
export const isPwned = (msg: string) => /pwned|leaked|compromised|known to be weak|easy to guess/i.test(msg);

// E-mail na tela de entrar e nas listas de acesso: nome@dominio.algo, com pelo menos duas letras no fim (pega
// "nome@gmail" e "nome@gmail.c").
export const validEmail = (e: string) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i.test(e.trim());
