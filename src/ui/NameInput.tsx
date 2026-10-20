// Campo de nome com a primeira letra maiúscula ("danilo" → "Danilo"), sem pular o cursor (ver MaskInput).
import type { InputHTMLAttributes } from "react";
import { capFirst } from "../lib/calendar";
import { MaskInput } from "./MaskInput";

export function NameInput({value, onValue, ...rest}: {value: string; onValue: (v: string) => void} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">){
  return <MaskInput {...rest} value={value} onValue={onValue} mask={capFirst} sig={/[\s\S]/}/>;
}
