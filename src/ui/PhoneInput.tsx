// Campo de celular com a máscara (11) 91234-5678, sem pular o cursor (ver MaskInput). Usar em todo campo de celular.
import type { InputHTMLAttributes } from "react";
import { maskPhone } from "../lib/calendar";
import { MaskInput } from "./MaskInput";

export function PhoneInput({value, onValue, ...rest}: {value: string; onValue: (masked: string) => void} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode">){
  return <MaskInput {...rest} type="tel" inputMode="tel" value={value} onValue={onValue} mask={maskPhone} sig={/[\d+]/} lead="("/>;
}
