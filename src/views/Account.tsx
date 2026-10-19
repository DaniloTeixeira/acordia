// Conta: tela de entrar (Google ou e-mail e senha), aviso de sem acesso e a página Perfil, com a lista de quem
// pode entrar para os admins.
import { useEffect, useRef, useState } from "react";
import { t, tn, locale } from "../lib/i18n";
import { useAuth, savePhone, cleanPhone, signIn, signUp, resendConfirmation, pendingConfirm, setPendingConfirm, forgotPassword, setNewPassword, signInWithGoogle, signOut, saveName, saveBirthday, listAllowed, addAllowed, setAllowedInfo, setPersonInfo, setAllowedAdmin, removeAllowed, validEmail, initials, ownPhoto, removePhoto, type Allowed } from "../lib/cloud";
import { DEFAULT_POLICY, missing, passes, fromError, isPwned, type PwPolicy, type PwRule } from "../lib/password";
import { reduced, flashSaved, norm } from "../lib/util";
import { toast, confirmDialog, openDialog, go } from "../state";
import { Icon } from "../ui/Icon";
import { DateInput } from "../ui/DateInput";
import { useFold, FoldHead } from "../ui/Fold";
import { useGroups, loadGroups, setMemberRole, respond, outMark } from "../lib/groups";
import { attendanceRate, rehearsalStanding, MISS_LIMIT, COMEBACK, fmtPhone } from "../lib/calendar";
import { sortRoles, joinRoles } from "../lib/roles";
import { MemberRoles, RolePicker, StatusChip, eventTitle, timeOf, longDay } from "./Group";
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
export function useLock(){
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
export const Spin = () => <span className="spinner" aria-hidden="true"/>;

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

// Bolinha com as iniciais (botão do perfil no topo e no trilho; com `person`, a de outra pessoa).
// Com foto (a enviada pelo app ou a da conta Google), mostra a foto; se ela não carregar (sem internet, link vencido), volta às iniciais.
// Celular nas listas de pessoas: linha própria com o ícone, no formato "(11) 91234-5678"; toca para ligar.
export const PhoneLink = ({phone}: {phone: string}) =>
  <a className="phone-link" href={"tel:" + phone.replace(/[^\d+]/g, "")}><Icon name="phone" sm/><span>{fmtPhone(phone)}</span></a>;

export function Avatar({big, person}: {big?: boolean; person?: {name: string; email: string; photo?: string}}){
  const mine = useAuth(s => s.profile), p = person || mine;
  const [broken, setBroken] = useState("");
  const photo = p?.photo && p.photo !== broken ? p.photo : "";
  return <span className={"avatar" + (big ? " big" : "") + (photo ? " photo" : "")} aria-hidden="true">
    {photo ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(photo)}/> : initials(p) || <Icon name="user" sm/>}</span>;
}

// Escolher a foto (galeria ou câmera do celular) e abrir a janela de recortar: a do perfil ou, com gid, a do
// grupo. No perfil, funciona para quem entra com e-mail e senha e para quem não tem foto no Google (ou quer
// outra): aparece na hora, sem sair e entrar de novo.
export function pickPhoto(gid?: string){
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*";
  input.onchange = () => { const f = input.files?.[0]; if(f) openDialog("photo", {src: URL.createObjectURL(f), gid}); };
  input.click();
}
// Avatar grande do Perfil: tocar troca a foto.
function PhotoButton(){
  const has = useAuth(s => !!s.profile?.photo), label = t(has ? "photo.change" : "photo.add");
  return <button type="button" className="avatar-edit" id="profile-photo" aria-label={label} title={label} onClick={() => pickPhoto()}>
    <Avatar big/><span className="cam"><Icon name="camera" sm/></span></button>;
}
function PhotoActions(){
  const photo = useAuth(s => s.profile?.photo), [busy, setBusy] = useState(false), lock = useLock();
  const remove = async () => {
    if(!await confirmDialog({title: t("photo.removeTitle"), message: t("photo.removeMsg"), confirm: t("photo.remove")})) return;
    lock(async () => { setBusy(true); const ok = await removePhoto().finally(() => setBusy(false)); toast(t(ok ? "photo.removed" : "profile.saveFail")); });
  };
  return <span className="profile-photo-actions">
    <button type="button" className="link-btn" onClick={() => pickPhoto()}>{t(photo ? "photo.change" : "photo.add")}</button>
    {ownPhoto(photo) && <button type="button" className="link-btn" aria-busy={busy} onClick={remove}>{busy && <Spin/>}{t("photo.remove")}</button>}
  </span>;
}

export function Profile(){
  const {profile, admin, email} = useAuth();
  const [name, setName] = useState(profile?.name || "");
  useEffect(() => setName(profile?.name || ""), [profile?.name]);
  const fold = useFold("profile");
  return <section className="view" id="view-profile" data-view="profile" aria-labelledby="profile-h">
    <div className="view-head"><div><h1 id="profile-h">{t("profile.title")}</h1><p className="sub">{email}</p></div></div>
    <div className="profile-grid">
      {/* Cada card tem o topo (card-top) e o corpo (card-body): lado a lado, os topos dividem a mesma altura
          (subgrid no CSS) e os quadros de campos dos dois começam na mesma linha. */}
      <div className={"card profile-card" + fold.cls}>
        {/* Lado a lado, este card não tem título (o topo é a foto e o nome); um abaixo do outro, ganha "Meu perfil". */}
        <FoldHead folded={fold.folded} onToggle={fold.toggle} title={t("profile.card")}/>
        <div className="card-top"><div className="profile-who"><PhotoButton/><div><span className="people-name"><b>{profile?.name || email}</b>{admin && <span className="chip accent">{t("profile.admin")}</span>}</span><span className="sub">{email}</span>
          <PhotoActions/></div></div></div>
        <div className="card-body">
        {/* Nome, celular e nascimento num quadro com título, como o "Adicionar pessoa" ao lado; na mesma linha
            (no celular estreito, quebram). */}
        <section className="people-add-box" aria-labelledby="profile-data-h">
        <h3 className="people-sub-h" id="profile-data-h">{t("profile.data")}</h3>
        <div className="profile-pair">
        <label className="field"><span>{t("profile.name")}</span><input className="input" id="profile-name" maxLength={80} autoComplete="name" value={name}
          onChange={e => setName(e.target.value)} onBlur={async e => { const el = e.currentTarget; if(name.trim() !== (profile?.name || "")){ if(await saveName(name)) flashSaved(el); else toast(t("profile.saveFail")); } }}
          onKeyDown={e => { if(e.key === "Enter") e.currentTarget.blur(); }}/></label>
        <PhoneField/>
        <BirthdayField/>
        </div>
        </section>
        <MyRoles/>
        <MyTeam/>
        <GroupNote/>
        {/* Sair à esquerda e o estado da nuvem na mesma linha, à direita, no fundo do card: a linha de cima
            fica na altura da linha da última pessoa da lista ao lado (mesma altura de linha). */}
        <div className="profile-foot"><SignOut/><SyncStatus/></div>
        </div>
      </div>
      {admin && <People me={email}/>}
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

// No grupo aberto: a frequência da pessoa nos ensaios (com a regra que tira dos cultos) e o próximo
// evento em que ela está escalada, com Confirmar e Não posso ali mesmo.
function MyTeam(){
  const g = useGroups(), me = useAuth(s => s.email), [busy, setBusy] = useState(""), lock = useLock();
  const group = g.groups.find(x => x.id === g.gid);
  if(!group || !g.members.some(x => x.email === me)) return null;
  const rate = attendanceRate(me, g.events, g.attendance), sd = rehearsalStanding(me, g.events, g.attendance, Date.now(), outMark(g.members.find(x => x.email === me)));
  const p = rate.total ? Math.round(100 * rate.present / rate.total) : 0;
  // Um evento que começou há pouco ainda conta como o "próximo" (a pessoa pode estar a caminho).
  const soon = Date.now() - 3 * 3600 * 1000;
  const next = g.events.filter(e => new Date(e.starts_at).getTime() > soon && g.roster.some(r => r.event_id === e.id && r.email === me))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const rows = next ? g.roster.filter(r => r.event_id === next.id && r.email === me) : [], st = rows[0]?.status || "pending";
  const answer = (v: "yes" | "no") => lock(async () => {
    const to = st === v ? "pending" : v; setBusy(v);
    const ok = await respond(next!.id, to).finally(() => setBusy(""));
    toast(t(!ok ? "profile.saveFail" : to === "yes" ? "group.confirmed" : to === "no" ? "group.declined" : "group.saved"));
  });
  return <>
    <div className="field profile-att"><span>{t("profile.attendance")}</span>
      {rate.total ? <div className="profile-stat">
        <b>{p}%</b><span className="sub">{t("profile.attCount", {present: rate.present, total: rate.total})}</span>
        {sd.out ? <span className="chip st-no">{tn("group.standOut", sd.need)}</span>
          : sd.streak > 0 ? <span className={"chip" + (sd.streak >= MISS_LIMIT - 3 ? " st-pending" : "")}>{t("group.streak", {n: sd.streak, max: MISS_LIMIT})}</span>
          : <span className="chip st-yes">{t("group.standOk")}</span>}
        <span className="meter" aria-hidden="true"><i style={{width: p + "%"}}/></span>
      </div> : <span className="sub">{t("profile.attNone")}</span>}
      <small className="sub">{t("profile.attRule", {max: MISS_LIMIT, back: COMEBACK})}</small></div>
    <div className="field profile-next"><span>{t("profile.next")}</span>
      {next ? <div className="profile-next-box">
        <div className="profile-next-what"><b>{eventTitle(next)}</b>
          <span className="sub">{longDay(new Date(next.starts_at))} · {timeOf(next.starts_at)}{next.place && " · " + next.place}</span>
          <span className="profile-next-chips">{sortRoles(rows.map(r => r.role).filter(Boolean)).map(r => <span key={r} className="chip">{r}</span>)}<StatusChip status={st}/></span></div>
        <div className="profile-next-actions">
          <button className={"btn sm" + (st === "yes" ? " primary" : " ghost")} aria-pressed={st === "yes"} aria-busy={busy === "yes"} onClick={() => answer("yes")}>{busy === "yes" ? <Spin/> : <Icon name="check" sm/>} {t("group.confirm")}</button>
          <button className={"btn sm" + (st === "no" ? " danger armed" : " ghost")} aria-pressed={st === "no"} aria-busy={busy === "no"} onClick={() => answer("no")}>{busy === "no" ? <Spin/> : <Icon name="x" sm/>} {t("group.decline")}</button>
          <button className="link-btn" onClick={() => go("group")}>{t("profile.seeAgenda")}</button>
        </div>
      </div> : <span className="sub">{t("profile.nextNone")} <button className="link-btn" onClick={() => go("group")}>{t("profile.seeAgenda")}</button></span>}
    </div>
  </>;
}

// Sem funções e frequência no card: avisa o porquê (o grupo não carregou, ou a pessoa não está em nenhum),
// em vez de o card ficar só com os campos.
function GroupNote(){
  const g = useGroups(), me = useAuth(s => s.email);
  if(g.members.some(x => x.email === me)) return null;
  if(g.error) return <p className="sub profile-group-note">{t("group.loadFail")} <button className="link-btn" onClick={() => loadGroups()}>{t("group.retry")}</button></p>;
  return g.loaded && !g.loading ? <p className="sub profile-group-note">{t("profile.noGroup")}</p> : null;
}

// As funções da pessoa no grupo aberto (pode ter várias: tocar e cantar). São as que aparecem ao montar
// a escala. Quem lidera muda as de todos em Grupo → Membros.
function MyRoles(){
  const g = useGroups(), me = useAuth(s => s.email), [busy, setBusy] = useState(false);
  // Ao abrir o perfil, busca o grupo de novo (a cópia do aparelho pode estar velha ou ter falhado).
  useEffect(() => { loadGroups(); }, []);
  const group = g.groups.find(x => x.id === g.gid), m = g.members.find(x => x.email === me);
  if(!group || !m) return null;
  const save = async (v: string) => { setBusy(true); const ok = await setMemberRole(g.gid, me, v).finally(() => setBusy(false)); toast(t(ok ? "profile.rolesSaved" : "profile.saveFail")); };
  return <div className="field profile-roles"><span>{t("profile.roles", {group: group.name})}</span>
    <MemberRoles m={m} editable busy={busy} onSave={save}/>
    <small className="sub">{t("profile.rolesHint")}</small></div>;
}

// Hoje no formato do campo de data ("AAAA-MM-DD"), para não aceitar datas no futuro.
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// Celular no perfil: salva ao sair do campo (o grupo vê, para achar substituto).
function PhoneField(){
  const saved = useAuth(s => s.profile?.phone || "");
  const [v, setV] = useState(saved);
  useEffect(() => setV(saved), [saved]);
  return <label className="field"><span>{t("profile.phone")}</span>
    <input className="input" id="profile-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} placeholder={t("profile.phonePh")} value={v}
      onChange={e => setV(e.target.value)} onKeyDown={e => { if(e.key === "Enter") e.currentTarget.blur(); }}
      onBlur={async e => { const el = e.currentTarget; if(cleanPhone(v) === saved) return; if(await savePhone(v)) flashSaved(el); else { setV(saved); toast(t("profile.saveFail")); } }}/></label>;
}

// Data de nascimento no perfil: salva ao mudar (o grupo vê só o dia e o mês, na página Início).
function BirthdayField(){
  const saved = useAuth(s => s.profile?.birthday || "");
  const [v, setV] = useState(saved);
  useEffect(() => setV(saved), [saved]);
  const save = async (nv: string, el: HTMLElement) => { setV(nv); if(nv === saved) return; if(await saveBirthday(nv)) flashSaved(el); else { setV(saved); toast(t("profile.saveFail")); } };
  return <label className="field"><span>{t("profile.birthday")}</span>
    <DateInput id="profile-birthday" aria={t("profile.birthday")} max={today()} clearable value={v} onChange={save}/>
    <small className="sub">{t("profile.birthdayHint")}</small></label>;
}

// Dia e mês de uma data de nascimento ("12 de março"), sem o ano.
export const fmtBirthday = (v: string) => new Intl.DateTimeFormat(locale(), {day: "numeric", month: "long", timeZone: "UTC"}).format(new Date(v + "T00:00:00Z"));

// Nome, celular e data de nascimento de quem já está na lista. O que a pessoa já preencheu no próprio perfil
// aparece travado: só ela muda.
function PersonEdit({r, onDone}: {r: Allowed; onDone: (saved: boolean) => void}){
  const [name, setName] = useState(r.profileName || r.name), [birthday, setBirthday] = useState(r.profileBirthday || r.birthday || "");
  const [phone, setPhone] = useState(r.profilePhone || r.phone);
  const [busy, setBusy] = useState(false), lock = useLock();
  // O admin muda nome e celular mesmo os que a pessoa preencheu no perfil; a data que ela preencheu continua dela.
  const lockedDate = !!r.profileBirthday;
  const save = (e: React.FormEvent) => { e.preventDefault(); lock(async () => {
    setBusy(true);
    const day = lockedDate ? (r.birthday || "") : birthday;
    // Banco sem admin_set_person ainda: grava só na lista de acesso (o que a pessoa preencheu continua valendo).
    const ok = await setPersonInfo(r.email, name, phone, day).then(done => done || setAllowedInfo(r.email, name, day, phone)).finally(() => setBusy(false));
    toast(t(ok ? "people.infoSaved" : "profile.saveFail", {email: r.email}));
    if(ok) onDone(true);
  }); };
  return <form className="people-edit" onSubmit={save}>
    <div className="people-add">
      <div className="field"><label htmlFor={"edit-name-" + r.email}>{t("profile.name")}</label>
        <input className="input" id={"edit-name-" + r.email} maxLength={80} autoComplete="off" placeholder={t("people.namePh")} value={name} onChange={e => setName(e.target.value)} autoFocus/></div>
      <div className="field phone"><label htmlFor={"edit-phone-" + r.email}>{t("profile.phone")}</label>
        <input className="input" id={"edit-phone-" + r.email} type="tel" inputMode="tel" autoComplete="off" maxLength={30} placeholder={t("profile.phonePh")} value={phone} onChange={e => setPhone(e.target.value)}/></div>
      <div className="field birthday"><label htmlFor={"edit-birthday-" + r.email}>{t("profile.birthday")}</label>
        <DateInput className="people-birthday" id={"edit-birthday-" + r.email} max={today()} clearable value={birthday} disabled={lockedDate} onChange={setBirthday}/></div>
      <button type="button" className="btn ghost" onClick={() => onDone(false)}>{t("common.cancel")}</button>
      <button className="btn primary" aria-busy={busy}>{busy ? <Spin/> : <Icon name="check" sm/>} {t("common.save")}</button>
    </div>
    {lockedDate && <p className="sub people-edit-hint">{t("people.lockedHint")}</p>}
  </form>;
}

// Validação do e-mail ao adicionar uma pessoa (como no login): aparece ao sair do campo ou ao tentar
// adicionar, e some quando fica certo.
export function useEmailCheck(email: string){
  const [touched, setTouched] = useState(false);
  return {bad: touched && !!email.trim() && !validEmail(email), blur: () => setTouched(true), fail: () => setTouched(true), reset: () => setTouched(false)};
}
// Nome, e-mail e nascimento de quem está sendo adicionado, cada um com o rótulo em cima.
export function PersonFields({idp, name, onName, email, onEmail, phone, onPhone, birthday, onBirthday, check}: {idp: string; name: string; onName: (v: string) => void;
  email: string; onEmail: (v: string) => void; phone: string; onPhone: (v: string) => void; birthday: string; onBirthday: (v: string) => void; check: ReturnType<typeof useEmailCheck>}){
  return <>
    <div className="field"><label htmlFor={idp + "-name"}>{t("profile.name")}</label>
      <input className="input" id={idp + "-name"} maxLength={80} autoComplete="off" placeholder={t("people.namePh")} value={name} onChange={e => onName(e.target.value)}/></div>
    <div className="field"><label htmlFor={idp + "-email"}>{t("auth.email")}</label>
      <input className="input" id={idp + "-email"} type="email" inputMode="email" autoComplete="off" placeholder={t("people.emailPh")} value={email}
        aria-invalid={check.bad} aria-describedby={check.bad ? idp + "-email-err" : undefined} onBlur={check.blur} onChange={e => onEmail(e.target.value)}/>
      {check.bad && <span className="field-error" id={idp + "-email-err"}>{t("auth.badEmail")}</span>}</div>
    <div className="field phone"><label htmlFor={idp + "-phone"}>{t("profile.phone")}</label>
      <input className="input" id={idp + "-phone"} type="tel" inputMode="tel" autoComplete="off" maxLength={30} placeholder={t("profile.phonePh")} value={phone} onChange={e => onPhone(e.target.value)}/></div>
    <div className="field birthday"><label htmlFor={idp + "-birthday"}>{t("profile.birthday")}</label>
      <DateInput className="people-birthday" id={idp + "-birthday"} max={today()} clearable value={birthday} onChange={onBirthday}/></div>
  </>;
}

function People({me}: {me: string}){
  const [rows, setRows] = useState<Allowed[] | null>(null), fold = useFold("people");
  const [email, setEmail] = useState(""), [name, setName] = useState(""), [birthday, setBirthday] = useState(""), [phone, setPhone] = useState(""), [asAdmin, setAsAdmin] = useState(false), [busy, setBusy] = useState(false);
  // pending: o e-mail da linha com uma mudança em andamento (os botões dela ficam desabilitados).
  const [pending, setPending] = useState("");
  // editing: o e-mail da linha com o nome e a data abertos para editar.
  const [editing, setEditing] = useState("");
  const lock = useLock(), check = useEmailCheck(email);
  // Busca na lista "Com acesso": por nome ou e-mail.
  const [q, setQ] = useState(""), nq = norm(q.trim());
  const shown = rows && nq ? rows.filter(r => norm(r.profileName || r.name).includes(nq) || norm(r.email).includes(nq)) : rows;
  // Falhou: a lista fica vazia com o aviso e o botão de tentar de novo (antes ficava em "Carregando..." para sempre).
  const [failed, setFailed] = useState(false);
  // Funções no cadastro: só com um grupo (é nele que a pessoa entra sozinha); com mais, ficam em Grupo → Membros.
  const groups = useGroups(s => s.groups), only = groups.length === 1 ? groups[0] : null, [roles, setRoles] = useState<string[]>([]);
  const load = async () => { setFailed(false); const r = await listAllowed(); if(r) setRows(r); else { setRows(rows => rows || []); setFailed(true); } };
  useEffect(() => { load(); }, []);
  const add = (e: React.FormEvent) => { e.preventDefault(); lock(async () => {
    const v = email.trim().toLowerCase();
    if(!validEmail(v)){ check.fail(); document.getElementById("people-email")?.focus(); return; }
    setBusy(true); const ok = await addAllowed(v, asAdmin, name, birthday, phone).then(async ok => {
      // Com um grupo só, a pessoa já entra nele (on_allowed_join): as funções escolhidas vão junto.
      if(ok && only && roles.length) await setMemberRole(only.id, v, joinRoles(roles));
      return ok;
    }).finally(() => setBusy(false));
    if(!ok) return toast(t("profile.saveFail"));
    toast(t("people.added", {email: v})); setEmail(""); setName(""); setBirthday(""); setPhone(""); setRoles([]); setAsAdmin(false); check.reset(); await load();
  }); };
  const onRow = (r: Allowed, fn: () => Promise<unknown>) => lock(async () => { setPending(r.email); try{ await fn(); } finally{ setPending(""); } });
  const toggleAdmin = (r: Allowed) => onRow(r, async () => { if(await setAllowedAdmin(r.email, !r.is_admin)) await load(); else toast(t("profile.saveFail")); });
  const remove = async (r: Allowed) => {
    if(!await confirmDialog({title: t("people.removeTitle"), message: t("people.removeMsg", {email: r.email}), confirm: t("people.remove")})) return;
    onRow(r, async () => { if(await removeAllowed(r.email)){ toast(t("people.removed", {email: r.email})); await load(); loadGroups(); } else toast(t("profile.saveFail")); });
  };
  return <div className={"card people-card" + fold.cls}>
    <FoldHead folded={fold.folded} onToggle={fold.toggle} title={t("people.title")}/>
    <div className="card-top"><h2>{t("people.title")}</h2><p className="sub">{t("people.sub")}</p></div>
    <div className="card-body">
    <form className="people-add-box" onSubmit={add} noValidate>
      <h3 className="people-sub-h">{t("people.addTitle")}</h3>
      <div className="people-add">
      <PersonFields idp="people" name={name} onName={setName} email={email} onEmail={setEmail} phone={phone} onPhone={setPhone} birthday={birthday} onBirthday={setBirthday} check={check}/>
      <label className="switch lead boxed"><span>{t("profile.admin")}</span><input type="checkbox" id="people-admin" checked={asAdmin} onChange={e => setAsAdmin(e.target.checked)}/></label>
      <button className="btn primary" disabled={!email.trim()} aria-busy={busy}>{busy ? <Spin/> : <Icon name="plus" sm/>} {t("common.add")}</button>
      </div>
      {only && <RolePicker value={roles} onChange={setRoles}/>}
    </form>
    <h3 className="people-sub-h">{t("people.listTitle")} {rows && rows.length > 0 && <span className="count-chip">{nq && shown ? shown.length + "/" + rows.length : rows.length}</span>}</h3>
    {rows && rows.length > 0 && <div className="search people-search"><Icon name="search" sm/><input type="search" className="input" id="people-q" placeholder={t("people.searchPh")}
      aria-label={t("people.searchPh")} value={q} onChange={e => setQ(e.target.value)}/></div>}
    {/* Cabeçalho da lista, como numa tabela: marca onde as pessoas começam. */}
    {shown && shown.length > 0 && <div className="people-list-head" aria-hidden="true"><span>{t("people.colPerson")}</span><span>{t("people.colActions")}</span></div>}
    <ul className="people-list" id="people-list">
      {nq && shown && !shown.length && <li className="sub">{t("lib.noResults")}</li>}
      {failed && <li className="sub">{t("profile.loadFail")} <button type="button" className="link-btn" onClick={load}>{t("common.retry")}</button></li>}
      {shown === null ? <li className="sub">{t("auth.loading")}</li> : shown.map(r => {
        const nm = r.profileName || r.name, bd = r.profileBirthday || r.birthday, ph = r.profilePhone || r.phone;
        return <li key={r.email}>
        {/* O "Admin" fica logo depois do nome (ou do e-mail, para quem ainda não tem nome). */}
        <span className="people-who"><Avatar person={{name: nm, email: r.email, photo: r.profilePhoto}}/><span className="people-id">
          {/* Sempre as três linhas (nome, e-mail, celular), com um texto apagado no que falta: todas as pessoas
              ficam com a mesma altura. */}
          <span className="people-name">{nm ? <b>{nm}</b> : <span className="people-missing">{t("people.noName")}</span>}{r.is_admin && <span className="chip accent">{t("profile.admin")}</span>}</span>
          <span className="sub people-email">{r.email}{bd && " · " + fmtBirthday(bd)}</span>
          {ph ? <PhoneLink phone={ph}/> : <span className="phone-link people-missing"><Icon name="phone" sm/><span>{t("people.noPhone")}</span></span>}</span></span>
        {r.email === me ? <span className="chip">{t("people.you")}</span> : <span className="people-actions">
          {/* Admin liga/desliga direto na linha (desabilitado enquanto salva). */}
          <label className="switch lead boxed people-admin" aria-busy={pending === r.email}><span>{t("profile.admin")}</span>
            <input type="checkbox" checked={!!r.is_admin} disabled={pending === r.email} aria-label={t("people.adminAria", {email: r.email})} onChange={() => toggleAdmin(r)}/></label>
          <button className="icon-btn sm line" aria-label={t("people.edit")} title={t("people.edit")} aria-expanded={editing === r.email} onClick={() => setEditing(editing === r.email ? "" : r.email)}><Icon name="edit" sm/></button>
          <button className="icon-btn sm line danger" aria-label={t("people.remove")} title={t("people.remove")} onClick={() => remove(r)}><Icon name="trash" sm/></button></span>}
        {editing === r.email && <PersonEdit r={r} onDone={async saved => { setEditing(""); if(saved) await load(); }}/>}
      </li>; })}
    </ul>
    </div>
  </div>;
}
