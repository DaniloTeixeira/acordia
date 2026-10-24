// Estudo: explorador de escalas e campo harmônico e treino em forma de jogo.
import { t } from "../../lib/i18n";
import * as store from "../../lib/store";
import { useData } from "../../state";
import { BackLink } from "../../ui/BackLink";
import { Seg } from "../../ui/Seg";
import { Explore } from "./Explore";
import { Train } from "./Train";
import type { ScaleId, Level } from "../../lib/core";

export interface StudyState { tab: "explore" | "train"; rootPc: number; scaleId: ScaleId; sevenths: boolean; octave: number; kind: string; level: Level; mode: "choice" | "full" }
// Quantas oitavas o teclado do Explorar desce ou sobe a partir da posição padrão (C1 a B7 nos extremos).
export const OCT_MAX = 2;
const DEFAULTS: StudyState = {tab:"explore", rootPc:0, scaleId:"maior", sevenths:false, octave:0, kind:"misto", level:"facil", mode:"choice"};
export function studyState(): StudyState {
  const s = Object.assign({}, DEFAULTS, store.data.settings.study || {}) as StudyState;
  if(!["explore", "train"].includes(s.tab)) s.tab = "explore";
  s.octave = Math.max(-OCT_MAX, Math.min(OCT_MAX, Math.round(+s.octave) || 0));
  return s;
}
export function setStudy(p: Partial<StudyState>){ store.setSetting("study", Object.assign(studyState(), p)); }

export function Study(){
  useData();
  const st = studyState();
  return <section className="view" id="view-study" data-view="study" aria-labelledby="study-h">
    <BackLink id="study-back" fallback="more"/>
    <div className="view-head"><div>
      <h1 id="study-h">{t("study.title")}</h1><p className="sub">{t("study.sub")}</p></div></div>
    <Seg id="study-tabs" className="tabs" aria={t("study.tabsAria")} value={st.tab} onChange={tab => setStudy({tab})}
      options={[{v: "explore", label: t("study.explore")}, {v: "train", label: t("study.train")}]}/>
    <div id="study-explore" hidden={st.tab !== "explore"}>{st.tab === "explore" && <Explore/>}</div>
    {/* O treino continua montado ao trocar de aba, para não perder a rodada em andamento. */}
    <div id="study-train" hidden={st.tab !== "train"}><Train active={st.tab === "train"}/></div>
  </section>;
}
