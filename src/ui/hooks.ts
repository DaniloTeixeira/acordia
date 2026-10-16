import { useEffect, useState } from "react";

// Valor de um campo de texto ligado a um dado que muda fora (outro lugar editou a mesma música):
// guarda o que a pessoa digita localmente e acompanha mudanças externas.
export function useSynced(value: string): [string, (v: string) => void] {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return [v, setV];
}
