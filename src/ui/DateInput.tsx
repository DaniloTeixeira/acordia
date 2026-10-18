// Campo de data no idioma do app. O <input type="date"> nativo segue o idioma do navegador
// (mm/dd/aaaa num navegador em inglês, mesmo com o app em português), então aqui a data é digitada na
// ordem do idioma do app (as barras entram sozinhas) e o botão ao lado abre um calendário em popover.
// O valor continua "AAAA-MM-DD" ("" = vazio).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t, locale } from "../lib/i18n";
import { monthGrid, dayKey } from "../lib/calendar";
import { Icon } from "./Icon";
import { placeNear, toggler } from "./popover";

const parse = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) : null;
const LEN = {day: 2, month: 2, year: 4} as const;
type Part = keyof typeof LEN;
// Ordem do dia, mês e ano no idioma do app (dd/mm/aaaa em português, mm/dd/yyyy em inglês dos EUA).
const partOrder = () => new Intl.DateTimeFormat(locale(), {day: "2-digit", month: "2-digit", year: "numeric"}).formatToParts(new Date(2000, 10, 22))
  .map(p => p.type).filter((x): x is Part => x in LEN);
// Só os números digitados, com as barras nos lugares (no máximo 8 números).
function mask(text: string, order: Part[]){
  let d = text.replace(/\D/g, "").slice(0, 8), out = "";
  for(const p of order){ if(!d) break; const n = d.slice(0, LEN[p]); d = d.slice(LEN[p]); out += (out ? "/" : "") + n; }
  return out;
}
// Data completa e que existe (sem 31/02) vira "AAAA-MM-DD"; senão, "".
function read(text: string, order: Part[]){
  const nums = text.split("/"); if(nums.length !== 3 || nums.some((n, i) => n.length !== LEN[order[i]])) return "";
  const v = {day: 0, month: 0, year: 0}; order.forEach((p, i) => v[p] = +nums[i]);
  const d = new Date(v.year, v.month - 1, v.day);
  return v.year >= 1900 && d.getFullYear() === v.year && d.getMonth() === v.month - 1 && d.getDate() === v.day ? dayKey(d) : "";
}

// onChange recebe o botão junto, para quem quer marcar o campo como salvo (flashSaved).
export function DateInput({value, onChange, id, className = "", aria, max, disabled, clearable}: {
  value: string; onChange: (v: string, el: HTMLElement) => void; id?: string; className?: string; aria?: string;
  max?: string; disabled?: boolean; clearable?: boolean;
}){
  const btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLSpanElement>(null), field = useRef<HTMLInputElement>(null), pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Dentro de uma janela modal o calendário vai para dentro dela (fora, a janela deixa tudo inerte).
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setHost(btn.current?.closest("dialog") || document.body); }, []);
  const cur = parse(value), now = new Date();
  const [view, setView] = useState(() => ({y: (cur || now).getFullYear(), m: (cur || now).getMonth()}));
  const show = () => {
    const p = pop.current, b = btn.current; if(!p || !b) return;
    const d = parse(value) || (max && parse(max) && parse(max)! < now ? parse(max)! : now);
    setView({y: d.getFullYear(), m: d.getMonth()});
    setOpen(true);
    placeNear(p, box.current || b, 280);
    requestAnimationFrame(() => p.querySelector<HTMLElement>(".dp-day.on, .dp-day.today, .dp-day:not(:disabled)")?.focus({preventScroll: true}));
  };
  useEffect(() => {
    const p = pop.current; if(!p) return;
    const onToggle = (e: Event) => { if((e as ToggleEvent).newState === "closed") setOpen(false); };
    p.addEventListener("toggle", onToggle); return () => p.removeEventListener("toggle", onToggle);
  }, [host]);
  const [tg] = useState(() => toggler(() => pop.current, show));
  const pick = (v: string) => { pop.current?.hidePopover(); btn.current?.focus(); if(v !== value && field.current) onChange(v, field.current); };
  const go = (n: number) => setView(({y, m}) => { const d = new Date(y, m + n, 1); return {y: d.getFullYear(), m: d.getMonth()}; });
  // Anos para escolher: até 100 anos para trás (aniversários) e alguns para a frente, sem passar do máximo.
  const maxD = max ? parse(max) : null, lastY = maxD ? maxD.getFullYear() : now.getFullYear() + 5;
  const years = Array.from({length: lastY - (now.getFullYear() - 100) + 1}, (_, i) => lastY - i);
  if(!years.includes(view.y)) years.push(view.y);
  const months = Array.from({length: 12}, (_, i) => new Intl.DateTimeFormat(locale(), {month: "long"}).format(new Date(2000, i, 1)));
  // Domingo primeiro, como a grade do mês (monthGrid).
  const week = Array.from({length: 7}, (_, i) => new Intl.DateTimeFormat(locale(), {weekday: "narrow"}).format(new Date(2026, 2, 1 + i)));
  const order = partOrder();
  const label = cur ? mask(new Intl.DateTimeFormat(locale(), {day: "2-digit", month: "2-digit", year: "numeric"}).format(cur), order) : "";
  const todayKey = dayKey(now);
  // O texto digitado; volta à data salva quando ela muda por fora (calendário, Limpar, outra tela).
  const [text, setText] = useState(label);
  useEffect(() => setText(label), [label]);
  const letters = t("date.letters").split("|"), hint = order.map(p => letters[p === "day" ? 0 : p === "month" ? 1 : 2].repeat(LEN[p])).join("/");
  // Data completa e válida salva na hora; ao sair do campo, vazio limpa (quando pode) e incompleta volta à salva.
  const commit = (txt: string, leaving: boolean) => {
    const v = read(txt, order), el = field.current!;
    if(v && (!max || v <= max)){ if(v !== value) onChange(v, el); return; }
    if(!leaving) return;
    if(!txt && clearable){ if(value) onChange("", el); return; }
    setText(label);
  };
  // Setas andam pelos dias, PageUp/PageDown pelos meses.
  const onKey = (e: React.KeyboardEvent) => {
    const el = document.activeElement as HTMLElement | null, k = el?.dataset.day;
    const step = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7}[e.key];
    if(k && step){
      e.preventDefault();
      const d = parse(k)!; d.setDate(d.getDate() + step);
      setView({y: d.getFullYear(), m: d.getMonth()});
      requestAnimationFrame(() => pop.current?.querySelector<HTMLElement>(`[data-day="${dayKey(d)}"]`)?.focus());
    }else if(e.key === "PageUp" || e.key === "PageDown"){ e.preventDefault(); go(e.key === "PageUp" ? -1 : 1); }
  };
  return <>
    <span ref={box} className={"date-field " + className}>
      <input ref={field} id={id} className="input date-input" inputMode="numeric" autoComplete="off" placeholder={hint} maxLength={10}
        aria-label={aria} disabled={disabled} value={text}
        onChange={e => { const v = mask(e.target.value, order); setText(v); commit(v, false); }}
        onBlur={e => commit(mask(e.target.value, order), true)} onKeyDown={e => { if(e.key === "Enter"){ e.preventDefault(); commit(text, true); } }}/>
      <button type="button" ref={btn} className="icon-btn sm date-cal" aria-haspopup="dialog" aria-expanded={open} aria-label={t("date.pick")} title={t("date.pick")}
        disabled={disabled} onPointerDown={tg.onPointerDown} onClick={tg.onClick}><Icon name="calendar" sm/></button>
    </span>
    {host && createPortal(<div ref={pop} className="popover date-pop" popover="auto" role="dialog" aria-label={aria || t("date.pick")} onKeyDown={onKey}>
      <div className="dp-head">
        <button type="button" className="icon-btn sm" aria-label={t("date.prev")} onClick={() => go(-1)}><Icon name="chev" sm className="chev-left"/></button>
        <select className="dp-sel" aria-label={t("date.month")} value={view.m} onChange={e => setView(v => ({...v, m: +e.target.value}))}>
          {months.map((n, i) => <option key={i} value={i}>{n}</option>)}</select>
        <select className="dp-sel" aria-label={t("date.year")} value={view.y} onChange={e => setView(v => ({...v, y: +e.target.value}))}>
          {years.sort((a, b) => b - a).map(y => <option key={y} value={y}>{y}</option>)}</select>
        <button type="button" className="icon-btn sm" aria-label={t("date.next")} onClick={() => go(1)}><Icon name="chev" sm className="chev-right"/></button>
      </div>
      <div className="dp-grid" role="grid">
        {week.map((w, i) => <span key={"w" + i} className="dp-wd" aria-hidden="true">{w}</span>)}
        {monthGrid(view.y, view.m).flat().map((d, i) => {
          if(!d) return <span key={i}/>;
          const k = dayKey(d), off = !!max && k > max;
          return <button key={i} type="button" data-day={k} className={"dp-day" + (k === value ? " on" : "") + (k === todayKey ? " today" : "")}
            disabled={off} aria-pressed={k === value} aria-label={new Intl.DateTimeFormat(locale(), {dateStyle: "full"}).format(d)} onClick={() => pick(k)}>{d.getDate()}</button>;
        })}
      </div>
      <div className="dp-foot">
        {clearable && value ? <button type="button" className="btn ghost sm" onClick={() => pick("")}>{t("date.clear")}</button> : <span/>}
        {(!max || todayKey <= max) && <button type="button" className="btn ghost sm" onClick={() => pick(todayKey)}>{t("date.today")}</button>}
      </div>
    </div>, host)}
  </>;
}
