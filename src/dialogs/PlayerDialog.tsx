// Link de referência: vídeo do YouTube tocando dentro do app, com loop A–B e velocidade.
// Sem a API do YouTube (offline, bloqueada), mostra o player simples.
import { useEffect, useRef, useState } from "react";
import { youtubeId, youtubeStart } from "../lib/core";
import { t } from "../lib/i18n";
import * as store from "../lib/store";
import type { DialogProps } from "../state";
import { Dialog, DialogHead } from "../ui/Dialog";
import { Seg } from "../ui/Seg";

interface YTPlayer { getCurrentTime(): number; seekTo(s: number, allow: boolean): void; setPlaybackRate(r: number): void; destroy(): void }
interface YTApi { Player: new (el: HTMLElement, opts: object) => YTPlayer }
declare global { interface Window { YT?: YTApi; onYouTubeIframeAPIReady?: () => void } }

let ytApi: Promise<YTApi> | null = null;
function loadYouTubeAPI(): Promise<YTApi> {
  if(window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if(!ytApi) ytApi = new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if(prev) prev(); res(window.YT!); };
    const sc = document.createElement("script"); sc.src = "https://www.youtube.com/iframe_api"; sc.async = true;
    sc.onerror = () => { ytApi = null; rej(new Error("yt")); };
    document.head.appendChild(sc);
    setTimeout(() => { ytApi = null; rej(new Error("timeout")); }, 8000);
  });
  return ytApi;
}
const fmt = (s: number | null) => s == null ? "–:––" : Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
type Loop = {a: number | null; b: number | null; on: boolean};

export function PlayerDialog({url, title}: DialogProps["player"]){
  const id = youtubeId(url), start = youtubeStart(url), offline = navigator.onLine === false;
  // "loading" até a API responder; "api" com as ferramentas; "plain" com o iframe simples.
  const [mode, setMode] = useState<"loading" | "api" | "plain">(offline ? "plain" : "loading");
  const [ready, setReady] = useState(false);
  const saved = ((store.data.settings.loops || {}) as Record<string, Loop>)[id] || {a: null, b: null, on: false};
  const [loop, setLoop] = useState<Loop>({a: saved.a ?? null, b: saved.b ?? null, on: !!saved.on && saved.a != null && saved.b != null});
  const [speed, setSpeed] = useState("1");
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null), loopRef = useRef(loop); loopRef.current = loop;
  useEffect(() => {
    if(offline) return;
    let alive = true;
    loadYouTubeAPI().then(YT => {
      if(!alive) return;
      setMode("api");
      requestAnimationFrame(() => {
        if(!alive || !host.current) return;
        // O player troca o elemento por um iframe; por isso ele fica num filho que o React não controla.
        const el = document.createElement("div"); host.current.replaceChildren(el);
        const st = loopRef.current;
        player.current = new YT.Player(el, {videoId: id, host: "https://www.youtube-nocookie.com",
          playerVars: {autoplay: 1, rel: 0, playsinline: 1, start: st.on ? Math.floor(st.a!) : start},
          events: {onReady: () => { if(alive) setReady(true); }}});
      });
    }).catch(() => { if(alive) setMode("plain"); });
    const poll = setInterval(() => {
      const st = loopRef.current, p = player.current;
      if(p && p.getCurrentTime && st.on && st.b != null && p.getCurrentTime() >= st.b) p.seekTo(st.a!, true);
    }, 120);
    return () => { alive = false; clearInterval(poll); try{ player.current?.destroy(); }catch(e){ /* já saiu */ } player.current = null; };
  }, [id]);
  const update = (st: Loop) => {
    setLoop(st);
    const l = Object.assign({}, store.data.settings.loops || {}) as Record<string, Loop>; l[id] = st; store.setSetting("loops", l);
  };
  const now = () => player.current && player.current.getCurrentTime ? player.current.getCurrentTime() : 0;
  return <Dialog name="player" id="dlg-player" className="player" labelledBy="player-h">
    <form method="dialog" className="dlg">
      <DialogHead id="player-h" title={title || t("ref.title")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        <p className="note" id="player-offline" hidden={!offline}>{t("ref.offline")}</p>
        <div className="player-box" id="player-box">
          {mode === "loading" && <div className="player-loading">{t("player.loading")}</div>}
          {mode === "api" && <div id="yt-player" ref={host}/>}
          {mode === "plain" && <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1${start ? "&start=" + start : ""}`} title={title || "YouTube"}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>}
        </div>
        <div className="player-tools" id="player-tools" hidden={!(mode === "api" && ready)}>
          <div className="pl-row">
            <button type="button" className="btn ghost sm" id="pl-a" onClick={() => { const a = now(); update({...loop, a, b: loop.b != null && loop.b <= a ? null : loop.b}); }}>A {fmt(loop.a)}</button>
            <button type="button" className="btn ghost sm" id="pl-b" onClick={() => { const b = now(); if(loop.a != null && b > loop.a) update({...loop, b, on: true}); }}>B {fmt(loop.b)}</button>
            <button type="button" className="btn soft sm" id="pl-loop" aria-pressed={loop.on} disabled={loop.a == null || loop.b == null || loop.b <= loop.a}
              onClick={() => { const on = !loop.on; if(on) player.current?.seekTo(loop.a!, true); update({...loop, on}); }}>{t("player.loop")}</button>
            <button type="button" className="btn ghost sm" id="pl-clear" onClick={() => update({a: null, b: null, on: false})}>{t("player.clear")}</button>
            <span className="pl-speed-wrap"><span className="sub">{t("player.speed")}</span>
              <Seg className="sm" id="pl-speed" value={speed} onChange={v => { setSpeed(v); player.current?.setPlaybackRate(+v); }}
                options={["0.5", "0.75", "1"].map(v => ({v, label: v + "×"}))}/></span>
          </div>
          <p className="sub" id="pl-status">{loop.on ? t("player.loopOn", {a: fmt(loop.a), b: fmt(loop.b)}) : t("player.hint")}</p>
        </div>
      </div>
      <div className="dlg-foot"><a className="btn ghost" id="player-open" href={url} target="_blank" rel="noopener">{t("ref.open")}</a>
        <button className="btn primary" value="cancel">{t("common.close")}</button></div>
    </form>
  </Dialog>;
}
