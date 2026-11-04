// Adicionar músicas ao repertório aberto só com links: uma por linha (nome, link da cifra e/ou do vídeo), sem colar cifra.
import { useState } from "react";
import { t, tn } from "../lib/i18n";
import { parseLinkLines, LINK_BATCH_MAX } from "../lib/links";
import { toast, requestClose } from "../state";
import { Dialog, DialogHead } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { addLinkSongs } from "../views/Repertoire";

export function LinkSongsDialog(){
  const [text, setText] = useState(""), [tried, setTried] = useState(false);
  const r = parseLinkLines(text), none = tried && !r.songs.length;
  const add = (e: React.FormEvent<HTMLFormElement>) => {
    // O X do cabeçalho (value="cancel") só fecha.
    if(((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "cancel") return;
    e.preventDefault(); const d = e.currentTarget.closest("dialog");
    // Botão sempre ativo: sem nenhuma música reconhecida avisa embaixo do campo e leva o foco para ele.
    if(!r.songs.length){ setTried(true); document.getElementById("link-text")?.focus(); return; }
    addLinkSongs(r.songs);
    toast(tn("link.added", r.songs.length));
    d?.close("ok");
  };
  return <Dialog name="linkSongs" id="dlg-link-songs" labelledBy="link-h" dirty={() => !!text.trim()}>
    <form method="dialog" className="dlg" onSubmit={add} noValidate>
      <DialogHead id="link-h" title={t("link.title")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        <p className="note">{t("link.help")}</p>
        <label className="field"><span>{t("link.field")}</span>
          <textarea className="input" id="link-text" rows={6} spellCheck={false} autoFocus autoComplete="off" placeholder={t("link.ph")} value={text} aria-invalid={none}
            aria-describedby={none ? "link-text-err" : undefined} onChange={e => setText(e.target.value)}/>
          {none && <span className="field-error" id="link-text-err">{t("link.none")}</span>}</label>
        {r.songs.length > 0 && <ul className="link-preview" aria-label={tn("link.found", r.songs.length)}>
          {r.songs.map((s, i) => <li key={i}><span className="tt">{s.title}</span>
            {s.chartUrl && <span className="chip">{t("link.chart")}</span>}{s.ref && <span className="chip">{t("link.video")}</span>}</li>)}
        </ul>}
        {r.skipped.length > 0 && <ul className="link-preview" aria-label={t("link.skipped")}>
          <li className="note">{t("link.skipped")}</li>
          {r.skipped.map((l, i) => <li key={i} className="skip">{l}</li>)}
        </ul>}
        {r.extra > 0 && <p className="field-error">{t("link.extra", {n: LINK_BATCH_MAX})}</p>}
      </div>
      <div className="dlg-foot"><button type="button" className="btn ghost" onClick={e => { const d = e.currentTarget.closest("dialog"); if(d) requestClose(d); }}>{t("common.cancel")}</button>
        <button type="submit" className="btn primary" id="link-add"><Icon name="plus" sm/> {r.songs.length ? tn("link.addN", r.songs.length) : t("common.add")}</button></div>
    </form>
  </Dialog>;
}
