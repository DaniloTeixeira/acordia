// Pad infinito: escolhe o tom e o estilo, toca e ajusta o volume. O som segue tocando fora desta tela.
// Ao lado, os drum pads (efeitos para soltar por cima); abaixo, o ritmo (BPM, caixa, shaker e grave) e os grooves por estilo.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { KEYS } from "../lib/core";
import { t } from "../lib/i18n";
import { toast } from "../state";
import { pad, PAD_STYLES, type PadState } from "../pad";
import { FX, FX_DUR, fire, fxVolume, setFxVolume, fxAmbience, setFxAmbience, fxEcho, setFxEcho, type FxKind } from "../padfx";
import { snare, shaker, bass, groove, snareModes, shakerModes, bassModes, snareTones, shakerTones, bassTones, GROOVES, GROOVE_STYLES, grooveStyle, setGrooveStyle, type Loop, type Patterned, type Toned } from "../loops";
import { Select } from "../ui/Select";
import { metro } from "../metro";
import { tapTempo, tempoName } from "../lib/metronome";
import { Icon } from "../ui/Icon";
import { Range } from "../ui/Range";

function usePad(){
  const [s, setS] = useState<PadState>(pad.state);
  useEffect(() => pad.onChange(setS), []);
  return s;
}

export function PadUI(){
  const s = usePad(), key = KEYS[s.pc];
  useEffect(() => { pad.preload(); }, [s.pc]);
  const fail = (ok: boolean) => { if(!ok) toast(t("pad.error")); };
  const on = s.playing || s.loading;
  return <div className="pad-layout">
  <div className="card metro pad">
    <div className="card-head"><h2>{t("pad.title")}</h2><p className="sub">{t("pad.sub")}</p></div>
    <div className="metro-read pad-read" aria-live="polite"><b>{key}</b>
      {s.loading ? <small>{t("pad.loading")}</small>
        : s.playing ? <small className="pad-playing"><Icon name="music" sm/><span>{t("pad.playing")}</span></small>
        : <small>{t("pad.idle")}</small>}</div>
    <div className="field roots-field"><span id="pad-key-h">{t("pad.key")}</span>
      <div className="roots pad-keys" role="group" aria-labelledby="pad-key-h">{KEYS.map((k, pc) =>
        <button key={k} className="root-btn" aria-pressed={pc === s.pc} onClick={() => pad.setKey(pc).then(fail)}>{k}</button>)}</div></div>
    <div className="field roots-field"><span id="pad-style-h">{t("pad.style")}</span>
      <div className="pad-styles" role="group" aria-labelledby="pad-style-h">{PAD_STYLES.map(st =>
        <button key={st} className="root-btn" aria-pressed={st === s.style} title={t("pad.style." + st + ".hint")} onClick={() => pad.setStyle(st)}>
          <b>{t("pad.style." + st)}</b><small>{t("pad.style." + st + ".hint")}</small></button>)}</div></div>
    <label className="field"><span>{t("pad.volume")}</span>
      <Range min={0} max={100} step={1} value={Math.round(s.volume * 100)} aria-label={t("pad.volume")} onChange={e => pad.setVolume(+e.target.value / 100)}/></label>
    <div className="field"><span className="pad-filter-h"><span>{t("pad.filter")}</span><small>{t("pad.filter.closed")} ↔ {t("pad.filter.open")}</small></span>
      <Range min={0} max={100} step={1} value={Math.round(s.filter * 100)} aria-label={t("pad.filter")} onChange={e => pad.setFilter(+e.target.value / 100)}/>
      <div className="pad-swell">{[4, 8].map(b => <button key={b} className={"btn ghost sm" + (s.swelling === b ? " busy" : "")} onClick={() => pad.swell(b)}>{t("pad.swell", {n: b})}</button>)}</div></div>
    <div className="metro-actions">
      <button className={"btn primary metro-go" + (on ? " running" : "")} id="pad-toggle" onClick={() => pad.toggle().then(fail)}>
        {on ? <><Icon name="stop" sm/> {t("pad.stop")}</> : <><Icon name="play" sm/> {t("pad.start")}</>}</button>
      <button className={"btn ghost" + (s.fading ? " busy" : "")} data-tip-key="pad.fade.tip" onClick={() => pad.fade().then(fail)}>
        {s.fading ? t("pad.fading") : on ? t("pad.fadeOut") : t("pad.fadeIn")}</button>
    </div>
    <p className="sub">{t("pad.hint")}</p>
  </div>
  <FxPads/>
  <Rhythm/>
  <Grooves/>
  </div>;
}

// Botão de efeito: soa no toque (sem esperar soltar) e acende pelo tempo que o som dura; tocar de novo reacende.
function FxButton({kind}: {kind: FxKind}){
  const go = (el: HTMLElement) => {
    fire(kind).then(ok => { if(!ok) toast(t("study.noAudio")); });
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  };
  return <button className="fx-pad" data-fx={kind} style={{"--d": FX_DUR[kind] + "s"} as CSSProperties}
    onPointerDown={e => { e.preventDefault(); go(e.currentTarget); }}
    onKeyDown={e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); go(e.currentTarget); } }}
    onAnimationEnd={e => e.currentTarget.classList.remove("on")}>
    <b>{t("fx." + kind)}</b><small>{t("fx." + kind + ".hint")}</small></button>;
}

function FxPads(){
  const [vol, setVol] = useState(fxVolume()), [amb, setAmb] = useState(fxAmbience()), [echo, setEcho] = useState(fxEcho());
  return <div className="card metro fx-card">
    <div className="card-head"><h2>{t("fx.title")}</h2><p className="sub">{t("fx.sub")}</p></div>
    <div className="fx-grid">{FX.map(k => <FxButton key={k} kind={k}/>)}</div>
    <label className="field"><span>{t("fx.volume")}</span>
      <Range min={0} max={100} step={1} value={Math.round(vol * 100)} aria-label={t("fx.volume")} onChange={e => { setVol(+e.target.value / 100); setFxVolume(+e.target.value / 100); }}/></label>
    <label className="field"><span>{t("fx.ambience")}</span>
      <Range min={0} max={100} step={1} value={Math.round(amb * 100)} aria-label={t("fx.ambience")} onChange={e => { setAmb(+e.target.value / 100); setFxAmbience(+e.target.value / 100); }}/></label>
    <label className="field"><span>{t("fx.echo")}</span>
      <Range min={0} max={100} step={1} value={Math.round(echo * 100)} aria-label={t("fx.echo")} onChange={e => { setEcho(+e.target.value / 100); setFxEcho(+e.target.value / 100); }}/></label>
  </div>;
}

function useLoop(loop: Loop){
  const [on, setOn] = useState(loop.on);
  useEffect(() => loop.onChange(setOn), [loop]);
  return on;
}
function useBpm(){
  const [bpm, setBpm] = useState(metro.state.bpm);
  useEffect(() => metro.onChange(s => setBpm(s.bpm)), []);
  return bpm;
}
// Um loop do ritmo: liga/desliga, quando toca (`children`) e volume.
function LoopControl({loop, name, children}: {loop: Loop; name: string; children?: ReactNode}){
  const on = useLoop(loop), [vol, setVol] = useState(loop.volume());
  return <div className="rhythm-item">
    <div className="rhythm-top"><div><b>{t("rhythm." + name)}</b><small>{t("rhythm." + name + ".hint")}</small></div>
      <button className={"btn sm " + (on ? "primary running" : "ghost")} onClick={() => loop.toggle().then(ok => { if(!ok) toast(t("study.noAudio")); })}>
        {on ? <><Icon name="stop" sm/> {t("pad.stop")}</> : <><Icon name="play" sm/> {t("rhythm.play")}</>}</button></div>
    {children}
    <label className="field"><span>{t("vol.title")}</span>
      <Range min={0} max={100} step={1} value={Math.round(vol * 100)} aria-label={t("rhythm." + name) + " · " + t("vol.title")} onChange={e => { setVol(+e.target.value / 100); loop.setVolume(+e.target.value / 100); }}/></label>
  </div>;
}
// Padrão e tipo de som de um loop do ritmo, em duas listas lado a lado; no padrão "Personalizado", a grade para editar.
function Modes({name, ctl, tones}: {name: string; ctl: Patterned; tones: Toned}){
  const [m, setM] = useState(ctl.mode()), [tn, setTn] = useState(tones.tone());
  return <>
    <div className="rhythm-pick">
      <label className="field"><span>{t("rhythm.pattern")}</span>
        <Select value={m} aria={t("rhythm." + name) + " · " + t("rhythm.pattern")} onChange={v => { setM(v); ctl.setMode(v); }}
          options={ctl.modes.map(v => ({value: v, label: v === "custom" ? t("rhythm.custom") : t("rhythm." + name + "." + v)}))}/></label>
      <label className="field"><span>{t("rhythm.tone")}</span>
        <Select value={tn} aria={t("rhythm." + name) + " · " + t("rhythm.tone")} onChange={v => { setTn(v); tones.setTone(v); }}
          options={tones.tones.map(v => ({value: v, label: t("rhythm." + name + ".tone." + v)}))}/></label>
    </div>
    {m === "custom" && <StepGrid name={name} ctl={ctl}/>}
  </>;
}
// As 16 semicolcheias do compasso, em 4 grupos (os tempos). Cada toque passa por forte → fraca → vazia; vale na
// próxima volta do loop, mesmo tocando.
const STEP_NEXT: Record<number, number> = {0: 0.9, 0.9: 0.45, 0.45: 0};
const SUBS = ["", "e", "&", "a"];
function StepGrid({name, ctl}: {name: string; ctl: Patterned}){
  const [p, setP] = useState<number[]>(() => ctl.custom().map(v => v >= 0.7 ? 0.9 : v > 0 ? 0.45 : 0));
  const flip = (i: number) => { const n = p.slice(); n[i] = STEP_NEXT[p[i]] ?? 0; setP(n); ctl.setCustom(n); };
  return <div className="steps-grid" role="group" aria-label={t("rhythm." + name) + " · " + t("rhythm.custom")}>
    {[0, 1, 2, 3].map(b => <div key={b} className="steps-beat"><span className="steps-n">{b + 1}</span>
      <div className="steps-row">{[0, 1, 2, 3].map(k => { const i = b * 4 + k, v = p[i];
        return <button key={k} className={"step" + (v >= 0.7 ? " hi" : v > 0 ? " lo" : "")} aria-pressed={v > 0}
          aria-label={t("rhythm.step", {beat: b + 1, sub: SUBS[k] || "·"}) + " · " + t(v >= 0.7 ? "rhythm.step.hi" : v > 0 ? "rhythm.step.lo" : "rhythm.step.off")}
          onClick={() => flip(i)}/>; })}</div></div>)}
  </div>;
}
// Ritmo: o BPM (o mesmo do metrônomo, com toque para marcar) e os loops no tempo.
function Rhythm(){
  const bpm = useBpm(), taps = useRef<number[]>([]);
  const tap = () => { taps.current.push(performance.now()); if(taps.current.length > 8) taps.current.shift(); const b = tapTempo(taps.current); if(b) metro.set({bpm: b}); };
  return <div className="card metro rhythm-card">
    <div className="card-head"><h2>{t("rhythm.title")}</h2><p className="sub">{t("rhythm.sub")}</p></div>
    <div className="rhythm-grid">
      <div className="rhythm-item rhythm-tempo">
        <div className="rhythm-bpm">
          <button className="icon-btn metro-step" aria-label={t("hands.slower")} onClick={() => metro.set({bpm: bpm - 1})}><Icon name="minus"/></button>
          <div className="metro-read"><b>{bpm}</b><small><span>BPM</span> · <span>{tempoName(bpm)}</span></small></div>
          <button className="icon-btn metro-step" aria-label={t("hands.faster")} onClick={() => metro.set({bpm: bpm + 1})}><Icon name="plus"/></button>
        </div>
        <button className="btn ghost" data-tip-key="tip.tap" onClick={tap}>{t("metro.tap")}</button>
      </div>
      <LoopControl loop={snare} name="snare"><Modes name="snare" ctl={snareModes} tones={snareTones}/></LoopControl>
      <LoopControl loop={shaker} name="shaker"><Modes name="shaker" ctl={shakerModes} tones={shakerTones}/></LoopControl>
      <LoopControl loop={bass} name="bass"><Modes name="bass" ctl={bassModes} tones={bassTones}/></LoopControl>
    </div>
  </div>;
}

// Grooves: caixa, shaker e grave juntos no padrão de um estilo, no BPM do ritmo. Trocar de estilo tocando vale na
// próxima semicolcheia; o andamento típico aparece como sugestão, com um toque para usá-lo.
function Grooves(){
  const on = useLoop(groove), bpm = useBpm(), [style, setStyle] = useState(grooveStyle()), [vol, setVol] = useState(groove.volume());
  const pick = (g: string) => { setStyle(g); setGrooveStyle(g); };
  const typical = GROOVES[style].bpm;
  return <div className="card metro groove-card">
    <div className="card-head"><h2>{t("groove.title")}</h2><p className="sub">{t("groove.sub")}</p></div>
    <div className="pad-styles groove-styles" role="group" aria-label={t("groove.title")}>{GROOVE_STYLES.map(g =>
      <button key={g} className="root-btn" aria-pressed={g === style} onClick={() => pick(g)}>
        <b>{t("groove." + g)}</b><small>{t("groove." + g + ".hint")} · ~{GROOVES[g].bpm} BPM</small></button>)}</div>
    <div className="groove-row">
      <label className="field"><span>{t("vol.title")}</span>
        <Range min={0} max={100} step={1} value={Math.round(vol * 100)} aria-label={t("groove.title") + " · " + t("vol.title")} onChange={e => { setVol(+e.target.value / 100); groove.setVolume(+e.target.value / 100); }}/></label>
      {bpm !== typical && <button className="btn ghost sm" onClick={() => metro.set({bpm: typical})}>{t("groove.useBpm", {n: typical})}</button>}
      <button className={"btn primary metro-go" + (on ? " running" : "")} onClick={() => groove.toggle().then(ok => { if(!ok) toast(t("study.noAudio")); })}>
        {on ? <><Icon name="stop" sm/> {t("pad.stop")}</> : <><Icon name="play" sm/> {t("groove.play")}</>}</button>
    </div>
  </div>;
}
