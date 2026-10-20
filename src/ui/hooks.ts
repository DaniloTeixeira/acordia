import { useEffect, useState, type RefObject } from "react";

// Valor de um campo de texto ligado a um dado que muda fora (outro lugar editou a mesma música):
// guarda o que a pessoa digita localmente e acompanha mudanças externas.
export function useSynced(value: string): [string, (v: string) => void] {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return [v, setV];
}

// Se a media query vale agora; redesenha quando muda (tela girou, janela mudou de largura).
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query), f = () => setOn(mq.matches);
    f(); mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [query]);
  return on;
}

// Celular em pé com o teclado (ou o braço) mais largo que a tela: vale sugerir deitar o aparelho.
// dep: o que muda o conteúdo (outro exercício, outra oitava), para medir de novo.
export function useTooWide(ref: RefObject<HTMLElement | null>, dep?: unknown): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = ref.current; if(!el) return;
    const mq = matchMedia("(orientation: portrait) and (pointer: coarse)");
    const check = () => setWide(mq.matches && el.scrollWidth > el.clientWidth + 4);
    const ro = new ResizeObserver(check); ro.observe(el);
    mq.addEventListener("change", check); check();
    return () => { ro.disconnect(); mq.removeEventListener("change", check); };
  }, [ref, dep]);
  return wide;
}
