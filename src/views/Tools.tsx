// Ferramentas: metrônomo e afinador.
import { useEffect, useRef, useState } from "react";
import { detectPitch, noteFromFreq, nearestString, midiName } from "../lib/tuner";
import { INSTRUMENTS, isInstrument } from "../lib/instruments";
import { t } from "../lib/i18n";
import * as store from "../lib/store";
import { useData, toast } from "../state";
import { metro } from "../metro";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { MetronomeUI } from "./Metronome";
import { InstrumentSelect } from "./InstrumentSelect";
import { HelpButton } from "./Repertoire";

const { data } = store;

export function Tools(){
  useData();
  const tab = data.settings.toolsTab === "tuner" ? "tuner" : "metro";
  // Sair da página (ou trocar de aba) para o metrônomo.
  useEffect(() => () => metro.stop(), []);
  useEffect(() => { if(tab === "tuner") metro.stop(); }, [tab]);
  return <section className="view" id="view-tools" data-view="tools" aria-labelledby="tools-h">
    <div className="view-head"><div><h1 id="tools-h">{t("tools.title")}</h1><p className="sub">{t("tools.sub")}</p></div><div className="actions"><HelpButton page="tools"/></div></div>
    <Seg id="tools-tabs" aria={t("tools.title")} value={tab} onChange={v => store.setSetting("toolsTab", v)}
      options={[{v: "metro", label: t("tools.metro")}, {v: "tuner", label: t("tools.tuner")}]}/>
    <div id="tools-metro" hidden={tab !== "metro"}>{tab === "metro" && <MetronomeUI/>}</div>
    <div id="tools-tuner" hidden={tab !== "tuner"}>{tab === "tuner" && <Tuner/>}</div>
  </section>;
}

interface Reading { label: string; oct: string; cents: number; ok: boolean; hz: number; string: number | null }

function Tuner(){
  useData();
  const a4 = (data.settings.a4 as number) || 440;
  const inst = (data.settings.instrument as string) || "guitar";
  const I = INSTRUMENTS[isInstrument(inst) ? inst : "guitar"];
  const [on, setOn] = useState(false);
  const [r, setR] = useState<Reading | null>(null);
  const [quiet, setQuiet] = useState(false);
  const live = useRef({a4, inst}); live.current = {a4, inst};
  const stopRef = useRef<() => void>(() => {});
  const stop = () => { stopRef.current(); stopRef.current = () => {}; setOn(false); };
  const start = async () => {
    let stream: MediaStream;
    try{ stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}}); }
    catch(e){ return toast(t("tuner.denied")); }
    const C = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
    const ctx = new C(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 4096; src.connect(an);
    const buf = new Float32Array(an.fftSize), smooth: number[] = [];
    let raf = 0, last = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(); if(now - last < 60) return; last = now;
      an.getFloatTimeDomainData(buf);
      const f = detectPitch(buf, ctx.sampleRate);
      if(!f){ setQuiet(true); return; }
      smooth.push(f); if(smooth.length > 5) smooth.shift();
      const fm = [...smooth].sort((x, y) => x - y)[smooth.length >> 1];
      const {a4, inst} = live.current;
      const n = noteFromFreq(fm, a4), s = nearestString(fm, inst, a4);
      const near = s && Math.abs(s.cents) <= 150;
      const cents = near ? s!.cents : n.cents, label = near ? s!.name : n.name + n.octave;
      setQuiet(false);
      setR({label: label.replace(/-?\d+$/, ""), oct: label.match(/-?\d+$/)?.[0] || "", cents, ok: Math.abs(cents) <= 5, hz: fm, string: near ? s!.index : null});
    };
    loop(); setOn(true);
    stopRef.current = () => { cancelAnimationFrame(raf); stream.getTracks().forEach(tr => tr.stop()); ctx.close().catch(()=>{}); };
  };
  useEffect(() => () => stopRef.current(), []);
  const clamped = r ? Math.max(-50, Math.min(50, r.cents)) : 0;
  return <div className="card tuner">
    <div className="tuner-top"><InstrumentSelect/>
      <label className="field a4" title={t("tuner.refHelp")}><span>{t("tuner.ref")}</span>
        <Select id="tu-a4" value={String(a4)} onChange={v => store.setSetting("a4", +v)}
          options={[432,436,438,440,442,444,446].map(v => ({value: String(v), label: v + " Hz" + (v === 440 ? " · " + t("tuner.default") : "")}))}/></label></div>
    <div className={"tuner-dial" + (quiet ? " quiet" : "") + (r && r.ok && !quiet ? " ok" : "")} aria-live="polite">
      <div className="tuner-note"><b id="tu-note">{r ? r.label : "—"}</b><small id="tu-oct">{r ? r.oct : ""}</small></div>
      <div className="tuner-meter"><div className="tuner-scale">{[-50,-25,0,25,50].map(v => <span key={v} style={{left: (50 + v * 0.9) + "%"}}>{v > 0 ? "+" + v : v}</span>)}</div>
        <div className="tuner-needle" id="tu-needle" style={r ? {left: (50 + clamped * 0.9) + "%"} : undefined}/><div className="tuner-zone"/></div>
      <p className="tuner-cents" id="tu-cents">{!r ? t("tuner.idle") : r.ok ? t("tuner.inTune") : t(r.cents < 0 ? "tuner.low" : "tuner.high", {c: Math.abs(r.cents)}) + ` · ${r.hz.toFixed(1)} Hz`}</p>
    </div>
    {I.kind === "strings" && <div className="tuner-strings">{I.strings.map((m, i) => <span key={i} className={"tstring" + (r && !quiet && r.string === i ? " on" : "")} data-i={i}>
      <b>{midiName(m).replace(/\d/, "")}</b><small>{midiName(m).replace(/\D/g, "")}</small></span>)}</div>}
    <button className={"btn primary metro-go" + (on ? " running" : "")} id="tu-toggle" onClick={() => on ? stop() : start()}>
      {on ? <><Icon name="x" sm/> {t("tuner.stop")}</> : <><Icon name="sound" sm/> {t("tuner.start")}</>}</button>
    <p className="sub">{t("tuner.hint")}</p>
    <p className="sub">{t("tuner.refHelp")}</p>
  </div>;
}
