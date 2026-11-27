// Ferramentas: metrônomo, afinador, pad infinito e voz (medir a extensão).
import { useEffect, useRef, useState } from "react";
import { detectPitch, tuneTarget, midiName } from "../lib/tuner";
import { INSTRUMENTS, isInstrument, type InstrumentId } from "../lib/instruments";
import { t } from "../lib/i18n";
import * as store from "../lib/store";
import { useData } from "../state";
import { BackLink } from "../ui/BackLink";
import { metro } from "../metro";
import { Icon } from "../ui/Icon";
import { micFailed, micOk } from "../ui/micFailed";
import { MicHelp } from "../ui/MicHelp";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { SecHead } from "../ui/SecHead";
import { MetronomeUI } from "./Metronome";
import { PadUI } from "./Pad";
import { Voice } from "./Voice";
import { pad } from "../pad";

const { data } = store;

export function Tools(){
  useData();
  const tab = (["tuner", "pad", "voice"] as const).find(v => v === data.settings.toolsTab) || "metro";
  // Sair da página (ou trocar de aba) para o metrônomo.
  useEffect(() => () => metro.stop(), []);
  useEffect(() => { if(tab !== "metro") metro.stop(); }, [tab]);
  return <section className="view" id="view-tools" data-view="tools" aria-labelledby="tools-h">
    <BackLink id="tools-back" fallback="more"/>
    <div className="view-head"><div>
      <h1 id="tools-h">{t("tools.title")}</h1><p className="sub">{t("tools.sub")}</p></div></div>
    <Seg id="tools-tabs" className="tabs" aria={t("tools.title")} value={tab} onChange={v => store.setSetting("toolsTab", v)}
      options={[{v: "metro", label: t("tools.metro")}, {v: "tuner", label: t("tools.tuner")}, {v: "pad", label: t("tools.pad")}, {v: "voice", label: t("tools.voice")}]}/>
    <div id="tools-metro" hidden={tab !== "metro"}>{tab === "metro" && <MetronomeUI/>}</div>
    <div id="tools-tuner" hidden={tab !== "tuner"}>{tab === "tuner" && <Tuner/>}</div>
    <div id="tools-pad" hidden={tab !== "pad"}>{tab === "pad" && <PadUI/>}</div>
    <div id="tools-voice" hidden={tab !== "voice"}>{tab === "voice" && <Voice/>}</div>
  </section>;
}

// Toca a nota da corda (referência para afinar de ouvido). Som de corda dedilhada: parciais harmônicos com ataque
// seco e os agudos morrendo antes dos graves, como numa corda real. Altura exata (sem atraso inteiro de Karplus-Strong,
// que desafinaria alguns cents). Contexto próprio, fechado ao fim do som.
let mutedUntil = 0;
function playNote(midi: number, a4: number){
  // Silencia o microfone só enquanto a referência ainda soa alto (os parciais agudos somem antes do fundamental).
  mutedUntil = performance.now() + 2000;
  try{
    const C = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
    const ctx = new C(), now = ctx.currentTime, f0 = a4 * Math.pow(2, (midi - 69) / 12), out = ctx.createGain();
    ctx.resume().catch(() => {});
    out.gain.value = 0.5; out.connect(ctx.destination);
    for(let n = 1; n <= 12 && f0 * n < 6000; n++){
      const o = ctx.createOscillator(), g = ctx.createGain(), dur = 4 / (1 + (n - 1) * 0.55);
      o.type = "sine"; o.frequency.value = f0 * n;
      // Amplitude cai com o harmônico; o 2º e o 3º dão o "corpo" do violão.
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.7 / Math.pow(n, 0.9), now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
      o.connect(g); g.connect(out); o.start(now); o.stop(now + dur + 0.05);
    }
    // O parcial mais grave é o que dura mais (4 s): fecha o contexto depois dele.
    setTimeout(() => { ctx.close().catch(() => {}); }, 4300);
  }catch(e){ /* sem áudio no aparelho: a seleção da corda continua valendo */ }
}

// Instrumentos do afinador: os comuns em equipe de louvor. Ukulele e cavaquinho seguem no resto do app (acordes), e aqui usam o Cromático.
const TUNER_IDS: InstrumentId[] = ["guitar", "bass"];

interface Reading { label: string; oct: string; cents: number; ok: boolean; hz: number; string: number | null }

function Tuner(){
  useData();
  const a4 = (data.settings.a4 as number) || 440;
  // Modo próprio do afinador, que começa no Violão. Voz, sopro e teclado usam o "Cromático", que mostra a nota mais próxima.
  const mode = store.setting<string>("tunerMode", "guitar");
  const inst = TUNER_IDS.includes(mode as InstrumentId) ? (mode as InstrumentId) : "chromatic";
  const I = isInstrument(inst) ? INSTRUMENTS[inst] : null;
  const [pick, setPick] = useState<number | null>(null);
  const [on, setOn] = useState(false);
  const [r, setR] = useState<Reading | null>(null);
  const [quiet, setQuiet] = useState(false);
  const live = useRef({a4, inst, pick}); live.current = {a4, inst, pick};
  const stopRef = useRef<() => void>(() => {});
  const alive = useRef(true);
  const start = async () => {
    // O microfone ouviria o pad no lugar do instrumento.
    pad.stop();
    let stream: MediaStream;
    try{ stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}}); }
    catch(e){ return micFailed(e, start); }
    // Saiu da aba enquanto o aparelho pedia o microfone: solta sem ligar.
    if(!alive.current){ stream.getTracks().forEach(tr => tr.stop()); return; }
    micOk();
    const C = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
    const ctx = new C(); ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 4096; src.connect(an);
    const buf = new Float32Array(an.fftSize), smooth: number[] = [];
    let raf = 0, last = 0, locked = false;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(); if(now - last < 60) return; last = now;
      an.getFloatTimeDomainData(buf);
      // Enquanto toca a nota de referência, o microfone ouviria o próprio app.
      if(now < mutedUntil){ smooth.length = 0; return; }
      const f = detectPitch(buf, ctx.sampleRate);
      if(!f){ locked = false; setQuiet(true); return; }
      smooth.push(f); if(smooth.length > 5) smooth.shift();
      const fm = [...smooth].sort((x, y) => x - y)[smooth.length >> 1];
      const {a4, inst, pick} = live.current;
      const {name: label, cents, string} = tuneTarget(fm, inst, a4, pick);
      // Histerese: entra na afinação com até 5 cents e só sai com mais de 10, para o ponteiro não tremer na borda.
      locked = Math.abs(cents) <= (locked ? 10 : 5);
      setQuiet(false);
      setR({label: label.replace(/-?\d+$/, ""), oct: label.match(/-?\d+$/)?.[0] || "", cents, ok: locked, hz: fm, string});
    };
    loop(); setOn(true);
    stopRef.current = () => { cancelAnimationFrame(raf); stream.getTracks().forEach(tr => tr.stop()); ctx.close().catch(()=>{}); };
  };
  const stop = () => { stopRef.current(); stopRef.current = () => {}; setOn(false); setR(null); setQuiet(false); };
  // O microfone só liga no botão; ao sair da aba solta o aparelho (e cancela um pedido de permissão em andamento).
  useEffect(() => { alive.current = true; return () => { alive.current = false; stopRef.current(); }; }, []);
  const clamped = r ? Math.max(-50, Math.min(50, r.cents)) : 0;
  return <div className="card tuner">
    <SecHead>{t("tools.tuner")}</SecHead>
    <div className="tuner-top">
      <label className="field inst-field"><span>{t("inst.label")}</span>
        <Select id="tu-inst" value={inst} onChange={v => { store.setSetting("tunerMode", v); setPick(null); }}
          options={[...TUNER_IDS.map(id => ({value: id, label: t("inst." + id)})), {value: "chromatic", label: t("tuner.chromatic")}]}/></label>
      <label className="field a4"><span>{t("tuner.ref")}</span>
        <Select keepOrder id="tu-a4" value={String(a4)} onChange={v => store.setSetting("a4", +v)}
          options={[...new Set([432,440,442,444,a4])].sort((x, y) => x - y).map(v => ({value: String(v), label: v + " Hz" + (v === 440 ? " · " + t("tuner.default") : "")}))}/></label></div>
    <div className={"tuner-dial" + (quiet ? " quiet" : "") + (r && r.ok && !quiet ? " ok" : "")} aria-live="polite">
      <div className="tuner-note"><b id="tu-note">{r ? r.label : "—"}</b><small id="tu-oct">{r ? r.oct : ""}</small></div>
      <div className="tuner-meter"><div className="tuner-scale">{[-50,-25,0,25,50].map(v => <span key={v} style={{left: (50 + v * 0.9) + "%"}}>{v > 0 ? "+" + v : v}</span>)}</div>
        <div className="tuner-needle" id="tu-needle" style={r ? {left: (r.ok ? 50 : 50 + clamped * 0.9) + "%"} : undefined}/><div className="tuner-zone"/></div>
      <p className="tuner-cents" id="tu-cents">{!r ? (pick !== null && I ? t("tuner.idlePick", {n: midiName(I.strings[pick]).replace(/\d/, "")}) : t(I ? "tuner.idle" : "tuner.idleChromatic")) : r.ok ? t("tuner.inTune") : t(r.cents < 0 ? "tuner.low" : "tuner.high", {c: Math.abs(r.cents)}) + ` · ${r.hz.toFixed(1)} Hz`}</p>
    </div>
    {I && <div className="tuner-strings">{I.strings.map((m, i) => <button type="button" key={i} aria-pressed={pick === i}
      className={"tstring" + (pick === i || (pick === null && r && !quiet && r.string === i) ? " on" : "")} data-i={i}
      onClick={() => { setPick(i); playNote(m, a4); }}>
      <b>{midiName(m).replace(/\d/, "")}</b><small>{midiName(m).replace(/\D/g, "")}</small></button>)}</div>}
    {I && <p className="sub">{t(pick === null ? "tuner.pickHint" : "tuner.pickedHint")}</p>}
    <button className={"btn primary metro-go" + (on ? " running" : "")} id="tu-toggle" onClick={() => on ? stop() : start()}>
      {on ? <><Icon name="x" sm/> {t("tuner.stop")}</> : <><Icon name="sound" sm/> {t("tuner.start")}</>}</button>
    <MicHelp/>
    <p className="sub">{t(I ? "tuner.hint" : "tuner.hintChromatic")}</p>
    <p className="sub">{t("tuner.refHelp")}</p>
  </div>;
}
