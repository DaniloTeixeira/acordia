// Separar faixas: a pessoa traz uma música (arquivo do aparelho ou link direto para o arquivo), a IA
// separa voz, violão/guitarra, piano, baixo, bateria e o resto, e um mixer toca tudo junto com cada
// faixa ligada ou desligada, para tocar ou cantar por cima. Dá para baixar a mistura ou cada faixa.
import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { saveBlob } from "../lib/pdf";
import { slug } from "../lib/util";
import { toast, confirmDialog } from "../state";
import { MODEL, STEM_ORDER } from "../lib/stems";
import { useStems, openFile, openLink, separate, cancel, reset, checkModel, hasInput, play, pause, seek, stemWav, mixWav, PRESETS, applyPreset, effectiveGains, MAX_SECONDS } from "../stems";
import { Icon } from "../ui/Icon";
import { Range } from "../ui/Range";

const clock = (s: number) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

export function StemsUI(){
  const s = useStems();
  const [link, setLink] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if(s.modelCached === null) checkModel(); }, [s.modelCached]);
  // Sair da tela pausa (a música separada continua guardada até fechar o app).
  useEffect(() => () => { if(useStems.getState().playing) pause(); }, []);
  const busy = s.phase === "decoding" || s.phase === "download" || s.phase === "loading" || s.phase === "separating";
  const start = async () => {
    if(!s.modelCached && !await confirmDialog({title: t("stems.modelTitle"), message: t("stems.modelMsg", {mb: MODEL.mb}), confirm: t("stems.download")})) return;
    separate();
  };
  // Quanto falta: pelo ritmo dos pedaços já separados.
  const eta = s.phase === "separating" && s.progress > 0.05 && s.startedAt ? (Date.now() - s.startedAt) / s.progress * (1 - s.progress) / 1000 : 0;
  return <div className="stems-layout">
    <div className="card stems-in">
      <div className="card-head"><h2>{t("stems.title")}</h2><p className="sub">{t("stems.sub")}</p></div>
      <div className="stems-src">
        <button className="btn ghost" id="stems-file" disabled={busy} onClick={() => file.current?.click()}><Icon name="import" sm/> {t("stems.pickFile")}</button>
        <input ref={file} type="file" accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.flac,.aac,.mp4,.webm" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if(f) openFile(f); }}/>
        <span className="sub">{t("stems.or")}</span>
        <form className="stems-link" onSubmit={e => { e.preventDefault(); if(link.trim()) openLink(link); }}>
          <input className="input" id="stems-url" type="url" inputMode="url" placeholder={t("stems.linkPh")} aria-label={t("stems.link")} value={link} onChange={e => setLink(e.target.value)} disabled={busy}/>
          <button className="btn ghost" disabled={!link.trim() || busy}><Icon name="link" sm/> {t("stems.openLink")}</button>
        </form>
      </div>
      <p className="sub">{t("stems.linkHint")}</p>
      {s.phase === "error" && <p className="note" role="alert">{t("stems.err." + s.error, {min: MAX_SECONDS / 60})}{s.detail && <small className="stems-detail"> ({s.detail.slice(0, 120)})</small>}</p>}
      {(hasInput() || s.phase === "decoding") && <div className="stems-song">
        <Icon name="music"/><div><b>{s.name || "…"}</b><span className="sub">{s.phase === "decoding" ? t("stems.decoding") : clock(s.duration)}</span></div>
        {s.phase !== "ready" && !busy && hasInput() && <button className="btn primary" id="stems-go" onClick={start}><Icon name="layers" sm/> {t("stems.separate")}</button>}
        {s.phase === "ready" && <button className="btn ghost sm" onClick={reset}>{t("stems.another")}</button>}
      </div>}
      {busy && s.phase !== "decoding" && <div className="stems-progress" aria-live="polite">
        <div className="bar"><i style={{width: (s.phase === "loading" ? 100 : Math.round(s.progress * 100)) + "%"}} className={s.phase === "loading" ? "indet" : ""}/></div>
        <span>{s.phase === "download" ? t("stems.downloading", {p: Math.round(s.progress * 100), mb: MODEL.mb})
          : s.phase === "loading" ? t("stems.loading")
          : t("stems.working", {p: Math.round(s.progress * 100)}) + (eta ? " · " + t("stems.eta", {t: clock(eta)}) : "")}</span>
        <button className="btn ghost sm" onClick={cancel}>{t("common.cancel")}</button>
      </div>}
      {(s.phase === "separating" || s.phase === "loading") && <p className="sub">{s.gpuFailed && t("stems.gpuFailed") + " "}{t(s.device === "gpu" ? "stems.onGpu" : "stems.onCpu")}</p>}
      {s.modelCached === false && s.phase === "idle" && hasInput() && <p className="note info">{t("stems.firstTime", {mb: MODEL.mb})}</p>}
    </div>
    {s.phase === "ready" && <Mixer/>}
    <p className="sub stems-credit">{t("stems.credit")}</p>
  </div>;
}

function Mixer(){
  const s = useStems(), gains = effectiveGains(s);
  const preset = PRESETS.find(p => STEM_ORDER.every(n => p.off.includes(n) === (s.muted[n] && !s.solo)) && !s.solo);
  return <div className="card stems-mix">
    <div className="card-head"><h2>{t("stems.mixer")}</h2></div>
    <div className="stems-presets" role="group" aria-label={t("stems.presets")}>{PRESETS.map(p =>
      <button key={p.id} className="root-btn" aria-pressed={preset?.id === p.id} onClick={() => applyPreset(p.off)}>{t("stems.preset." + p.id)}</button>)}</div>
    <ul className="stems-list">{STEM_ORDER.map(n => {
      const i = MODEL.stems.indexOf(n), on = gains[i] > 0;
      return <li key={n} className={on ? "" : "off"}>
        <button className={"stem-toggle" + (on ? " on" : "")} aria-pressed={!s.muted[n]} aria-label={t("stems.toggle", {name: t("stems.name." + n)})}
          onClick={() => useStems.setState(st => ({muted: {...st.muted, [n]: !st.muted[n]}}))}><Icon name={s.muted[n] ? "mute" : "sound"} sm/></button>
        <b className="stem-name">{t("stems.name." + n)}</b>
        <Range min={0} max={150} step={5} value={Math.round(s.gains[n] * 100)} aria-label={t("stems.volume", {name: t("stems.name." + n)})}
          onChange={e => useStems.setState(st => ({gains: {...st.gains, [n]: +e.target.value / 100}}))}/>
        <button className={"btn sm " + (s.solo === n ? "primary" : "ghost")} aria-pressed={s.solo === n} title={t("stems.soloHint")} onClick={() => useStems.setState(st => ({solo: st.solo === n ? "" : n}))}>{t("stems.solo")}</button>
        <button className="icon-btn sm" aria-label={t("stems.downloadStem", {name: t("stems.name." + n)})} title={t("stems.downloadStem", {name: t("stems.name." + n)})}
          onClick={() => saveBlob(stemWav(n), slug(s.name) + "-" + slug(t("stems.name." + n)) + ".wav")}><Icon name="download" sm/></button>
      </li>; })}</ul>
    <div className="stems-player">
      <button className={"btn primary metro-go" + (s.playing ? " running" : "")} id="stems-play" onClick={() => s.playing ? pause() : play()}>
        {s.playing ? <><Icon name="stop" sm/> {t("stems.pause")}</> : <><Icon name="play" sm/> {t("stems.play")}</>}</button>
      <span className="stems-time">{clock(s.pos)}</span>
      <Range min={0} max={Math.max(1, Math.floor(s.duration))} step={1} value={Math.floor(s.pos)} aria-label={t("stems.position")} onChange={e => seek(+e.target.value)}/>
      <span className="stems-time">{clock(s.duration)}</span>
    </div>
    <div className="stems-actions">
      <button className="btn ghost" onClick={() => { toast(t("stems.exporting")); setTimeout(() => saveBlob(mixWav(), slug(s.name) + "-" + slug(preset ? t("stems.preset." + preset.id) : t("stems.mix")) + ".wav"), 50); }}>
        <Icon name="download" sm/> {t("stems.downloadMix")}</button>
    </div>
    <p className="sub">{t("stems.mixHint")}</p>
  </div>;
}
