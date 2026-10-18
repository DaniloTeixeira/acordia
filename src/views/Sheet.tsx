// Folha A4 do repertório: modo (cifra, graus, letra), opções, PDF/impressão e as páginas.
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sanitizeOptions } from "../lib/core";
import { fitSetlist, toSVG, lyricsOnly, lyricsText, type Page, type SheetMode } from "../lib/layout";
import { toPDF, saveBlob } from "../lib/pdf";
import { t } from "../lib/i18n";
import * as store from "../lib/store";
import { measure, slug } from "../lib/util";
import { useData, useUI, toast, openDialog } from "../state";
import { sheetSongs } from "../repertoire";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { Select } from "../ui/Select";
import { toggler } from "../ui/popover";
import type { Medley, Options } from "../lib/types";

const { data } = store;
export const sheetMode = (): SheetMode => (["cifras","graus","letra"] as const).find(v => v === data.settings.sheetMode) || "cifras";
// Últimas páginas desenhadas, para o PDF e a impressão.
let lastPages: Page[] = [];

export function SheetPane({m, children}: {m: Medley; children: ReactNode}){
  useData();
  const mode = sheetMode();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if(!lastPages.length) return toast(t("sheet.needSong"));
    setBusy(true);
    try{ saveBlob(await toPDF(lastPages), `${slug(m.name)}-${mode}.pdf`); toast(t("sheet.pdfSaved")); }
    catch(e){ toast(t("sheet.pdfFail")); }
    setBusy(false);
  };
  return <div className="pane pane-sheet">
    <div className="sheet-toolbar">
      <Seg id="mode-seg" aria={t("sheet.modeAria")} value={mode} onChange={v => store.setSetting("sheetMode", v)}
        options={[{v: "cifras", label: t("sheet.chords"), tip: "tip.cifras"}, {v: "graus", label: t("sheet.degrees"), tip: "tip.graus"}, {v: "letra", label: t("sheet.lyrics"), tip: "tip.letra"}]}/>
      <div className="tools">
        <SheetPickButton m={m}/>
        <SheetOptions m={m}/>
        <CopyLyricsButton m={m}/>
        <button className="icon-btn line" id="btn-print" aria-label={t("sheet.print")} title={t("sheet.print")}
          onClick={() => { if(!lastPages.length) return toast(t("sheet.needSong")); window.print(); }}><Icon name="print"/></button>
        <button className="btn primary sm" id="btn-pdf" data-tip-key="tip.pdf" disabled={busy} onClick={download}><Icon name="download" sm/>PDF</button>
      </div>
    </div>
    <div className="sheet-scroll">{children}</div>
  </div>;
}

// Quais músicas entram na folha: abre a lista para marcar; com alguma de fora, mostra "3/7".
function SheetPickButton({m}: {m: Medley}){
  const skip = useUI(s => s.sheetSkip[m.id]) || [], list = sheetSongs(m), all = list.length, on = all - list.filter(s => skip.includes(s.itemId)).length;
  if(all < 2) return null;
  return <button className={"btn sm " + (on < all ? "soft" : "ghost")} id="btn-sheet-pick" aria-label={t("sheetPick.title")} title={t("sheetPick.title")}
    onClick={() => openDialog("sheetPick", {id: m.id})}><Icon name="list" sm/>{on < all ? on + "/" + all : t("sheetPick.all")}</button>;
}
// Copia a letra (sem cifras) para colar no WhatsApp ou na projeção: da folha inteira ou de uma música só.
export async function copyLyrics(songs: Parameters<typeof lyricsText>[0]){
  const text = lyricsText(songs);
  if(!text) return toast(t("sheet.needSong"));
  try{ await navigator.clipboard.writeText(text); toast(t("sheet.lyricsCopied")); }
  catch{ toast(t("sheet.copyFail")); }
}
// As músicas marcadas para a folha, na ordem do repertório.
function CopyLyricsButton({m}: {m: Medley}){
  const skip = useUI(s => s.sheetSkip[m.id]);
  return <button className="icon-btn line" id="btn-copy-lyrics" aria-label={t("sheet.copyLyrics")} title={t("sheet.copyLyrics")}
    onClick={() => copyLyrics(sheetSongs(m).filter(s => !skip?.includes(s.itemId)))}><Icon name="copy"/></button>;
}
export const setSheetSkip = (id: string, skip: string[]) => useUI.setState(s => ({sheetSkip: {...s.sheetSkip, [id]: skip}}));

function SheetOptions({m}: {m: Medley}){
  const pop = useRef<HTMLDivElement>(null);
  const o = m.options;
  const [tg] = useState(() => toggler(() => pop.current, btn => {
    const p = pop.current!, r = btn.getBoundingClientRect(), vw = document.documentElement.clientWidth, w = Math.min(320, vw - 32);
    const top = Math.min(r.bottom + 8, innerHeight - 20);
    p.style.top = top + "px"; p.style.setProperty("--pop-top", top + "px");
    p.style.left = Math.max(16, Math.min(r.right - w, vw - w - 16)) + "px";
    p.showPopover();
  }));
  const change = <K extends keyof Options>(k: K, v: Options[K]) => { m.options[k] = v; m.options = sanitizeOptions(m.options); store.saveMedley(m); };
  const tr = o.transpose || 0;
  const transpose = (d: number) => { m.options.transpose = d ? ((m.options.transpose || 0) + d + 17) % 12 - 5 : 0; store.saveMedley(m); };
  const sw = (k: "dedupe" | "showKey" | "transitions" | "capoShapes", label: string, tip?: string) =>
    <label className="switch lead boxed" data-tip-key={tip}><span>{label}</span><input type="checkbox" data-opt={k} checked={!!o[k]} onChange={e => change(k, e.target.checked)}/></label>;
  return <>
    <button className="icon-btn line" id="btn-options" aria-label={t("sheet.options")} title={t("sheet.options")} onPointerDown={tg.onPointerDown} onClick={tg.onClick}><Icon name="sliders"/></button>
    <div id="sheet-options" className="popover" popover="auto" ref={pop}>
      <h3>{t("sheet.options")}</h3>
      {sw("dedupe", t("opt.dedupe"), "tip.dedupe")}
      {sw("showKey", t("opt.showKey"))}
      {sw("transitions", t("opt.transitions"))}
      <label className="switch lead boxed"><span>{t("opt.maxPages")}</span><input type="checkbox" data-opt="maxPages" checked={o.maxPages === 2} onChange={e => change("maxPages", e.target.checked ? 2 : 1)}/></label>
      {sw("capoShapes", t("opt.capoShapes"), "tip.capoShapes")}
      <div className="row" data-tip-key="tip.transpose"><span>{t("opt.transpose")}</span><span className="tr-ctl">
        <button type="button" className="icon-btn sm" data-tr="-1" aria-label="−½" onClick={() => transpose(-1)}>−</button><b id="opt-tr-val">{(tr > 0 ? "+" : "") + tr}</b>
        <button type="button" className="icon-btn sm" data-tr="1" aria-label="+½" onClick={() => transpose(1)}>+</button>
        <button type="button" className="btn ghost sm" data-tr="0" onClick={() => transpose(0)}>{t("opt.transposeReset")}</button></span></div>
      <hr/>
      <div className="row"><span>{t("opt.columns")}</span><Seg className="sm" value={String(o.columns)} onChange={v => change("columns", v === "auto" ? "auto" : +v as 1 | 2)}
        options={[{v: "auto", label: t("opt.auto")}, {v: "1", label: "1"}, {v: "2", label: "2"}]}/></div>
      <div className="row"><span>{t("opt.degrees")}</span><Seg className="sm" value={o.degreeStyle} onChange={v => change("degreeStyle", v)}
        options={[{v: "roman", label: "I IV V"}, {v: "arabic", label: "1 4 5"}]}/></div>
      <div className="row"><label htmlFor="opt-minfont">{t("opt.minFont")}</label>
        <Select id="opt-minfont" style={{width: "auto"}} value={String(o.minFont)} onChange={v => change("minFont", +v)}
          options={[7,8,9,10,11,12].map(n => ({value: String(n), label: n + " pt"}))}/></div>
    </div>
  </>;
}

// As páginas são recalculadas um pouco depois da última mudança (o ajuste mede o texto várias vezes).
// A folha mostra sempre o repertório inteiro, na ordem, abra ou feche os cards à esquerda.
export function Sheet({m}: {m: Medley}){
  const version = useData(), lang = useUI(s => s.lang), skip = useUI(s => s.sheetSkip[m.id]);
  const mode = sheetMode();
  const [res, setRes] = useState<{pages: Page[]; warn: string | null} | null>(null);
  const first = useRef(true);
  useEffect(() => {
    const run = () => {
      // Só as marcadas para a folha (impressão e PDF saem iguais à tela).
      const all = sheetSongs(m).filter(s => !skip?.includes(s.itemId));
      if(!all.length){ lastPages = []; setRes({pages: [], warn: null}); return; }
      const r = fitSetlist(mode === "letra" ? lyricsOnly(all) : all, Object.assign({}, m.options, {mode, measure}));
      lastPages = r.pages; setRes({pages: r.pages, warn: r.warn});
    };
    if(first.current){ first.current = false; run(); return; }
    const h = setTimeout(run, 180);
    return () => clearTimeout(h);
  }, [version, lang, mode, m, skip]);
  const total = sheetSongs(m).length, out = skip ? sheetSongs(m).filter(s => skip.includes(s.itemId)).length : 0;
  // Cada folha é um elemento que fica: ao digitar só o desenho de dentro muda, e a animação de
  // entrada da folha não roda de novo (antes a folha piscava a cada tecla).
  const svgs = useMemo(() => {
    if(!res) return [];
    const label = t("sheet.label." + mode);
    return res.pages.map((p, i) => toSVG(p, t("sheet.aria", {label, n:i+1})));
  }, [res, mode]);
  const onClick = (e: React.MouseEvent) => {
    const r = (e.target as Element).closest?.("rect.hit") as SVGElement | null;
    if(r) openDialog("chord", {symbol: r.dataset.chord || "", songKey: r.dataset.key || ""});
  };
  return <>
    {out > 0 && <p className="note info sheet-pick-note">{t("sheetPick.note", {n: total - out, total})}
      <button type="button" className="link-btn" onClick={() => setSheetSkip(m.id, [])}>{t("sheetPick.showAll")}</button></p>}
    <p className="note" id="sheet-warn" hidden={!res?.warn}>{res?.warn}</p>
    {res && !res.pages.length
      ? <div className="pages" id="pages"><div className="sheet-empty empty-state"><Icon name="file"/><strong>{t("sheet.emptyTitle")}</strong><span>{t("sheet.emptyText")}</span></div></div>
      : <div className="pages" id="pages" onClick={onClick}>
          {svgs.map((svg, i) => <Fragment key={i}>
          {/* Número acima da folha, como cabeçalho: ao rolar, aparece antes do conteúdo. */}
          {svgs.length > 1 && <p className="page-label">{t("sheet.page", {n:i+1, total:svgs.length})}</p>}
          <div className="paper" dangerouslySetInnerHTML={{__html: svg}}/>
        </Fragment>)}</div>}
  </>;
}
export const getLastPages = () => lastPages;
