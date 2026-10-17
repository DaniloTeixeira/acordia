// Metrônomo. `compact` é a versão do modo palco: só BPM, indicador e iniciar/parar.
import { useEffect, useRef, useState } from "react";
import { SIGNATURES, MIN_BPM, MAX_BPM, tempoName, tapTempo, type MetroState } from "../lib/metronome";
import { t } from "../lib/i18n";
import { toast } from "../state";
import { metro } from "../metro";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Range } from "../ui/Range";

function useMetro(){
  const [st, setSt] = useState<{s: MetroState; running: boolean}>({s: metro.state, running: metro.running});
  const [beat, setBeat] = useState(-1);
  useEffect(() => {
    const offC = metro.onChange((s, running) => { setSt({s, running}); if(!running) setBeat(-1); });
    const offT = metro.onTick((b, sub) => { if(!sub) setBeat(b); });
    return () => { offC(); offT(); };
  }, []);
  return {...st, beat};
}

export function MetronomeUI({compact = false}: {compact?: boolean}){
  const {s, running, beat} = useMetro();
  const taps = useRef<number[]>([]);
  const beats = (SIGNATURES[s.sig] || SIGNATURES["4/4"]).beats;
  const dots = Array.from({length: beats}, (_, i) => <i key={i} data-b={i} className={(i === beat ? "on" : "") + (i === 0 && beat >= 0 ? " first" : "")}/>);
  const start = async () => { if(!(await metro.toggle())) toast(t("study.noAudio")); };
  const tap = () => { taps.current.push(performance.now()); if(taps.current.length > 8) taps.current.shift(); const b = tapTempo(taps.current); if(b) metro.set({bpm: b}); };
  const toggleBtn = (cls: string) => <button className={cls + (running ? " running" : "")} data-m="toggle" onClick={start}>
    {running ? <><Icon name="x" sm/> {t("metro.stop")}</> : <><Icon name="play" sm/> {t("metro.start")}</>}</button>;
  // Atalhos: espaço inicia/para, setas mudam o BPM (Shift = de 10 em 10), T marca o tempo.
  useEffect(() => {
    if(compact) return;
    const key = (e: KeyboardEvent) => {
      if(e.target instanceof Element && e.target.closest("input:not([type=range]):not([type=checkbox]),textarea,select,button,dialog[open]")) return;
      if(document.querySelector("dialog[open]")) return;
      if(e.key === " "){ e.preventDefault(); start(); }
      else if(e.key === "ArrowUp" || e.key === "ArrowRight"){ e.preventDefault(); metro.set({bpm: metro.state.bpm + (e.shiftKey ? 10 : 1)}); }
      else if(e.key === "ArrowDown" || e.key === "ArrowLeft"){ e.preventDefault(); metro.set({bpm: metro.state.bpm - (e.shiftKey ? 10 : 1)}); }
      else if(e.key.toLowerCase() === "t") tap();
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [compact]);
  if(compact) return <div className="metro-mini">
    <button className="icon-btn sm" data-m="minus" aria-label={t("hands.slower")} onClick={() => metro.set({bpm: s.bpm - 2})}><Icon name="minus" sm/></button>
    <span className="mini-bpm"><b data-m="bpm">{s.bpm}</b> bpm</span>
    <button className="icon-btn sm" data-m="plus" aria-label={t("hands.faster")} onClick={() => metro.set({bpm: s.bpm + 2})}><Icon name="plus" sm/></button>
    <span className="beat-dots" data-m="dots">{dots}</span>
    {toggleBtn("btn primary sm")}
  </div>;
  return <div className="card metro">
    <div className="metro-top">
      <button className="icon-btn metro-step" data-m="minus" aria-label={t("hands.slower")} onClick={() => metro.set({bpm: s.bpm - 1})}><Icon name="minus"/></button>
      <div className="metro-read"><b data-m="bpm">{s.bpm}</b><small><span>BPM</span> · <span data-m="tempo">{tempoName(s.bpm)}</span></small></div>
      <button className="icon-btn metro-step" data-m="plus" aria-label={t("hands.faster")} onClick={() => metro.set({bpm: s.bpm + 1})}><Icon name="plus"/></button>
    </div>
    <Range data-m="range" min={MIN_BPM} max={MAX_BPM} step={1} aria-label="BPM" value={s.bpm} onChange={e => metro.set({bpm: +e.target.value})}/>
    <div className="beat-dots big" data-m="dots">{dots}</div>
    <div className="metro-opts">
      <div><span className="lbl">{t("metro.signature")}</span><Seg className="sm" value={s.sig} onChange={v => metro.set({sig: v})} options={Object.keys(SIGNATURES).map(k => ({v: k, label: k}))}/></div>
      <div><span className="lbl">{t("metro.subdivision")}</span><Seg className="sm" value={String(s.subdiv)} onChange={v => metro.set({subdiv: +v})}
        options={[1,2,3,4].map(n => ({v: String(n), label: ["♩","♫","3","4"][n-1], aria: t("metro.sub" + n), title: t("metro.sub" + n)}))}/></div>
      <label className="switch lead boxed">{t("metro.accent")}<input type="checkbox" data-m="accent" checked={s.accent} onChange={e => metro.set({accent: e.target.checked})}/></label>
    </div>
    <div className="metro-actions">
      <button className="btn ghost" data-m="tap" data-tip-key="tip.tap" onClick={tap}>{t("metro.tap")}</button>
      {toggleBtn("btn primary metro-go")}
    </div>
    <p className="sub">{t("metro.hint")}</p>
  </div>;
}
