// Modo palco: tela cheia para tocar, com letra grande, tela acesa, metrônomo, acordes clicáveis
// e troca rápida entre as músicas do repertório.
import { useEffect, useRef, useState } from "react";
import { lyricsOnly, chordLine, transitionLine, type SheetMode } from "../lib/layout";
import { t } from "../lib/i18n";
import * as store from "../lib/store";
import { reduced, focusPlatform } from "../lib/util";
import { useData, useUI, openDialog } from "../state";
import { current, sheetSongs, shiftItemKey } from "../repertoire";
import { Icon } from "../ui/Icon";
import { ThemeButton } from "../ui/theme";
import { Seg } from "../ui/Seg";
import { MetronomeUI } from "./Metronome";
import { metro } from "../metro";
import { openRef } from "./Repertoire";
import { sheetMode } from "./Sheet";

const stageFsDefault = () => innerWidth < 500 ? 17 : innerWidth < 700 ? 19 : 24;
// Tela larga (tablet deitado, computador): a lista de músicas fica ao lado da cifra.
const wide = () => matchMedia("(min-width:1000px)").matches;
const FOCUS_STEPS = {ios: ["stage.focus.ios1", "stage.focus.ios2", "stage.focus.ios3", "stage.focus.ios4"],
  android: ["stage.focus.android1", "stage.focus.android2", "stage.focus.android3"]};

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
  const [cur, setCur] = useState(0);
  const [listOpen, setListOpen] = useState(() => wide() && store.data.settings.stageList !== false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [isFs, setIsFs] = useState(!!document.fullscreenElement);
  const scroll = useRef<HTMLDivElement>(null);
  const m = current(), L = mode === "letra", list = sheetSongs(m), src = L ? lyricsOnly(list) : list;
  const close = () => useUI.setState({stageOpen: false});
  const songEls = () => [...(scroll.current?.querySelectorAll<HTMLElement>(".stage-song") || [])];
  const topOf = (el: HTMLElement) => { const sc = scroll.current!; return el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop; };
  // Música em cena: a última cujo título já passou do primeiro quarto da tela.
  const jumping = useRef(0);
  const track = () => {
    const sc = scroll.current; if(!sc || Date.now() < jumping.current) return;
    const line = sc.scrollTop + sc.clientHeight * 0.25;
    let i = 0; songEls().forEach((el, k) => { if(topOf(el) - 16 <= line) i = k; });
    setCur(i);
  };
  const goSong = (i: number) => {
    const els = songEls(), el = els[Math.max(0, Math.min(els.length - 1, i))]; if(!el) return;
    // Durante a rolagem até lá, o título não passa pelas músicas do meio.
    jumping.current = Date.now() + 700;
    scroll.current!.scrollTo({top: topOf(el) - 12, behavior: reduced() ? "auto" : "smooth"});
    setCur(els.indexOf(el));
    if(!wide()) setListOpen(false);
  };
  const curRef = useRef(0); curRef.current = cur;
  const toggleList = () => setListOpen(v => { if(wide()) store.setSetting("stageList", !v); return !v; });
  const toggleFs = () => {
    if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
    else document.documentElement.requestFullscreen?.().catch(()=>{});
  };
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
    const fsChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fsChange);
    const key = (e: KeyboardEvent) => {
      if(e.target instanceof Element && e.target.closest("button,input,select")) return;
      if(["ArrowDown","PageDown","ArrowRight"," "].includes(e.key)){ e.preventDefault(); page(1); }
      else if(["ArrowUp","PageUp","ArrowLeft"].includes(e.key)){ e.preventDefault(); page(-1); }
      else if(e.key === "Escape"){ if(document.querySelector("dialog[open]")) return; e.preventDefault(); close(); }
      else if(e.key === "+" || e.key === "=") font(2);
      else if(e.key === "-") font(-2);
      else if(e.key === "n" || e.key === "N"){ e.preventDefault(); goSong(curRef.current + 1); }
      else if(e.key === "p" || e.key === "P"){ e.preventDefault(); goSong(curRef.current - 1); }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      metro.stop();
      document.removeEventListener("visibilitychange", vis); document.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", fsChange);
      if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
      if(lock) lock.release().catch(()=>{});
      document.querySelector<HTMLElement>("#btn-stage")?.focus();
    };
  }, []);
  // Ao trocar cifra/letra ou o tamanho da letra, as posições mudam.
  useEffect(track, [mode, fs, src.length]);
  const toggleMetro = () => {
    const open = !metroOpen; setMetroOpen(open);
    if(!open){ metro.stop(); return; }
    // Começa no BPM da primeira música que tiver um.
    const withBpm = list.find(s => +s.meta.bpm);
    if(withBpm && !metro.running) metro.set({bpm: +withBpm.meta.bpm});
  };
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if(getSelection()?.toString()) return;
    // No celular a lista fica por cima da cifra: tocar fora dela só fecha.
    if(listOpen && !wide()){ setListOpen(false); return; }
    const r = e.currentTarget.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    if(y > 0.6) page(1); else if(y < 0.3) page(-1);
  };
  return <div className={"stage" + (L ? " letra" : "")} id="stage" role="dialog" aria-modal="true" aria-label={t("stage.aria")}>
    <div className="stage-bar">
      <button className="icon-btn" id="stage-close" aria-label={t("stage.close")} onClick={close}><Icon name="x"/></button>
      <Seg className="sm" id="stage-mode" aria={t("stage.modeAria")} value={mode} onChange={setMode}
        options={[{v: "cifras", label: t("sheet.chords")}, {v: "graus", label: t("sheet.degrees")}, {v: "letra", label: t("sheet.lyricsShort")}]}/>
      <span className="grow"/>
      <button className="icon-btn" id="stage-focus" aria-pressed={focusOpen} aria-label={t("stage.focus")} title={t("stage.focus")} onClick={() => setFocusOpen(v => !v)}><Icon name="lock"/></button>
      {document.fullscreenEnabled && <button className="icon-btn" id="stage-fs" aria-pressed={isFs} aria-label={t("stage.fullscreen")} title={t("stage.fullscreen")} onClick={toggleFs}><Icon name="stage"/></button>}
      <button className="icon-btn" id="stage-metro" aria-pressed={metroOpen} aria-label={t("metro.title")} title={t("metro.title")} onClick={toggleMetro}><Icon name="metro"/></button>
      <button className="icon-btn" id="stage-smaller" aria-label={t("stage.smaller")} onClick={() => font(-2)}><b>A−</b></button>
      <button className="icon-btn" id="stage-bigger" aria-label={t("stage.bigger")} onClick={() => font(2)}><b>A+</b></button>
      {/* O Palco cobre o menu: o tema claro/escuro também fica aqui (palco escuro, ensaio de dia). */}
      <ThemeButton/>
    </div>
    {src.length > 0 && <div className="stage-nav" id="stage-nav">
      <button className="icon-btn" id="stage-prev" aria-label={t("stage.prevSong")} title={t("stage.prevSong")} disabled={cur <= 0} onClick={() => goSong(cur - 1)}><Icon name="back"/></button>
      <button className="stage-now" id="stage-now" aria-expanded={listOpen} aria-controls="stage-list" onClick={toggleList}>
        {/* Diz o que o botão faz (ver a lista de músicas ou fechar), antes da posição e do nome da música. */}
        <span className="stage-now-cta">{/* Os dois textos ocupam o mesmo lugar e só um aparece: a largura não muda ao abrir/fechar. */}
          <span className="stage-now-cta-txt"><span className={listOpen ? "off" : ""} aria-hidden={listOpen}>{t("stage.listShow")}</span><span className={listOpen ? "" : "off"} aria-hidden={!listOpen}>{t("stage.listHide")}</span></span><Icon name="chev" sm className="stage-now-chev"/></span>
        <span className="stage-pos">{t("stage.pos", {n: cur + 1, total: src.length})}</span>
        <span className="stage-now-title">{src[cur]?.title}</span>
      </button>
      <button className="icon-btn" id="stage-next" aria-label={t("stage.nextSong")} title={t("stage.nextSong")} disabled={cur >= src.length - 1} onClick={() => goSong(cur + 1)}><Icon name="back" className="flip"/></button>
    </div>}
    {/* Quanto do repertório já passou: o gradiente vai se revelando a cada música. */}
    {src.length > 1 && <div className="stage-progress" aria-hidden="true"><span style={{clipPath: `inset(0 ${100 - (cur + 1) / src.length * 100}% 0 0)`}}/></div>}
    <div className="stage-metro" id="stage-metro-panel" hidden={!metroOpen}>{metroOpen && <MetronomeUI compact/>}</div>
    {focusOpen && <div className="stage-focus" id="stage-focus-panel">
      <strong>{t("stage.focusTitle")}</strong>
      {(() => {
        const pf = focusPlatform(navigator.userAgent, navigator.maxTouchPoints);
        const groups = pf === "other" ? (["android", "ios"] as const) : [pf];
        return groups.map(g => <div key={g}>
          {groups.length > 1 && <p className="stage-focus-os">{t("stage.focus." + g)}</p>}
          <ol className="steps">{FOCUS_STEPS[g].map(k => <li key={k} dangerouslySetInnerHTML={{__html: t(k)}}/>)}</ol>
        </div>);
      })()}
    </div>}
    <div className="stage-body">
    {listOpen && src.length > 0 && <nav className="stage-list" id="stage-list" aria-label={t("stage.songs")}>
      <ol>{src.map((s, si) => <li key={si}>
        <button className={si === cur ? "on" : ""} aria-current={si === cur ? "true" : undefined} onClick={() => goSong(si)}>
          <span className="n">{si + 1}</span><span className="tt">{s.title}</span>{(s.target || s.key) && !L && <small>{s.target || s.key}</small>}
        </button>
      </li>)}</ol>
    </nav>}
    <div className="stage-scroll" id="stage-scroll" tabIndex={0} ref={scroll} onClick={onTap} onScroll={track}>
      <div className="stage-content" id="stage-content" style={{"--stage-fs": fs + "px"} as React.CSSProperties}>
        {!src.length && <div className="empty-state"><strong>{t("stage.empty")}</strong><span>{t("stage.emptyText")}</span></div>}
        {src.map((s, si) => {
          const key = s.target || s.key;
          const meta = [!L && s.meta.bpm && t("sheet.bpm", {n:s.meta.bpm}), !L && s.meta.capo && t("sheet.capo", {n:s.meta.capo}), s.meta.singer && t("sheet.voice", {name:s.meta.singer}), !L && s.meta.solo && t("sheet.solo", {name:s.meta.solo}), s.meta.notes].filter(Boolean).join(" · ");
          const trText = m.options.transitions ? transitionLine(s, src[si+1], mode) : "";
          const group = s.group && (si === 0 || src[si-1].group !== s.group);
          return <div key={si} style={{display: "contents"}}>
            {/* Divisórias: em gradiente entre músicas (e antes de um medley); discreta entre as músicas de um mesmo medley. */}
            {group && <p className={"stage-group" + (si ? " stage-sep" : "")}><Icon name="link" sm/> {t("sheet.medleyLabel", {name: s.gname || ""})}{s.gpos && <span className="chip moment-chip">{s.gpos}</span>}</p>}
            <section className={"stage-song" + (si === src.length - 1 ? " last" : "") + (s.group && !group ? " medley-next" : si && !group ? " stage-sep" : "")}>
              {/* Número da música antes do título: o mesmo da lista de músicas do Palco. */}
              <div className="stage-song-head"><h2><span className="stage-num">{si + 1}</span>{s.title}</h2>
                {s.meta.moment && <span className="chip moment-chip">{s.meta.moment}</span>}
                {s.ref && <button className="stage-ref" onClick={e => { e.stopPropagation(); openRef(s.ref, s.title); }}><Icon name="play" sm/> {t("ref.listen")}</button>}
                {/* Tom alinhado à esquerda: legenda e o tom atual entre baixar e subir meio tom. */}
                {key && !L && <div className="stage-key" role="group" aria-label={t("stage.key")}>
                  <span className="stage-key-cap">{t("stage.key")}</span>
                  <button className="stage-key-btn" aria-label={t("stage.down")} title={t("stage.down")} onClick={e => { e.stopPropagation(); shiftItemKey(s.itemId, -1); }}>−½</button>
                  <b className="stage-key-now">{key}</b>
                  <button className="stage-key-btn" aria-label={t("stage.up")} title={t("stage.up")} onClick={e => { e.stopPropagation(); shiftItemKey(s.itemId, 1); }}>+½</button>
                </div>}</div>
              {meta && <p className="meta">{meta}</p>}
              {s.blocks.map((b, bi) => <div key={bi} className="stage-block">{b.map((it, ii) => <div key={ii} style={{display: "contents"}}>
                {it.chord !== undefined && it.chord !== null && !L && <p className="stage-line ch"><ChordSpans cl={chordLine(it.chord, s, mode, m.options.degreeStyle)} songKey={key}/></p>}
                {it.lyric !== undefined && <p className="stage-line">{it.lyric}</p>}
              </div>)}</div>)}
            </section>
            {trText && <p className="stage-trans">{trText}</p>}
          </div>;
        })}
      </div>
    </div>
    </div>
    <div className="stage-hint">{t("stage.hint")}</div>
  </div>;
}
