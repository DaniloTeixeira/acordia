// Exercícios de teclado: técnica para as duas mãos, em qualquer tom, com dedilhado, teclado MIDI,
// modo espera (avança quando acerta), demonstração e modo no tempo.
import { useEffect, useMemo, useRef, useState } from "react";
import { KEY_EXERCISES, buildExercise, required, checkStep, scoreNotes, type KeyExercise, type BuiltExercise, type Hands, type TimedNote } from "../../lib/keys";
import { rootFor } from "../../lib/core";
import * as audio from "../../lib/audio";
import { t } from "../../lib/i18n";
import * as store from "../../lib/store";
import { esc, practiceKeyboardSVG } from "../../lib/svg";
import { useData, toast } from "../../state";
import { Icon } from "../../ui/Icon";
import { Seg } from "../../ui/Seg";
import { Select } from "../../ui/Select";
import { Range } from "../../ui/Range";
import { RotateHint } from "../../ui/RotateHint";
import { useTooWide } from "../../ui/hooks";
import { TimbreSelect } from "../InstrumentSelect";
import { LevelDots } from "./Rhythm";

const { data } = store;
// Relógio do áudio (0 enquanto não há áudio).
const clock = () => audio.audioNow() ?? 0;
interface KeysState { id: string | null; key: number; hands: Hands; bpm: Record<string, number>; sound: boolean }
const keysState = (): KeysState => Object.assign({id: null, key: 0, hands: "both" as Hands, bpm: {}, sound: true}, data.settings.keys || {});
const setKeys = (p: Partial<KeysState>) => store.setSetting("keys", Object.assign(keysState(), p));
const bpmOf = (ex: KeyExercise) => keysState().bpm[ex.id] || (ex.level === 1 ? 72 : ex.level === 2 ? 66 : 60);
const best = () => (data.settings.keysBest || {}) as Record<string, number>;
const CONFIRM_MS = 380;
const hasMidi = "requestMIDIAccess" in navigator;

// ---------- teclado MIDI (Chrome/Edge) ----------
let midiAccess: MIDIAccess | null = null, midiName = "";
const midiListeners = new Set<() => void>(), noteListeners = new Set<(n: number, on: boolean) => void>();
async function connectMIDI(){
  if(midiAccess || !hasMidi) return;
  try{
    midiAccess = await navigator.requestMIDIAccess();
    const bind = () => {
      midiName = "";
      midiAccess!.inputs.forEach(inp => {
        midiName = midiName || inp.name || "MIDI";
        inp.onmidimessage = e => { const d = e.data; if(!d) return; const [s, n, v] = d, k = s & 0xf0;
          if(k === 0x90 || k === 0x80) noteListeners.forEach(f => f(n, k === 0x90 && v > 0)); };
      });
      midiListeners.forEach(f => f());
    };
    midiAccess.onstatechange = bind; bind();
  }catch(e){ midiAccess = null; }
}
function useMidiName(){
  const [name, setName] = useState(midiName);
  useEffect(() => { const f = () => setName(midiName); midiListeners.add(f); connectMIDI(); return () => { midiListeners.delete(f); }; }, []);
  return name;
}

export function Keys(){
  useData();
  const st = keysState(), ex = KEY_EXERCISES.find(x => x.id === st.id);
  if(!ex) return <ExerciseList/>;
  return <Practice key={ex.id + ":" + st.key + ":" + st.hands} ex={ex}/>;
}

function ExerciseList(){
  const b = best();
  return <>
    <div className="hands-intro"><h2>{t("keys.title")}</h2><p className="sub">{t("keys.intro")}</p></div>
    <div className="kinds hands-list">{KEY_EXERCISES.map(ex => <button key={ex.id} className="kind ex" data-id={ex.id} onClick={() => setKeys({id: ex.id})}>
      <span className="ex-top"><b>{t("keys.p." + ex.id)}</b><LevelDots n={ex.level}/></span>
      <span>{t("keys.p." + ex.id + "D")}</span>
      {b[ex.id] !== undefined && <span className="chip accent">{t("hands.best", {n: b[ex.id]})}</span>}</button>)}</div>
  </>;
}

type Result = {mode: "wait"; accuracy: number; errors: number; secs: number} | ({mode: "timed"} & ReturnType<typeof scoreNotes>);
type Cur =
  | {mode: "wait"; i: number; pressed: number[]; queue: number[]; busy: boolean; errors: number; start: number; hands: Hands}
  | {mode: "timed" | "demo"; t0: number; spb: number; count: number; played: TimedNote[]; expected: TimedNote[]; end: number; timer: ReturnType<typeof setTimeout>; shown?: number};

function Practice({ex}: {ex: KeyExercise}){
  const st = keysState();
  const built: BuiltExercise = useMemo(() => buildExercise(ex, st.key), [ex, st.key]);
  const [bpm, setBpmState] = useState(bpmOf(ex));
  const [result, setResult] = useState<Result | null>(null);
  const [mode, setMode] = useState<Cur["mode"] | null>(null);
  const [status, setStatus] = useState(t(hasMidi ? "keys.tip" : "keys.tipNoMidi"));
  const midi = useMidiName();
  const root = useRef<HTMLDivElement>(null), prompt = useRef<HTMLDivElement>(null), board = useRef<HTMLDivElement>(null);
  const cur = useRef<Cur | null>(null), tick = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const live = useRef({sound: st.sound}); live.current = {sound: st.sound};
  const setBpm = (v: number) => { v = Math.max(30, Math.min(160, v)); setBpmState(v); setKeys({bpm: {...keysState().bpm, [ex.id]: v}}); };
  const svg = () => root.current?.querySelector(".keyboard.practice");
  const rect = (m: number) => svg()?.querySelector(`rect[data-midi="${m}"]`);

  // Destaca no teclado as notas do passo i (e mostra os dedos).
  function showStep(i: number, scroll = true){
    const k = svg(); if(!k) return;
    k.querySelectorAll("rect.rh,rect.lh,rect.next").forEach(r => r.classList.remove("rh","lh","next"));
    k.querySelectorAll("text.fing").forEach(tx => tx.textContent = "");
    const s = built.steps[i], nx = built.steps[i + 1];
    const mark = (ev: BuiltExercise["events"][number] | null, h: string) => ev && ev.midis.forEach((m, j) => { rect(m)?.classList.add(h); const f = k.querySelector(`[data-f="${m}"]`); if(f && built.fingering) f.textContent = String(ev.fingers[j]); });
    if(nx) [nx.rh, nx.lh].forEach(ev => ev && ev.midis.forEach(m => rect(m)?.classList.add("next")));
    if(s){ mark(s.lh, "lh"); mark(s.rh, "rh"); }
    k.querySelectorAll("rect.target").forEach(r => r.classList.remove("target"));
    const c = cur.current, waiting = c && c.mode === "wait" && s ? c : null;
    if(waiting) required(s, waiting.hands).forEach(m => rect(m)?.classList.add("target"));
    const p = prompt.current;
    if(p){
      p.hidden = !waiting;
      if(waiting){
        const order = built.steps.map((_, k2) => k2).filter(k2 => required(built.steps[k2], waiting.hands).length);
        const part = (ev: BuiltExercise["events"][number] | null, h: "rh" | "lh") => ev && waiting.hands !== (h === "rh" ? "lh" : "rh")
          ? `<span class="kp ${h}">${esc(t(h === "rh" ? "keys.rhFull" : "keys.lhFull"))}: <b>${ev.names.map((nm, j) => esc(nm) + (built.fingering ? ` <small>${esc(t("keys.finger", {n: ev.fingers[j]}))}</small>` : "")).join(" + ")}</b></span>` : "";
        p.innerHTML = `<span class="kp-step">${esc(t("keys.prompt", {n: order.indexOf(i) + 1, total: order.length}))}</span>${part(s.rh, "rh")}${part(s.lh, "lh")}`;
      }
    }
    root.current?.querySelectorAll<HTMLElement>(".kstep").forEach(el => el.classList.toggle("on", +el.dataset.i! === i));
    const on = root.current?.querySelector(`.kstep[data-i="${i}"]`);
    if(on && scroll) on.scrollIntoView({block:"nearest", inline:"center", behavior:"smooth"});
    // Teclado mais largo que a tela (celular em pé): rola até as notas do passo ficarem no meio.
    const wrap = board.current, ms = s ? [...(s.rh ? s.rh.midis : []), ...(s.lh ? s.lh.midis : [])] : [];
    if(wrap && ms.length && wrap.scrollWidth > wrap.clientWidth){
      const box = wrap.getBoundingClientRect(), rs = ms.map(m => rect(m)?.getBoundingClientRect()).filter((r): r is DOMRect => !!r);
      if(rs.length){
        const mid = (Math.min(...rs.map(r => r.left)) + Math.max(...rs.map(r => r.right))) / 2 - box.left + wrap.scrollLeft;
        wrap.scrollTo({left: mid - wrap.clientWidth / 2, behavior: scroll ? "smooth" : "auto"});
      }
    }
  }
  function flashKey(m: number, cls: string, ms = 300){
    const r = rect(m); if(!r) return;
    r.classList.remove("hit","bad"); void r.getBoundingClientRect(); r.classList.add(cls); setTimeout(() => r.classList.remove(cls), ms);
  }
  // Ao completar um passo: apaga o destaque atual e deixa só o verde da confirmação.
  // As teclas acertadas (keep) só trocam de cor e mantêm o número do dedo.
  function clearMarks(keep: number[] = []){
    const k = svg(); if(!k) return;
    k.querySelectorAll<SVGElement>("rect.rh,rect.lh,rect.next,rect.target").forEach(r => { if(!keep.includes(+r.dataset.midi!)) r.classList.remove("rh","lh","next","target"); else r.classList.remove("target","next"); });
    k.querySelectorAll<SVGElement>("text.fing").forEach(tx => { if(!keep.includes(+tx.dataset.f!)) tx.textContent = ""; });
  }
  function stop(){
    clearInterval(tick.current);
    const c = cur.current; if(c && c.mode !== "wait") clearTimeout(c.timer);
    cur.current = null; setMode(null);
  }
  // Volta ao estado parado, com o resultado (se houver) e o primeiro passo destacado.
  function reset(r: Result | null){ stop(); setResult(r); setStatus(t(hasMidi ? "keys.tip" : "keys.tipNoMidi")); requestAnimationFrame(() => showStep(0, false)); }
  // Toca a mão que a pessoa não está estudando, no passo atual.
  function autoPlay(i: number){
    const c = cur.current; if(!c || c.mode !== "wait" || c.hands === "both") return;
    const s = built.steps[i], ev = s && s[c.hands === "rh" ? "lh" : "rh"];
    if(ev) audio.playChord(ev.midis, {base:0, dur: Math.min(2.5, ev.dur * 0.8), strum:0});
  }
  function saveBest(acc: number){
    const b = Object.assign({}, best()); if(b[ex.id] === undefined || acc > b[ex.id]){ b[ex.id] = acc; store.setSetting("keysBest", b); }
  }

  // ---------- modo espera ----------
  function startWait(){
    stop();
    const c: Cur = {mode:"wait", i:0, pressed:[], queue:[], busy:false, errors:0, start: performance.now(), hands: st.hands};
    cur.current = c; setMode("wait"); setResult(null); setStatus(t("keys.waitHint"));
    // Pula passos em que só a outra mão toca.
    while(c.i < built.steps.length - 1 && !required(built.steps[c.i], c.hands).length){ autoPlay(c.i); c.i++; }
    root.current?.querySelector(".board-wrap")?.scrollIntoView({block:"nearest", behavior:"smooth"});
    autoPlay(c.i); showStep(c.i);
  }
  function finishWait(){
    const c = cur.current; if(!c || c.mode !== "wait") return;
    const total = built.steps.reduce((n, s) => n + required(s, c.hands).length, 0);
    const acc = Math.max(0, Math.round(total / (total + c.errors) * 100));
    saveBest(acc); audio.cue("ok");
    reset({mode:"wait", accuracy: acc, errors: c.errors, secs: Math.round((performance.now() - c.start) / 1000)});
  }
  // Notas soando enquanto a tecla (na tela ou no MIDI) está apertada.
  const holding = useRef(new Map<number, () => void>());
  function noteOff(m: number){ rect(m)?.classList.remove("down"); const r = holding.current.get(m); if(r){ r(); holding.current.delete(m); } }
  function noteOn(m: number, src: "midi" | "screen" | "queued"){
    if(src !== "queued") rect(m)?.classList.add("down");
    if((live.current.sound || src === "screen") && src !== "queued"){ holding.current.get(m)?.(); const r = audio.noteOn(m); if(r) holding.current.set(m, r); }
    const c = cur.current;
    if(!c){ flashKey(m, "hit"); return; }
    if(c.mode !== "wait"){ if(c.mode === "timed") c.played.push({midi:m, t: clock()}); flashKey(m, "hit"); return; }
    // Durante a confirmação verde, guarda a nota para contar no próximo passo.
    if(c.busy){ c.queue.push(m); return; }
    let s = built.steps[c.i], req = required(s, c.hands);
    while(!req.length && c.i < built.steps.length - 1){ c.i++; s = built.steps[c.i]; req = required(s, c.hands); }
    c.pressed.push(m);
    const r = checkStep(req, c.pressed, m);
    if(r.wrong){ c.errors++; flashKey(m, "bad"); audio.cue("bad"); c.pressed = c.pressed.filter(n => n !== m); return; }
    if(!r.done){ flashKey(m, "hit"); return; }
    // Passo completo: primeiro a confirmação em verde (só nas teclas tocadas), depois o próximo destaque.
    const done = [...new Set(c.pressed)];
    clearMarks(done);
    done.forEach(n => flashKey(n, "hit", CONFIRM_MS));
    c.busy = true;
    setTimeout(() => {
      if(cur.current !== c) return;
      c.busy = false; c.pressed = []; c.i++;
      while(c.i < built.steps.length && !required(built.steps[c.i], c.hands).length){ autoPlay(c.i); c.i++; }
      if(c.i >= built.steps.length) return finishWait();
      autoPlay(c.i); showStep(c.i);
      c.queue.splice(0).forEach(n => noteOn(n, "queued"));
    }, CONFIRM_MS);
  }
  const noteRef = useRef(noteOn); noteRef.current = noteOn;
  // Tecla da tela segurada: guarda qual nota cada dedo/ponteiro está tocando.
  const pointers = useRef(new Map<number, number>());
  const pointerUp = (e: React.PointerEvent) => { const m = pointers.current.get(e.pointerId); if(m !== undefined){ pointers.current.delete(e.pointerId); noteOff(m); } };

  // ---------- ouvir (demonstração) e no tempo (com MIDI) ----------
  async function startTimed(demo: boolean){
    stop();
    if(!(await audio.audioReady())) return toast(t("study.noAudio"));
    const spb = 60 / bpm, t0 = clock() + 0.15, count = demo ? 0 : 4;
    for(let i = 0; i < count + built.beats; i++) audio.click(i % 4 ? "beat" : "accent", t0 + i * spb);
    const mine = (h: string) => !demo && (st.hands === "both" || st.hands === h);
    const expected: TimedNote[] = [];
    built.events.forEach(ev => {
      const at = t0 + (count + ev.t) * spb;
      if(mine(ev.hand)) ev.midis.forEach(m => expected.push({midi:m, t:at}));
      else audio.playNotesAt(ev.midis, at, Math.min(2.5, ev.dur * spb * 0.95));
    });
    const end = t0 + (count + built.beats) * spb;
    const c: Cur = {mode: demo ? "demo" : "timed", t0, spb, count, played: [], expected, end, timer: setTimeout(() => finishTimed(), (end - clock() + 0.4) * 1000)};
    cur.current = c; setMode(c.mode); setResult(null);
    setStatus(t(demo ? "keys.demoHint" : "keys.timedHint"));
    frame(); tick.current = setInterval(frame, 40);
  }
  // Acompanha o relógio do áudio com um timer próprio (a animação de quadro pode pausar em segundo plano).
  function frame(){
    const c = cur.current; if(!c || c.mode === "wait") return;
    const beat = (clock() - c.t0) / c.spb - c.count;
    let i = -1; built.steps.forEach((s, k) => { if(s.t <= beat + 0.02) i = k; });
    if(i !== c.shown){ c.shown = i; if(i >= 0) showStep(i); }
    if(beat < 0 && c.count) setStatus(t("keys.countIn", {n: Math.max(1, Math.floor(beat + c.count) + 1)}));
    else if(c.count && beat >= 0 && beat < 0.2) setStatus(t("keys.timedHint"));
  }
  function finishTimed(){
    const c = cur.current; if(!c || c.mode === "wait") return;
    if(c.mode === "demo") return reset(null);
    const tol = Math.min(0.12, c.spb * 0.3), r = scoreNotes(c.expected, c.played, tol);
    saveBest(r.accuracy);
    reset({mode:"timed", ...r});
  }

  useEffect(() => {
    showStep(0, false);
    const f = (n: number, on: boolean) => { if(on) noteRef.current(n, "midi"); else noteOff(n); }; noteListeners.add(f);
    const hold = holding.current;
    return () => { noteListeners.delete(f); hold.forEach(r => r()); hold.clear(); clearInterval(tick.current); const c = cur.current; if(c && c.mode !== "wait") clearTimeout(c.timer); cur.current = null; };
  }, []);

  const keyboard = useMemo(() => practiceKeyboardSVG(built.lo, built.hi), [built]);
  const tooWide = useTooWide(board, keyboard);
  const cell = (evt: BuiltExercise["events"][number] | null, h: "rh" | "lh") => evt
    ? <span className={"kc " + h + (st.hands !== "both" && st.hands !== h ? " auto" : "")}><b>{evt.names.join(" ")}</b>{built.fingering && <small>{evt.fingers.join(" ")}</small>}</span>
    : <span className="kc empty"/>;
  const r = result, ms = r && r.mode === "timed" ? Math.round((r.meanOffset || 0) * 1000) : 0;
  const feel = !r || r.mode !== "timed" || !r.hits ? "" : Math.abs(ms) < 15 ? t("hands.onTime") : ms < 0 ? t("hands.early", {ms:-ms}) : t("hands.late", {ms});
  return <div ref={root}>
    <button className="btn ghost sm back" id="k-back" onClick={() => setKeys({id: null})}><Icon name="back" sm/> {t("hands.all")}</button>
    <div className={"card hands-card" + (mode === "wait" ? " practicing" : "")}>
      <div className="scale-head"><div><h2>{t("keys.p." + ex.id)} <LevelDots n={ex.level}/></h2><p className="sub">{t("keys.p." + ex.id + "D")}</p></div>
        <span id="k-midi" className={"chip" + (midi ? " accent" : "")}>{midi ? t("keys.midiOn", {name: midi}) : t("keys.midiOff")}</span></div>
      <div className="study-row k-controls">
        <label className="field inst-field"><span>{t("study.root")}</span><Select id="k-key" value={String(st.key)} onChange={v => setKeys({key: +v})}
          options={Array.from({length:12}, (_, pc) => ({value: String(pc), label: rootFor(pc, "maior")}))}/></label>
        <TimbreSelect/>
        <div className="field inst-field" data-tip-key="tip.youPlay"><span>{t("keys.youPlay")}</span>
          <Seg className="sm" id="k-hands" aria={t("keys.youPlay")} value={st.hands} onChange={hands => setKeys({hands})}
            options={[{v: "rh", label: t("keys.rh")}, {v: "lh", label: t("keys.lh")}, {v: "both", label: t("keys.both")}]}/></div>
        <div className="bpm"><button className="icon-btn sm" id="k-slower" aria-label={t("hands.slower")} onClick={() => setBpm(bpm - 4)}><Icon name="minus" sm/></button>
          <label><Range id="k-bpm" min={30} max={160} step={2} value={bpm} aria-label="BPM" onChange={e => setBpm(+e.target.value)}/><span><b id="k-bpm-v">{bpm}</b> bpm</span></label>
          <button className="icon-btn sm" id="k-faster" aria-label={t("hands.faster")} onClick={() => setBpm(bpm + 4)}><Icon name="plus" sm/></button></div>
      </div>
      {!built.fingering && <p className="note">{t("keys.noFingering")}</p>}
      <div className="k-prompt" id="k-prompt" aria-live="polite" hidden ref={prompt}/>
      <RotateHint show={tooWide} what="keyboard"/>
      <div className="board-wrap k-board" ref={board} dangerouslySetInnerHTML={{__html: keyboard}}
        onPointerDown={e => { const k = (e.target as Element).closest?.("[data-midi]") as HTMLElement | null; if(k){ e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pointerUp(e); pointers.current.set(e.pointerId, +k.dataset.midi!); noteOn(+k.dataset.midi!, "screen"); } }}
        onPointerUp={pointerUp} onPointerCancel={pointerUp}/>
      <div className="kgrid-head"><h3>{t("keys.gridTitle")}</h3><p className="sub">{t(built.fingering ? "keys.gridHint" : "keys.gridHintNoFing")}</p></div>
      <div className="kgrid-wrap"><div className="kgrid">
        <div className="kstep klabels" aria-hidden="true"><span className="kbeat">{t("keys.beat")}</span><span className="kc lbl rh">{t("keys.rh")}</span><span className="kc lbl lh">{t("keys.lh")}</span></div>
        {built.steps.map((s, i) => <div key={i} className="kstep" data-i={i}><span className="kbeat">{Number.isInteger(s.t) ? s.t % 4 + 1 : "&"}</span>{cell(s.rh, "rh")}{cell(s.lh, "lh")}</div>)}
      </div></div>
      {st.hands !== "both" && <p className="sub k-auto">{t(st.hands === "rh" ? "keys.autoLh" : "keys.autoRh")}</p>}
      <div className="study-row k-actions">
        <button className="btn soft" id="k-demo" onClick={() => startTimed(true)}><Icon name="sound" sm/> {t("hands.listen")}</button>
        <button className="btn primary" id="k-wait" onClick={() => mode === "wait" ? reset(null) : startWait()}>
          {mode === "wait" ? <><Icon name="x" sm/> {t("keys.stop")}</> : <><Icon name="play" sm/> {t("keys.wait")}</>}</button>
        <button className="btn ghost" id="k-timed" disabled={!midi} title={midi ? "" : t("keys.timedNeedsMidi")} onClick={() => startTimed(false)}><Icon name="metro" sm/> {t("keys.timed")}</button>
        <label className="switch lead boxed k-sound">{t("keys.sound")}<input type="checkbox" id="k-sound" checked={st.sound} onChange={e => setKeys({sound: e.target.checked})}/></label>
      </div>
      <p className="sub" id="k-status">{status}</p>
      <div id="k-result">{r && <div className="hands-result"><div className="big">{r.accuracy}%</div>
        <div className="stats">{r.mode === "wait" ? <><span><b>{r.errors}</b> {t("keys.errors")}</span><span><b>{r.secs}s</b> {t("keys.time")}</span></>
          : <><span><b>{r.hits}</b> {t("keys.hits")}</span><span><b>{r.misses}</b> {t("hands.missed")}</span><span><b>{r.extras}</b> {t("hands.extra")}</span></>}</div>
        <p>{feel} {t("hands.msg." + (r.accuracy >= 90 ? "great" : r.accuracy >= 70 ? "good" : "try"))}</p></div>}</div>
    </div>
  </div>;
}
