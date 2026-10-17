// Treino: rodadas de 10 perguntas (graus, notas, relativas, ouvido e do próprio repertório).
import { useEffect, useRef, useState } from "react";
import { makeQuestion, makeRepertoireQuestion, QUIZ_KINDS, NOTE_GRID, CHORD_QUALITIES, cadence, type Question } from "../../lib/core";
import { playChord, playNotesAt, playProgression, audioNow, cue } from "../../lib/audio";
import { t } from "../../lib/i18n";
import * as store from "../../lib/store";
import { useUI, toast } from "../../state";
import { repertoireEntries } from "../../repertoire";
import { Icon } from "../../ui/Icon";
import { Seg } from "../../ui/Seg";
import { studyState, setStudy } from "./Study";

const ROUND = 10;
const KINDS = ["misto", ...QUIZ_KINDS, "repertorio"];
const QUAL_LABEL: Record<string, string> = {"":"train.qM", "m":"train.qm", "°":"train.qd", "+":"train.qa"};
const kindLabel = (k: string) => k === "misto" ? [t("train.mixed"), t("train.mixedD")] : [t("train." + k), t("train." + k + "D")];

// Os sons do treino ficam em volta do Dó central: a nota mais grave entre Fá#3 e Fá4. Mais agudo fica difícil
// distinguir as notas; mais grave embola e distorce em alto-falante pequeno.
const baseFor = (pcs: number[]) => Math.min(...pcs) >= 6 ? 48 : 60;
// Som da pergunta: o acorde, ou (grau de ouvido) a cadência no tom e depois a nota.
function playQ(q: Question, noteOnly = false){
  if(!q.ear){ if(q.play) playChord(q.play, {base: baseFor(q.play)}); return; }
  const at = audioNow(); if(at === null) return toast(t("study.noAudio"));
  const tonic = baseFor([q.ear.tonic]) + q.ear.tonic;
  // Cadência sem pressa (0,75 s por acorde) e uma pausa antes da nota, para o tom assentar.
  const end = noteOnly ? at + 0.05 : (playProgression(cadence(q.ear.minor).map(c => c.map(x => tonic + x)), at + 0.05, 0.75) ?? at) + 0.45;
  playNotesAt([tonic + q.ear.note], end, 1.3);
}

interface Quiz { i: number; right: number; streak: number; q: Question; last: string; answered: boolean; picked: string | null; ok: boolean; root: string | null; qual: string; bump: number }
type Phase = {kind: "setup"} | {kind: "quiz"; quiz: Quiz} | {kind: "summary"; right: number; prev: number | undefined; isBest: boolean};

export function Train({active}: {active: boolean}){
  const st = studyState();
  const lang = useUI(s => s.lang);
  const [phase, setPhase] = useState<Phase>({kind: "setup"});
  const bestKey = st.kind + ":" + st.level + (st.mode === "full" ? ":full" : "");
  const question = () => st.kind === "repertorio" ? makeRepertoireQuestion(repertoireEntries()) : makeQuestion(st.kind, st.level);
  const next = (base: Omit<Quiz, "q" | "last" | "answered" | "picked" | "ok" | "root" | "qual" | "bump"> & {last: string}) => {
    let q: Question | null, tries = 0;
    do { q = question(); } while(q && q.prompt + q.answer === base.last && ++tries < 5);
    if(!q) return setPhase({kind: "setup"});
    setPhase({kind: "quiz", quiz: {...base, q, last: q.prompt + q.answer, answered: false, picked: null, ok: false, root: null, qual: "", bump: 0}});
    if(q.autoplay){ const qq = q; setTimeout(() => playQ(qq), 250); }
  };
  const start = () => next({i: 0, right: 0, streak: 0, last: ""});
  // Ao trocar de idioma, uma pergunta ainda sem resposta é refeita no novo idioma.
  const langRef = useRef(lang);
  useEffect(() => {
    if(langRef.current === lang) return; langRef.current = lang;
    if(phase.kind === "quiz" && !phase.quiz.answered){ const {i, right, streak} = phase.quiz; next({i, right, streak, last: ""}); }
  }, [lang]);
  if(phase.kind === "setup") return <Setup start={start} bestKey={bestKey}/>;
  if(phase.kind === "summary") return <Summary {...phase} again={start} setup={() => setPhase({kind: "setup"})}/>;
  const quiz = phase.quiz;
  const answer = (value: string) => {
    if(quiz.answered) return;
    const ok = value === quiz.q.answer;
    // No acerto que toca o acorde, o próprio acorde é o retorno; nos outros, o som de acerto ou erro.
    if(ok && quiz.q.play && quiz.q.kind !== "ouvido") playChord(quiz.q.play, {base: baseFor(quiz.q.play)}); else cue(ok ? "ok" : "bad");
    setPhase({kind: "quiz", quiz: {...quiz, answered: true, picked: value, ok, right: quiz.right + (ok ? 1 : 0), streak: ok ? quiz.streak + 1 : 0, bump: ok ? quiz.bump + 1 : quiz.bump}});
  };
  const advance = () => {
    const i = quiz.i + 1;
    if(i < ROUND) return next({i, right: quiz.right, streak: quiz.streak, last: quiz.last});
    const best = Object.assign({}, store.data.settings.best || {}) as Record<string, number>, prev = best[bestKey], isBest = prev === undefined || quiz.right > prev;
    if(isBest){ best[bestKey] = quiz.right; store.setSetting("best", best); }
    setPhase({kind: "summary", right: quiz.right, prev, isBest});
  };
  return <QuizView quiz={quiz} full={st.mode === "full"} active={active} answer={answer} advance={advance} quit={() => setPhase({kind: "setup"})}
    setPick={(root, qual) => setPhase({kind: "quiz", quiz: {...quiz, root, qual}})}/>;
}

function Setup({start, bestKey}: {start: () => void; bestKey: string}){
  const st = studyState();
  const best = ((store.data.settings.best || {}) as Record<string, number>)[bestKey];
  const noRep = st.kind === "repertorio" && !makeRepertoireQuestion(repertoireEntries());
  return <div className="train-setup" style={{marginTop: 16}}>
    <h2>{t("train.kind")}</h2>
    <div className="kinds">{KINDS.map(k => { const [a, b] = kindLabel(k); return <button key={k} className="kind" data-k={k} aria-pressed={k === st.kind} onClick={() => setStudy({kind: k})}><b>{a}</b><span>{b}</span></button>; })}</div>
    <div className="setup-row">
      <div><h2>{t("train.level")}</h2>
        <Seg id="tr-level" aria={t("train.level")} value={st.level} onChange={level => setStudy({level})}
          options={[{v: "facil", label: t("train.easy")}, {v: "medio", label: t("train.medium")}, {v: "dificil", label: t("train.hard")}]}/>
        <p className="sub" style={{marginTop: 6}}>{t("train.levelD." + st.level)}</p></div>
      <div><h2>{t("train.answers")}</h2>
        <Seg id="tr-mode" aria={t("train.answers")} value={st.mode} onChange={mode => setStudy({mode})}
          options={[{v: "choice", label: t("train.choice")}, {v: "full", label: t("train.full")}]}/>
        <p className="sub" style={{marginTop: 6}}>{t(st.mode === "full" ? "train.fullD" : "train.choiceD")}</p></div>
    </div>
    <div className="study-row"><button className="btn primary" id="tr-start" disabled={noRep} onClick={start}><Icon name="play" sm/> {t("train.start")}</button>
      {noRep && <span className="note">{t("train.needRepertoire")}</span>}
      {best !== undefined && <span className="best">{t("train.best", {n: best, total: ROUND})}</span>}</div>
  </div>;
}

function QuizView({quiz, full, active, answer, advance, quit, setPick}: {quiz: Quiz; full: boolean; active: boolean; answer: (v: string) => void; advance: () => void; quit: () => void; setPick: (root: string | null, qual: string) => void}){
  const q = quiz.q, nextBtn = useRef<HTMLButtonElement>(null);
  const building = full && q.full.type === "chord";
  useEffect(() => { if(quiz.answered) nextBtn.current?.focus({preventScroll: true}); }, [quiz.answered]);
  // Atalhos: 1–4 respondem (com alternativas); Enter avança depois de responder.
  useEffect(() => {
    if(!active) return;
    const key = (e: KeyboardEvent) => {
      if(e.target instanceof Element && e.target.closest("input,textarea,select")) return;
      const n = +e.key;
      // No grau de ouvido as respostas já são números: a tecla 3 responde "3", não a 3ª opção.
      if(q.ear && n >= 1 && n <= 7 && !quiz.answered){ const o = String(n); if((full && q.full.type === "list" ? q.full.options : q.options).includes(o)){ e.preventDefault(); answer(o); } }
      else if(!full && n >= 1 && n <= 4 && !quiz.answered){ const o = q.options[n-1]; if(o !== undefined){ e.preventDefault(); answer(o); } }
      else if(e.key === "Enter" && quiz.answered && document.activeElement === document.body){ e.preventDefault(); advance(); }
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  });
  const cls = (o: string, base: string) => {
    // Montando o acorde, a escolha aparece pelo aria-pressed; o resultado vai no botão Confirmar.
    if(!quiz.answered || building) return base;
    if(o === q.answer) return base + " right";
    if(o === quiz.picked) return base + " wrong";
    return base + " dim";
  };
  const opt = (o: string, i: number, base = "answer") => <button key={o} className={cls(o, base)} data-o={o} style={{animationDelay: Math.min(i, 12)*25 + "ms"}}
    disabled={quiz.answered} aria-pressed={building && base.includes("cell") ? quiz.root === o : undefined}
    onClick={() => building ? (!quiz.answered && setPick(o, quiz.qual)) : answer(o)}>
    {i < 4 && base === "answer" && <span className="sr-only">{i+1}. </span>}{o}</button>;
  const noteGrid = (extra = "") => <div className={"note-grid " + extra} role="group" aria-label={t("train.notesAria")}>{NOTE_GRID.map(row => row.map((n, i) => opt(n, i, "answer cell")))}</div>;
  let answers: React.ReactNode;
  if(!full) answers = <div className="answers">{q.options.map((o, i) => opt(o, i))}</div>;
  else if(q.full.type === "notes") answers = noteGrid();
  else if(q.full.type === "list"){ const w = Math.max(...q.full.options.map(o => o.length)); answers = <div className="answer-list" style={{"--cell": Math.max(68, w * 11 + 28) + "px"} as React.CSSProperties}>{q.full.options.map((o, i) => opt(o, i, "answer cell"))}</div>; }
  else answers = <><p className="sub">{t("train.pickChord")}</p>{noteGrid("pick")}
    <div className="study-row"><Seg id="tr-qual" aria={t("train.quality")} value={quiz.qual} disabled={quiz.answered} onChange={v => setPick(quiz.root, v)}
      options={CHORD_QUALITIES.map(x => ({v: x, label: t(QUAL_LABEL[x])}))}/>
      <button className={"btn primary" + (quiz.answered ? (quiz.ok ? " right-btn" : " wrong-btn") : "")} id="tr-confirm" disabled={!quiz.root || quiz.answered}
        onClick={() => answer(quiz.root! + quiz.qual)}>{quiz.root ? t("train.confirmChord", {chord: quiz.root + quiz.qual}) : t("train.confirm")}</button></div></>;
  const done = quiz.i + (quiz.answered ? 1 : 0), misses = done - quiz.right;
  return <>
    <div className="quiz card">
      <div className="quiz-top"><span>{t("train.question", {n: quiz.i + 1, total: ROUND})}</span><div className="progress"><span style={{width: done / ROUND * 100 + "%"}}/></div>
        <span key={quiz.bump} className={"streak" + (quiz.bump ? " bump" : "")} title={t("train.streak")}><Icon name="flame" sm/> {quiz.streak}</span></div>
      <p className="prompt">{q.prompt}</p>
      {(q.kind === "ouvido" || q.ear) && <div className="study-row"><button className="btn soft sm" id="tr-listen" onClick={() => playQ(q)}><Icon name="sound" sm/> {t("train.listen")}</button>
        {q.ear && <button className="btn ghost sm" id="tr-note" onClick={() => playQ(q, true)}>{t("train.noteOnly")}</button>}</div>}
      {answers}
      {/* As opções já mostram o acerto e o erro (e a resposta certa) pela cor, então o texto só aparece ao montar o
          acorde, onde a resposta certa não aparece em outro lugar; nos outros casos fica só para leitores de tela. */}
      <div className="study-row tr-foot">
        {/* Placar da rodada à esquerda do botão; o número que muda dá um pulo (a key troca e a animação roda). */}
        <div className="tr-score" role="group" aria-label={t("train.score")}>
          <span className="ok"><b key={"r" + quiz.right} className={quiz.answered && quiz.ok ? "bump" : ""}>{quiz.right}</b><small>{t("train.hits")}</small></span>
          <span className="bad"><b key={"w" + misses} className={quiz.answered && !quiz.ok ? "bump" : ""}>{misses}</b><small>{t("train.misses")}</small></span>
        </div>
        <p className={"feedback" + (quiz.answered ? (quiz.ok ? " ok" : " bad") : "") + (building ? "" : " sr-only")} aria-live="polite">{quiz.answered ? (quiz.ok ? t("train.right") : t("train.wrong", {answer: q.answer})) : ""}</p>
        <button className="btn primary" id="tr-next" ref={nextBtn} disabled={!quiz.answered} onClick={advance}>{quiz.i + 1 >= ROUND ? t("train.finish") : t("train.next")}</button></div>
    </div>
    {/* Trocar de treino fica embaixo do card, longe dos botões de resposta. */}
    <button className="btn ghost sm back tr-quit" id="tr-quit" onClick={quit}><Icon name="back" sm/> {t("train.change")}</button>
  </>;
}

function Summary({right, prev, isBest, again, setup}: {right: number; prev: number | undefined; isBest: boolean; again: () => void; setup: () => void}){
  const pct = right / ROUND, msg = pct >= 0.9 ? "great" : pct >= 0.6 ? "good" : "try";
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { btn.current?.focus({preventScroll: true}); }, []);
  return <>
    <button className="btn ghost sm back" id="tr-setup" onClick={setup}><Icon name="back" sm/> {t("train.change")}</button>
    <div className="card summary" style={{maxWidth: 720}}>
      <div className="big">{Math.round(pct * 100)}%</div>
      <h2>{t("train.result", {right, total: ROUND})}</h2>
      <p>{t("train.msg." + msg)}</p>
      <p className="best">{isBest && right ? t("train.newBest") : t("train.best", {n: Math.max(prev ?? 0, right), total: ROUND})}</p>
      <div className="study-row" style={{justifyContent: "center"}}><button className="btn primary" id="tr-again" ref={btn} onClick={again}>{t("train.again")}</button></div>
    </div>
  </>;
}
