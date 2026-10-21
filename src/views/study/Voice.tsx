// Aba Voz do Estudo, pensada para cantores: "Minha extensão" mede a voz e sugere o tom das músicas do
// repertório aberto.
import { useEffect, useRef, useState } from "react";
import { voiceType, voiceShift, transposeKey } from "../../lib/core";
import { listenPitch, midiName } from "../../lib/tuner";
import { t } from "../../lib/i18n";
import * as store from "../../lib/store";
import { useData, toast } from "../../state";
import { voiceSongs, applyVoiceKey, setSongHigh } from "../../repertoire";
import { Icon } from "../../ui/Icon";
import { micFailed } from "../../ui/micFailed";
import { Select } from "../../ui/Select";
import { SecHead } from "../../ui/SecHead";

const { data } = store;
const midiOf = (f: number) => 69 + 12 * Math.log2(f / 440);
const LOWEST = 36, HIGHEST = 96; // C2..C7, limites da medição e das listas de notas

interface VoiceState { singer: string }
const voiceState = (): VoiceState => Object.assign({singer: ""}, data.settings.voice || {});
const setVoice = (p: Partial<VoiceState>) => store.setSetting("voice", Object.assign(voiceState(), p));
type Voices = Record<string, {low?: number; high?: number}>;
const voices = (): Voices => (data.settings.voices || {}) as Voices;

// Microfone: liga com um callback e desliga ao sair da tela.
function useMic(){
  const stop = useRef<(() => void) | null>(null);
  const off = () => { if(stop.current){ stop.current(); stop.current = null; } };
  const on = async (onPitch: (f: number | null) => void, retry?: () => void) => {
    off();
    try{ stop.current = await listenPitch(onPitch); return true; }
    catch(e){ micFailed(e, retry); return false; }
  };
  useEffect(() => off, []);
  return {on, off};
}

export function Voice(){
  useData();
  return <VoiceRange/>;
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
  // Qual nota acabou de ser salva: mostra "✓ Salvo" no título do card por um instante.
  const [saved, setSaved] = useState<"low" | "high" | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(savedTimer.current), []);
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
    }, () => startMeasure(which));
    if(!ok){ run.current = null; return; }
    setMeasuring({which, live: t("voice.singNow"), best: null});
  };
  const stopMeasure = () => {
    const m = run.current; mic.off(); run.current = null; setMeasuring(null);
    if(m && m.best !== null){
      const cur = Object.assign({}, voices()[singer] || {}); cur[m.which] = m.best;
      if(cur.low && cur.high && cur.low > cur.high) [cur.low, cur.high] = [cur.high, cur.low];
      saveVoice(cur);
      setSaved(m.which); clearTimeout(savedTimer.current); savedTimer.current = setTimeout(() => setSaved(null), 2500);
    } else if(m) toast(t("voice.noNote"));
  };
  const songs = v && v.high ? voiceSongs() : [];
  return <>
    <div className="card voice-card">
      <SecHead>{t("voice.rangeTitle")}</SecHead>
      <p className="sub">{t("voice.rangeD")}</p>
      {/* Passo a passo: aberto enquanto a extensão não foi medida, recolhido depois. */}
      <details className="voice-howto" open={!(v && v.low && v.high)}>
        <summary><Icon name="help" sm/> {t("voice.how.title")}<Icon name="chev" sm className="howto-chev"/></summary>
        <ol>{[1, 2, 3, 4, 5].map(n => <li key={n}>{t("voice.how.s" + n)}</li>)}</ol>
      </details>
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
            <span className="lbl">{t(which === "low" ? "voice.lowest" : "voice.highest")}
              <span className={"voice-saved" + (saved === which ? " on" : "")} role="status">{saved === which ? "✓ " + t("common.saved") : ""}</span></span>
            <b className="voice-val">{val ? midiName(val) : "—"}</b>
            {/* Sempre no lugar (só invisível fora da medição), para o card não crescer quando a nota ao vivo aparece. */}
            <span className={"voice-live" + (on ? "" : " idle")} aria-hidden={!on}>{on ? measuring.live : ""}</span>
            <div className="voice-step-actions">
              <button className="btn soft sm" data-measure={which} onClick={() => {
                const was = measuring && measuring.which;
                if(was) stopMeasure(); // salva a medição em andamento
                if(was !== which) startMeasure(which);
              }}>{on ? <><Icon name="check" sm/> {t("common.save")}</> : <><Icon name="sound" sm/> {t(val ? "voice.measureAgain" : "voice.measure")}</>}</button>
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
      <SecHead>{t("voice.keysTitle", {name: singer})}</SecHead>
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
