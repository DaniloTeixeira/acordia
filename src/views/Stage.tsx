// Modo palco: tela cheia para tocar, com letra grande, tela acesa, metrônomo e acordes clicáveis.
import { useEffect, useRef, useState } from "react";
import { transition } from "../lib/core";
import { lyricsOnly, chordLine, type SheetMode } from "../lib/layout";
import { t } from "../lib/i18n";
import * as store from "../lib/store";
import { reduced } from "../lib/util";
import { useData, useUI, openDialog } from "../state";
import { current, sheetSongs, shiftItemKey } from "../repertoire";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { MetronomeUI } from "./Metronome";
import { metro } from "../metro";
import { openRef } from "./Repertoire";
import { sheetMode } from "./Sheet";

const stageFsDefault = () => innerWidth < 700 ? 19 : 24;

function ChordSpans({cl, songKey}: {cl: {text: string; chords: {pos: number; len: number; chord: string}[]}; songKey: string}){
  const out: React.ReactNode[] = []; let at = 0;
  cl.chords.forEach((c, i) => {
    out.push(cl.text.slice(at, c.pos));
    out.push(<span key={i} className="chd" data-chord={c.chord} data-key={songKey || ""}
      onClick={e => { e.stopPropagation(); openDialog("chord", {symbol: c.chord, songKey: songKey || ""}); }}>{cl.text.slice(c.pos, c.pos + c.len)}</span>);
    at = c.pos + c.len;
  });
  out.push(cl.text.slice(at));
  return <>{out}</>;
}

export function Stage(){
  useData();
  const [mode, setMode] = useState<SheetMode>(sheetMode());
  const [metroOpen, setMetroOpen] = useState(false);
  const [fs, setFs] = useState<number>((store.data.settings.stageFs as number) || stageFsDefault());
  const scroll = useRef<HTMLDivElement>(null);
  const m = current(), L = mode === "letra", list = sheetSongs(m), src = L ? lyricsOnly(list) : list;
  const close = () => useUI.setState({stageOpen: false});
  const page = (dir: number) => { const sc = scroll.current!; sc.scrollBy({top: dir * sc.clientHeight * 0.82, behavior: reduced() ? "auto" : "smooth"}); };
  const font = (d: number) => setFs(v => { const n = Math.max(12, Math.min(48, v + d)); store.setSetting("stageFs", n); return n; });
  useEffect(() => {
    document.body.style.overflow = "hidden";
    scroll.current?.focus();
    if(document.documentElement.requestFullscreen && matchMedia("(pointer:coarse)").matches) document.documentElement.requestFullscreen().catch(()=>{});
    // Tela acesa enquanto toca.
    let lock: WakeLockSentinel | null = null;
    const lockScreen = async () => { try{ if("wakeLock" in navigator && !document.hidden) lock = await navigator.wakeLock.request("screen"); }catch(e){ /* sem suporte */ } };
    lockScreen();
    const vis = () => { if(!document.hidden) lockScreen(); };
    document.addEventListener("visibilitychange", vis);
    const key = (e: KeyboardEvent) => {
      if(e.target instanceof Element && e.target.closest("button,input,select")) return;
      if(["ArrowDown","PageDown","ArrowRight"," "].includes(e.key)){ e.preventDefault(); page(1); }
      else if(["ArrowUp","PageUp","ArrowLeft"].includes(e.key)){ e.preventDefault(); page(-1); }
      else if(e.key === "Escape"){ if(document.querySelector("dialog[open]")) return; e.preventDefault(); close(); }
      else if(e.key === "+" || e.key === "=") font(2);
      else if(e.key === "-") font(-2);
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      metro.stop();
      document.removeEventListener("visibilitychange", vis); document.removeEventListener("keydown", key);
      if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
      if(lock) lock.release().catch(()=>{});
      document.querySelector<HTMLElement>("#btn-stage")?.focus();
    };
  }, []);
  const toggleMetro = () => {
    const open = !metroOpen; setMetroOpen(open);
    if(!open){ metro.stop(); return; }
    // Começa no BPM da primeira música que tiver um.
    const withBpm = list.find(s => +s.meta.bpm);
    if(withBpm && !metro.running) metro.set({bpm: +withBpm.meta.bpm});
  };
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if(getSelection()?.toString()) return;
    const r = e.currentTarget.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    if(y > 0.6) page(1); else if(y < 0.3) page(-1);
  };
  return <div className={"stage" + (L ? " letra" : "")} id="stage" role="dialog" aria-modal="true" aria-label={t("stage.aria")}>
    <div className="stage-bar">
      <button className="icon-btn" id="stage-close" aria-label={t("stage.close")} onClick={close}><Icon name="x"/></button>
      <Seg className="sm" id="stage-mode" aria={t("stage.modeAria")} value={mode} onChange={setMode}
        options={[{v: "cifras", label: t("sheet.chords")}, {v: "graus", label: t("sheet.degrees")}, {v: "letra", label: t("sheet.lyricsShort")}]}/>
      <span className="grow"/>
      <button className="icon-btn" id="stage-metro" aria-pressed={metroOpen} aria-label={t("metro.title")} title={t("metro.title")} onClick={toggleMetro}><Icon name="metro"/></button>
      <button className="icon-btn" id="stage-smaller" aria-label={t("stage.smaller")} onClick={() => font(-2)}><b>A−</b></button>
      <button className="icon-btn" id="stage-bigger" aria-label={t("stage.bigger")} onClick={() => font(2)}><b>A+</b></button>
    </div>
    <div className="stage-metro" id="stage-metro-panel" hidden={!metroOpen}>{metroOpen && <MetronomeUI compact/>}</div>
    <div className="stage-scroll" id="stage-scroll" tabIndex={0} ref={scroll} onClick={onTap}>
      <div className="stage-content" id="stage-content" style={{"--stage-fs": fs + "px"} as React.CSSProperties}>
        {!src.length && <div className="empty-state"><strong>{t("stage.empty")}</strong><span>{t("stage.emptyText")}</span></div>}
        {src.map((s, si) => {
          const key = s.target || s.key;
          const meta = [!L && s.meta.bpm && t("sheet.bpm", {n:s.meta.bpm}), !L && s.meta.capo && t("sheet.capo", {n:s.meta.capo}), s.meta.singer && t("sheet.voice", {name:s.meta.singer}), s.meta.notes].filter(Boolean).join(" · ");
          const next = src[si+1], tr = m.options.transitions && !L && next ? transition(key, next.target || next.key) : null;
          const group = s.group && (si === 0 || src[si-1].group !== s.group);
          return <div key={si} style={{display: "contents"}}>
            {group && <p className="stage-group"><Icon name="link" sm/> {t("sheet.medleyLabel", {name: s.gname || ""})}</p>}
            <section className="stage-song">
              <h2>{s.title}{key && !L && <> <small>({key})</small>
                <span className="stage-tr">
                  <button className="icon-btn sm" aria-label={t("stage.down")} title={t("stage.down")} onClick={e => { e.stopPropagation(); shiftItemKey(s.itemId, -1); }}>−</button>
                  <button className="icon-btn sm" aria-label={t("stage.up")} title={t("stage.up")} onClick={e => { e.stopPropagation(); shiftItemKey(s.itemId, 1); }}>+</button>
                </span></>}</h2>
              {(meta || s.ref) && <p className="meta">{meta} {s.ref && <button className="btn soft sm stage-ref" onClick={e => { e.stopPropagation(); openRef(s.ref, s.title); }}><Icon name="play" sm/> {t("ref.listen")}</button>}</p>}
              {s.blocks.map((b, bi) => <div key={bi} className="stage-block">{b.map((it, ii) => <div key={ii} style={{display: "contents"}}>
                {it.chord !== undefined && it.chord !== null && !L && <p className="stage-line ch"><ChordSpans cl={chordLine(it.chord, s, mode, m.options.degreeStyle)} songKey={key}/></p>}
                {it.lyric !== undefined && <p className="stage-line">{it.lyric}</p>}
              </div>)}</div>)}
            </section>
            {tr && !tr.same && <p className="stage-trans">→ {next.target || next.key}: {tr.text}{tr.passing ? " · " + t("sheet.passing", {chord: mode === "graus" ? "V7" : tr.passing}) : ""}</p>}
          </div>;
        })}
      </div>
    </div>
    <div className="stage-hint">{t("stage.hint")}</div>
  </div>;
}
