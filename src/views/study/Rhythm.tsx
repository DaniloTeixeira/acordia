// Independência das mãos: padrões rítmicos em duas mãos, com contagem, cursor e avaliação.
import { useEffect, useRef, useState } from "react";
import { PATTERNS, BARS, COUNT_IN, timeline, tolerance, scoreTaps, type Pattern, type TapResult, type Expected } from "../../lib/hands";
import type { Hand } from "../../lib/keys";
import * as audio from "../../lib/audio";
import { t } from "../../lib/i18n";
import * as store from "../../lib/store";
import { esc } from "../../lib/svg";
import { useData, toast } from "../../state";
import { Icon } from "../../ui/Icon";

const { data } = store;
interface HandsState { id: string | null; bpm: Record<string, number> }
const handsState = (): HandsState => Object.assign({id: null, bpm: {}}, data.settings.hands || {});
const setHands = (p: Partial<HandsState>) => store.setSetting("hands", Object.assign(handsState(), p));
const bpmOf = (p: Pattern) => handsState().bpm[p.id] || (p.level === 1 ? 70 : p.level === 2 ? 64 : 56);
const best = () => (data.settings.handsBest || {}) as Record<string, number>;

export function LevelDots({n}: {n: number}){
  return <span className="dots" aria-label={t("hands.level", {n})}>{[1,2,3].map(i => <i key={i} className={i <= n ? "on" : ""}/>)}</span>;
}

export function Rhythm(){
  useData();
  const st = handsState(), p = PATTERNS.find(x => x.id === st.id);
  if(!p) return <PatternList/>;
  return <Practice key={p.id} p={p}/>;
}

function PatternList(){
  const b = best();
  return <>
    <div className="hands-intro"><h2>{t("hands.title")}</h2><p className="sub">{t("hands.intro")}</p></div>
    <div className="kinds hands-list">{PATTERNS.map(p => <button key={p.id} className="kind ex" data-id={p.id} onClick={() => setHands({id: p.id})}>
      <span className="ex-top"><b>{t("hands.p." + p.id)}</b><LevelDots n={p.level}/></span>
      <span>{t("hands.p." + p.id + "D")}</span>
      {b[p.id] !== undefined && <span className="chip accent">{t("hands.best", {n: b[p.id]})}</span>}</button>)}</div>
  </>;
}

// Trilhas das duas mãos (SVG); o cursor e os acendimentos são atualizados direto no DOM.
function laneSVG(p: Pattern, marks: Record<string, number> | null){
  const W = 640, H = 110, x0 = 92, w = W - x0 - 12, y = {rh:32, lh:80};
  const X = (beat: number) => x0 + beat / 4 * w;
  let s = `<svg class="lanes" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("hands.lanesAria"))}">`;
  s += `<text x="8" y="${y.rh + 4}" class="lane-l">${esc(t("hands.right"))}</text><text x="8" y="${y.lh + 4}" class="lane-l">${esc(t("hands.left"))}</text>`;
  for(let b = 0; b <= 4; b++) s += `<line x1="${X(b)}" x2="${X(b)}" y1="10" y2="${H-8}" class="${b % 4 ? "beat" : "bar"}"/>` + (b < 4 ? `<text x="${X(b) + 4}" y="${H - 1}" class="beat-n">${b + 1}</text>` : "");
  s += `<line x1="${x0}" x2="${x0 + w}" y1="${y.rh}" y2="${y.rh}" class="lane"/><line x1="${x0}" x2="${x0 + w}" y1="${y.lh}" y2="${y.lh}" class="lane"/>`;
  for(const hand of ["rh","lh"] as const) for(const beat of p[hand]){
    const m = marks && marks[hand + ":" + beat];
    const cls = m === undefined || m === null ? "" : m >= 1 ? " ok" : m > 0 ? " part" : " miss";
    s += `<circle cx="${X(beat)}" cy="${y[hand]}" r="${p[hand].length > 8 ? 6 : 9}" class="note ${hand}${cls}" data-k="${hand}:${beat}"/>`;
  }
  s += `<line class="playhead" x1="${x0}" x2="${x0}" y1="8" y2="${H - 10}" style="opacity:0"/></svg>`;
  return s;
}
function markMap(r: TapResult){
  const m: Record<string, {h: number; n: number}> = {};
  r.notes.forEach(n => { const k = n.hand + ":" + n.beat; m[k] = m[k] || {h:0, n:0}; m[k].n++; if(n.hit) m[k].h++; });
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.h / v.n]));
}

interface Run { p: Pattern; demo: boolean; bpm: number; spb: number; t0: number; bars: number; expected: Expected[]; taps: {hand: Hand; t: number}[]; end: number; timer: ReturnType<typeof setTimeout>; raf: number }

function Practice({p}: {p: Pattern}){
  const [bpm, setBpmState] = useState(bpmOf(p));
  const [result, setResult] = useState<TapResult | null>(null);
  const [running, setRunning] = useState(false);
  const wrap = useRef<HTMLDivElement>(null), count = useRef<HTMLDivElement>(null), resultBox = useRef<HTMLDivElement>(null);
  const pads = useRef<Record<Hand, HTMLButtonElement | null>>({lh: null, rh: null});
  const run = useRef<Run | null>(null);
  const setBpm = (v: number) => { v = Math.max(40, Math.min(160, v)); setBpmState(v); setHands({bpm: {...handsState().bpm, [p.id]: v}}); };
  const stop = () => { const r = run.current; if(r){ cancelAnimationFrame(r.raf); clearTimeout(r.timer); } run.current = null; setRunning(false); };
  const finish = () => {
    const r = run.current; if(!r) return; stop();
    if(r.demo){ setResult(null); return; }
    const res = scoreTaps(r.expected, r.taps, tolerance(r.p, r.bpm));
    const b = Object.assign({}, best());
    if(b[r.p.id] === undefined || res.accuracy > b[r.p.id]){ b[r.p.id] = res.accuracy; store.setSetting("handsBest", b); res.newBest = res.accuracy > 0; }
    setResult(res);
    setTimeout(() => resultBox.current?.scrollIntoView({block:"nearest", behavior:"smooth"}), 50);
  };
  const frame = () => {
    const r = run.current, svg = wrap.current?.querySelector(".lanes"); if(!r || !svg) return;
    const now = audio.audioNow(), el = (now - r.t0) / r.spb, head = svg.querySelector<SVGLineElement>(".playhead")!;
    if(el < COUNT_IN){ count.current!.textContent = el >= 0 ? String(Math.floor(el) + 1) : ""; head.style.opacity = "0"; }
    else {
      count.current!.textContent = "";
      const pos = (el - COUNT_IN) % 4, x = 92 + pos / 4 * (640 - 92 - 12);
      head.setAttribute("x1", String(x)); head.setAttribute("x2", String(x)); head.style.opacity = "1";
      // Acende cada nota quando o cursor passa por ela.
      svg.querySelectorAll<SVGElement>(".note").forEach(n => { const beat = +n.dataset.k!.split(":")[1]; n.classList.toggle("flash", pos >= beat && pos - beat < 0.18); });
    }
    if(now >= r.end + 0.2) return finish();
    r.raf = requestAnimationFrame(frame);
  };
  const start = async (demo: boolean) => {
    stop();
    if(!(await audio.audioReady())) return toast(t("study.noAudio"));
    const spb = 60 / bpm, now = audio.audioNow(), t0 = now + 0.15, bars = demo ? 2 : BARS;
    const expected = timeline(p, bpm, bars, t0);
    for(let i = 0; i < COUNT_IN + bars * 4; i++) audio.click(i % 4 ? "beat" : "accent", t0 + i * spb);
    if(demo) expected.forEach(e => audio.click(e.hand, e.t));
    const end = t0 + (COUNT_IN + bars * 4) * spb;
    setResult(null);
    wrap.current?.querySelectorAll(".lanes .note").forEach(n => n.classList.remove("ok","part","miss","flash"));
    // Encerra pelo relógio mesmo se a animação ficar pausada (aba em segundo plano).
    run.current = {p, demo, bpm, spb, t0, bars, expected, taps: [], end, timer: setTimeout(finish, (end + 0.25 - now) * 1000), raf: 0};
    setRunning(true);
    frame();
  };
  const tap = (hand: Hand) => {
    audio.click(hand);
    const pad = pads.current[hand]; if(pad){ pad.classList.remove("hit"); void pad.offsetWidth; pad.classList.add("hit"); }
    const r = run.current; if(r && !r.demo) r.taps.push({hand, t: audio.audioNow()});
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if(e.repeat || (e.target instanceof Element && e.target.closest("input:not([type=range]),textarea,select")) || document.querySelector("dialog[open]")) return;
      const k = e.key.toLowerCase();
      if(k === "f" || k === "j"){ e.preventDefault(); tap(k === "f" ? "lh" : "rh"); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); stop(); };
  }, []);
  const r = result, ms = r ? Math.round(r.meanOffset * 1000) : 0;
  const feel = !r || !r.hits ? "" : Math.abs(ms) < 15 ? t("hands.onTime") : ms < 0 ? t("hands.early", {ms:-ms}) : t("hands.late", {ms});
  const pct = (h: Hand) => r && r.perHand[h].total ? Math.round(r.perHand[h].hits / r.perHand[h].total * 100) : 0;
  return <>
    <button className="btn ghost sm back" id="h-back" onClick={() => setHands({id: null})}><Icon name="back" sm/> {t("hands.all")}</button>
    <div className="card hands-card">
      <div className="scale-head"><div><h2>{t("hands.p." + p.id)} <LevelDots n={p.level}/></h2><p className="sub">{t("hands.p." + p.id + "D")}</p></div></div>
      <div className="lane-wrap" ref={wrap}><div style={{display: "contents"}} dangerouslySetInnerHTML={{__html: laneSVG(p, r ? markMap(r) : null)}}/><div className="hands-count" id="h-count" aria-live="assertive" ref={count}/></div>
      <div className="study-row hands-controls">
        <div className="bpm"><button className="icon-btn sm" id="h-slower" aria-label={t("hands.slower")} onClick={() => setBpm(bpm - 4)}><Icon name="minus" sm/></button>
          <label><input type="range" id="h-bpm" min={40} max={160} step={2} value={bpm} aria-label="BPM" onChange={e => setBpm(+e.target.value)}/><span><b id="h-bpm-v">{bpm}</b> bpm</span></label>
          <button className="icon-btn sm" id="h-faster" aria-label={t("hands.faster")} onClick={() => setBpm(bpm + 4)}><Icon name="plus" sm/></button></div>
        <button className="btn soft" id="h-demo" disabled={running} onClick={() => start(true)}><Icon name="sound" sm/> {t("hands.listen")}</button>
        <button className="btn primary" id="h-start" disabled={running} onClick={() => start(false)}><Icon name="play" sm/> {t(result ? "hands.again" : "hands.start")}</button>
      </div>
      <div className="pads">
        <button className="pad lh" data-hand="lh" ref={el => { pads.current.lh = el; }} onPointerDown={e => { e.preventDefault(); tap("lh"); }}><b>{t("hands.left")}</b><kbd>F</kbd></button>
        <button className="pad rh" data-hand="rh" ref={el => { pads.current.rh = el; }} onPointerDown={e => { e.preventDefault(); tap("rh"); }}><b>{t("hands.right")}</b><kbd>J</kbd></button>
      </div>
      <p className="sub hands-tip">{t("hands.tip")}</p>
      <div id="h-result" ref={resultBox}>{r && <div className="hands-result">
        <div className="big">{r.accuracy}%</div>
        <div className="stats">
          <span><b>{pct("lh")}%</b> {t("hands.left")}</span><span><b>{pct("rh")}%</b> {t("hands.right")}</span>
          <span><b>{r.misses}</b> {t("hands.missed")}</span><span><b>{r.extras}</b> {t("hands.extra")}</span>
        </div>
        <p>{feel} {t("hands.msg." + (r.accuracy >= 90 ? "great" : r.accuracy >= 70 ? "good" : "try"))}</p>
        {r.newBest && <p className="chip accent">{t("train.newBest")}</p>}</div>}</div>
    </div>
  </>;
}
