// Aba Voz das Ferramentas, pensada para cantores: "Minha extensão" mede a voz e guarda no perfil, para o líder e o
// grupo verem a classificação vocal de cada cantor em Membros e na escala do evento.
import { useEffect, useRef, useState } from "react";
import { voiceType } from "../lib/core";
import { listenPitch, midiName } from "../lib/tuner";
import { cleanRange, HOLD_TICKS, newHold, holdStep, holdDone, type Hold } from "../lib/voice";
import { saveVoiceRange } from "../lib/groups";
import { useAuth } from "../lib/cloud";
import { t } from "../lib/i18n";
import * as store from "../lib/store";
import { useData, toast } from "../state";
import { Icon } from "../ui/Icon";
import { useMedia } from "../ui/hooks";
import { micFailed, micOk } from "../ui/micFailed";
import { MicHelp } from "../ui/MicHelp";
import { pad } from "../pad";
import { SecHead } from "../ui/SecHead";
import { VoiceChip } from "../ui/VoiceChip";
import { Spin } from "./Account";

const midiOf = (f: number) => 69 + 12 * Math.log2(f / 440);

// Microfone: liga com um callback e desliga ao sair da tela.
function useMic(){
  const stop = useRef<(() => void) | null>(null);
  const off = () => { if(stop.current){ stop.current(); stop.current = null; } };
  const on = async (onPitch: (f: number | null) => void, retry?: () => void) => {
    off();
    // O microfone ouviria o pad no lugar da voz.
    pad.stop();
    try{ stop.current = await listenPitch(onPitch); micOk(); return true; }
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
  // Mesmo corte do trilho lateral (celular/tablet usam a barra de abas).
  const wide = useMedia("(min-width: 900px)");
  const [measuring, setMeasuring] = useState<{which: Which; hold: number} | null>(null);
  const run = useRef<({which: Which} & Hold) | null>(null);
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
  // Mede a nota que a pessoa sustenta: ao segurar a mesma nota por ~2 s ela é salva sozinha e a medição termina.
  const startMeasure = async (which: Which) => {
    run.current = {which, ...newHold()};
    const ok = await mic.on(f => {
      const cur = run.current; if(!cur || cur.which !== which) return;
      const h = holdStep(cur, f ? Math.round(midiOf(f)) : null);
      run.current = {which, ...h};
      if(holdDone(h)){ mic.off(); run.current = null; setMeasuring(null); save(which, h.note!); return; }
      setMeasuring(s => s && {...s, hold: Math.min(1, h.run / HOLD_TICKS)});
    }, () => startMeasure(which));
    if(!ok){ run.current = null; return; }
    setMeasuring({which, hold: 0});
  };
  const cancelMeasure = () => { mic.off(); run.current = null; setMeasuring(null); };
  return <div className="card voice-card">
    <SecHead>{t("voice.rangeTitle")}</SecHead>
    <p className="sub">{t("voice.rangeD")}</p>
    <MicHelp/>
    {/* Passo a passo: sempre aberto na tela larga (sobra espaço); no celular, aberto só enquanto a extensão não foi medida. */}
    <details className="voice-howto" open={wide || !(v.low !== null && v.high !== null)}>
      <summary><Icon name="help" sm/> {t("voice.how.title")}<Icon name="chev" sm className="howto-chev"/></summary>
      <ol>{[1, 2, 3, 4].map(n => <li key={n}>{t("voice.how.s" + n)}</li>)}</ol>
    </details>
    <div className="voice-steps">
      {(["low", "high"] as const).map(which => {
        const on = measuring && measuring.which === which, busy = saving === which;
        const cur = v[which], val = cur;
        return <div key={which} className={"voice-step" + (on ? " measuring" : "")} data-step={which}>
          <h3 className="lbl">{t(which === "low" ? "voice.lowest" : "voice.highest")}
            <span className={"voice-saved" + (saved === which ? " on" : "")} role="status">{saved === which ? "✓ " + t("common.saved") : ""}</span></h3>
          <b className="voice-val">{val ? midiName(val) : "—"}</b>
          {/* Uma linha só, antes do botão: diz o que cantar e, medindo, vira "Cante e segure uma nota…" (no mesmo lugar, o card não cresce). */}
          <span className={"voice-live" + (on ? " on" : "")}>{on ? t("voice.singNow") : t(which === "low" ? "voice.lowestD" : "voice.highestD")}</span>
          <span className={"voice-hold" + (on ? "" : " idle")} aria-hidden="true"><i style={{width: (on ? measuring.hold * 100 : 0) + "%"}}/></span>
          {/* No fim do card, à direita. Primeira medição é o botão de destaque; depois de medido (ou medindo, para cancelar) vira link. */}
          <div className="voice-step-foot">
            <button type="button" className={cur !== null || on ? "link-btn voice-measure" : "btn soft sm"} data-measure={which} aria-busy={busy} disabled={busy} onClick={() => {
              const was = measuring && measuring.which;
              if(was) cancelMeasure();
              if(was !== which) startMeasure(which);
            }}>{busy ? <Spin/> : <Icon name={on ? "x" : cur !== null ? "sync" : "sound"} sm/>} {on ? t("common.cancel") : t(cur !== null ? "voice.measureAgain" : "voice.measure")}</button>
          </div>
        </div>;
      })}
    </div>
    {type && v.low !== null && v.high !== null && <><p className="voice-result">{t("voice.result", {low: midiName(v.low), high: midiName(v.high)})}<VoiceChip voice_low={v.low} voice_high={v.high}/></p><p className="sub">{t("voice.typeNote")}</p></>}
    <p className="sub">{t("voice.shared")}</p>
  </div>;
}
