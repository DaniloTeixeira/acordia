// Aba Voz do Estudo, pensada para cantores: "Cante o grau" (o app firma o tom e você canta o grau
// pedido, com o microfone conferindo a afinação) e "Minha extensão" (mede a voz e sugere o tom das
// músicas do repertório aberto).
import { useEffect, useRef, useState } from "react";
import { KEYS, MINOR_KEYS, parseKey, cadence, DEGREE_STEPS, voiceType, voiceShift, transposeKey, type Level } from "../../lib/core";
import { listenPitch, midiName } from "../../lib/tuner";
import * as audio from "../../lib/audio";
import { t, ordinal } from "../../lib/i18n";
import * as store from "../../lib/store";
import { useData, toast } from "../../state";
import { voiceSongs, applyVoiceKey, setSongHigh } from "../../repertoire";
import { Icon } from "../../ui/Icon";
import { Seg } from "../../ui/Seg";
import { Select } from "../../ui/Select";

const { data } = store;
const ROUND = 10;
// Tolerância em cents por nível, e quanto tempo segurar a nota certa para valer.
const TOLERANCE: Record<Level, number> = {facil:40, medio:25, dificil:12}, HOLD_MS = 700;
const midiOf = (f: number) => 69 + 12 * Math.log2(f / 440);
const LOWEST = 36, HIGHEST = 96; // C2..C7, limites da medição e das listas de notas

interface VoiceState { mode: "sing" | "range"; key: string; set: "triad" | "scale"; level: Level; singer: string }
const VOICE_DEFAULTS: VoiceState = {mode:"sing", key:"random", set:"triad", level:"facil", singer:""};
const voiceState = (): VoiceState => Object.assign({}, VOICE_DEFAULTS, data.settings.voice || {});
const setVoice = (p: Partial<VoiceState>) => store.setSetting("voice", Object.assign(voiceState(), p));
type Voices = Record<string, {low?: number; high?: number}>;
const voices = (): Voices => (data.settings.voices || {}) as Voices;
const best = () => (data.settings.voiceBest || {}) as Record<string, number>;

// Microfone: liga com um callback e desliga ao sair da tela.
function useMic(){
  const stop = useRef<(() => void) | null>(null);
  const off = () => { if(stop.current){ stop.current(); stop.current = null; } };
  const on = async (onPitch: (f: number | null) => void) => {
    off();
    try{ stop.current = await listenPitch(onPitch); return true; }
    catch(e){ toast(t("tuner.denied")); return false; }
  };
  useEffect(() => off, []);
  return {on, off};
}

export function Voice({openEarTraining}: {openEarTraining: () => void}){
  useData();
  const st = voiceState();
  return <>
    <Seg className="sub-seg" id="voice-mode" value={st.mode} onChange={mode => setVoice({mode})}
      options={[{v: "sing", label: t("voice.sing")}, {v: "range", label: t("voice.range")}]}/>
    <div id="voice-body">{st.mode === "range" ? <VoiceRange/> : <Sing openEarTraining={openEarTraining}/>}</div>
  </>;
}

// ---------- Cante o grau ----------
interface Game { key: string; minor: boolean; tonic: number; i: number; right: number; n: number; held: number; lastAt: number; done: boolean; helped: boolean }
type Phase = {kind: "setup"} | {kind: "game"; i: number; n: number; key: string; feedback: {ok: boolean; text: string} | null} | {kind: "summary"; right: number; prev?: number; isBest: boolean};

function Sing({openEarTraining}: {openEarTraining: () => void}){
  const st = voiceState();
  const [phase, setPhase] = useState<Phase>({kind: "setup"});
  const mic = useMic();
  const game = useRef<Game | null>(null);
  const status = useRef<HTMLParagraphElement>(null), needle = useRef<HTMLDivElement>(null), hold = useRef<HTMLSpanElement>(null), meter = useRef<HTMLDivElement>(null);
  // Mudo o microfone enquanto o próprio app toca, para o som da caixa não contar como canto.
  const muteUntil = useRef(0);
  const playing = () => performance.now() < muteUntil.current;
  const playAndMute = (fn: (at: number) => number | null) => {
    const now = audio.audioNow(); if(now === null){ toast(t("study.noAudio")); return; }
    const end = fn(now + 0.05) ?? now;
    muteUntil.current = performance.now() + (end - now) * 1000 + 300;
  };
  const degreeStep = (g: Game, n: number) => DEGREE_STEPS[g.minor ? "menor" : "maior"][n - 1];
  const noteLabel = (g: Game, n: number) => midiName(g.tonic + degreeStep(g, n)).replace(/-?\d+$/, "");
  const playTonality = (full: boolean) => {
    const g = game.current; if(!g) return;
    const chords = cadence(g.minor).map(c => c.map(x => g.tonic + x));
    playAndMute(at => audio.playProgression(full ? chords : chords.slice(-1), at, full ? 0.6 : 0.9));
  };
  const nextNote = (first: boolean) => {
    const g = game.current!;
    const pool = st.set === "triad" ? [1, 3, 5] : [1, 2, 3, 4, 5, 6, 7];
    let n; do { n = pool[Math.floor(Math.random() * pool.length)]; } while(n === g.n && pool.length > 1);
    Object.assign(g, {n, held: 0, lastAt: 0, done: false, helped: false});
    setPhase({kind: "game", i: g.i, n, key: g.key, feedback: null});
    // Na primeira nota, a cadência inteira; depois só o acorde da tônica, para não perder o tom.
    playTonality(first);
  };
  const finishNote = (ok: boolean) => {
    const g = game.current; if(!g || g.done) return;
    g.done = true;
    if(ok) g.right++;
    setPhase({kind: "game", i: g.i, n: g.n, key: g.key, feedback: {ok, text: ok ? (g.helped ? t("voice.rightHelped") : t("train.right")) : t("voice.skipped", {note: noteLabel(g, g.n)})}});
    if(!ok) playAndMute(at => { audio.playNotesAt([g.tonic + degreeStep(g, g.n)], at, 1); return at + 1; });
    setTimeout(() => {
      if(game.current !== g) return;
      g.i++;
      if(g.i >= ROUND) summary(); else nextNote(false);
    }, ok ? 900 : 1600);
  };
  const onPitch = (f: number | null) => {
    const g = game.current; if(!g || g.done) return;
    const s = status.current, nd = needle.current, h = hold.current; if(!s || !nd || !h) return;
    const now = performance.now();
    if(playing()){ s.textContent = t("voice.wait"); return; }
    if(!f){ g.held = Math.max(0, g.held - 120); h.style.width = (g.held / HOLD_MS * 100) + "%"; s.textContent = t("voice.listening"); nd.classList.add("idle"); return; }
    // Desvio até o grau pedido na oitava mais próxima: vale cantar em qualquer oitava.
    const target = g.tonic + degreeStep(g, g.n), m = midiOf(f);
    const cents = Math.round((((m - target) % 12 + 18) % 12 - 6) * 100);
    nd.classList.remove("idle");
    nd.style.left = (50 + Math.max(-50, Math.min(50, cents)) * 0.9) + "%";
    const ok = Math.abs(cents) <= TOLERANCE[st.level];
    const dt = g.lastAt ? Math.min(150, now - g.lastAt) : 60; g.lastAt = now;
    g.held = ok ? g.held + dt : Math.max(0, g.held - dt * 2);
    h.style.width = Math.min(100, g.held / HOLD_MS * 100) + "%";
    const sung = midiName(Math.round(m)).replace(/-?\d+$/, "");
    s.textContent = ok ? t("voice.holdIt") : Math.abs(cents) > 300 ? t("voice.youSang", {note: sung}) : t(cents < 0 ? "voice.low" : "voice.high", {c: Math.abs(cents)});
    meter.current?.classList.toggle("ok", ok);
    if(g.held >= HOLD_MS) finishNote(true);
  };
  const pitchRef = useRef(onPitch); pitchRef.current = onPitch;
  const start = async () => {
    const key = st.key === "random" ? [...KEYS, ...KEYS, ...MINOR_KEYS][Math.floor(Math.random() * 36)] : st.key;
    const k = parseKey(key)!;
    game.current = {key, minor: k.minor, tonic: 60 + k.pc - (k.pc > 6 ? 12 : 0), i: 0, right: 0, n: 0, held: 0, lastAt: 0, done: false, helped: false};
    if(!(await mic.on(f => pitchRef.current(f)))){ game.current = null; return; }
    nextNote(true);
  };
  const quit = () => { mic.off(); game.current = null; setPhase({kind: "setup"}); };
  function summary(){
    mic.off();
    const g = game.current!, k = st.set + ":" + st.level, b = Object.assign({}, best()), prev = b[k], isBest = prev === undefined || g.right > prev;
    if(isBest){ b[k] = g.right; store.setSetting("voiceBest", b); }
    game.current = null;
    setPhase({kind: "summary", right: g.right, prev, isBest});
  }

  if(phase.kind === "summary"){
    const pct = phase.right / ROUND, msg = pct >= 0.9 ? "great" : pct >= 0.6 ? "good" : "try";
    return <>
      <button className="btn ghost sm back" id="vs-setup" onClick={() => setPhase({kind: "setup"})}><Icon name="back" sm/> {t("train.change")}</button>
      <div className="card summary" style={{maxWidth: 720}}>
        <div className="big">{Math.round(pct * 100)}%</div>
        <h2>{t("train.result", {right: phase.right, total: ROUND})}</h2>
        <p>{t("train.msg." + msg)}</p>
        <p className="best">{phase.isBest && phase.right ? t("train.newBest") : t("train.best", {n: Math.max(phase.prev ?? 0, phase.right), total: ROUND})}</p>
        <div className="study-row" style={{justifyContent: "center"}}><button className="btn primary" id="vs-again" onClick={start}>{t("train.again")}</button></div>
      </div>
    </>;
  }
  if(phase.kind === "game"){
    const g = game.current, fb = phase.feedback, done = phase.i + (fb ? 1 : 0);
    return <>
      <button className="btn ghost sm back" id="vs-quit" onClick={quit}><Icon name="back" sm/> {t("train.change")}</button>
      <div className="quiz card voice-game">
        <div className="quiz-top"><span>{t("train.question", {n: phase.i + 1, total: ROUND})}</span><div className="progress"><span style={{width: done / ROUND * 100 + "%"}}/></div>
          <span className="chip accent">{t("voice.inKey", {key: phase.key})}</span></div>
        <p className="prompt">{t("voice.singThe", {ord: ordinal(phase.n), n: phase.n})} <small className="voice-note">({g ? noteLabel(g, phase.n) : ""})</small></p>
        <div className="voice-meter" aria-live="polite" ref={meter}>
          <div className="tuner-meter"><div className="tuner-scale">{[-50,-25,0,25,50].map(v => <span key={v} style={{left: (50 + v * 0.9) + "%"}}>{v > 0 ? "+" + v : v}</span>)}</div>
            <div className="voice-zone" style={{left: (50 - TOLERANCE[st.level] * 0.9) + "%", width: TOLERANCE[st.level] * 1.8 + "%"}}/><div className="tuner-needle" id="vs-needle" ref={needle}/></div>
          <div className="voice-hold"><span id="vs-hold" ref={hold}/></div>
          <p className="tuner-cents" id="vs-status" ref={status}>{t("voice.listening")}</p>
        </div>
        <div className="study-row">
          <button className="btn soft sm" id="vs-key-again" onClick={() => playTonality(true)}><Icon name="sound" sm/> {t("voice.keyAgain")}</button>
          <button className="btn ghost sm" id="vs-hint" onClick={() => { const g2 = game.current; if(!g2) return; g2.helped = true; playAndMute(at => { audio.playNotesAt([g2.tonic + degreeStep(g2, g2.n)], at, 1.2); return at + 1.2; }); }}>{t("voice.hearNote")}</button>
          <button className="btn ghost sm" id="vs-skip" style={{marginLeft: "auto"}} onClick={() => finishNote(false)}>{t("voice.skip")}</button>
        </div>
        <p className={"feedback" + (fb ? (fb.ok ? " ok" : " bad") : "")} aria-live="polite">{fb ? fb.text : ""}</p>
      </div>
    </>;
  }
  const b = best()[st.set + ":" + st.level];
  return <>
    <div className="card voice-card">
      <h2>{t("voice.singTitle")}</h2>
      <p className="sub">{t("voice.singD")}</p>
      <div className="study-row">
        <label className="field inst-field"><span>{t("voice.key")}</span><Select id="vs-key" value={st.key} onChange={key => setVoice({key})}
          options={["random", ...KEYS, ...MINOR_KEYS].map(k => ({value: k, label: k === "random" ? t("voice.randomKey") : k}))}/></label>
        <div className="field inst-field"><span>{t("voice.degrees")}</span><Seg className="sm" id="vs-set" aria={t("voice.degrees")} value={st.set} onChange={set => setVoice({set})}
          options={[{v: "triad", label: "1 · 3 · 5"}, {v: "scale", label: t("voice.wholeScale")}]}/></div>
        <div className="field inst-field"><span>{t("voice.precision")}</span><Seg className="sm" id="vs-level" aria={t("voice.precision")} value={st.level} onChange={level => setVoice({level})}
          options={[{v: "facil", label: t("train.easy")}, {v: "medio", label: t("train.medium")}, {v: "dificil", label: t("train.hard")}]}/></div>
      </div>
      <p className="sub">{t("voice.precisionD", {c: TOLERANCE[st.level]})}</p>
      <div className="study-row"><button className="btn primary" id="vs-start" onClick={start}><Icon name="play" sm/> {t("train.start")}</button>
        {b !== undefined && <span className="best">{t("train.best", {n: b, total: ROUND})}</span>}</div>
      <p className="note">{t("voice.micNote")}</p>
    </div>
    <div className="card voice-card voice-link">
      <div><h3>{t("voice.earTitle")}</h3><p className="sub">{t("voice.earD")}</p></div>
      <button className="btn soft" id="vs-ear" onClick={openEarTraining}>{t("voice.earGo")}</button>
    </div>
  </>;
}

// ---------- Minha extensão ----------
const noteOptions = (empty?: string) => [...(empty ? [{value: "", label: empty}] : []),
  ...Array.from({length: HIGHEST - LOWEST + 1}, (_, i) => LOWEST + i).map(m => ({value: String(m), label: midiName(m)}))];

function VoiceRange(){
  const st = voiceState();
  const singer = st.singer || Object.keys(voices())[0] || t("voice.me");
  const v = voices()[singer] || null, names = Object.keys(voices());
  const type = v && v.low && v.high ? voiceType(v.low, v.high) : null;
  const mic = useMic();
  const [measuring, setMeasuring] = useState<{which: "low" | "high"; live: string; best: number | null} | null>(null);
  const run = useRef<{which: "low" | "high"; best: number | null; run: number; lastMidi: number | null} | null>(null);
  const [name, setName] = useState(singer);
  useEffect(() => setName(singer), [singer]);
  const saveVoice = (val: {low?: number; high?: number} | null) => {
    const all = Object.assign({}, voices());
    if(val) all[singer] = val; else delete all[singer];
    store.setSetting("voices", all);
  };
  // Mede a nota mais grave (ou aguda) que a pessoa sustenta: conta uma nota quando ela fica ~0,5 s estável.
  const startMeasure = async (which: "low" | "high") => {
    run.current = {which, best: null, run: 0, lastMidi: null};
    const ok = await mic.on(f => {
      const m0 = run.current; if(!m0 || m0.which !== which) return;
      if(!f){ m0.run = 0; setMeasuring(s => s && {...s, live: t("voice.singNow")}); return; }
      const m = Math.round(midiOf(f));
      if(m < LOWEST || m > HIGHEST) return;
      m0.run = m === m0.lastMidi ? m0.run + 1 : 1; m0.lastMidi = m;
      if(m0.run >= 8 && (m0.best === null || (which === "low" ? m < m0.best : m > m0.best))) m0.best = m;
      setMeasuring(s => s && {...s, live: t("voice.hearing", {note: midiName(m)}), best: m0.best});
    });
    if(!ok){ run.current = null; return; }
    setMeasuring({which, live: t("voice.singNow"), best: null});
  };
  const stopMeasure = () => {
    const m = run.current; mic.off(); run.current = null; setMeasuring(null);
    if(m && m.best !== null){
      const cur = Object.assign({}, voices()[singer] || {}); cur[m.which] = m.best;
      if(cur.low && cur.high && cur.low > cur.high) [cur.low, cur.high] = [cur.high, cur.low];
      saveVoice(cur);
    } else if(m) toast(t("voice.noNote"));
  };
  const songs = v && v.high ? voiceSongs() : [];
  return <>
    <div className="card voice-card">
      <h2>{t("voice.rangeTitle")}</h2>
      <p className="sub">{t("voice.rangeD")}</p>
      <div className="study-row">
        <label className="field inst-field"><span>{t("voice.singer")}</span><input className="input" id="vr-name" list="vr-names" maxLength={40} autoComplete="off" value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { const n = name.trim(); if(!n || n === singer){ setName(singer); return; } mic.off(); run.current = null; setMeasuring(null); setVoice({singer: n}); }}
          onKeyDown={e => { if(e.key === "Enter") e.currentTarget.blur(); }}/></label>
        <datalist id="vr-names">{names.map(n => <option key={n} value={n}/>)}</datalist>
      </div>
      <div className="voice-steps">
        {(["low", "high"] as const).map(which => {
          const on = measuring && measuring.which === which;
          const val = on && measuring.best !== null ? measuring.best : v && v[which];
          return <div key={which} className={"voice-step" + (on ? " measuring" : "")} data-step={which}>
            <span className="lbl">{t(which === "low" ? "voice.lowest" : "voice.highest")}</span>
            <b className="voice-val">{val ? midiName(val) : "—"}</b>
            <span className="voice-live" hidden={!on}>{on ? measuring.live : ""}</span>
            <div className="voice-step-actions">
              <button className="btn soft sm" data-measure={which} onClick={() => {
                const was = measuring && measuring.which;
                if(was) stopMeasure(); // salva a medição em andamento
                if(was !== which) startMeasure(which);
              }}>{on ? <><Icon name="check" sm/> {t("voice.done")}</> : <><Icon name="sound" sm/> {t("voice.measure")}</>}</button>
              {v && v[which] && <>
                {([-1, 1] as const).map(d => <button key={d} className="icon-btn sm" data-nudge={which + ":" + d} aria-label={t(d < 0 ? "voice.lower" : "voice.higher")} title={t(d < 0 ? "voice.lower" : "voice.higher")}
                  onClick={() => { const cur = Object.assign({}, v); cur[which] = Math.max(LOWEST, Math.min(HIGHEST, cur[which]! + d)); saveVoice(cur); }}><Icon name={d < 0 ? "minus" : "plus"} sm/></button>)}
              </>}
            </div>
            <p className="sub">{t(which === "low" ? "voice.lowestD" : "voice.highestD")}</p>
          </div>;
        })}
      </div>
      {type && v && <><p className="voice-result">{t("voice.result", {low: midiName(v.low!), high: midiName(v.high!), type: t("voice.type." + type)})}</p><p className="sub">{t("voice.typeNote")}</p></>}
    </div>
    {/* Tom sugerido para cada música do repertório aberto, a partir da nota mais aguda da melodia. */}
    {v && v.high && <div className="card voice-card">
      <h2>{t("voice.keysTitle", {name: singer})}</h2>
      <p className="sub">{t("voice.keysD")}</p>
      {songs.length ? <div className="voice-keys">{songs.map(s => {
        const sug = s.high ? transposeKey(s.key, voiceShift(s.high, v.high!)) : "";
        const applied = !!sug && s.target === sug && s.singer === singer;
        return <div key={s.itemId} className="voice-key-row" data-item={s.itemId} data-song={s.songId}>
          <div className="vk-title"><b>{s.title}</b><span className="sub">{t("voice.original", {key: s.key})}</span></div>
          <label className="field"><span>{t("voice.songHigh")}</span>
            <Select f="high" value={s.high ? String(s.high) : ""} options={noteOptions("—")} onChange={val => setSongHigh(s.songId, val ? +val : undefined)}/></label>
          <div className="vk-sug">{sug ? <><span className="lbl">{t("voice.suggested")}</span><b>{sug}</b></> : <span className="sub">{t("voice.needHigh")}</span>}</div>
          <button className={"btn " + (applied ? "ghost" : "soft") + " sm"} data-apply={sug} disabled={!sug || applied}
            onClick={() => { applyVoiceKey(s.itemId, sug, singer); toast(t("voice.appliedToast", {key: sug})); }}>{applied ? t("voice.applied") : t("voice.apply")}</button>
        </div>;
      })}</div> : <p className="note">{t("voice.noSongs")}</p>}
    </div>}
  </>;
}
