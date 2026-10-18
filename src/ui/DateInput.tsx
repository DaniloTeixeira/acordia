// Campo de data no idioma do app. O <input type="date"> nativo segue o idioma do navegador
// (mm/dd/aaaa num navegador em inglês, mesmo com o app em português), então aqui o botão mostra a data
// formatada no idioma do app e abre um calendário em popover. O valor continua "AAAA-MM-DD" ("" = vazio).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t, locale } from "../lib/i18n";
import { monthGrid, dayKey } from "../lib/calendar";
import { Icon } from "./Icon";
import { placeNear, toggler } from "./popover";

const parse = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) : null;

// onChange recebe o botão junto, para quem quer marcar o campo como salvo (flashSaved).
export function DateInput({value, onChange, id, className = "", aria, max, disabled, clearable}: {
  value: string; onChange: (v: string, el: HTMLElement) => void; id?: string; className?: string; aria?: string;
  max?: string; disabled?: boolean; clearable?: boolean;
}){
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
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
    placeNear(p, b, 280);
    requestAnimationFrame(() => p.querySelector<HTMLElement>(".dp-day.on, .dp-day.today, .dp-day:not(:disabled)")?.focus({preventScroll: true}));
  };
  useEffect(() => {
    const p = pop.current; if(!p) return;
    const onToggle = (e: Event) => { if((e as ToggleEvent).newState === "closed") setOpen(false); };
    p.addEventListener("toggle", onToggle); return () => p.removeEventListener("toggle", onToggle);
  }, [host]);
  const [tg] = useState(() => toggler(() => pop.current, show));
  const pick = (v: string) => { pop.current?.hidePopover(); btn.current?.focus(); if(v !== value && btn.current) onChange(v, btn.current); };
  const go = (n: number) => setView(({y, m}) => { const d = new Date(y, m + n, 1); return {y: d.getFullYear(), m: d.getMonth()}; });
  // Anos para escolher: até 100 anos para trás (aniversários) e alguns para a frente, sem passar do máximo.
  const maxD = max ? parse(max) : null, lastY = maxD ? maxD.getFullYear() : now.getFullYear() + 5;
  const years = Array.from({length: lastY - (now.getFullYear() - 100) + 1}, (_, i) => lastY - i);
  if(!years.includes(view.y)) years.push(view.y);
  const months = Array.from({length: 12}, (_, i) => new Intl.DateTimeFormat(locale(), {month: "long"}).format(new Date(2000, i, 1)));
  // Domingo primeiro, como a grade do mês (monthGrid).
  const week = Array.from({length: 7}, (_, i) => new Intl.DateTimeFormat(locale(), {weekday: "narrow"}).format(new Date(2026, 2, 1 + i)));
  const label = cur ? new Intl.DateTimeFormat(locale(), {day: "2-digit", month: "2-digit", year: "numeric"}).format(cur) : "";
  const todayKey = dayKey(now);
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
    <button type="button" ref={btn} id={id} className={"input select-btn date-btn " + className} aria-haspopup="dialog" aria-expanded={open}
      aria-label={aria ? aria + (label ? ": " + label : "") : undefined} disabled={disabled} onPointerDown={tg.onPointerDown} onClick={tg.onClick}>
      <span className={"select-label" + (label ? "" : " placeholder")}>{label || t("date.pick")}</span><Icon name="calendar" sm/>
    </button>
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
