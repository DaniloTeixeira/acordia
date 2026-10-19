// Pad infinito: escolhe o tom e o estilo, toca e ajusta o volume. Sair desta tela para o pad.
import { useEffect, useState } from "react";
import { KEYS } from "../lib/core";
import { t } from "../lib/i18n";
import { toast } from "../state";
import { pad, PAD_STYLES, type PadState } from "../pad";
import { Icon } from "../ui/Icon";
import { Range } from "../ui/Range";

function usePad(){
  const [s, setS] = useState<PadState>(pad.state);
  useEffect(() => pad.onChange(setS), []);
  return s;
}

export function PadUI(){
  const s = usePad(), key = KEYS[s.pc];
  useEffect(() => { pad.preload(); }, [s.pc]);
  // Sair da tela (trocar de aba ou de página) para o pad.
  useEffect(() => () => pad.stop(), []);
  const fail = (ok: boolean) => { if(!ok) toast(t("pad.error")); };
  const on = s.playing || s.loading;
  return <div className="pad-layout">
  <div className="card metro pad">
    <div className="card-head"><h2>{t("pad.title")}</h2><p className="sub">{t("pad.sub")}</p></div>
    <div className="metro-read pad-read" aria-live="polite"><b>{key}</b>
      {s.loading ? <small>{t("pad.loading")}</small>
        : s.playing ? <small className="pad-playing"><Icon name="music" sm/><span>{t("pad.playing")}</span></small>
        : <small>{t("pad.idle")}</small>}</div>
    <div className="field roots-field"><span id="pad-key-h">{t("pad.key")}</span>
      <div className="roots pad-keys" role="group" aria-labelledby="pad-key-h">{KEYS.map((k, pc) =>
        <button key={k} className="root-btn" aria-pressed={pc === s.pc} onClick={() => pad.setKey(pc).then(fail)}>{k}</button>)}</div></div>
    <div className="field roots-field"><span id="pad-style-h">{t("pad.style")}</span>
      <div className="pad-styles" role="group" aria-labelledby="pad-style-h">{PAD_STYLES.map(st =>
        <button key={st} className="root-btn" aria-pressed={st === s.style} title={t("pad.style." + st + ".hint")} onClick={() => pad.setStyle(st)}>
          <b>{t("pad.style." + st)}</b><small>{t("pad.style." + st + ".hint")}</small></button>)}</div></div>
    <label className="field"><span>{t("pad.volume")}</span>
      <Range min={0} max={100} step={1} value={Math.round(s.volume * 100)} aria-label={t("pad.volume")} onChange={e => pad.setVolume(+e.target.value / 100)}/></label>
    <div className="field"><span className="pad-filter-h"><span>{t("pad.filter")}</span><small>{t("pad.filter.closed")} ↔ {t("pad.filter.open")}</small></span>
      <Range min={0} max={100} step={1} value={Math.round(s.filter * 100)} aria-label={t("pad.filter")} onChange={e => pad.setFilter(+e.target.value / 100)}/></div>
    <div className="metro-actions pad-actions">
      <button className={"btn primary metro-go" + (on ? " running" : "")} id="pad-toggle" onClick={() => pad.toggle().then(fail)}>
        {on ? <><Icon name="stop" sm/> {t("pad.stop")}</> : <><Icon name="play" sm/> {t("pad.start")}</>}</button>
      <button className={"btn ghost" + (s.fading ? " busy" : "")} data-tip-key="pad.fade.tip" onClick={() => pad.fade().then(fail)}>
        {s.fading ? t("pad.fading") : on ? t("pad.fadeOut") : t("pad.fadeIn")}</button>
    </div>
    <p className="sub">{t("pad.hint")}</p>
  </div>
  </div>;
}
