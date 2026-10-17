// Montar cifra de ouvido: a letra com uma fileira de quadradinhos acima de cada linha. Em cada
// quadradinho vai um acorde ou um grau; ao aplicar, os graus viram acordes no tom escolhido e
// cada acorde fica na coluna do seu quadradinho.
import { useRef, useState } from "react";
import { KEYS, MINOR_KEYS, EAR_CELL, earCellCount, parseKey, parseSong, detectKey, harmonicField, earRows, earText, earBad, earCellAs, type EarLine } from "../lib/core";
import { playChord } from "../lib/audio";
import { t } from "../lib/i18n";
import * as store from "../lib/store";
import { toast, type DialogProps } from "../state";
import { Dialog, DialogHead } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";

type Mode = "cifras" | "graus";
const mapCells = (lines: EarLine[], fn: (c: string) => string) => lines.map(l => typeof l === "string" ? l : {...l, cells: l.cells.map(fn)});
const keyOpts = () => [{group: t("keys.major"), options: KEYS.map(k => ({value: k, label: k}))}, {group: t("keys.minor"), options: MINOR_KEYS.map(k => ({value: k, label: k}))}];

export function EarDialog({text, songKey, onApply}: DialogProps["ear"]){
  const [key, setKey] = useState(() => { const p = parseSong(text); return songKey || (p.blocks.some(b => b.some(it => it.chord)) ? detectKey(p) : "C"); });
  const [mode, setModeState] = useState<Mode>(() => store.setting<string>("earMode", "graus") === "cifras" ? "cifras" : "graus");
  // Os quadradinhos guardam o que a pessoa escreveu, no modo em que está; só viram acorde ao aplicar.
  const [lines, setLines] = useState<EarLine[]>(() => mapCells(earRows(text), c => earCellAs(c, key, mode)));
  const start = useRef<string | null>(null); if(start.current === null) start.current = earText(lines, key);
  const sel = useRef<{r: number; c: number} | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const k = parseKey(key)!, field = harmonicField(k.root, k.minor ? "menor" : "maior");
  const anyBad = lines.some(l => typeof l !== "string" && l.cells.some(c => earBad(c, key)));
  // Escrevendo em graus, trocar o tom muda os acordes de todas as linhas: nenhuma volta como era.
  const changeKey = (v: string) => { if(mode === "graus") setLines(ls => ls.map(l => typeof l === "string" ? l : {cells: l.cells, lyric: l.lyric})); setKey(v); };
  const setMode = (v: Mode) => { setLines(ls => mapCells(ls, c => earCellAs(c, key, v))); setModeState(v); store.setSetting("earMode", v); };
  const setCell = (r: number, c: number, v: string) => setLines(ls => ls.map((l, i) => {
    if(i !== r || typeof l === "string") return l;
    const cells = l.cells.slice(); cells[c] = v;
    // Sempre sobra um quadradinho vazio no fim da linha.
    if(v && c === cells.length - 1) cells.push("");
    return {cells, lyric: l.lyric};
  }));
  const focusCell = (r: number, c: number) => requestAnimationFrame(() => body.current?.querySelector<HTMLInputElement>(`[data-r="${r}"][data-c="${c}"]`)?.focus());
  // Acorde do campo harmônico: toca e, com um quadradinho escolhido, preenche e passa para o próximo.
  const pick = (i: number) => {
    playChord(field[i].pcs.map(p => k.pc + p), {base: 48});
    const s = sel.current; if(!s) return;
    setCell(s.r, s.c, mode === "graus" ? String(i + 1) : field[i].name);
    sel.current = {r: s.r, c: s.c + 1}; focusCell(s.r, s.c + 1);
  };
  // Linha só de acordes (introdução, solo, passagem), antes de uma estrofe ou no fim.
  const addRow = (r: number) => { setLines(ls => [...ls.slice(0, r), {cells: Array(earCellCount(null)).fill(""), lyric: null}, ...ls.slice(r)]); sel.current = null; focusCell(r, 0); };
  const removeRow = (r: number) => { setLines(ls => ls.filter((_, i) => i !== r)); sel.current = null; };
  const addBtn = (r: number) => <button type="button" key={"add" + r} className="btn ghost sm ear-add" onClick={() => addRow(r)}><Icon name="plus" sm/> {t("ear.addRow")}</button>;
  const close = (rv: string) => { if(rv === "ok") onApply(earText(lines, key), key); };
  const dirty = () => earText(lines, key) !== start.current;
  let row = 0;
  return <Dialog name="ear" id="dlg-ear" className="ear-dlg" labelledBy="ear-h" onClose={close} dirty={dirty}>
    <form method="dialog" className="dlg">
      <DialogHead id="ear-h" title={t("ear.title")} closeLabel={t("common.close")}/>
      <div className="dlg-body" ref={body}>
        <p className="sub ear-hint">{t("ear.hint")}</p>
        <div className="ear-tools">
          <label className="field ear-key"><span>{t("ear.key")}</span><Select id="ear-key" value={key} onChange={changeKey} options={keyOpts()}/></label>
          <Seg className="sm" id="ear-mode" aria={t("ear.show")} value={mode} onChange={setMode} options={[{v: "graus", label: t("ear.degrees")}, {v: "cifras", label: t("ear.chords")}]}/>
        </div>
        <div className="ear-field" role="group" aria-label={t("ear.field")}>
          {field.map((f, i) => <button type="button" key={i} className="ear-chip" onPointerDown={e => e.preventDefault()} onClick={() => pick(i)}>
            <b>{i + 1}</b><span>{f.name}</span></button>)}
        </div>
        <div className="ear-lines">
          {lines.map((l, r) => {
            if(typeof l === "string") return l.trim() ? <div key={r} className="ear-tag">{l}</div> : <div key={r} className="ear-gap"/>;
            const n = ++row, first = r === 0 || typeof lines[r - 1] === "string";
            return [first && addBtn(r), <div key={r} className={"ear-row" + (l.lyric === null ? " inst" : "")}>
              <div className="ear-cells">{l.lyric === null && <button type="button" className="icon-btn sm ear-rm" aria-label={t("ear.removeRow")} title={t("ear.removeRow")} onClick={() => removeRow(r)}><Icon name="x" sm/></button>}{l.cells.map((c, j) => {
                const w = Math.max(EAR_CELL, c.length + 0.6);
                return <input key={j} className={"ear-cell" + (c ? " on" : "") + (c && earBad(c, key) ? " bad" : "")} data-r={r} data-c={j} value={c}
                  aria-label={t("ear.cellAria", {r: n, c: j + 1})} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="next"
                  style={w > EAR_CELL ? {width: w + "ch", marginRight: (EAR_CELL - w) + "ch"} : undefined}
                  onFocus={() => { sel.current = {r, c: j}; }}
                  onChange={e => setCell(r, j, e.target.value.replace(/^\s+/, ""))}
                  onKeyDown={e => { if(e.key === "Enter"){ e.preventDefault(); focusCell(r, j + 1); } }}/>;
              })}</div>
              {l.lyric !== null && <div className="ear-lyric">{l.lyric || " "}</div>}
            </div>];
          })}
          {addBtn(lines.length)}
        </div>
      </div>
      <div className="dlg-foot"><button className="btn ghost" value="cancel">{t("common.cancel")}</button>
        <button className="btn primary" value="ok" onClick={e => { if(anyBad){ e.preventDefault(); toast(t("ear.bad")); } }}>{t("ear.apply")}</button></div>
    </form>
  </Dialog>;
}
