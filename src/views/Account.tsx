// Conta: tela de entrar (Google ou e-mail e senha), aviso de sem acesso e a página Perfil, com a lista de quem
// pode entrar para os admins.
import { useEffect, useRef, useState } from "react";
import { t, tn } from "../lib/i18n";
import { useAuth, signIn, signUp, resendConfirmation, pendingConfirm, setPendingConfirm, forgotPassword, setNewPassword, signInWithGoogle, signOut, saveName, listAllowed, addAllowed, setAllowedAdmin, removeAllowed, validEmail, initials, cloud, type Allowed } from "../lib/cloud";
import { DEFAULT_POLICY, missing, passes, fromError, isPwned, type PwPolicy, type PwRule } from "../lib/password";
import { reduced } from "../lib/util";
import { toast, confirmDialog } from "../state";
import { Icon } from "../ui/Icon";
import { InstrumentSelect } from "./InstrumentSelect";
import { useSync, syncNow, flushBeforeSignOut, forgetLocal } from "../lib/sync";

const BASE = import.meta.env.BASE_URL;
// Logo sem o fundo (as barras em gradiente servem nos dois temas), o nome com o gradiente da marca e o slogan.
const Logo = () => <div className="auth-logo"><img src={BASE + "icons/mark.svg"} alt=""/><b className="brand-name">Acordia</b><small>{t("app.tagline")}</small></div>;

// Fundo da tela de entrar: notas com o gradiente da marca surgem e somem devagar em pontos aleatórios;
// a cada ciclo a nota troca de lugar, de símbolo e de tamanho.
const GLYPHS = ["♪", "♫", "♩", "♬"];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
// Cada nota tem uma região em volta do card: 4 à esquerda, 4 à direita, 2 acima e 2 abaixo (as de cima e de baixo,
// uma em cada metade), para o fundo nunca pender para um lado. Nenhuma cai atrás do card: sem espaço na região
// (no celular o card ocupa a largura toda), a nota vai para a próxima que tiver espaço.
type Zone = "left" | "right" | "top" | "bottom";
const ZONES: Zone[] = ["left", "right", "top", "bottom", "left", "right"];
function spot(box: HTMLElement, i: number, size: number){
  const b = box.getBoundingClientRect(), r = box.parentElement?.querySelector(".auth-card")?.getBoundingClientRect();
  const W = b.width, H = b.height, gap = 10, rightHalf = Math.floor(i / ZONES.length) % 2 === 1;
  const x0 = W * .02, x1 = W * .96 - size, y0 = H * .03, y1 = H * .95 - size;
  if(!r) return {left: rnd(x0, x1), top: rnd(y0, y1)};
  const cl = r.left - b.left - gap - size, cr = r.right - b.left + gap, ct = r.top - b.top - gap - size, cb = r.bottom - b.top + gap;
  const half = (): [number, number] => rightHalf ? [Math.max(x0, W / 2), x1] : [x0, Math.min(x1, W / 2 - size)];
  const area: Record<Zone, [number, number, number, number]> = {
    left: [x0, cl, y0, y1], right: [cr, x1, y0, y1], top: [...half(), y0, ct], bottom: [...half(), cb, y1]
  };
  const first = ZONES[i % ZONES.length];
  const order: Zone[] = [first, ...(first === "left" || first === "right" ? ["top", "bottom"] as Zone[] : first === "top" ? ["bottom"] as Zone[] : ["top"] as Zone[]), "left", "right"];
  for(const z of order){
    const [ax, bx, ay, by] = area[z];
    if(bx > ax && by > ay) return {left: rnd(ax, bx), top: rnd(ay, by)};
  }
  return {left: rnd(x0, x1), top: rnd(y0, y1)};
}
const noteStyle = (box: HTMLElement, first: boolean, i: number): React.CSSProperties => {
  const size = rnd(18, 40);
  return {...spot(box, i, size), fontSize: size + "px",
    animationDuration: rnd(7, 12) + "s", animationDelay: first ? rnd(0, 10) + "s" : rnd(0, 3) + "s",
    rotate: rnd(-18, 18) + "deg"};
};
// Chave nova a cada troca para o navegador recomeçar a animação.
let noteKey = 0;
type Note = {k: number; g: string; s: React.CSSProperties};
const newNote = (box: HTMLElement, first: boolean, i: number): Note => ({k: noteKey++, g: GLYPHS[Math.floor(rnd(0, 4))], s: noteStyle(box, first, i)});
function NotesBg(){
  // As posições dependem do tamanho da tela e do card, então as notas só nascem depois de montar.
  const box = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  useEffect(() => { if(box.current) setNotes(Array.from({length: 12}, (_, i) => newNote(box.current!, true, i))); }, []);
  const move = (i: number) => setNotes(n => box.current ? n.map((x, j) => j === i ? newNote(box.current!, false, i) : x) : n);
  return <div className="auth-notes" ref={box} aria-hidden="true">{notes.map((n, i) =>
    <span key={n.k} style={n.s} onAnimationEnd={() => move(i)}>{n.g + "︎"}</span>)}</div>;
}

// Trava contra clique duplo: enquanto uma requisição está em andamento, outra chamada sai na hora
// (os botões ficam habilitados, só com o indicador). Se a função devolver KEEP, a trava continua
// fechada: deu certo e a tela vai mudar (entrar no app, ir para o Google). release() reabre.
const KEEP = Symbol("keep");
function useLock(){
  const on = useRef(false);
  const lock = async (fn: () => Promise<unknown>) => {
    if(on.current) return;
    on.current = true;
    let keep = false;
    try{ keep = (await fn()) === KEEP; } finally{ if(!keep) on.current = false; }
  };
  return Object.assign(lock, {release: () => { on.current = false; }});
}

// Avisos do formulário num lugar só, abaixo do título: erro, informação e o quadro de confirmar e-mail.
// Enquanto houver aviso, ele fica no lugar do subtítulo; se aparecer fora da área visível (a pessoa
// tocou no botão lá embaixo), a tela rola até ele. Erro de um campo fica embaixo do próprio campo.
function Notices({items, fallback, watch}: {items: React.ReactNode[]; fallback: React.ReactNode; watch: string}){
  const ref = useRef<HTMLDivElement>(null), shown = items.filter(Boolean);
  useEffect(() => { if(shown.length) ref.current?.scrollIntoView({block: "nearest", behavior: reduced() ? "auto" : "smooth"}); }, [watch]);
  return shown.length ? <div className="auth-notices" ref={ref}>{shown}</div> : <>{fallback}</>;
}

// Girando dentro do botão enquanto espera a resposta (o botão fica desabilitado e marcado aria-busy).
const Spin = () => <span className="spinner" aria-hidden="true"/>;

// Requisitos da senha: o texto de cada um e a mensagem do que falta (ou da recusa do Supabase).
const ruleText = (r: PwRule, p: PwPolicy) => t("auth.rule." + r, {n: p.min});
const needsMsg = (p: PwPolicy, pw: string) => t("auth.needs", {list: missing(p, pw).map(r => ruleText(r, p).toLowerCase()).join(", ")});
// Recusa do Supabase: aprende o que ele exige (a lista na tela passa a mostrar) e diz o que falta.
function weakMsg(detail: string, p: PwPolicy, pw: string, learn: (p: PwPolicy) => void){
  if(isPwned(detail)) return t("auth.pwned");
  const np = fromError(detail, p); learn(np);
  return missing(np, pw).length ? needsMsg(np, pw) : t("auth.weakPassword");
}

// Antes de entrar: carregando, entrar (Google ou e-mail e senha), criar conta, esqueci a senha,
// senha nova (volta do link de recuperação) ou o aviso de que o e-mail não tem acesso.
type Mode = "signin" | "signup" | "forgot";
export function AuthScreen(){
  const status = useAuth(s => s.status), who = useAuth(s => s.email), backError = useAuth(s => s.error), backFrom = useAuth(s => s.errorFrom), backDetail = useAuth(s => s.errorDetail), recovery = useAuth(s => s.recovery);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState(pendingConfirm), [pw, setPw] = useState("");
  // busy: qual botão está esperando a resposta (só ele gira; os outros ficam desabilitados).
  const [busy, setBusy] = useState<"" | "google" | "submit">("");
  // sent: link de senha nova enviado; a tela volta para entrar e mostra o aviso até a pessoa mudar de tela.
  const [sent, setSent] = useState("");
  // confirmFor: e-mail que criou a conta e ainda não confirmou; o quadro no topo fica até a pessoa
  // entrar ou trocar de e-mail (não some ao tocar em Entrar, como um aviso comum).
  const [emailTouched, setEmailTouched] = useState(false), submitted = useRef(false);
  const [confirmFor, setConfirmState] = useState(pendingConfirm);
  const setConfirmFor = (v: string) => { setConfirmState(v); setPendingConfirm(v); };
  const [msg, setMsg] = useState(backError ? t(backError === "notAllowed" ? "auth.notAllowed" : backFrom === "google" ? "auth.googleFail" : "auth.linkFail") : "");
  // Detalhe técnico do erro da volta (Google ou link), em letra pequena: ajuda a descobrir a causa.
  const [detail, setDetail] = useState(backError === "error" ? backDetail : "");
  const [policy, setPolicy] = useState<PwPolicy>(DEFAULT_POLICY);
  const lock = useLock();
  useEffect(() => {
    const back = (e: PageTransitionEvent) => { if(e.persisted){ lock.release(); setBusy(""); } };
    addEventListener("pageshow", back); return () => removeEventListener("pageshow", back);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if(status === "loading") return <div className="auth-screen"><Logo/><p className="sub">{t("auth.loading")}</p></div>;
  if(recovery) return <NewPassword/>;
  if(status === "denied") return <div className="auth-screen"><NotesBg/><div className="card auth-card"><Logo/>
    <h1>{t("auth.deniedTitle")}</h1><p className="sub">{t("auth.denied", {email: who})}</p>
    <button className="btn ghost" onClick={() => { forgetLocal(); signOut(); }}>{t("auth.signOut")}</button></div></div>;
  const go = (m: Mode) => { setMode(m); setMsg(""); setDetail(""); setPw(""); setSent(""); };
  const run = (e: React.FormEvent) => { e.preventDefault(); lock(async () => {
    setMsg(""); setDetail(""); submitted.current = true;
    if(!validEmail(email)){ setEmailTouched(true); document.getElementById("auth-email")?.focus(); return; }
    if(mode === "signup" && missing(policy, pw).length) return setMsg(needsMsg(policy, pw));
    setBusy("submit");
    // Deu certo e o app vai abrir: o indicador fica até a tela trocar (o perfil ainda carrega).
    let done = false;
    try{
    if(mode === "signin"){
      const r = await signIn(email, pw);
      if(r === "ok") done = true;
      else if(r === "notConfirmed") setConfirmFor(email.trim().toLowerCase());
      else setMsg(t(r === "badLogin" ? "auth.badLogin" : "auth.fail"));
    } else if(mode === "signup"){
      const {r, detail} = await signUp(email, pw);
      if(r === "ok") done = true;
      // Conta criada: volta direto para entrar, com o e-mail preenchido e o quadro de confirmar pelo link.
      if(r === "confirm"){ go("signin"); setConfirmFor(email.trim().toLowerCase()); }
      else if(r === "weak") setMsg(weakMsg(detail || "", policy, pw, setPolicy));
      else if(r !== "ok") setMsg(t(r === "notAllowed" ? "auth.notAllowed" : r === "exists" ? "auth.exists" : "auth.fail"));
    } else if(mode === "forgot"){
      if(await forgotPassword(email)){ go("signin"); setSent(t("auth.sentReset", {email})); }
      else setMsg(t("auth.fail"));
    }
    } finally{ if(!done) setBusy(""); }
    return done ? KEEP : undefined;
  }); };
  // Validação do e-mail embaixo do campo: aparece ao sair do campo (ou ao enviar) e some quando fica certo.
  // Campo vazio só reclama depois de tentar enviar; e-mail incompleto reclama ao sair do campo.
  const badEmail = emailTouched && !validEmail(email) && (!!email.trim() || submitted.current);
  const emailField = <div className="field"><label htmlFor="auth-email">{t("auth.email")}</label><input className="input" id="auth-email" type="email" inputMode="email" autoComplete="email" required value={email}
    aria-invalid={badEmail} aria-describedby={badEmail ? "auth-email-err" : undefined} onBlur={() => setEmailTouched(true)}
    onChange={e => { setEmail(e.target.value); if(confirmFor && e.target.value.trim().toLowerCase() !== confirmFor) setConfirmFor(""); }}/>
    {badEmail && <span className="field-error" id="auth-email-err">{t(email.trim() ? "auth.badEmail" : "auth.needEmail")}</span>}</div>;
  return <div className="auth-screen"><NotesBg/><div className="card auth-card"><Logo/>
    <form onSubmit={run} noValidate>
      <h1>{t(mode === "signup" ? "auth.signupTitle" : mode === "forgot" ? "auth.forgotTitle" : "auth.title")}</h1>
      <Notices watch={msg + "|" + sent + "|" + confirmFor} items={[
        msg && <p key="msg" className="note" role="alert">{msg}{detail && <small className="note-detail">{detail}</small>}</p>,
        sent && mode === "signin" && <p key="sent" className="note info" role="status"><b>{t("auth.checkEmail")}</b> {sent}</p>,
        confirmFor && mode === "signin" && <ConfirmBox key="confirm" email={confirmFor}/>
      ]} fallback={<p className="sub">{t(mode === "signup" ? "auth.signupSub" : mode === "forgot" ? "auth.forgotSub" : "auth.sub")}</p>}/>
      {mode === "signin" && <>
        <button type="button" className="btn google-btn" id="auth-google" aria-busy={busy === "google"}
          onClick={() => lock(async () => {
            setBusy("google"); setMsg("");
            // Indo para a página do Google: o indicador fica até ela abrir.
            if(await signInWithGoogle()) return KEEP;
            setBusy(""); setMsg(t("auth.googleFail"));
          })}>
          {busy === "google" ? <Spin/> : <GoogleIcon/>} {t("auth.google")}</button>
        <div className="auth-or"><span>{t("auth.or")}</span></div>
      </>}
      {emailField}
      {mode !== "forgot" && <PasswordField key={mode} id="auth-password" label={t("auth.password")} policy={mode === "signup" ? policy : undefined} value={pw} onChange={setPw}/>}
      {mode === "signin" && <button type="button" className="link-btn auth-forgot" onClick={() => go("forgot")}>{t("auth.forgot")}</button>}
      <button className="btn primary" id="auth-submit" aria-busy={busy === "submit"}>
        {busy === "submit" && <Spin/>}{t(mode === "signup" ? "auth.signup" : mode === "forgot" ? "auth.sendReset" : "auth.enter")}</button>
      <p className="auth-switch">{mode === "signin" ? <>{t("auth.noAccount")} <button type="button" className="link-btn" onClick={() => go("signup")}>{t("auth.signup")}</button></>
        : <button type="button" className="link-btn" onClick={() => go("signin")}>{t("auth.backToSignIn")}</button>}</p>
      {mode === "signin" && <p className="auth-invite"><Icon name="user" sm/> {t("auth.invite")}</p>}
    </form>
  </div></div>;
}

// Falta confirmar o e-mail: quadro no topo, com o e-mail do link, a dica do spam e "Reenviar e-mail"
// (espera 60 s entre envios, o mesmo intervalo que o Supabase exige).
function ConfirmBox({email}: {email: string}){
  const [wait, setWait] = useState(0), [busy, setBusy] = useState(false), [note, setNote] = useState("");
  const lock = useLock();
  useEffect(() => { if(!wait) return; const h = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(h); }, [wait]);
  const resend = () => lock(async () => {
    setBusy(true); setNote("");
    const ok = await resendConfirmation(email).finally(() => setBusy(false));
    if(ok){ setWait(60); setNote(t("auth.resent")); } else setNote(t("auth.fail"));
  });
  return <div className="confirm-box" role="status">
    <Icon name="mail"/>
    <div><b>{t("auth.confirmTitle")}</b>
      <p>{t("auth.confirmText", {email})}</p>
      <button type="button" className="link-btn" disabled={wait > 0} aria-busy={busy} onClick={resend}>
        {busy && <Spin/>}{wait ? t("auth.resendIn", {n: wait}) : t("auth.resend")}</button>
      {note && <small>{note}</small>}</div>
  </div>;
}

// Senha com o olho para mostrar o que foi digitado (no celular é fácil errar uma letra e não há
// "repita a senha") e o aviso de Caps Lock, que só o teclado físico informa. Com policy (senha nova),
// mostra os requisitos, que ficam verdes conforme a pessoa digita.
function PasswordField({id, label, policy, autoFocus, value, onChange}: {id: string; label: string; policy?: PwPolicy; autoFocus?: boolean; value: string; onChange: (v: string) => void}){
  const isNew = !!policy;
  const [show, setShow] = useState(false), [caps, setCaps] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // A senha à vista volta a ficar escondida ao enviar o formulário e quando o app vai para segundo plano
  // (trocar de app, bloquear o celular). Trocar de tela já esconde: o campo é recriado (key).
  useEffect(() => {
    const hide = () => setShow(false), form = input.current?.form;
    const away = () => { if(document.hidden) hide(); };
    form?.addEventListener("submit", hide); document.addEventListener("visibilitychange", away); addEventListener("pagehide", hide);
    return () => { form?.removeEventListener("submit", hide); document.removeEventListener("visibilitychange", away); removeEventListener("pagehide", hide); };
  }, []);
  const checkCaps = (e: React.KeyboardEvent) => { if(typeof e.getModifierState === "function") setCaps(e.getModifierState("CapsLock")); };
  return <div className="field"><label htmlFor={id}>{label}</label>
    <div className="pw-wrap"><input ref={input} className="input" id={id} type={show ? "text" : "password"} required autoFocus={autoFocus}
      autoComplete={isNew ? "new-password" : "current-password"} minLength={policy ? policy.min : undefined} aria-describedby={policy ? id + "-rules" : undefined} autoCapitalize="off" autoCorrect="off" spellCheck={false}
      value={value} onChange={e => onChange(e.target.value)} onKeyDown={checkCaps} onKeyUp={checkCaps} onBlur={() => setCaps(false)}/>
      <button type="button" className="icon-btn sm pw-eye" aria-label={t(show ? "auth.hidePassword" : "auth.showPassword")} title={t(show ? "auth.hidePassword" : "auth.showPassword")}
        aria-pressed={show} onClick={() => setShow(v => !v)}><Icon name={show ? "eye-off" : "eye"} sm/></button></div>
    {caps && <span className="pw-caps" role="status"><Icon name="capslock" sm/> {t("auth.capsLock")}</span>}
    {policy && <ul className="pw-rules" id={id + "-rules"} aria-label={t("auth.rulesAria")}>{policy.rules.map(r => {
      const ok = passes(r, value, policy.min);
      return <li key={r} className={ok ? "ok" : ""}><Icon name={ok ? "check" : "dot"} sm/> {ruleText(r, policy)}</li>;
    })}</ul>}
  </div>;
}

// Volta do link de "esqueci minha senha": a pessoa já está com a sessão e só escolhe a senha nova.
function NewPassword(){
  const [pw, setPw] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const [policy, setPolicy] = useState<PwPolicy>(DEFAULT_POLICY);
  const lock = useLock();
  const save = (e: React.FormEvent) => { e.preventDefault(); lock(async () => {
    if(missing(policy, pw).length) return setMsg(needsMsg(policy, pw));
    setBusy(true); const err = await setNewPassword(pw).finally(() => setBusy(false));
    if(!err) toast(t("auth.passwordSaved"));
    else setMsg(/password/i.test(err) ? weakMsg(err, policy, pw, setPolicy) : t("auth.fail"));
  }); };
  return <div className="auth-screen"><NotesBg/><div className="card auth-card"><Logo/><form onSubmit={save} noValidate>
    <h1>{t("auth.newPasswordTitle")}</h1>
    <Notices watch={msg} items={[msg && <p key="msg" className="note" role="alert">{msg}</p>]} fallback={<p className="sub">{t("auth.newPasswordSub")}</p>}/>
    <PasswordField id="auth-new-password" label={t("auth.newPassword")} policy={policy} autoFocus value={pw} onChange={setPw}/>
    <button className="btn primary" aria-busy={busy}>{busy && <Spin/>}{t("auth.savePassword")}</button>
  </form></div></div>;
}

// Marca do Google nas cores dela, como pedem as regras do botão "Entrar com Google".
const GoogleIcon = () => <svg className="g-logo" viewBox="0 0 48 48" aria-hidden="true">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>;

// Bolinha com as iniciais (botão do perfil no topo e no trilho).
// Com foto da conta Google, mostra a foto; se ela não carregar (sem internet, link vencido), volta às iniciais.
export function Avatar({big}: {big?: boolean}){
  const p = useAuth(s => s.profile);
  const [broken, setBroken] = useState("");
  const photo = p?.photo && p.photo !== broken ? p.photo : "";
  return <span className={"avatar" + (big ? " big" : "") + (photo ? " photo" : "")} aria-hidden="true">
    {photo ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(photo)}/> : initials(p) || <Icon name="user" sm/>}</span>;
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
        <SyncStatus/>
        <SignOut/>
      </div> : <div className="card profile-card"><p>{t(cloud ? "profile.out" : "profile.local")}</p><div className="profile-row"><InstrumentSelect/></div></div>}
      {status === "in" && admin && <People me={email}/>}
    </div>
  </section>;
}

// Estado da nuvem: tudo salvo, sincronizando, sem internet (com quantas mudanças esperam) ou erro.
function SyncStatus(){
  const {state, pending} = useSync();
  if(state === "off") return null;
  const text = state === "syncing" ? t("sync.syncing") : state === "offline" ? (pending ? tn("sync.offline", pending) : t("sync.offlineNone"))
    : state === "error" ? t("sync.error") : pending ? tn("sync.pending", pending) : t("sync.ok");
  return <div className={"sync-status " + state} role="status">
    {state === "syncing" ? <Spin/> : <Icon name={state === "idle" && !pending ? "check" : "sync"} sm/>}
    <span>{text}</span>
    {(state === "error" || state === "offline" || (state === "idle" && pending > 0)) && <button type="button" className="link-btn" onClick={() => syncNow()}>{t("sync.now")}</button>}
  </div>;
}

// Sair: tenta subir o que falta; se ficou algo sem subir (sem internet), pergunta antes. Depois os
// dados desta conta saem do aparelho, para a próxima pessoa que usar não ver nada seu.
function SignOut(){
  const [busy, setBusy] = useState(false), lock = useLock();
  const leave = () => lock(async () => {
    setBusy(true);
    const left = await flushBeforeSignOut();
    if(left && !await confirmDialog({title: t("sync.leaveTitle"), message: tn("sync.leaveMsg", left), confirm: t("auth.signOut")})){ setBusy(false); return; }
    forgetLocal(); await signOut();
  });
  return <button className="btn ghost" id="profile-out" aria-busy={busy} onClick={leave}>{busy ? <Spin/> : <Icon name="back" sm/>} {t("auth.signOut")}</button>;
}

function People({me}: {me: string}){
  const [rows, setRows] = useState<Allowed[] | null>(null);
  const [email, setEmail] = useState(""), [asAdmin, setAsAdmin] = useState(false), [busy, setBusy] = useState(false);
  // pending: o e-mail da linha com uma mudança em andamento (os botões dela ficam desabilitados).
  const [pending, setPending] = useState("");
  const lock = useLock();
  const load = async () => { const r = await listAllowed(); if(r) setRows(r); else toast(t("profile.loadFail")); };
  useEffect(() => { load(); }, []);
  const add = (e: React.FormEvent) => { e.preventDefault(); lock(async () => {
    const v = email.trim().toLowerCase();
    if(!validEmail(v)) return toast(t("auth.badEmail"));
    setBusy(true); const ok = await addAllowed(v, asAdmin).finally(() => setBusy(false));
    if(!ok) return toast(t("profile.saveFail"));
    toast(t("people.added", {email: v})); setEmail(""); setAsAdmin(false); await load();
  }); };
  const onRow = (r: Allowed, fn: () => Promise<unknown>) => lock(async () => { setPending(r.email); try{ await fn(); } finally{ setPending(""); } });
  const toggleAdmin = (r: Allowed) => onRow(r, async () => { if(await setAllowedAdmin(r.email, !r.is_admin)) await load(); else toast(t("profile.saveFail")); });
  const remove = async (r: Allowed) => {
    if(!await confirmDialog({title: t("people.removeTitle"), message: t("people.removeMsg", {email: r.email}), confirm: t("people.remove")})) return;
    onRow(r, async () => { if(await removeAllowed(r.email)){ toast(t("people.removed", {email: r.email})); await load(); } else toast(t("profile.saveFail")); });
  };
  return <div className="card people-card">
    <h2>{t("people.title")}</h2><p className="sub">{t("people.sub")}</p>
    <form className="people-add" onSubmit={add}>
      <input className="input" id="people-email" type="email" inputMode="email" placeholder={t("people.emailPh")} aria-label={t("auth.email")} value={email} onChange={e => setEmail(e.target.value)}/>
      <label className="switch lead boxed"><span>{t("profile.admin")}</span><input type="checkbox" id="people-admin" checked={asAdmin} onChange={e => setAsAdmin(e.target.checked)}/></label>
      <button className="btn primary" disabled={!email.trim()} aria-busy={busy}>{busy ? <Spin/> : <Icon name="plus" sm/>} {t("common.add")}</button>
    </form>
    <ul className="people-list" id="people-list">
      {rows === null ? <li className="sub">{t("auth.loading")}</li> : rows.map(r => <li key={r.email}>
        <span className="people-who"><span className="people-email">{r.email}</span>
          {r.is_admin && <span className="chip accent">{t("profile.admin")}</span>}</span>
        {r.email === me ? <span className="chip">{t("people.you")}</span> : <span className="people-actions">
          <button className="btn ghost sm" aria-busy={pending === r.email} onClick={() => toggleAdmin(r)}>{pending === r.email && <Spin/>}{t(r.is_admin ? "people.unadmin" : "people.makeAdmin")}</button>
          <button className="icon-btn sm danger" aria-label={t("people.remove")} title={t("people.remove")} onClick={() => remove(r)}><Icon name="trash" sm/></button></span>}
      </li>)}
    </ul>
  </div>;
}
