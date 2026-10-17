// Estudo: explorador de escalas e campo harmônico, treino em forma de jogo e prática das mãos.
import { t } from "../../lib/i18n";
import * as store from "../../lib/store";
import { useData } from "../../state";
import { Seg } from "../../ui/Seg";
import { Explore } from "./Explore";
import { Train } from "./Train";
import { Rhythm } from "./Rhythm";
import { Keys } from "./Keys";
import { Voice } from "./Voice";
import { useState } from "react";
import type { ScaleId, Level } from "../../lib/core";

export interface StudyState { tab: "explore" | "train" | "hands" | "voice"; rootPc: number; scaleId: ScaleId; sevenths: boolean; octave: number; kind: string; level: Level; mode: "choice" | "full"; handsMode: "rhythm" | "keys" }
// Quantas oitavas o teclado do Explorar desce ou sobe a partir da posição padrão (C1 a B7 nos extremos).
export const OCT_MAX = 2;
const DEFAULTS: StudyState = {tab:"explore", rootPc:0, scaleId:"maior", sevenths:false, octave:0, kind:"misto", level:"facil", mode:"choice", handsMode:"rhythm"};
export function studyState(): StudyState {
  const s = Object.assign({}, DEFAULTS, store.data.settings.study || {}) as StudyState;
  if(!["explore", "train", "hands", "voice"].includes(s.tab)) s.tab = "explore";
  s.octave = Math.max(-OCT_MAX, Math.min(OCT_MAX, Math.round(+s.octave) || 0));
  return s;
}
export function setStudy(p: Partial<StudyState>){ store.setSetting("study", Object.assign(studyState(), p)); }

export function Study(){
  useData();
  const st = studyState();
  // Reinicia o treino (ex.: o atalho da aba Voz abre o grau de ouvido do começo).
  const [trainRun, setTrainRun] = useState(0);
  const openEarTraining = () => { setStudy({kind: "grauOuvido", tab: "train"}); setTrainRun(n => n + 1); };
  return <section className="view" id="view-study" data-view="study" aria-labelledby="study-h">
    <div className="view-head"><div><h1 id="study-h">{t("study.title")}</h1><p className="sub">{t("study.sub")}</p></div></div>
    <Seg id="study-tabs" aria={t("study.tabsAria")} value={st.tab} onChange={tab => setStudy({tab})}
      options={[{v: "explore", label: t("study.explore")}, {v: "train", label: t("study.train")}, {v: "hands", label: t("study.hands")}, {v: "voice", label: t("study.voice")}]}/>
    <div id="study-explore" hidden={st.tab !== "explore"}>{st.tab === "explore" && <Explore/>}</div>
    {/* O treino continua montado ao trocar de aba, para não perder a rodada em andamento. */}
    <div id="study-train" hidden={st.tab !== "train"}><Train key={trainRun} active={st.tab === "train"}/></div>
    <div id="study-hands" hidden={st.tab !== "hands"}>{st.tab === "hands" && <>
      <Seg className="sub-seg" id="hands-mode" value={st.handsMode} onChange={handsMode => setStudy({handsMode})}
        options={[{v: "rhythm", label: t("hands.modeRhythm")}, {v: "keys", label: t("hands.modeKeys")}]}/>
      <div id="hands-rhythm" hidden={st.handsMode !== "rhythm"}>{st.handsMode === "rhythm" && <Rhythm/>}</div>
      <div id="hands-keys" hidden={st.handsMode !== "keys"}>{st.handsMode === "keys" && <Keys/>}</div>
    </>}</div>
    <div id="study-voice" hidden={st.tab !== "voice"}>{st.tab === "voice" && <Voice openEarTraining={openEarTraining}/>}</div>
  </section>;
}
