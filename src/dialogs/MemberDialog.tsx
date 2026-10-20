// Detalhes de um membro do grupo (tocar na pessoa em Grupo → Membros): contato, aniversário, funções,
// frequência nos ensaios, as próximas escalas e, para quem pode, as ações da pessoa (editar, chamada, líder, remover).
// Aberta pela página Usuários, também traz o acesso ao app (admin, editar dados, excluir).
import { useState } from "react";
import { t, tn } from "../lib/i18n";
import { useGroups, personPhoto, outMark, amGroupAdmin } from "../lib/groups";
import { attendanceRate, rehearsalStanding, monthLoad, dayKey, MISS_LIMIT, COMEBACK } from "../lib/calendar";
import { splitRoles, sortRoles } from "../lib/roles";
import { useAuth } from "../lib/cloud";
import { closeDialog, type DialogProps } from "../state";
import { Dialog, DialogHead } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Avatar, PhoneLink, StreakChip, fmtBirthday, AppAccess, PersonEdit, canManageApp } from "../views/Account";
import { StatusChip, MemberManage, MemberRemove, MemberEditInline, eventTitle, timeOf, longDay } from "../views/Group";
import { SecHead } from "../ui/SecHead";
import { YouChip } from "../ui/YouChip";

// Um evento que começou há pouco ainda conta (a pessoa pode estar a caminho), como no Perfil.
const SOON_MS = 3 * 3600 * 1000;

export function MemberDialog({email, person, manage}: DialogProps["member"]){
  const g = useGroups(), me = useAuth(s => s.email), owner = useAuth(s => s.owner);
  const m = g.members.find(x => x.email === email), [editing, setEditing] = useState(false), [editApp, setEditApp] = useState(false);
  // Fora do grupo aberto (aberto pela lista do Perfil): só os dados da pessoa, sem funções, frequência e escalas.
  const info = m ? {name: m.name, phone: m.phone || "", birthday: m.birthday || null, photo: personPhoto(email)} : person;
  if(!info) return null;
  // Aberto por Usuários, o Editar abre o formulário do app (nome, celular, data e funções); no grupo, o do grupo.
  const canApp = !!manage && canManageApp(manage.row, me, owner), canEdit = canApp || !!m && (amGroupAdmin() || email === me), edit = canApp ? editApp : editing && canEdit;
  const rate = attendanceRate(email, g.events, g.attendance), sd = rehearsalStanding(email, g.events, g.attendance, Date.now(), m ? outMark(m) : null);
  const p = rate.total ? Math.round(100 * rate.present / rate.total) : 0;
  const roles = sortRoles(splitRoles(m?.role || "")), load = m ? monthLoad(dayKey(new Date()), g.events, g.roster).get(email) || 0 : 0;
  const soon = Date.now() - SOON_MS;
  const next = g.events.filter(e => new Date(e.starts_at).getTime() > soon && g.roster.some(r => r.event_id === e.id && r.email === email))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 3);
  return <Dialog name="member" id="dlg-member" className="member-dlg" labelledBy="member-h">
    <form method="dialog" className="dlg">
      <DialogHead id="member-h" title={t("member.title")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        <div className="member-dlg-who">
          <Avatar big person={{name: info.name, email, photo: info.photo}}/>
          <span className="people-id">
            <span className="people-name">{info.name ? <b>{info.name}</b> : <span className="people-missing">{t("people.noName")}</span>}{email === me && <YouChip/>}</span>
            <a className="sub people-email" href={"mailto:" + email}>{email}</a>
            {info.phone ? <PhoneLink phone={info.phone}/> : <span className="phone-link people-missing"><Icon name="phone" sm/><span>{t("people.noPhone")}</span></span>}
            <span className="member-chips">
              {m?.is_admin && <span className="chip accent">{t("group.leader")}</span>}
              {load > 0 && <span className="chip" title={t("group.loadHint")}>{tn("group.load", load)}</span>}
            </span>
          </span>
          {m && !edit && !manage && <MemberRemove m={m} onGone={() => closeDialog("member")}/>}
        </div>

        {edit && canApp && manage && <PersonEdit inline r={manage.row} onDone={saved => { setEditApp(false); if(saved){ manage.onChanged(); closeDialog("member"); } }}/>}
        {edit && !canApp && m && <MemberEditInline m={m} onDone={() => setEditing(false)}/>}

        {!edit && <div className="member-dlg-pair">
          <div className="field"><SecHead as="span">{t("member.birthday")}</SecHead>
            {info.birthday ? <span>{fmtBirthday(info.birthday)}</span> : <span className="people-missing">{t("member.noBirthday")}</span>}</div>
          {m && <div className="field"><SecHead as="span">{t("member.roles")}</SecHead>
            {roles.length ? <span className="member-chips">{roles.map(r => <span key={r} className="chip role">{r}</span>)}</span>
              : <span className="people-missing">{t("group.noRoles")}</span>}</div>}
        </div>}

        {manage && !edit && <AppAccess row={manage.row} onChanged={manage.onChanged}/>}

        {m && <>
        <div className="field profile-att"><SecHead as="span">{t("member.attendance")}</SecHead>
          {rate.total ? <div className="profile-stat">
            <b>{p}%</b><span className="sub">{t("profile.attCount", {present: rate.present, total: rate.total})}</span>
            {sd.out ? <span className="chip st-no">{tn("group.standOut", sd.need)}</span>
              : sd.streak > 0 ? <StreakChip streak={sd.streak}/>
              : <span className="chip st-yes">{t("group.standOk")}</span>}
            <span className="meter" aria-hidden="true"><i style={{width: p + "%"}}/></span>
          </div> : <span className="sub">{t("profile.attNone")}</span>}
          <small className="sub">{t("profile.attRule", {max: MISS_LIMIT, back: COMEBACK})}</small></div>

        <div className="field"><SecHead as="span">{t("member.next")}</SecHead>
          {next.length ? <ul className="member-dlg-next">{next.map(e => {
            const rows = g.roster.filter(r => r.event_id === e.id && r.email === email);
            return <li key={e.id}><b>{eventTitle(e)}</b>
              <span className="sub">{longDay(new Date(e.starts_at))} · {timeOf(e.starts_at)}{e.place && " · " + e.place}</span>
              <span className="member-chips">{sortRoles(rows.map(r => r.role).filter(Boolean)).map(r => <span key={r} className="chip role">{r}</span>)}<StatusChip status={rows[0]?.status || "pending"}/></span></li>;
          })}</ul> : <span className="sub">{t("member.nextNone")}</span>}</div>
        <MemberManage m={m}/>
        </>}
      </div>
      <div className="dlg-foot">
        {canEdit && !edit && <button type="button" className="btn ghost" onClick={() => canApp ? setEditApp(true) : setEditing(true)}><Icon name="edit" sm/> {t("group.editMemberShort")}</button>}
        <button className="btn primary" value="ok">{t("common.close")}</button></div>
    </form>
  </Dialog>;
}
