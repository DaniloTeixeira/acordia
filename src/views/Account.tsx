// Conta: tela de entrar (Google ou e-mail e senha), aviso de sem acesso e a página Perfil, com a lista de quem
// pode entrar para os admins.
import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { useAuth, signIn, signUp, forgotPassword, setNewPassword, MIN_PASSWORD, signInWithGoogle, signOut, saveName, listAllowed, addAllowed, setAllowedAdmin, removeAllowed, validEmail, initials, cloud, type Allowed } from "../lib/cloud";
import { toast, confirmDialog } from "../state";
import { Icon } from "../ui/Icon";
import { InstrumentSelect } from "./InstrumentSelect";

const BASE = import.meta.env.BASE_URL;
// Logo sem o fundo (as barras em gradiente servem nos dois temas) e o nome com o gradiente da marca.
const Logo = () => <div className="auth-logo"><img src={BASE + "icons/mark.svg"} alt=""/><b className="brand-name">Acordia</b></div>;

// Antes de entrar: carregando, entrar (Google ou e-mail e senha), criar conta, esqueci a senha,
// senha nova (volta do link de recuperação) ou o aviso de que o e-mail não tem acesso.
type Mode = "signin" | "signup" | "forgot" | "sent";
export function AuthScreen(){
  const status = useAuth(s => s.status), who = useAuth(s => s.email), backError = useAuth(s => s.error), recovery = useAuth(s => s.recovery);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState(""), [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false), [sent, setSent] = useState("");
  const [msg, setMsg] = useState(backError ? t(backError === "notAllowed" ? "auth.notAllowed" : "auth.linkFail") : "");
  if(status === "loading") return <div className="auth-screen"><Logo/><p className="sub">{t("auth.loading")}</p></div>;
  if(recovery) return <NewPassword/>;
  if(status === "denied") return <div className="auth-screen"><div className="card auth-card"><Logo/>
    <h1>{t("auth.deniedTitle")}</h1><p className="sub">{t("auth.denied", {email: who})}</p>
    <button className="btn ghost" onClick={signOut}>{t("auth.signOut")}</button></div></div>;
  const go = (m: Mode) => { setMode(m); setMsg(""); setPw(""); };
  const run = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    if(!validEmail(email)) return setMsg(t("auth.badEmail"));
    if(mode === "signup" && pw.length < MIN_PASSWORD) return setMsg(t("auth.shortPassword", {n: MIN_PASSWORD}));
    setBusy(true);
    if(mode === "signin"){
      const r = await signIn(email, pw);
      if(r !== "ok") setMsg(t(r === "badLogin" ? "auth.badLogin" : r === "notConfirmed" ? "auth.notConfirmed" : "auth.fail"));
    } else if(mode === "signup"){
      const r = await signUp(email, pw);
      if(r === "confirm"){ setSent(t("auth.sentConfirm", {email})); setMode("sent"); }
      else if(r !== "ok") setMsg(t(r === "notAllowed" ? "auth.notAllowed" : r === "exists" ? "auth.exists" : r === "weak" ? "auth.weakPassword" : "auth.fail"));
    } else if(mode === "forgot"){
      if(await forgotPassword(email)){ setSent(t("auth.sentReset", {email})); setMode("sent"); }
      else setMsg(t("auth.fail"));
    }
    setBusy(false);
  };
  const emailField = <label className="field"><span>{t("auth.email")}</span><input className="input" id="auth-email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>;
  return <div className="auth-screen"><div className="card auth-card"><Logo/>
    {mode === "sent" ? <>
      <h1>{t("auth.checkEmail")}</h1><p className="sub">{sent}</p>
      <button className="btn primary" onClick={() => go("signin")}>{t("auth.backToSignIn")}</button>
    </> : <form onSubmit={run} noValidate>
      <h1>{t(mode === "signup" ? "auth.signupTitle" : mode === "forgot" ? "auth.forgotTitle" : "auth.title")}</h1>
      <p className="sub">{t(mode === "signup" ? "auth.signupSub" : mode === "forgot" ? "auth.forgotSub" : "auth.sub")}</p>
      {mode === "signin" && <>
        <button type="button" className="btn google-btn" id="auth-google" disabled={busy}
          onClick={async () => { setBusy(true); setMsg(""); if(!await signInWithGoogle()){ setBusy(false); setMsg(t("auth.googleFail")); } }}>
          <GoogleIcon/> {t("auth.google")}</button>
        <div className="auth-or"><span>{t("auth.or")}</span></div>
      </>}
      {emailField}
      {mode !== "forgot" && <label className="field"><span>{t("auth.password")}</span><input className="input" id="auth-password" type="password" required
        autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? MIN_PASSWORD : undefined} value={pw} onChange={e => setPw(e.target.value)}/></label>}
      {mode === "signin" && <button type="button" className="link-btn auth-forgot" onClick={() => go("forgot")}>{t("auth.forgot")}</button>}
      {msg && <p className="note">{msg}</p>}
      <button className={"btn " + (mode === "signin" ? "soft" : "primary")} id="auth-submit" disabled={busy}>
        {t(mode === "signup" ? "auth.signup" : mode === "forgot" ? "auth.sendReset" : "auth.enter")}</button>
      <p className="auth-switch">{mode === "signin" ? <>{t("auth.noAccount")} <button type="button" className="link-btn" onClick={() => go("signup")}>{t("auth.signup")}</button></>
        : <button type="button" className="link-btn" onClick={() => go("signin")}>{t("auth.backToSignIn")}</button>}</p>
    </form>}
  </div></div>;
}

// Volta do link de "esqueci minha senha": a pessoa já está com a sessão e só escolhe a senha nova.
function NewPassword(){
  const [pw, setPw] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if(pw.length < MIN_PASSWORD) return setMsg(t("auth.shortPassword", {n: MIN_PASSWORD}));
    setBusy(true); const ok = await setNewPassword(pw); setBusy(false);
    if(ok) toast(t("auth.passwordSaved")); else setMsg(t("auth.weakPassword"));
  };
  return <div className="auth-screen"><div className="card auth-card"><Logo/><form onSubmit={save} noValidate>
    <h1>{t("auth.newPasswordTitle")}</h1><p className="sub">{t("auth.newPasswordSub", {n: MIN_PASSWORD})}</p>
    <label className="field"><span>{t("auth.newPassword")}</span><input className="input" id="auth-new-password" type="password" autoComplete="new-password" autoFocus required minLength={MIN_PASSWORD} value={pw} onChange={e => setPw(e.target.value)}/></label>
    {msg && <p className="note">{msg}</p>}
    <button className="btn primary" disabled={busy}>{t("auth.savePassword")}</button>
  </form></div></div>;
}

// Marca do Google nas cores dela, como pedem as regras do botão "Entrar com Google".
const GoogleIcon = () => <svg className="g-logo" viewBox="0 0 48 48" aria-hidden="true">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>;

// Bolinha com as iniciais (botão do perfil no topo e no trilho).
export function Avatar({big}: {big?: boolean}){
  const p = useAuth(s => s.profile);
  return <span className={"avatar" + (big ? " big" : "")} aria-hidden="true">{initials(p) || <Icon name="user" sm/>}</span>;
}

export function Profile(){
  const {status, profile, admin, email} = useAuth();
  const [name, setName] = useState(profile?.name || "");
  useEffect(() => setName(profile?.name || ""), [profile?.name]);
  return <section className="view" id="view-profile" data-view="profile" aria-labelledby="profile-h">
    <div className="view-head"><div><h1 id="profile-h">{t("profile.title")}</h1><p className="sub">{status === "in" ? email : t("profile.localSub")}</p></div></div>
    <div className="profile-grid">
      {status === "in" ? <div className="card profile-card">
        <div className="profile-who"><Avatar big/><div><b>{profile?.name || email}</b><span className="sub">{email}</span>{admin && <span className="chip accent">{t("profile.admin")}</span>}</div></div>
        <label className="field"><span>{t("profile.name")}</span><input className="input" id="profile-name" maxLength={80} autoComplete="name" value={name}
          onChange={e => setName(e.target.value)} onBlur={async () => { if(name.trim() !== (profile?.name || "")) toast(t(await saveName(name) ? "profile.nameSaved" : "profile.saveFail")); }}
          onKeyDown={e => { if(e.key === "Enter") e.currentTarget.blur(); }}/></label>
        <div className="profile-row"><InstrumentSelect/></div>
        <button className="btn ghost" id="profile-out" onClick={signOut}><Icon name="back" sm/> {t("auth.signOut")}</button>
      </div> : <div className="card profile-card"><p>{t(cloud ? "profile.out" : "profile.local")}</p><div className="profile-row"><InstrumentSelect/></div></div>}
      {status === "in" && admin && <People me={email}/>}
    </div>
  </section>;
}

function People({me}: {me: string}){
  const [rows, setRows] = useState<Allowed[] | null>(null);
  const [email, setEmail] = useState(""), [asAdmin, setAsAdmin] = useState(false), [busy, setBusy] = useState(false);
  const load = async () => { const r = await listAllowed(); if(r) setRows(r); else toast(t("profile.loadFail")); };
  useEffect(() => { load(); }, []);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); const v = email.trim().toLowerCase();
    if(!validEmail(v)) return toast(t("auth.badEmail"));
    setBusy(true); const ok = await addAllowed(v, asAdmin); setBusy(false);
    if(!ok) return toast(t("profile.saveFail"));
    toast(t("people.added", {email: v})); setEmail(""); setAsAdmin(false); load();
  };
  const toggleAdmin = async (r: Allowed) => { if(await setAllowedAdmin(r.email, !r.is_admin)) load(); else toast(t("profile.saveFail")); };
  const remove = async (r: Allowed) => {
    if(!await confirmDialog({title: t("people.removeTitle"), message: t("people.removeMsg", {email: r.email}), confirm: t("people.remove")})) return;
    if(await removeAllowed(r.email)){ toast(t("people.removed", {email: r.email})); load(); } else toast(t("profile.saveFail"));
  };
  return <div className="card people-card">
    <h2>{t("people.title")}</h2><p className="sub">{t("people.sub")}</p>
    <form className="people-add" onSubmit={add}>
      <input className="input" id="people-email" type="email" inputMode="email" placeholder={t("people.emailPh")} aria-label={t("auth.email")} value={email} onChange={e => setEmail(e.target.value)}/>
      <label className="switch"><span>{t("profile.admin")}</span><input type="checkbox" id="people-admin" checked={asAdmin} onChange={e => setAsAdmin(e.target.checked)}/></label>
      <button className="btn primary" disabled={busy || !email.trim()}><Icon name="plus" sm/> {t("common.add")}</button>
    </form>
    <ul className="people-list" id="people-list">
      {rows === null ? <li className="sub">{t("auth.loading")}</li> : rows.map(r => <li key={r.email}>
        <span className="people-email">{r.email}</span>
        {r.is_admin && <span className="chip accent">{t("profile.admin")}</span>}
        {r.email === me ? <span className="chip">{t("people.you")}</span> : <span className="people-actions">
          <button className="btn ghost sm" onClick={() => toggleAdmin(r)}>{t(r.is_admin ? "people.unadmin" : "people.makeAdmin")}</button>
          <button className="icon-btn sm danger" aria-label={t("people.remove")} title={t("people.remove")} onClick={() => remove(r)}><Icon name="trash" sm/></button></span>}
      </li>)}
    </ul>
  </div>;
}
