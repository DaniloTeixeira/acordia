// Barra deslizante: o CSS pinta o trecho até a bolinha com o gradiente do logo e precisa saber
// quanto já foi preenchido (--f, de 0 a 1).
import { forwardRef, type CSSProperties, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {value: number; min: number; max: number};
export const Range = forwardRef<HTMLInputElement, Props>(function Range({value, min, max, style, ...rest}, ref){
  const f = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  return <input ref={ref} type="range" value={value} min={min} max={max} style={{...style, "--f": f} as CSSProperties} {...rest}/>;
});
