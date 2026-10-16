// Detalhes de um acorde: notas, grau e função no tom, e como tocar no instrumento escolhido.
import { useEffect, useMemo, useRef, useState } from "react";
import { noteName } from "../lib/core";
import { INSTRUMENTS, isInstrument, parseChord, voicings } from "../lib/instruments";
import { chordInKey, diagramSVG, fretboardSVG, pianoSVG, voicingMidis, type Marks } from "../lib/svg";
import { playChord } from "../lib/audio";
import { t } from "../lib/i18n";
import { useData, type DialogProps } from "../state";
import { Dialog, DialogHead } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { InstrumentSelect } from "../views/InstrumentSelect";
import { instrument } from "../views/Repertoire";

export function ChordDialog({symbol, songKey: key}: DialogProps["chord"]){
  useData();
  const inst = instrument(), I = INSTRUMENTS[isInstrument(inst) ? inst : "keys"];
  const [idx, setIdx] = useState(0);
  const c = parseChord(symbol), info = key ? chordInKey(symbol, key) : null;
  const view = useMemo(() => {
    if(!c) return null;
    let visual = "", midis: number[] = [], count = 0;
    const roles = c.tones.map(x => x.role);
    if(I.kind === "keys"){
      const base = 48 + c.rootPc + (c.rootPc > 6 ? -12 : 0) + 12;
      midis = c.tones.map(x => base + x.iv);
      if(c.bassPc !== c.rootPc) midis.unshift(base - 12 + ((c.bassPc - c.rootPc + 12) % 12));
      visual = pianoSVG(midis, c.rootPc);
    } else if(I.arpeggio){
      const marks: Marks = {}; c.tones.forEach((x, i) => { marks[(c.rootPc + x.iv) % 12] = {label: roles[i], root: i === 0}; });
      visual = fretboardSVG(inst, marks, 12);
      midis = c.tones.slice(0, 4).map(x => I.strings[0] + ((c.rootPc - I.strings[0] % 12 + 12) % 12) + x.iv);
    } else {
      const vs = voicings(c, inst, 6); count = vs.length;
      if(vs.length){ const v = vs[Math.min(idx, vs.length - 1)]; midis = voicingMidis(v, inst); visual = diagramSVG(v, inst); }
      else { visual = `<p class="sub">${t("chord.noShape")}</p>`; midis = c.tones.map(x => 60 + c.rootPc + x.iv); }
    }
    return {visual, midis, count};
  }, [symbol, inst, idx, c?.name]);
  const play = () => { if(view && view.midis.length) playChord(view.midis.slice().sort((a, b) => a - b), {base:0, strum:0.035}); };
  // Toca ao abrir e ao trocar de posição ou de instrumento.
  const last = useRef("");
  useEffect(() => { const k = symbol + inst + idx; if(k !== last.current){ last.current = k; play(); } });
  const fnName: Record<string, string> = {T:t("study.fnT"), SD:t("study.fnSD"), D:t("study.fnD")};
  const onBoard = (e: React.PointerEvent) => { const el = (e.target as Element).closest?.("[data-midi]") as HTMLElement | null; if(el) playChord([+el.dataset.midi!], {base:0, dur:1}); };
  return <Dialog name="chord" id="dlg-chord" className="chord-dlg" labelledBy="chord-h">
    <form method="dialog" className="dlg">
      <DialogHead id="chord-h" title={symbol} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        {!c ? <p>{t("chord.unknown")}</p> : <>
          <div className="chord-info">
            {info && <><span className="chip accent">{t("chord.degreeIn", {degree: info.degree, key})}</span>
              {info.fn ? <span className={"fn " + info.fn}>{fnName[info.fn]}</span> : <span className="chip">{t("chord.borrowed")}</span>}</>}
            <span className="chord-notes">{c.tones.map((x, i) => <span key={i}><b>{noteName(c.rootPc + x.iv, key || c.root)}</b><small>{x.role}</small></span>)}</span>
          </div>
          <div className="chord-visual">
            <div onPointerDown={onBoard} style={{display: "contents"}} dangerouslySetInnerHTML={{__html: view!.visual}}/>
            {view!.count > 1 && <div className="voicing-nav">
              <button type="button" className="icon-btn sm" data-v="-1" aria-label={t("chord.prev")} disabled={idx === 0} onClick={() => setIdx(idx - 1)}>‹</button>
              <span>{t("chord.shape", {n: idx + 1, total: view!.count})}</span>
              <button type="button" className="icon-btn sm" data-v="1" aria-label={t("chord.next")} disabled={idx >= view!.count - 1} onClick={() => setIdx(idx + 1)}>›</button></div>}
          </div>
          <div className="study-row chord-actions"><InstrumentSelect/>
            <button type="button" className="btn primary" data-play onClick={play}><Icon name="play" sm/> {t("chord.play")}</button></div>
        </>}
      </div>
    </form>
  </Dialog>;
}
