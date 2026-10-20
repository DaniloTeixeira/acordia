// Campo de texto que reescreve o que é digitado (máscara de celular, de data, primeira letra maiúscula) sem
// jogar o cursor para o fim ao editar no meio. O valor controlado é reescrito e o navegador perderia a posição;
// aqui ela é recolocada contando quantos caracteres "que importam" (sig) havia antes do cursor.
// Usar em todo campo que transforma o texto digitado, em vez de <input onChange={e => set(transforma(...))}>.
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type InputHTMLAttributes } from "react";

export type MaskInputProps = {value: string; onValue: (masked: string) => void; mask: (raw: string) => string; sig: RegExp}
  & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;

const count = (s: string, sig: RegExp) => Array.from(s).filter(c => sig.test(c)).length;
// Posição do cursor logo depois do n-ésimo caractere que importa (sem n, no começo).
function caretAt(masked: string, n: number, sig: RegExp, lead: string){
  if(n <= 0) return masked.startsWith(lead) ? lead.length : 0;
  let pos = 0, seen = 0;
  while(pos < masked.length && seen < n){ if(sig.test(masked[pos])) seen++; pos++; }
  return pos;
}

export const MaskInput = forwardRef<HTMLInputElement, MaskInputProps & {lead?: string}>(function MaskInput({value, onValue, mask, sig, lead = "", ...rest}, fwd){
  const ref = useRef<HTMLInputElement>(null), want = useRef<number | null>(null);
  useImperativeHandle(fwd, () => ref.current!);
  // O React escreve o valor no campo (e isso leva o cursor ao fim) antes deste efeito: aqui o cursor volta.
  useLayoutEffect(() => {
    const el = ref.current, pos = want.current;
    if(el && pos != null && document.activeElement === el){ try{ el.setSelectionRange(pos, pos); }catch(e){ /* tipo sem seleção */ } }
  });
  return <input {...rest} ref={ref} value={value} onChange={e => {
    const el = e.currentTarget, raw = el.value;
    let n = count(raw.slice(0, el.selectionStart ?? raw.length), sig), masked = mask(raw);
    // Apagar um separador (") ", "-", "/") não muda o valor: apaga o caractere que importa antes dele.
    if(masked === value && raw.length < value.length && n > 0){
      const s = Array.from(raw).filter(c => sig.test(c)).join("");
      masked = mask(s.slice(0, n - 1) + s.slice(n)); n--;
    }
    const pos = caretAt(masked, n, sig, lead);
    want.current = pos;
    onValue(masked);
    // Se o valor não mudou o React não redesenha: recoloca o cursor depois que ele restaurar o campo.
    queueMicrotask(() => { if(document.activeElement === el){ try{ el.setSelectionRange(pos, pos); }catch(e){ /* tipo sem seleção */ } } });
  }}/>;
});
