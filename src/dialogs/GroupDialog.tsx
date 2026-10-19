// Janelas do grupo: editar o grupo aberto (lápis ao lado do nome, em Grupo) e criar outro (Início, só admins do app).
import { useState } from "react";
import { t } from "../lib/i18n";
import { useAuth } from "../lib/cloud";
import { useGroups, createGroup, renameGroup, deleteGroup, groupNameTaken } from "../lib/groups";
import { toast, confirmDialog } from "../state";
import { Dialog, DialogHead } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Spin, useLock } from "../views/Account";
import { GroupPhoto, openGroup } from "../views/Group";

// Enter no campo aperta o botão principal (senão o form usaria o primeiro botão, o X do cabeçalho, e fecharia).
const enterClicks = (id: string) => (e: React.KeyboardEvent) => {
  if(e.key === "Enter"){ e.preventDefault(); (document.getElementById(id) as HTMLButtonElement | null)?.click(); }
};

// Foto (só admins do app; o banco recusa os líderes) e nome; excluir também só para admins do app.
// A foto e o formato salvam na hora, como antes; o nome, no Salvar.
export function GroupDialog(){
  const g = useGroups(), appAdmin = useAuth(s => s.admin), group = g.groups.find(x => x.id === g.gid);
  const [name, setName] = useState(group?.name || ""), [busy, setBusy] = useState(false), lock = useLock();
  if(!group) return null;
  const changed = !!name.trim() && name.trim() !== group.name, taken = groupNameTaken(name, group.id);
  const save = (e: React.MouseEvent<HTMLButtonElement>) => { const d = e.currentTarget.closest("dialog"); lock(async () => {
    if(taken) return;
    if(changed){ setBusy(true); const ok = await renameGroup(group.id, name).finally(() => setBusy(false)); if(!ok) return toast(t("profile.saveFail")); toast(t("group.saved")); }
    d?.close("ok");
  }); };
  const remove = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const d = e.currentTarget.closest("dialog");
    if(!await confirmDialog({title: t("group.deleteTitle"), message: t("group.deleteMsg", {name: group.name})})) return;
    lock(async () => { const ok = await deleteGroup(group.id); toast(t(ok ? "group.deleted" : "profile.saveFail", {name: group.name})); if(ok) d?.close("ok"); });
  };
  return <Dialog name="group" id="dlg-group" className="group-dlg" labelledBy="group-dlg-h" dirty={() => changed}>
    <form method="dialog" className="dlg">
      <DialogHead id="group-dlg-h" title={t("group.edit")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        {appAdmin && <GroupPhoto/>}
        <label className="field"><span>{t("group.name")}</span>
          <input className="input" id="group-rename" maxLength={80} value={name} aria-invalid={taken} aria-describedby={taken ? "group-rename-err" : undefined}
            onChange={e => setName(e.target.value)} onKeyDown={enterClicks("group-save")}/>
          {taken && <span className="field-error" id="group-rename-err">{t("group.nameTaken")}</span>}</label>
        {appAdmin && <button type="button" className="btn ghost danger" id="group-delete" onClick={remove}><Icon name="trash" sm/> {t("group.delete")}</button>}
      </div>
      <div className="dlg-foot"><button className="btn ghost" value="cancel">{t("common.cancel")}</button>
        <button type="button" className="btn primary" id="group-save" disabled={!name.trim() || taken} aria-busy={busy} onClick={save}>{busy ? <Spin/> : <Icon name="check" sm/>} {t("common.save")}</button></div>
    </form>
  </Dialog>;
}

// Novo grupo: cria, passa a ser o grupo aberto e vai para ele (na aba Membros, para já cadastrar a equipe).
export function NewGroupDialog(){
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), lock = useLock(), taken = groupNameTaken(name);
  const create = (e: React.FormEvent<HTMLFormElement>) => {
    // O X do cabeçalho (value="cancel") só fecha.
    if(((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "cancel") return;
    e.preventDefault(); const d = e.currentTarget.closest("dialog"); if(!name.trim() || taken) return; lock(async () => {
      setBusy(true); const ok = await createGroup(name).finally(() => setBusy(false));
      toast(t(ok ? "group.created" : "profile.saveFail", {name: name.trim()}));
      if(ok){ d?.close("ok"); openGroup("members"); }
    });
  };
  return <Dialog name="newGroup" id="dlg-new-group" labelledBy="new-group-h" dirty={() => !!name.trim()}>
    <form method="dialog" className="dlg" onSubmit={create}>
      <DialogHead id="new-group-h" title={t("group.newGroupTitle")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        <label className="field"><span>{t("group.name")}</span>
          <input className="input" id="group-name-new" maxLength={80} autoFocus placeholder={t("group.namePh")} value={name} aria-invalid={taken} aria-describedby={taken ? "group-name-new-err" : undefined}
            onChange={e => setName(e.target.value)} onKeyDown={enterClicks("group-create")}/>
          {taken && <span className="field-error" id="group-name-new-err">{t("group.nameTaken")}</span>}</label>
      </div>
      <div className="dlg-foot"><button type="button" className="btn ghost" onClick={e => e.currentTarget.closest("dialog")?.close("cancel")}>{t("common.cancel")}</button>
        <button type="submit" className="btn primary" id="group-create" disabled={!name.trim() || taken} aria-busy={busy}>{busy ? <Spin/> : <Icon name="plus" sm/>} {t("group.create")}</button></div>
    </form>
  </Dialog>;
}
