// Explorador: escala no teclado ou no braço, campo harmônico com funções e a legenda das funções.
import { useRef, useState } from "react";
import { SCALES, noteName, spellScale, scaleDegrees, harmonicField, relativeKey, rootFor, type FieldChord, type ScaleId } from "../../lib/core";
import { INSTRUMENTS, isInstrument, voicings } from "../../lib/instruments";
import { fretboardSVG, diagramSVG, scaleKeyboardSVG, type Marks } from "../../lib/svg";
import { playChord, playSequence } from "../../lib/audio";
import { t, degLabel } from "../../lib/i18n";
import { toast, openDialog } from "../../state";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import { InstrumentSelect, TimbreSelect } from "../InstrumentSelect";
import { instrument } from "../Repertoire";
import { studyState, setStudy } from "./Study";

function FnLegend({field, fnName}: {field: FieldChord[]; fnName: Record<string, string>}){
  const by = (f: string) => field.filter(c => c.fn === f);
  const ex = ["T","SD","D","T"].map(f => { const c = by(f)[0]; return c ? c.name : ""; }).filter(Boolean).join(" → ");
  return <div className="fn-legend">
    <h3>{t("study.fnTitle")}</h3><p className="sub">{t("study.fnIntro")}</p>
    <div className="fn-grid">{["T","SD","D"].map(f => <div key={f} className={"fn-item " + f}>
      <div className="fn-name"><span className={"fn " + f}>{f}</span> {fnName[f]}</div>
      <p>{t("study.fn" + f + "D")}</p>
      <p className="fn-here">{t("study.fnHere", {degrees: by(f).map(c => c.degree + " (" + c.name + ")").join(", ")})}</p></div>)}</div>
    <p className="sub">{t("study.fnFlow", {example: ex})}</p></div>;
}

export function Explore(){
  const st = studyState();
  const root_ = useRef<HTMLDivElement>(null);
  const sc = SCALES[st.scaleId], root = rootFor(st.rootPc, st.scaleId);
  const names = spellScale(root, st.scaleId), degs = scaleDegrees(st.scaleId);
  const byPc: Record<number, string> = {}; sc.iv.forEach((iv, i) => byPc[(st.rootPc + iv) % 12] = names[i]);
  const field = harmonicField(root, st.scaleId, st.sevenths);
  const relKey = sc.minor ? relativeKey(root + "m") : relativeKey(root);
  const fnName: Record<string, string> = {T:t("study.fnT"), SD:t("study.fnSD"), D:t("study.fnD")};
  const inst = instrument(), I = INSTRUMENTS[isInstrument(inst) ? inst : "keys"], strings = I.kind === "strings";
  const marks: Marks = {}; sc.iv.forEach((iv, i) => { marks[(st.rootPc + iv) % 12] = {label: names[i], root: i === 0}; });
  const keyLabel = root + (sc.minor ? "m" : "");
  const mini = (c: FieldChord) => { if(!strings || I.arpeggio) return ""; const v = voicings(c.name, inst, 1)[0]; return v ? diagramSVG(v, inst, {small:true}) : ""; };
  // A escala fecha com a tônica uma oitava acima, nos chips e na reprodução.
  const base = (st.rootPc < 5 ? 60 : 48) + st.rootPc, seq = sc.iv.concat(12);
  const flash = (midis: number[], cls = "on") => midis.forEach(m => root_.current?.querySelectorAll(`[data-midi="${m}"]`).forEach(k => { k.classList.add(cls); setTimeout(()=>k.classList.remove(cls), 450); }));
  // Caixa ao lado do teclado: sempre a última nota tocada, com o grau na escala (ou "fora da escala")
  // e a função harmônica do grau (só nas escalas que têm T/SD/D).
  const [box, setBox] = useState<{note: string; sub: string; out: boolean; fn: string; n: number} | null>(null);
  const showKey = (midi: number) => {
    const pc = ((midi % 12) + 12) % 12, i = sc.iv.indexOf((pc - st.rootPc + 12) % 12);
    setBox(b => ({note: byPc[pc] || noteName(pc, keyLabel), sub: i < 0 ? t("study.keyOut") : t("study.keyDeg", {degree: degLabel(degs[i])}),
      out: i < 0, fn: i >= 0 && sc.fn ? sc.fn[i] : "", n: (b ? b.n : 0) + 1}));
  };
  const playScale = () => {
    if(!playSequence(seq, {base})) return toast(t("study.noAudio"));
    const chips = root_.current!.querySelectorAll(".note-chip");
    seq.forEach((iv, i) => setTimeout(() => { flash([base + iv]); showKey(base + iv); const c = chips[i % chips.length]; if(c && i < chips.length){ c.classList.remove("lit"); void (c as HTMLElement).offsetWidth; c.classList.add("lit"); } }, i * 320));
  };
  // Contorno por cima da tecla tocada, verde (da escala) ou vermelho (fora). O das brancas entra antes
  // das pretas (não as cobre), o das pretas no fim.
  const markKey = (key: SVGGraphicsElement, ok: boolean) => {
    const svg = key.ownerSVGElement!, k = key as SVGGraphicsElement & {_mark?: SVGGElement | null};
    if(k._mark) k._mark.remove();
    const white = key.classList.contains("w"), a = (n: string) => +key.getAttribute(n)!;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "key-mark " + (ok ? "ok" : "no"));
    g.innerHTML = `<rect class="ring" x="${a("x") + 1}" y="${a("y") + 1}" width="${a("width") - 2}" height="${a("height") - 2}" rx="${white ? 2.5 : 1.5}"/>`;
    if(white) svg.insertBefore(g, svg.querySelector("rect.b")); else svg.appendChild(g);
    k._mark = g;
    setTimeout(() => { g.remove(); if(k._mark === g) k._mark = null; }, 700);
  };
  // Teclas clicáveis; segurando e arrastando, toca as notas por onde passa.
  const drag = useRef<{down: boolean; last: Element | null}>({down: false, last: null});
  const press = (el: Element | null) => {
    const key = el && el.closest ? el.closest("[data-midi]") as (HTMLElement & SVGGraphicsElement) | null : null;
    if(!key || key === drag.current.last) return;
    drag.current.last = key;
    const midi = +key.dataset.midi!;
    if(!playChord([0], {base: midi, dur: 1.2})) return toast(t("study.noAudio"));
    if(key.ownerSVGElement && key.ownerSVGElement.classList.contains("keyboard")){ markKey(key, (midi % 12) in byPc); showKey(midi); }
    else flash([midi], "in-scale");
  };
  const board = strings ? fretboardSVG(inst, marks, I.frets > 12 ? 12 : I.frets) : scaleKeyboardSVG(base, st.rootPc, byPc);
  return <div ref={root_}>
    <div className="study-controls">
      <div className="roots" role="group" aria-label={t("study.root")}>{Array.from({length:12}, (_, pc) =>
        <button key={pc} className="root-btn" data-pc={pc} aria-pressed={pc === st.rootPc} onClick={() => setStudy({rootPc: pc})}>{rootFor(pc, st.scaleId)}</button>)}</div>
      <div className="study-row">
        <label className="field inst-field"><span>{t("study.scale")}</span><Select id="st-scale" value={st.scaleId} onChange={v => setStudy({scaleId: v as ScaleId})}
          options={Object.keys(SCALES).map(id => ({value: id, label: t("scale." + id)}))}/></label>
        <InstrumentSelect/>
        <TimbreSelect/>
        <label className="switch lead" style={{marginLeft: "auto"}}>{t("study.sevenths")}<input type="checkbox" id="st-7" checked={st.sevenths} disabled={!field.length && !st.sevenths} onChange={e => setStudy({sevenths: e.target.checked})}/></label>
      </div>
    </div>
    <div className="card scale-card">
      <div className="scale-head">
        <div><h2>{t("study.scaleOf", {root, scale: t("scale." + st.scaleId).toLowerCase()})}</h2><p className="sub">{t(sc.minor ? "study.relMajor" : "study.relMinor", {key: relKey})}</p></div>
        <button className="btn primary sm" id="st-play" onClick={playScale}><Icon name="play" sm/> {t("study.play")}</button>
      </div>
      <div className="scale-notes">{names.concat(names[0]).map((n, i) => <button key={i} className="note-chip" data-i={i}
        onClick={() => { const iv = seq[i]; playChord([iv], {base}); flash([base + iv]); showKey(base + iv); }}><b>{n}</b><small>{degLabel(degs[i % names.length])}</small></button>)}</div>
      <div className="board-wrap"
        onPointerDown={e => { drag.current = {down: true, last: null}; e.currentTarget.setPointerCapture(e.pointerId); press(e.target as Element); e.preventDefault(); }}
        onPointerMove={e => { if(drag.current.down) press(document.elementFromPoint(e.clientX, e.clientY)); }}
        onPointerUp={() => { drag.current = {down: false, last: null}; }} onPointerCancel={() => { drag.current = {down: false, last: null}; }}>
        {strings ? <div style={{display: "contents"}} dangerouslySetInnerHTML={{__html: board}}/>
          : <div className="kb-row"><div style={{display: "contents"}} dangerouslySetInnerHTML={{__html: board}}/>
            <div key={box ? box.n : 0} className={"key-box" + (box && box.out ? " out" : "") + (box ? " pop" : "")} aria-live="polite">
              <span className="key-box-h">{t("study.keyBox")}</span><b className="key-box-note">{box ? box.note : "–"}</b>
              <span className="key-box-sub">{box ? box.sub : t("study.keyHint")}</span>
              {/* Escondido, mas ocupando o lugar: o rodapé não pula. */}
              <span className={"key-box-fn" + (box && box.fn ? " fn " + box.fn : "")} style={box && box.fn ? undefined : {visibility: "hidden"}}>{box && box.fn ? fnName[box.fn] : ""}</span>
            </div></div>}
      </div>
    </div>
    <div className="card">
      <div className="scale-head" style={{marginBottom: 12}}><div><h2>{t("study.field")}</h2><p className="sub">{field.length ? t("study.fieldHint") : t("study.noField")}</p></div></div>
      {field.length > 0 && <>
        <div className="field-grid">{field.map((c, i) => <button key={i} className="chord-card" data-i={i} style={{animationDelay: i*30 + "ms"}}
          onClick={() => { flash(c.pcs.map(p => base + p)); openDialog("chord", {symbol: c.name, songKey: keyLabel}); }}>
          <span className="deg">{c.degree}</span><span className="name" style={{"--len": c.name.length} as React.CSSProperties}>{c.name}</span><span className="tones">{c.notes.join(" · ")}</span>
          <span style={{display: "contents"}} dangerouslySetInnerHTML={{__html: mini(c)}}/>
          {c.fn && <span className={"fn " + c.fn} title={fnName[c.fn]}>{c.fn}</span>}</button>)}</div>
        {sc.fn && <FnLegend field={field} fnName={fnName}/>}
      </>}
    </div>
  </div>;
}
