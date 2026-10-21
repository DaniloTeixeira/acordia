// Aba Voz do Estudo, pensada para cantores: "Minha extensão" mede a voz e guarda no perfil, para o líder e o
// grupo verem a faixa de cada cantor em Membros e na escala do evento.
import { useEffect, useRef, useState } from "react";
import { voiceType } from "../../lib/core";
import { listenPitch, midiName } from "../../lib/tuner";
import { cleanRange, VOICE_LOWEST, VOICE_HIGHEST } from "../../lib/voice";
import { saveVoiceRange } from "../../lib/groups";
import { useAuth } from "../../lib/cloud";
import { t } from "../../lib/i18n";
import * as store from "../../lib/store";
import { useData, toast } from "../../state";
import { Icon } from "../../ui/Icon";
import { micFailed } from "../../ui/micFailed";
import { SecHead } from "../../ui/SecHead";
import { Spin } from "../Account";

const midiOf = (f: number) => 69 + 12 * Math.log2(f / 440);

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

type Which = "low" | "high";
function VoiceRange(){
  const profile = useAuth(s => s.profile);
  const v = cleanRange(profile?.voice_low, profile?.voice_high);
  const type = v.low !== null && v.high !== null ? voiceType(v.low, v.high) : null;
  const mic = useMic();
  const [measuring, setMeasuring] = useState<{which: Which; live: string; best: number | null} | null>(null);
  const run = useRef<{which: Which; best: number | null; run: number; lastMidi: number | null} | null>(null);
  // Gravando na nuvem (spinner no botão) e qual nota acabou de ser salva ("✓ Salvo" no título por um instante).
  const [saving, setSaving] = useState<Which | null>(null);
  const [saved, setSaved] = useState<Which | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(savedTimer.current), []);
  const save = async (which: Which, note: number) => {
    const next = cleanRange(which === "low" ? note : v.low, which === "high" ? note : v.high);
    setSaving(which);
    const ok = await saveVoiceRange(next).finally(() => setSaving(null));
    if(!ok) return toast(t("voice.saveFail"), {label: t("common.retry"), run: () => save(which, note)});
    setSaved(which); clearTimeout(savedTimer.current); savedTimer.current = setTimeout(() => setSaved(null), 2500);
  };
  // Quem já mediu antes de a extensão ir para o perfil (guardada só neste aparelho): sobe uma vez, sem avisar.
  const migrated = useRef(false);
  useEffect(() => {
    if(!profile || migrated.current || v.low !== null || v.high !== null) return;
    migrated.current = true;
    const old = Object.values((store.data.settings.voices || {}) as Record<string, {low?: number; high?: number}>)[0];
    const r = cleanRange(old?.low, old?.high);
    if(r.low !== null || r.high !== null) saveVoiceRange(r);
  }, [profile]);
  // Mede a nota mais grave (ou aguda) que a pessoa sustenta: conta uma nota quando ela fica ~0,5 s estável.
  const startMeasure = async (which: Which) => {
    run.current = {which, best: null, run: 0, lastMidi: null};
    const ok = await mic.on(f => {
      const m0 = run.current; if(!m0 || m0.which !== which) return;
      if(!f){ m0.run = 0; setMeasuring(s => s && {...s, live: t("voice.singNow")}); return; }
      const m = Math.round(midiOf(f));
      if(m < VOICE_LOWEST || m > VOICE_HIGHEST) return;
      m0.run = m === m0.lastMidi ? m0.run + 1 : 1; m0.lastMidi = m;
      if(m0.run >= 8 && (m0.best === null || (which === "low" ? m < m0.best : m > m0.best))) m0.best = m;
      setMeasuring(s => s && {...s, live: t("voice.hearing", {note: midiName(m)}), best: m0.best});
    }, () => startMeasure(which));
    if(!ok){ run.current = null; return; }
    setMeasuring({which, live: t("voice.singNow"), best: null});
  };
  const stopMeasure = () => {
    const m = run.current; mic.off(); run.current = null; setMeasuring(null);
    if(m && m.best !== null) save(m.which, m.best);
    else if(m) toast(t("voice.noNote"));
  };
  return <div className="card voice-card">
    <SecHead>{t("voice.rangeTitle")}</SecHead>
    <p className="sub">{t("voice.rangeD")}</p>
    {/* Passo a passo: aberto enquanto a extensão não foi medida, recolhido depois. */}
    <details className="voice-howto" open={!(v.low !== null && v.high !== null)}>
      <summary><Icon name="help" sm/> {t("voice.how.title")}<Icon name="chev" sm className="howto-chev"/></summary>
      <ol>{[1, 2, 3, 4].map(n => <li key={n}>{t("voice.how.s" + n)}</li>)}</ol>
    </details>
    <div className="voice-steps">
      {(["low", "high"] as const).map(which => {
        const on = measuring && measuring.which === which, busy = saving === which;
        const cur = v[which], val = on && measuring.best !== null ? measuring.best : cur;
        return <div key={which} className={"voice-step" + (on ? " measuring" : "")} data-step={which}>
          <span className="lbl">{t(which === "low" ? "voice.lowest" : "voice.highest")}
            <span className={"voice-saved" + (saved === which ? " on" : "")} role="status">{saved === which ? "✓ " + t("common.saved") : ""}</span></span>
          <b className="voice-val">{val ? midiName(val) : "—"}</b>
          {/* Sempre no lugar (só invisível fora da medição), para o card não crescer quando a nota ao vivo aparece. */}
          <span className={"voice-live" + (on ? "" : " idle")} aria-hidden={!on}>{on ? measuring.live : ""}</span>
          <div className="voice-step-actions">
            <button className="btn soft sm" data-measure={which} aria-busy={busy} disabled={busy} onClick={() => {
              const was = measuring && measuring.which;
              if(was) stopMeasure(); // salva a medição em andamento
              if(was !== which) startMeasure(which);
            }}>{busy ? <Spin/> : on ? <Icon name="check" sm/> : <Icon name="sound" sm/>} {on ? t("common.save") : t(cur ? "voice.measureAgain" : "voice.measure")}</button>
            {cur !== null && <>
              {([-1, 1] as const).map(d => <button key={d} className="icon-btn sm" data-nudge={which + ":" + d} disabled={busy} aria-label={t(d < 0 ? "voice.lower" : "voice.higher")} title={t(d < 0 ? "voice.lower" : "voice.higher")}
                onClick={() => save(which, Math.max(VOICE_LOWEST, Math.min(VOICE_HIGHEST, cur + d)))}><Icon name={d < 0 ? "minus" : "plus"} sm/></button>)}
            </>}
          </div>
          <p className="sub">{t(which === "low" ? "voice.lowestD" : "voice.highestD")}</p>
        </div>;
      })}
    </div>
    {type && v.low !== null && v.high !== null && <><p className="voice-result">{t("voice.result", {low: midiName(v.low), high: midiName(v.high), type: t("voice.type." + type)})}</p><p className="sub">{t("voice.typeNote")}</p></>}
    <p className="sub">{t("voice.shared")}</p>
  </div>;
}
