// Sugerir uma música para a lista Para aprender do grupo (ou editar uma sugestão): nome, artista, link para ouvir e uma nota.
import { useState } from "react";
import { t } from "../lib/i18n";
import { sanitizeUrl } from "../lib/core";
import { LEARN_MAX } from "../lib/learn";
import { useGroups, addLearn, editLearn } from "../lib/groups";
import { toast, requestClose, type DialogProps } from "../state";
import { Dialog, DialogHead } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Spin, useLock } from "../views/Account";

export function LearnDialog({id}: DialogProps["learn"]){
  const g = useGroups(), old = id ? g.learn.find(x => x.id === id) : undefined;
  const [f, setF] = useState({title: old?.title || "", artist: old?.artist || "", url: old?.url || "", note: old?.note || ""});
  const [busy, setBusy] = useState(false), [tried, setTried] = useState(false), lock = useLock();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(x => ({...x, [k]: e.target.value}));
  const noTitle = tried && !f.title.trim(), badUrl = !!f.url.trim() && !sanitizeUrl(f.url);
  const changed = !old || (["title", "artist", "url", "note"] as const).some(k => f[k] !== old[k]);
  const save = (e: React.FormEvent<HTMLFormElement>) => {
    // O X do cabeçalho (value="cancel") só fecha.
    if(((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "cancel") return;
    e.preventDefault(); const d = e.currentTarget.closest("dialog");
    // Botão sempre ativo: título vazio ou link inválido avisa embaixo do campo e leva o foco para ele.
    if(!f.title.trim() || badUrl){ setTried(true); document.getElementById(!f.title.trim() ? "learn-title" : "learn-url")?.focus(); return; }
    lock(async () => {
      setBusy(true);
      const ok = await (old ? editLearn(old.id, f) : addLearn(g.gid, f)).finally(() => setBusy(false));
      if(!ok) return toast(t("profile.saveFail"));
      toast(t(old ? "learn.saved" : "learn.added", {title: f.title.trim()}));
      d?.close("ok");
    });
  };
  return <Dialog name="learn" id="dlg-learn" labelledBy="learn-h" dirty={() => changed && !!(f.title.trim() || f.url.trim())}>
    <form method="dialog" className="dlg" onSubmit={save} noValidate>
      <DialogHead id="learn-h" title={t(old ? "learn.editTitle" : "learn.new")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        <label className="field"><span>{t("learn.song")}</span>
          <input className="input" id="learn-title" maxLength={LEARN_MAX.title} autoFocus={!old} value={f.title} aria-invalid={noTitle} aria-describedby={noTitle ? "learn-title-err" : undefined} onChange={set("title")}/>
          {noTitle && <span className="field-error" id="learn-title-err">{t("learn.needTitle")}</span>}</label>
        <label className="field"><span>{t("learn.artist")}</span>
          <input className="input" id="learn-artist" maxLength={LEARN_MAX.artist} value={f.artist} onChange={set("artist")}/></label>
        <label className="field"><span>{t("learn.url")}</span>
          <input className="input" id="learn-url" type="url" inputMode="url" autoComplete="off" placeholder={t("item.refPh")} value={f.url} aria-invalid={badUrl} aria-describedby={badUrl ? "learn-url-err" : undefined} onChange={set("url")}/>
          {badUrl && <span className="field-error" id="learn-url-err">{t("learn.badUrl")}</span>}</label>
        <label className="field"><span>{t("learn.note")}</span>
          <textarea className="input" id="learn-note" rows={3} maxLength={LEARN_MAX.note} placeholder={t("learn.notePh")} value={f.note} onChange={set("note")}/></label>
      </div>
      <div className="dlg-foot"><button type="button" className="btn ghost" onClick={e => { const d = e.currentTarget.closest("dialog"); if(d) requestClose(d); }}>{t("common.cancel")}</button>
        <button type="submit" className="btn primary" id="learn-save" aria-busy={busy}>{busy ? <Spin/> : <Icon name="check" sm/>} {t("common.save")}</button></div>
    </form>
  </Dialog>;
}
