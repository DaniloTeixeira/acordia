// Modo palco: tela cheia para tocar, com letra grande, tela acesa, metrônomo, acordes clicáveis
// e troca rápida entre as músicas do repertório.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { lyricsOnly, chordLine, transitionLine, wrapCols, type SheetMode } from "../lib/layout";
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

// Caber na tela: do menor legível até bem grande (a altura disponível é quem decide o tamanho).
const FIT_MIN = 9, FIT_MAX = 96;
// Largura máxima do bloco da música (a mesma do CSS de .stage-content).
const CONTENT_MAX = 1100;
const stageFsDefault = () => innerWidth < 500 ? 17 : innerWidth < 700 ? 19 : 24;
// Tela larga (tablet deitado, computador): a lista de músicas fica ao lado da cifra.
const wide = () => matchMedia("(min-width:1000px)").matches;
const FOCUS_STEPS = {ios: ["stage.focus.ios1", "stage.focus.ios2", "stage.focus.ios3", "stage.focus.ios4"],
  android: ["stage.focus.android1", "stage.focus.android2", "stage.focus.android3"]};

// Largura de um caractere da fonte monoespaçada da cifra, em frações do tamanho da letra.
let monoCache = "", monoW = 0.62;
function monoWidth(el: HTMLElement | null){
  const fam = el ? getComputedStyle(el).getPropertyValue("--font-mono").trim() : "";
  if(!fam || fam === monoCache) return monoW;
  const ctx = document.createElement("canvas").getContext("2d");
  if(ctx){ ctx.font = "700 100px " + fam; monoW = ctx.measureText("M".repeat(10)).width / 1000; if(document.fonts?.status === "loaded") monoCache = fam; }
  return monoW;
}

// Tocar no acorde abre a janela do acorde; no Só a cifra (tela cheia, tocando) não abre, para não tirar o foco:
// o toque vale como tocar na tela.
function ChordSpans({cl, songKey, clickable}: {cl: {text: string; chords: {pos: number; len: number; chord: string}[]}; songKey: string; clickable: boolean}){
  const out: React.ReactNode[] = []; let at = 0;
  cl.chords.forEach((c, i) => {
    out.push(cl.text.slice(at, c.pos));
    out.push(<span key={i} className="chd" data-chord={c.chord} data-key={songKey || ""}
      onClick={clickable ? e => { e.stopPropagation(); openDialog("chord", {symbol: c.chord, songKey: songKey || ""}); } : undefined}>{cl.text.slice(c.pos, c.pos + c.len)}</span>);
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
  // Caber na tela: a letra encolhe até a música (ou o medley) inteira caber sem rolar, para quem não pode
  // parar de tocar. O tamanho sai de uma busca binária medindo a altura de verdade (a quebra de linha muda
  // com o tamanho). A− e A+ desligam e seguem do tamanho em que estava.
  const [fit, setFit] = useState(store.data.settings.stageFit === true);
  const [fitFs, setFitFs] = useState<number | null>(null);
  const search = useRef<{lo: number; hi: number} | null>(null);
  const [box, setBox] = useState(0);
  // Só a cifra: esconde barra, navegação e controles; o toque na tela continua passando página e música.
  const [clean, setClean] = useState(false);
  const toggleClean = () => setClean(v => {
    // Aproveita para pedir tela cheia (onde o navegador deixa).
    if(!v && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(()=>{});
    return !v;
  });
  const scroll = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const m = current(), L = mode === "letra", list = sheetSongs(m), src = L ? lyricsOnly(list) : list;
  const close = () => useUI.setState({stageOpen: false});
  // Uma tela por vez: uma música avulsa, ou o medley inteiro (as músicas emendadas ficam juntas).
  const screen = (i: number): [number, number] => {
    let a = i, z = i; const g = src[i]?.group;
    if(g){ while(a > 0 && src[a-1].group === g) a--; while(z < src.length - 1 && src[z+1].group === g) z++; }
    return [a, z];
  };
  const [first, last] = screen(Math.min(cur, Math.max(0, src.length - 1)));
  // Ao trocar de tela, começa do topo; escolhida na lista uma música do meio do medley, rola até ela.
  const pendingTop = useRef<number | null>(null);
  const goSong = (i: number) => {
    const n = Math.max(0, Math.min(src.length - 1, i));
    pendingTop.current = n; setCur(n);
    if(!wide()) setListOpen(false);
  };
  // As setas (e o toque no fim/começo) passam para a tela seguinte/anterior.
  const step = (dir: number) => goSong(dir > 0 ? last + 1 : screen(first - 1)[0]);
  const stepRef = useRef(step); stepRef.current = step;
  useLayoutEffect(() => {
    const n = pendingTop.current, sc = scroll.current; if(n === null || !sc) return;
    pendingTop.current = null;
    const el = sc.querySelector<HTMLElement>(`.stage-song[data-i="${n}"]`);
    sc.scrollTop = n === first || !el ? 0 : el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 12;
  });
  // Rolando: as setas aparecem mais e voltam a ficar apagadas um pouco depois de parar.
  const [scrolling, setScrolling] = useState(false), scrollTimer = useRef(0);
  const onScroll = () => {
    if(!scrolling) setScrolling(true);
    clearTimeout(scrollTimer.current); scrollTimer.current = window.setTimeout(() => setScrolling(false), 1200);
    track();
  };
  useEffect(() => () => clearTimeout(scrollTimer.current), []);
  // No medley, a música em cena acompanha a rolagem: a última cujo título passou do primeiro quarto da tela.
  const track = () => {
    const sc = scroll.current; if(!sc || last === first) return;
    const line = sc.getBoundingClientRect().top + sc.clientHeight * 0.25;
    let i = first; sc.querySelectorAll<HTMLElement>(".stage-song").forEach(el => { if(el.getBoundingClientRect().top - 16 <= line) i = +el.dataset.i!; });
    if(i !== cur) setCur(i);
  };
  // Se o repertório diminuir, a música em cena continua valendo.
  useEffect(() => { if(cur > 0 && cur >= src.length) setCur(Math.max(0, src.length - 1)); }, [src.length]);
  // A cifra quebra na largura da tela (sem rolagem para o lado): mede quantas colunas cabem. Mede a área de
  // rolagem (sem o recuo das setas), não o bloco da música: ele tem a largura da linha mais longa, e medir nele
  // faria a quebra encolher o bloco, que encolheria a quebra.
  useEffect(() => {
    const el = scroll.current; if(!el) return;
    const ro = new ResizeObserver(() => {
      const cs = getComputedStyle(el);
      setWidth(Math.min(CONTENT_MAX, el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const size = fit && fitFs ? fitFs : fs;
  const cols = L || !width ? Infinity : Math.max(12, Math.floor(width / (size * monoWidth(scroll.current))));
  const toggleList = () => setListOpen(v => { if(wide()) store.setSetting("stageList", !v); return !v; });
  const cleanRef = useRef(clean); cleanRef.current = clean;
  const toggleFit = () => setFit(v => { store.setSetting("stageFit", !v); return !v; });
  // Recomeça a busca ao ligar, ao trocar de tela, de modo, de tamanho da tela ou de conteúdo.
  // (O tom entra na conta: transpor muda o tamanho das linhas de acorde.)
  const sig = src.slice(first, last + 1).map(s => s.itemId + (s.target || s.key)).join() + mode;
  const [, kick] = useState(0);
  // Antes de pintar (layout effect, como cada passo da busca): a música nova não aparece um instante no
  // tamanho da anterior antes de ajustar.
  useLayoutEffect(() => {
    if(!fit){ search.current = null; setFitFs(null); return; }
    search.current = {lo: FIT_MIN, hi: FIT_MAX}; setFitFs(Math.ceil((FIT_MIN + FIT_MAX) / 2)); kick(n => n + 1);
  }, [fit, sig, box, width, clean]);
  // A cada passo da busca: mede se coube, estreita o intervalo e tenta o meio; no fim fica com o maior que cabe.
  useLayoutEffect(() => {
    const s = search.current, sc = scroll.current; if(!fit || !s || fitFs === null || !sc) return;
    if(sc.scrollHeight <= sc.clientHeight + 1) s.lo = fitFs; else s.hi = fitFs - 1;
    if(s.lo >= s.hi){ search.current = null; if(fitFs !== s.lo) setFitFs(s.lo); return; }
    setFitFs(Math.ceil((s.lo + s.hi) / 2));
  });
  // Já no fim da música, avançar passa para a próxima; já no começo, voltar passa para a anterior.
  const page = (dir: number) => {
    const sc = scroll.current!;
    if(dir > 0 && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) return stepRef.current(1);
    if(dir < 0 && sc.scrollTop <= 4) return stepRef.current(-1);
    sc.scrollBy({top: dir * sc.clientHeight * 0.82, behavior: reduced() ? "auto" : "smooth"});
  };
  const font = (d: number) => {
    const from = fit && fitFs ? fitFs : fs;
    if(fit){ setFit(false); store.setSetting("stageFit", false); }
    const n = Math.max(12, Math.min(48, from + d)); store.setSetting("stageFs", n); setFs(n);
  };
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
    // A altura da tela (girar o celular, abrir o metrônomo) muda o que cabe.
    const ro = new ResizeObserver(() => setBox(scroll.current?.clientHeight || 0)); if(scroll.current) ro.observe(scroll.current);
    const key = (e: KeyboardEvent) => {
      if(e.target instanceof Element && e.target.closest("button,input,select")) return;
      if(["ArrowDown","PageDown","ArrowRight"," "].includes(e.key)){ e.preventDefault(); page(1); }
      else if(["ArrowUp","PageUp","ArrowLeft"].includes(e.key)){ e.preventDefault(); page(-1); }
      else if(e.key === "Escape"){ if(document.querySelector("dialog[open]")) return; e.preventDefault(); if(cleanRef.current) setClean(false); else close(); }
      else if(e.key === "+" || e.key === "=") font(2);
      else if(e.key === "-") font(-2);
      else if(e.key === "n" || e.key === "N"){ e.preventDefault(); stepRef.current(1); }
      else if(e.key === "p" || e.key === "P"){ e.preventDefault(); stepRef.current(-1); }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      metro.stop();
      document.removeEventListener("visibilitychange", vis); document.removeEventListener("keydown", key);
      ro.disconnect();
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
  // Celular: passar o dedo para o lado troca de música (para a esquerda, a próxima; para a direita, a anterior).
  // Vale só um gesto rápido e bem mais horizontal que vertical, com um dedo, para não brigar com a rolagem
  // nem com o zoom de pinça.
  const swipe = useRef<{x: number; y: number; at: number} | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const p = e.touches[0];
    swipe.current = e.touches.length === 1 ? {x: p.clientX, y: p.clientY, at: Date.now()} : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s0 = swipe.current; swipe.current = null;
    if(!s0 || e.touches.length || (listOpen && !wide())) return;
    const p = e.changedTouches[0], dx = p.clientX - s0.x, dy = p.clientY - s0.y;
    if(Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - s0.at > 700) return;
    const dir = dx < 0 ? 1 : -1;
    if(dir > 0 ? last >= src.length - 1 : first <= 0) return;
    stepRef.current(dir);
  };
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if(getSelection()?.toString()) return;
    // No celular a lista fica por cima da cifra: tocar fora dela só fecha.
    if(listOpen && !wide()){ setListOpen(false); return; }
    const r = e.currentTarget.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    if(y > 0.6) page(1); else if(y < 0.3) page(-1);
  };
  return <div className={"stage" + (L ? " letra" : "") + (clean ? " clean" : "") + (scrolling ? " scrolling" : "")} id="stage" role="dialog" aria-modal="true" aria-label={t("stage.aria")}>
    {/* Só a cifra: dois botões discretos no canto, voltar e caber na tela. */}
    {clean && <div className="stage-clean-bar">
      <button className="icon-btn sm" id="stage-fit-clean" aria-pressed={fit} aria-label={t("stage.fit")} title={t("stage.fit")} onClick={toggleFit}><Icon name="fit" sm/></button>
      <button className="icon-btn sm" id="stage-unclean" aria-label={t("stage.cleanExit")} title={t("stage.cleanExit")} onClick={toggleClean}><Icon name="x" sm/></button>
    </div>}
    <div className="stage-bar">
      <button className="icon-btn" id="stage-close" aria-label={t("stage.close")} onClick={close}><Icon name="x"/></button>
      <Seg className="sm" id="stage-mode" aria={t("stage.modeAria")} value={mode} onChange={setMode}
        options={[{v: "cifras", label: t("sheet.chords")}, {v: "graus", label: t("sheet.degrees")}, {v: "letra", label: t("sheet.lyricsShort")}]}/>
      <span className="grow"/>
      <button className="icon-btn" id="stage-focus" aria-pressed={focusOpen} aria-label={t("stage.focus")} title={t("stage.focus")} onClick={() => setFocusOpen(v => !v)}><Icon name="lock"/></button>
      <button className="icon-btn" id="stage-clean" aria-pressed={clean} aria-label={t("stage.clean")} title={t("stage.clean")} onClick={toggleClean}><Icon name="stage"/></button>
      <button className="icon-btn" id="stage-fit" aria-pressed={fit} aria-label={t("stage.fit")} title={t("stage.fit")} onClick={toggleFit}><Icon name="fit"/></button>
      <button className="icon-btn" id="stage-metro" aria-pressed={metroOpen} aria-label={t("metro.title")} title={t("metro.title")} onClick={toggleMetro}><Icon name="metro"/></button>
      <button className="icon-btn" id="stage-smaller" aria-label={t("stage.smaller")} onClick={() => font(-2)}><b>A−</b></button>
      <button className="icon-btn" id="stage-bigger" aria-label={t("stage.bigger")} onClick={() => font(2)}><b>A+</b></button>
      {/* O Palco cobre o menu: o tema claro/escuro também fica aqui (palco escuro, ensaio de dia). */}
      <ThemeButton/>
    </div>
    {src.length > 0 && <div className="stage-nav" id="stage-nav">
      <button className="icon-btn" id="stage-prev" aria-label={t("stage.prevSong")} title={t("stage.prevSong")} disabled={first <= 0} onClick={() => step(-1)}><Icon name="back"/></button>
      <button className="stage-now" id="stage-now" aria-expanded={listOpen} aria-controls="stage-list" onClick={toggleList}>
        {/* Diz o que o botão faz (ver a lista de músicas ou fechar), antes da posição e do nome da música. */}
        <span className="stage-now-cta">{/* Os dois textos ocupam o mesmo lugar e só um aparece: a largura não muda ao abrir/fechar. */}
          <span className="stage-now-cta-txt"><span className={listOpen ? "off" : ""} aria-hidden={listOpen}>{t("stage.listShow")}</span><span className={listOpen ? "" : "off"} aria-hidden={!listOpen}>{t("stage.listHide")}</span></span><Icon name="chev" sm className="stage-now-chev"/></span>
        <span className="stage-pos">{t("stage.pos", {n: cur + 1, total: src.length})}</span>
        <span className="stage-now-title">{src[cur]?.title}</span>
      </button>
      <button className="icon-btn" id="stage-next" aria-label={t("stage.nextSong")} title={t("stage.nextSong")} disabled={last >= src.length - 1} onClick={() => step(1)}><Icon name="back" className="flip"/></button>
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
      {/* Medley: o nome dele e as músicas como subitens, com o mesmo número da folha. */}
      <ol>{src.map((s, si) => {
        const song = (i: number) => <li key={i}>
          <button className={i === cur ? "on" : ""} aria-current={i === cur ? "true" : undefined} onClick={() => goSong(i)}>
            <span className="n">{i + 1}</span><span className="tt">{src[i].title}</span>{(src[i].target || src[i].key) && !L && <small>{src[i].target || src[i].key}</small>}
          </button>
        </li>;
        if(!s.group) return song(si);
        if(si > 0 && src[si - 1].group === s.group) return null;
        const [a, z] = screen(si), ids = Array.from({length: z - a + 1}, (_, k) => a + k);
        return <li key={si} className="stage-list-medley">
          <span className="stage-list-mh"><Icon name="link" sm/><span className="tt">{s.gname || t("sheet.medleyLabel", {name: ""})}</span></span>
          <ol>{ids.map(song)}</ol>
        </li>;
      })}</ol>
    </nav>}
    <div className={"stage-scroll" + (fit ? " fit" : "")} id="stage-scroll" tabIndex={0} ref={scroll} onClick={onTap} onScroll={onScroll}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { swipe.current = null; }}>
      <div className="stage-content" id="stage-content" ref={content} style={{"--stage-fs": size + "px"} as React.CSSProperties} data-fit={fit || undefined}>
        {!src.length && <div className="empty-state"><strong>{t("stage.empty")}</strong><span>{t("stage.emptyText")}</span></div>}
        {src.slice(first, last + 1).map((s, k) => {
          const si = first + k, key = s.target || s.key;
          const meta = [!L && s.meta.bpm && t("sheet.bpm", {n:s.meta.bpm}), !L && s.meta.capo && t("sheet.capo", {n:s.meta.capo}), s.meta.singer && t("sheet.voice", {name:s.meta.singer}), !L && s.meta.solo && t("sheet.solo", {name:s.meta.solo}), s.meta.notes].filter(Boolean).join(" · ");
          const trText = m.options.transitions ? transitionLine(s, src[si+1], mode) : "";
          return <div key={si} style={{display: "contents"}}>
            {/* Medley: o nome em cima e uma linha discreta entre as músicas dele. */}
            {s.group && !k && <p className="stage-group"><Icon name="link" sm/> {t("sheet.medleyLabel", {name: s.gname || ""})}{s.gpos && <span className={"chip moment-chip" + (s.gpos === t("item.momentLouvor") ? " louvor" : "")}>{s.gpos}</span>}</p>}
            <section className={"stage-song" + (k ? " medley-next" : "")} data-i={si}>
              {/* Número da música antes do título: o mesmo da lista de músicas do Palco. */}
              {/* O momento (Louvor, Pós-pregação) vai dentro do título, logo depois do nome: quebra junto com ele. */}
              <div className="stage-song-head"><h2><span className="stage-num">{si + 1}</span>{s.title}
                {s.meta.moment && <span className={"chip moment-chip" + (s.meta.moment === t("item.momentLouvor") ? " louvor" : "")}>{s.meta.moment}</span>}</h2>
                {s.ref && <button className="stage-ref" onClick={e => { e.stopPropagation(); openRef(s.ref, s.title); }}><Icon name="play" sm/> {t("ref.listen")}</button>}
                {/* Tom alinhado à esquerda: legenda e o tom atual entre baixar e subir meio tom. */}
                {key && !L && <div className="stage-key" role="group" aria-label={t("stage.key")}>
                  <span className="stage-key-cap">{t("stage.key")}</span>
                  <button className="stage-key-btn" aria-label={t("stage.down")} title={t("stage.down")} onClick={e => { e.stopPropagation(); shiftItemKey(s.itemId, -1); }}>−½</button>
                  <b className="stage-key-now">{key}</b>
                  <button className="stage-key-btn" aria-label={t("stage.up")} title={t("stage.up")} onClick={e => { e.stopPropagation(); shiftItemKey(s.itemId, 1); }}>+½</button>
                </div>}</div>
              {meta && <p className="meta">{meta}</p>}
              {s.blocks.map((b, bi) => <div key={bi} className="stage-block">{b.map((it, ii) => {
                const cl = it.chord !== undefined && it.chord !== null && !L ? chordLine(it.chord, s, mode, m.options.degreeStyle) : null;
                const parts = wrapCols(cl?.text || "", it.lyric || "", cols), one = parts.length === 1;
                return <div key={ii} style={{display: "contents"}}>{parts.map(([a, z]) => {
                  const ly = it.lyric?.slice(a, z), ch = cl && {text: cl.text.slice(a, z), chords: cl.chords.filter(c => c.pos >= a && c.pos < z).map(c => ({...c, pos: c.pos - a}))};
                  return <div key={a} style={{display: "contents"}}>
                    {ch && (one || ch.text.trim()) && <p className="stage-line ch"><ChordSpans cl={ch} songKey={key} clickable={!clean}/></p>}
                    {ly !== undefined && (one || ly.trim()) && <p className="stage-line">{ly}</p>}
                  </div>;
                })}</div>;
              })}</div>)}
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
