// Conta: tela de entrar (Google ou e-mail e senha), aviso de sem acesso e a página Perfil, com a lista de quem
// pode entrar para os admins.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t, tn, locale } from "../lib/i18n";
import { Select } from "../ui/Select";
import { useAuth, savePhone, cleanPhone, signIn, signUp, resendConfirmation, pendingConfirm, setPendingConfirm, forgotPassword, setNewPassword, signInWithGoogle, signOut, saveName, saveBirthday, listAllowed, addAllowed, setAllowedInfo, setPersonInfo, setAllowedAdmin, removeAllowed, validEmail, initials, ownPhoto, removePhoto, type Allowed } from "../lib/cloud";
import { DEFAULT_POLICY, missing, passes, fromError, isPwned, type PwPolicy, type PwRule } from "../lib/password";
import { reduced, flashSaved, norm } from "../lib/util";
import { toast, confirmDialog, openDialog, closeDialog, confirmUnsaved, useUnsaved, go } from "../state";
import { Icon } from "../ui/Icon";
import { CopyBtn } from "../ui/CopyBtn";
import { DateInput } from "../ui/DateInput";
import { FieldLabel } from "../ui/FieldLabel";
import { useGroups, loadGroups, chooseGroup, setMemberRole, outMark, listGroupedEmails } from "../lib/groups";
import { attendanceRate, attendanceHistory, rehearsalStanding, comebackProgress, type Standing, type OutMark, MISS_LIMIT, COMEBACK, streakLevel, fmtPhone, maskPhone } from "../lib/calendar";
import { sortRoles, joinRoles, splitRoles } from "../lib/roles";
import { MemberRoles, RolePicker, ReplySeg, GroupMark, eventTitle, timeOf, longDay, openGroup } from "./Group";
import { useSync, syncNow, flushBeforeSignOut, forgetLocal } from "../lib/sync";
import { SecHead } from "../ui/SecHead";
import { FoldCard } from "../ui/FoldCard";
import { PhoneInput } from "../ui/PhoneInput";
import { NameInput } from "../ui/NameInput";
import { YouChip } from "../ui/YouChip";
import { VoiceChip } from "../ui/VoiceChip";
import { GoLink } from "../ui/GoLink";
import { rangeType } from "../lib/voice";
import { setSetting } from "../lib/store";

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
// Chip de faltas seguidas: neutro até a 2ª; da 3ª à 7ª vai de laranja a vermelho (a 8ª já deixa a pessoa em pausa).
export function StreakChip({streak, title}: {streak: number; title?: string}){
  const lvl = streakLevel(streak);
  return <span className={"chip" + (lvl === null ? "" : " streak")} style={lvl === null ? undefined : {"--lvl": lvl} as React.CSSProperties} title={title}>{t("group.streak", {n: streak, max: MISS_LIMIT})}</span>;
}

// Frequência nos ensaios: % de presença e a barra. Em pausa, o número e a barra mostram o quanto já foi cumprido
// da volta (0% neutro até o verde cheio), não o histórico, que mandaria um 100% verde ao lado do chip vermelho.
export function AttStat({rate, sd, mark}: {rate: {present: number; total: number}; sd: Standing; mark?: OutMark | null}){
  const back = sd.out ? comebackProgress(sd, mark) : null;
  const p = back ? back.pct : Math.round(100 * rate.present / rate.total);
  return <div className={"profile-stat" + (!back && sd.streak > 0 ? " is-warn" : "")}>
    <b>{p}%</b><span className="sub">{back ? t("profile.attBack", {done: back.done, total: back.total}) : t("profile.attCount", {present: rate.present, total: rate.total})}</span>
    {sd.out ? <span className="chip st-no">{tn("group.standOut", sd.need)}</span>
      : sd.streak > 0 ? <StreakChip streak={sd.streak}/>
      : <span className="chip st-yes">{t("group.standOk")}</span>}
    <span className="meter" aria-hidden="true"><i style={{width: p + "%"}}/></span>
  </div>;
}

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
      {mode === "signin" && <GoLink className="auth-forgot" onClick={() => go("forgot")}>{t("auth.forgot")}</GoLink>}
      <button className="btn primary" id="auth-submit" aria-busy={busy === "submit"}>
        {busy === "submit" && <Spin/>}{t(mode === "signup" ? "auth.signup" : mode === "forgot" ? "auth.sendReset" : "auth.enter")}</button>
      <p className="auth-switch">{mode === "signin" ? <>{t("auth.noAccount")} <GoLink onClick={() => go("signup")}>{t("auth.signup")}</GoLink></>
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
// Linha de pessoa: tocar fora destes (botões, links, campos, painel de editar) abre os detalhes.
export const SKIP_OPEN = "a, button, input, label, select, textarea, .people-edit";
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

// Perfil em painel (como o Início): o topo (foto, nome e escalas) na linha toda e cada seção num card
// próprio, dois por linha quando cabem (Meus dados ao lado de Meus grupos).
export function Profile(){
  const {profile, admin, owner, email} = useAuth();
  return <section className="view" id="view-profile" data-view="profile" aria-labelledby="profile-h">
    <div className="view-head"><div><h1 id="profile-h">{t("profile.title")}</h1></div></div>
    <div className="profile-panel">
      <div className="card profile-top wide">
        <div className="profile-who"><PhotoButton/><div><span className="people-name"><b>{profile?.name || email}</b>{(owner || admin) && <span className={"chip " + (owner ? "owner" : "accent")}>{t(owner ? "profile.owner" : "profile.admin")}</span>}</span><span className="sub">{email}</span>
          <PhotoActions/></div></div>
        {/* À direita, no pé do card: o estado da nuvem (só quando há algo) antes das escalas. */}
        <div className="profile-side"><SyncStatus/><MySoon/></div>
      </div>
      {/* Nome, celular e nascimento na mesma linha enquanto cabem; senão, quebram. */}
      <Sec id="profile-data" title={t("profile.data")}>
        <div className="profile-pair">
        <NameField/>
        <PhoneField/>
        <BirthdayField/>
        </div>
      </Sec>
      <MyGroups/>
      <MyRoles/>
      <MyVoice/>
      <MyAttendance/>
      <MyNext/>
      <GroupNote/>
      {admin && <PeopleLink/>}
    </div>
    {/* Sair no fim da página, sozinho, como nos apps de celular. */}
    <div className="profile-out"><SignOut/></div>
  </section>;
}

// No topo do Perfil: quantas escalas a pessoa tem nos próximos 30 dias no grupo aberto e quantas já confirmou.
function MySoon(){
  const {g, me, ok} = useMyGroup();
  if(!ok) return null;
  const now = Date.now(), until = now + 30 * 864e5;
  const soon = g.events.filter(e => { const at = new Date(e.starts_at).getTime(); return at > now && at < until && g.roster.some(r => r.event_id === e.id && r.email === me); });
  const yes = soon.filter(e => g.roster.some(r => r.event_id === e.id && r.email === me && r.status === "yes")).length;
  return <span className="profile-soon">
    <span><Icon name="calendar" sm/> {tn("profile.soon", soon.length)}</span>
    {soon.length > 0 && <span className={yes === soon.length ? "ok" : ""}><Icon name="check" sm/> {t("profile.soonYes", {n: yes, total: soon.length})}</span>}
  </span>;
}

// Os grupos da pessoa: tocar abre o grupo. No aberto (o único com os membros carregados), o chip Líder e
// desde quando ela está nele; nos outros, os números do grupo.
function MyGroups(){
  const g = useGroups(), me = useAuth(s => s.email);
  if(!g.groups.length) return null;
  const m = g.members.find(x => x.email === me);
  return <Sec id="profile-groups" className="profile-groups" title={t("profile.groups")}>
    <ul className="profile-group-list">{g.groups.map(x => {
      const cur = x.id === g.gid;
      return <li key={x.id}><button type="button" className="profile-group-open" onClick={() => { if(!cur) chooseGroup(x.id); openGroup("members"); }}>
        <GroupMark group={x}/>
        <span className="profile-group-what"><span className="people-name"><b>{x.name}</b>{cur && m?.is_admin && <span className="chip leader">{t("group.leader")}</span>}</span>
          {cur && m?.created_at ? <span className="sub">{t("profile.since", {date: fmtMonth(m.created_at)})}</span>
            : x.stats && <span className="sub">{tn("home.events", x.stats.events)} · {tn("profile.members", x.stats.members)}</span>}</span>
        <Icon name="chev" sm className="chev-right"/>
      </button></li>;
    })}</ul>
  </Sec>;
}
// Mês e ano ("março de 2025"), para o "no grupo desde".
const fmtMonth = (v: string) => new Intl.DateTimeFormat(locale(), {month: "long", year: "numeric"}).format(new Date(v));

// Card de uma seção do Perfil: título com o traço no degradê e o conteúdo embaixo. wide: a linha toda.
// "action" é um botão no canto direito, na mesma linha do título.
function Sec({id, title, wide, className = "", action, children}: {id: string; title: string; wide?: boolean; className?: string; action?: ReactNode; children: ReactNode}){
  const head = <SecHead id={id + "-h"}>{title}</SecHead>;
  return <section className={"card profile-sec " + className + (wide ? " wide" : "")} id={id} aria-labelledby={id + "-h"}>
    {action ? <div className="profile-sec-head">{head}{action}</div> : head}{children}</section>;
}

// Estado da nuvem: sincronizando, mudanças esperando, sem internet ou erro. Com tudo salvo (quase sempre),
// não aparece: o aviso só existe quando há algo a saber ou fazer.
function SyncStatus(){
  const {state, pending} = useSync();
  if(state === "off" || (state === "idle" && !pending)) return null;
  const text = state === "syncing" ? t("sync.syncing") : state === "offline" ? (pending ? tn("sync.offline", pending) : t("sync.offlineNone"))
    : state === "error" ? t("sync.error") : tn("sync.pending", pending);
  return <div className={"sync-status " + state} role="status">
    {state === "syncing" ? <Spin/> : <Icon name="sync" sm/>}
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
  return <button className="link-btn" id="profile-out" aria-busy={busy} disabled={busy} onClick={leave}>{busy ? <Spin/> : <Icon name="back" sm/>} {t("auth.signOut")}</button>;
}

// No grupo aberto, se a pessoa é membro dele (só assim existem as seções de frequência e da próxima escala).
function useMyGroup(){
  const g = useGroups(), me = useAuth(s => s.email);
  return {g, me, ok: g.groups.some(x => x.id === g.gid) && g.members.some(x => x.email === me)};
}

// A frequência da pessoa nos ensaios do grupo aberto, com a regra que tira dos cultos.
function MyAttendance(){
  const {g, me, ok} = useMyGroup();
  if(!ok) return null;
  const rate = attendanceRate(me, g.events, g.attendance, Date.now(), g.roster), sd = rehearsalStanding(me, g.events, g.attendance, Date.now(), outMark(g.members.find(x => x.email === me)), g.roster);
  // Os últimos ensaios do mais antigo ao mais novo (o mais recente fica na ponta direita).
  const hist = attendanceHistory(me, g.events, g.attendance, Date.now(), g.roster, 8).reverse();
  return <Sec id="profile-att" className="profile-att" title={t("profile.attendance")}>
    {rate.total ? <AttStat rate={rate} sd={sd} mark={outMark(g.members.find(x => x.email === me))}/> : <span className="sub">{t("profile.attNone")}</span>}
    {hist.length > 0 && <div className="att-dots-row">
      {/* O rótulo e, depois dele, a data de cada ensaio na cor da situação; a legenda no fim (só as situações que aparecem). */}
      <span className="sub">{tn("profile.attLast", hist.length)}</span>
      <ul className="att-dots">{hist.map(h => <li key={h.event.id} className={"att-dot " + h.status}
        aria-label={longDay(new Date(h.event.starts_at)) + ": " + t("group.att." + h.status)}>
        <span aria-hidden="true">{new Date(h.event.starts_at).toLocaleDateString(locale(), {day: "2-digit", month: "2-digit"})}</span></li>)}</ul>
      <ul className="att-legend" aria-hidden="true">{(["present", "absent", "excused"] as const).filter(st => hist.some(h => h.status === st)).map(st =>
        <li key={st} className={"att-dot " + st}><i/>{t("group.att." + st)}</li>)}</ul></div>}
    <small className="sub att-rule">{t("profile.attRule", {max: MISS_LIMIT, back: COMEBACK})}</small>
  </Sec>;
}

// O próximo evento do grupo aberto em que a pessoa está escalada, com Confirmar e Não posso ali mesmo.
function MyNext(){
  const {g, me, ok} = useMyGroup();
  if(!ok) return null;
  // Um evento que começou há pouco ainda conta como o "próximo" (a pessoa pode estar a caminho).
  const soon = Date.now() - 3 * 3600 * 1000;
  const next = g.events.filter(e => new Date(e.starts_at).getTime() > soon && g.roster.some(r => r.event_id === e.id && r.email === me))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const rows = next ? g.roster.filter(r => r.event_id === next.id && r.email === me) : [];
  const roles = sortRoles(rows.map(r => r.role).filter(Boolean));
  return <Sec id="profile-next" className="profile-next" title={t("profile.next")}>
    {next ? <div className="profile-next-box">
      {/* A situação ao lado do título; embaixo da data, "Suas funções:" e os chips na mesma linha. */}
      <div className="profile-next-what"><span className="profile-next-title"><b>{eventTitle(next)}</b>
          <GoLink onClick={() => openGroup("agenda")}>{t("profile.seeAgenda")}</GoLink></span>
        <span className="sub">{longDay(new Date(next.starts_at))} · {timeOf(next.starts_at)}{next.place && " · " + next.place}</span>
        {roles.length > 0 && <div className="profile-next-roles"><span className="profile-next-label">{t("profile.nextRoles")}</span>
          <span className="profile-next-chips">{roles.map(r => <span key={r} className="chip role">{r}</span>)}</span></div>}</div>
      <ReplySeg e={next}/>
    </div> : <span className="sub">{t("profile.nextNone")} <GoLink onClick={() => openGroup("agenda")}>{t("profile.seeAgenda")}</GoLink></span>}
  </Sec>;
}

// Sem as seções do grupo: um card avisa o porquê (o grupo não carregou, ou a pessoa não está em nenhum).
function GroupNote(){
  const g = useGroups(), me = useAuth(s => s.email);
  if(g.members.some(x => x.email === me)) return null;
  if(g.error) return <div className="card profile-sec profile-group-note"><p className="sub">{t("group.loadFail")} <button className="link-btn" onClick={() => loadGroups()}>{t("group.retry")}</button></p></div>;
  return g.loaded && !g.loading ? <div className="card profile-sec profile-group-note"><p className="sub">{t("profile.noGroup")}</p></div> : null;
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
  return <Sec id="profile-roles" className="profile-roles" title={t("profile.roles", {group: group.name})}>
    <MemberRoles m={m} editable busy={busy} onSave={save}/>
    <small className="sub">{t("profile.rolesHint")}</small></Sec>;
}

// Classificação vocal da pessoa (Baixo, Tenor...), vinda da medição em Ferramentas → Voz. Aparece mesmo sem
// grupo; o grupo só vê o chip.
function MyVoice(){
  const profile = useAuth(s => s.profile), has = !!rangeType(profile || {});
  return <Sec id="profile-voice" className="profile-voice" title={t("profile.voice")}
    action={<GoLink onClick={() => { setSetting("toolsTab", "voice"); go("tools"); }}>{t(has ? "voice.measureAgain" : "voice.measure")}</GoLink>}>
    <span className="member-chips">{has ? <VoiceChip {...profile}/> : <span className="people-missing">{t("profile.noVoice")}</span>}</span>
    <small className="sub">{t("profile.voiceHint")}</small></Sec>;
}

// Hoje no formato do campo de data ("AAAA-MM-DD"), para não aceitar datas no futuro.
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// Campo que grava na nuvem: enquanto salva, "Salvando…" com o spinner no canto do rótulo (onde depois
// aparece o "✓ Salvo") e a borda na cor de destaque; falhou, o aviso. Todo campo que grava na rede usa isto:
// a pessoa sempre vê que está salvando, que salvou ou que não deu.
export function useFieldSave(){
  const [saving, setSaving] = useState(false);
  const run = async (el: Element, save: () => Promise<boolean>) => {
    setSaving(true);
    const ok = await save().catch(() => false).finally(() => setSaving(false));
    if(ok) flashSaved(el); else toast(t("profile.saveFail"));
    return ok;
  };
  const status = saving && <span className="field-saving" role="status"><Spin/>{t("common.saving")}</span>;
  return {saving, run, status};
}

// Nome no perfil: salva ao sair do campo (ou no Enter).
function NameField(){
  const saved = useAuth(s => s.profile?.name || "");
  const [v, setV] = useState(saved), f = useFieldSave();
  useEffect(() => setV(saved), [saved]);
  return <label className="field"><span>{t("profile.name")}</span>{f.status}
    <NameInput className="input" id="profile-name" maxLength={80} autoComplete="name" value={v} aria-busy={f.saving}
      onValue={setV} onKeyDown={e => { if(e.key === "Enter") e.currentTarget.blur(); }}
      onBlur={e => { if(v.trim() !== saved) f.run(e.currentTarget, () => saveName(v)); }}/></label>;
}

// Celular no perfil: salva ao sair do campo (o grupo vê, para achar substituto).
function PhoneField(){
  const saved = useAuth(s => s.profile?.phone || "");
  const [v, setV] = useState(maskPhone(saved)), f = useFieldSave();
  useEffect(() => setV(maskPhone(saved)), [saved]);
  return <label className="field"><span>{t("profile.phone")}</span>{f.status}
    <PhoneInput className="input" id="profile-phone" autoComplete="tel" maxLength={30} placeholder={t("profile.phonePh")} value={v} aria-busy={f.saving}
      onValue={setV} onKeyDown={e => { if(e.key === "Enter") e.currentTarget.blur(); }}
      onBlur={async e => { if(cleanPhone(v) === saved || v === maskPhone(saved)) return; if(!await f.run(e.currentTarget, () => savePhone(v))) setV(maskPhone(saved)); }}/></label>;
}

// Data de nascimento no perfil: salva ao mudar (o grupo vê só o dia e o mês, na página Início).
function BirthdayField(){
  const saved = useAuth(s => s.profile?.birthday || "");
  const [v, setV] = useState(saved), f = useFieldSave();
  useEffect(() => setV(saved), [saved]);
  const save = async (nv: string, el: HTMLElement) => { setV(nv); if(nv === saved) return; if(!await f.run(el, () => saveBirthday(nv))) setV(saved); };
  return <label className="field"><span>{t("profile.birthday")}</span>{f.status}
    <DateInput id="profile-birthday" aria={t("profile.birthday")} max={today()} clearable value={v} onChange={save}/>
    <small className="sub">{t("profile.birthdayHint")}</small></label>;
}

// Dia e mês de uma data de nascimento ("12 de março"), sem o ano.
export const fmtBirthday = (v: string) => new Intl.DateTimeFormat(locale(), {day: "numeric", month: "long", timeZone: "UTC"}).format(new Date(v + "T00:00:00Z"));

// Rótulo das funções na página Usuários: com mais de um grupo, diz de qual grupo são.
const rolesLabel = (count: number, group: string) => count > 1 ? t("people.rolesIn", {group}) : undefined;

// Nome, celular, data de nascimento e funções de quem já está na lista. O admin muda tudo, mesmo o que a
// pessoa preencheu no próprio perfil.
// inline: dentro de outra janela com formulário (a de detalhes): sem <form> aninhado, para o Enter e o Salvar nunca
// fecharem a janela; o Enter dos campos salva.
export function PersonEdit({r, onDone, inline}: {r: Allowed; onDone: (saved: boolean) => void; inline?: boolean}){
  const [name, setName] = useState(r.profileName || r.name), [birthday, setBirthday] = useState(r.profileBirthday || r.birthday || "");
  const [phone, setPhone] = useState(maskPhone(r.profilePhone || r.phone));
  const [busy, setBusy] = useState(false), lock = useLock();
  // Funções no grupo aberto, se a pessoa está nele (com mais de um grupo, o rótulo diz qual).
  const g = useGroups(), group = g.groups.find(x => x.id === g.gid), member = group ? g.members.find(x => x.email === r.email) : undefined;
  const [roles, setRoles] = useState<string[]>(() => member ? sortRoles(splitRoles(member.role)) : []);
  // Alterado = diferente de quando abriu: sair (Cancelar, fechar a janela, trocar de página) pergunta antes.
  const root = useRef<HTMLElement>(null), snap = JSON.stringify([name, phone, birthday, roles]), start = useRef(snap);
  useUnsaved(root, snap !== start.current);
  const cancel = async () => { if(snap === start.current || await confirmUnsaved()) onDone(false); };
  // O admin muda nome, celular e data mesmo os que a pessoa preencheu no perfil.
  const save = (e?: React.SyntheticEvent) => { e?.preventDefault(); lock(async () => {
    setBusy(true);
    // Banco sem admin_set_person ainda: grava só na lista de acesso (o que a pessoa preencheu continua valendo).
    const ok = await setPersonInfo(r.email, name, phone, birthday).then(done => done || setAllowedInfo(r.email, name, birthday, phone))
      .then(async ok => { const v = joinRoles(roles); if(ok && group && member && v !== member.role) await setMemberRole(group.id, r.email, v); return ok; })
      .finally(() => setBusy(false));
    toast(t(ok ? "people.infoSaved" : "profile.saveFail", {email: r.email}));
    // Editou a si mesmo: "Meus dados" mostra o novo na hora (sem esperar entrar de novo).
    const p = useAuth.getState().profile;
    if(ok && p && r.email === useAuth.getState().email) useAuth.setState({profile: {...p, name: name.trim().slice(0, 80), phone: cleanPhone(phone), birthday: birthday || null}});
    if(ok) onDone(true);
  }); };
  const Root = inline ? "div" : "form";
  return <Root ref={root as React.RefObject<never>} className="people-edit member-edit" {...(inline
    ? {onKeyDown: (e: React.KeyboardEvent) => { if(e.key === "Enter" && !e.defaultPrevented && (e.target as HTMLElement).tagName === "INPUT"){ e.preventDefault(); save(); } }}
    : {onSubmit: save})}>
    <div className="people-add">
      <div className="field"><label htmlFor={"edit-name-" + r.email}>{t("profile.name")}</label>
        <NameInput className="input" id={"edit-name-" + r.email} maxLength={80} autoComplete="off" placeholder={t("people.namePh")} value={name} onValue={setName} autoFocus/></div>
      <div className="field phone"><label htmlFor={"edit-phone-" + r.email}>{t("profile.phone")}</label>
        <PhoneInput className="input" id={"edit-phone-" + r.email} autoComplete="off" maxLength={30} placeholder={t("profile.phonePh")} value={phone} onValue={setPhone}/></div>
      <div className="field birthday"><label htmlFor={"edit-birthday-" + r.email}>{t("profile.birthday")}</label>
        <DateInput className="people-birthday" id={"edit-birthday-" + r.email} max={today()} clearable value={birthday} onChange={setBirthday}/></div>
    </div>
    {group && member && <RolePicker value={roles} onChange={setRoles} label={rolesLabel(g.groups.length, group.name)}/>}
    {/* Cancelar e Salvar por último, embaixo das funções (como no editar de Grupo → Membros). */}
    <div className="member-roles-foot">
      <button type="button" className="btn ghost sm" onClick={cancel}>{t("common.cancel")}</button>
      <button type={inline ? "button" : "submit"} className="btn primary sm" aria-busy={busy} onClick={inline ? () => save() : undefined}>{busy ? <Spin/> : <Icon name="check" sm/>} {t("common.save")}</button>
    </div>
  </Root>;
}

// Validação do e-mail ao adicionar uma pessoa (como no login): aparece ao sair do campo ou ao tentar
// adicionar, e some quando fica certo.
export function useEmailCheck(email: string){
  const [touched, setTouched] = useState(false), [tried, setTried] = useState(false);
  // Vazio só reclama depois de tentar adicionar; incompleto reclama ao sair do campo.
  return {bad: touched && (email.trim() ? !validEmail(email) : tried), empty: !email.trim(), blur: () => setTouched(true),
    fail: () => { setTouched(true); setTried(true); }, reset: () => { setTouched(false); setTried(false); }};
}
// Nome, e-mail e nascimento de quem está sendo adicionado, cada um com o rótulo em cima.
export function PersonFields({idp, name, onName, email, onEmail, phone, onPhone, birthday, onBirthday, check}: {idp: string; name: string; onName: (v: string) => void;
  email: string; onEmail: (v: string) => void; phone: string; onPhone: (v: string) => void; birthday: string; onBirthday: (v: string) => void; check: ReturnType<typeof useEmailCheck>}){
  return <>
    <div className="field"><label htmlFor={idp + "-name"}>{t("profile.name")}</label>
      <NameInput className="input" id={idp + "-name"} maxLength={80} autoComplete="off" placeholder={t("people.namePh")} value={name} onValue={onName}/></div>
    <div className="field"><FieldLabel htmlFor={idp + "-email"} required>{t("auth.email")}</FieldLabel>
      <input className="input" id={idp + "-email"} type="email" inputMode="email" autoComplete="off" placeholder={t("people.emailPh")} value={email}
        aria-required="true" aria-invalid={check.bad} aria-describedby={check.bad ? idp + "-email-err" : undefined} onBlur={check.blur} onChange={e => onEmail(e.target.value)}/>
      {check.bad && <span className="field-error" id={idp + "-email-err"}>{t(check.empty ? "auth.needEmail" : "auth.badEmail")}</span>}</div>
    <div className="field phone"><label htmlFor={idp + "-phone"}>{t("profile.phone")}</label>
      <PhoneInput className="input" id={idp + "-phone"} autoComplete="off" maxLength={30} placeholder={t("profile.phonePh")} value={phone} onValue={onPhone}/></div>
    <div className="field birthday"><label htmlFor={idp + "-birthday"}>{t("profile.birthday")}</label>
      <DateInput className="people-birthday" id={idp + "-birthday"} max={today()} clearable value={birthday} onChange={onBirthday}/></div>
  </>;
}

type PeopleOrder = "az" | "new" | "old";
// Busca (por nome ou e-mail) e ordem de uma lista de pessoas: por nome (A–Z), mais recentes ou mais antigos
// primeiro (pela data em que entrou na lista); empate fica por nome. A ordem fica lembrada no aparelho, por lista.
export function usePeopleFilter<T extends {email: string}>(rows: T[] | null, key: string, name: (r: T) => string, since: (r: T) => string){
  const [q, setQState] = useState(""), nq = norm(q.trim()), listRef = useRef<HTMLUListElement>(null);
  // Ao buscar, a lista encolhe e a página ficaria mais curta: o navegador puxaria a rolagem para cima. Enquanto
  // há busca, a lista guarda a altura que tinha antes (min-height) e a tela fica parada.
  const setQ = (v: string) => {
    const ul = listRef.current;
    if(ul) ul.style.minHeight = v.trim() ? (ul.style.minHeight || ul.offsetHeight + "px") : "";
    setQState(v);
  };
  const [order, setOrderState] = useState<PeopleOrder>(() => { try{ const v = localStorage.getItem(key); return v === "new" || v === "old" ? v : "az"; }catch(e){ return "az"; } });
  const setOrder = (v: string) => { setOrderState(v as PeopleOrder); try{ localStorage.setItem(key, v); }catch(e){ /* sem armazenamento: só não lembra */ } };
  const label = (r: T) => name(r) || r.email;
  const byName = (a: T, b: T) => label(a).localeCompare(label(b), undefined, {sensitivity: "base"});
  const sign = order === "new" ? -1 : 1;
  const found = rows && nq ? rows.filter(r => norm(name(r)).includes(nq) || norm(r.email).includes(nq)) : rows;
  const shown = found && [...found].sort((a, b) => order === "az" ? byName(a, b) : sign * since(a).localeCompare(since(b)) || byName(a, b));
  return {q, setQ, nq, order, setOrder, shown, listRef};
}
// Campo de busca e a ordem, na mesma linha.
export function PeopleTools({idp, f}: {idp: string; f: ReturnType<typeof usePeopleFilter<any>>}){
  return <div className="people-tools">
    <div className="search people-search"><Icon name="search" sm/><input type="search" className="input" id={idp + "-q"} placeholder={t("people.searchPh")}
      aria-label={t("people.searchPh")} value={f.q} onChange={e => f.setQ(e.target.value)}/></div>
    <Select id={idp + "-order"} className="people-order" aria={t("people.order")} value={f.order} onChange={f.setOrder}
      options={[{value: "az", label: t("people.orderAz")}, {value: "new", label: t("people.orderNew")}, {value: "old", label: t("people.orderOld")}]}/></div>;
}

// Página Usuários (só admin): todos com acesso ao app, com admin, editar e tirar o acesso. Abre pelo Perfil;
// quem não é admin e chega pelo endereço volta para o Perfil.
export function PeoplePage(){
  const {admin, email} = useAuth();
  useEffect(() => { if(!admin) go("profile", {instant: true}); }, [admin]);
  if(!admin) return null;
  return <section className="view" id="view-people" data-view="people" aria-labelledby="people-h">
    <div className="view-head"><div>
      <button className="back-link" id="people-back" onClick={() => go("profile")}><Icon name="back" sm/><span>{t("profile.title")}</span></button>
      <h1 id="people-h">{t("people.title")}</h1><p className="sub">{t("people.sub")}</p></div></div>
    <People me={email}/>
  </section>;
}

// Card do Perfil do admin que leva à página Usuários: quantos têm acesso (com as fotos dos que entraram por
// último), quantos são admins e quantos ainda estão sem celular ou sem data de nascimento.
function PeopleLink(){
  const [rows, setRows] = useState<Allowed[] | null>(null);
  useEffect(() => { listAllowed().then(r => setRows(r || [])); }, []);
  const recent = rows ? [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];
  const admins = recent.filter(r => r.is_owner || r.is_admin).length;
  const noPhone = recent.filter(r => !(r.profilePhone || r.phone)).length, noBirthday = recent.filter(r => !(r.profileBirthday || r.birthday)).length;
  return <section className="card profile-sec profile-people" id="profile-users" aria-labelledby="profile-users-h">
    <SecHead id="profile-users-h">{t("people.title")}{recent.length > 0 && <span className="count-chip">{recent.length}</span>}</SecHead>
    <p className="sub people-hint">{t("people.hint")}</p>
    {rows === null ? <span className="sub">{t("auth.loading")}</span> : recent.length > 0 && <>
      <span className="scale-people" aria-hidden="true">{recent.slice(0, 8).map(r => <Avatar key={r.email} person={{name: r.profileName || r.name, email: r.email, photo: r.profilePhoto}}/>)}
        {recent.length > 8 && <span className="avatar more">+{recent.length - 8}</span>}</span>
      <ul className="profile-users-stats">
        <li><Icon name="user" sm/> {tn("people.statAdmins", admins)}</li>
        {noPhone > 0 && <li className="warn"><Icon name="phone" sm/> {tn("people.statNoPhone", noPhone)}</li>}
        {noBirthday > 0 && <li className="warn"><Icon name="gift" sm/> {tn("people.statNoBirthday", noBirthday)}</li>}
        {!noPhone && !noBirthday && <li className="ok"><Icon name="check" sm/> {t("people.statComplete")}</li>}
      </ul></>}
    <button type="button" className="btn primary sm" id="profile-people" onClick={() => go("people")}><Icon name="id" sm/> {t("people.see")} <Icon name="chev" sm className="chev-right"/></button>
  </section>;
}

// Gerenciar a pessoa pelo app (dentro da janela de detalhes aberta na página Usuários): admin (só o Dono), editar os
// dados e excluir do app. A regra vale no banco; aqui só se esconde. Quem é Dono só aparece para o próprio Dono.
export const canManageApp = (row: Allowed, me: string, owner: boolean) => !(row.is_owner && row.email !== me && !owner);
export function AppAccess({row, onChanged}: {row: Allowed; onChanged: () => void}){
  const {email: me, owner} = useAuth(), lock = useLock();
  const [admin, setAdmin] = useState(row.is_admin), [busy, setBusy] = useState("");
  const self = row.email === me;
  if(!canManageApp(row, me, owner)) return null;
  // Dar admin é sensível: pede confirmação. Tirar é direto.
  const toggleAdmin = async () => {
    if(!admin && !await confirmDialog({title: t("people.adminGrantTitle"), message: t("people.adminGrantMsg", {email: row.email}), confirm: t("people.adminGrant")})) return;
    lock(async () => {
      setBusy("admin");
      const ok = await setAllowedAdmin(row.email, !admin).finally(() => setBusy(""));
      if(ok){ setAdmin(!admin); onChanged(); } else toast(t("profile.saveFail"));
    });
  };
  const remove = async () => {
    if(!await confirmDialog({title: t("people.removeTitle"), message: t("people.removeMsg", {email: row.email}), confirm: t("people.remove")})) return;
    lock(async () => {
      setBusy("remove");
      const ok = await removeAllowed(row.email).finally(() => setBusy(""));
      if(ok){ toast(t("people.removed", {email: row.email})); onChanged(); loadGroups(); closeDialog("member"); } else toast(t("profile.saveFail"));
    });
  };
  return <div className="field member-access"><SecHead as="span">{t("people.access")}</SecHead>
    {row.created_at && <span className="sub member-access-since">{t("people.since", {date: new Intl.DateTimeFormat(locale(), {day: "numeric", month: "long", year: "numeric"}).format(new Date(row.created_at))})}{!row.joined && " · " + t("people.notJoinedHint")}</span>}
    <div className="member-manage-btns">
      {owner && !self && !row.is_owner && <label className="switch lead boxed people-admin" aria-busy={busy === "admin"}><span>{t("profile.admin")}</span>
        <input type="checkbox" checked={admin} disabled={!!busy} aria-label={t("people.adminAria", {email: row.email})} onChange={toggleAdmin}/></label>}
      {!self && !row.is_owner && <button type="button" className="btn ghost danger" aria-busy={busy === "remove"} disabled={!!busy} onClick={remove}>
        {busy === "remove" ? <Spin/> : <Icon name="trash" sm/>} {t("people.remove")}</button>}
    </div>
  </div>;
}

function People({me}: {me: string}){
  const [rows, setRows] = useState<Allowed[] | null>(null);
  // Busca e ordem da lista "Com acesso".
  const filter = usePeopleFilter(rows, "acordia-people-order", r => r.profileName || r.name, r => r.created_at), {nq, shown} = filter;
  // Falhou: a lista fica vazia com o aviso e o botão de tentar de novo (antes ficava em "Carregando..." para sempre).
  const [failed, setFailed] = useState(false);
  // Quem está em algum grupo (null: não deu para ler, então ninguém é marcado "Sem grupo").
  const [grouped, setGrouped] = useState<Set<string> | null>(null);
  const load = async () => {
    setFailed(false);
    const [r, gr] = await Promise.all([listAllowed(), listGroupedEmails()]);
    setGrouped(gr);
    if(r) setRows(r); else { setRows(rows => rows || []); setFailed(true); }
  };
  useEffect(() => { load(); }, []);
  // Cadastro sem grupo: só entra na lista de acesso (a pessoa pode ser escalada em um grupo depois).
  const [aEmail, setAEmail] = useState(""), [aName, setAName] = useState(""), [aBirthday, setABirthday] = useState(""), [aPhone, setAPhone] = useState(""), [adding, setAdding] = useState(false), lock = useLock(), check = useEmailCheck(aEmail);
  const add = (ev: React.FormEvent) => { ev.preventDefault(); lock(async () => {
    const v = aEmail.trim().toLowerCase();
    if(!validEmail(v)){ check.fail(); document.getElementById("people-add-email")?.focus(); return; }
    // Já tem acesso: addAllowed faria upsert e apagaria o que está marcado (admin); avisa em vez de gravar.
    if(rows?.some(r => r.email === v)) return toast(t("people.alreadyHas", {email: v}));
    setAdding(true); const ok = await addAllowed(v, false, aName, aBirthday, aPhone).finally(() => setAdding(false));
    if(!ok) return toast(t("profile.saveFail"));
    toast(t("people.added", {email: v})); setAEmail(""); setAName(""); setABirthday(""); setAPhone(""); check.reset(); load();
  }); };
  return <div className="card people-card people-page">
    {/* No celular o cadastro começa fechado, para a lista de usuários aparecer logo. */}
    <FoldCard id="people-add-card" title={t("people.addTitle")} defaultOpen={!matchMedia("(max-width: 899px)").matches}>
    <p className="sub">{t("people.addSub")}</p>
    <form className="member-add people-add-box" onSubmit={add} noValidate>
      <div className="people-add">
        <PersonFields idp="people-add" name={aName} onName={setAName} email={aEmail} onEmail={setAEmail} phone={aPhone} onPhone={setAPhone} birthday={aBirthday} onBirthday={setABirthday} check={check}/>
      </div>
      <div className="member-roles-foot">
        <button className="btn primary" aria-busy={adding} disabled={adding}>{adding ? <Spin/> : <Icon name="plus" sm/>} {t("common.add")}</button>
      </div>
    </form>
    </FoldCard>
    <SecHead as="h3" className="people-sub-h">{t("people.listTitle")} {rows && rows.length > 0 && <span className="count-chip">{nq && shown ? shown.length + "/" + rows.length : rows.length}</span>}</SecHead>
    {rows && rows.length > 0 && <PeopleTools idp="people" f={filter}/>}
    {/* Cabeçalho da lista, como numa tabela: marca onde as pessoas começam (no celular, só a faixa). */}
    {shown && shown.length > 0 && <div className="people-list-head" aria-hidden="true"><span>{t("people.colPerson")}</span></div>}
    <ul className="people-list" id="people-list" ref={filter.listRef}>
      {nq && shown && !shown.length && <li className="sub">{t("lib.noResults")}</li>}
      {failed && <li className="sub">{t("profile.loadFail")} <button type="button" className="link-btn" onClick={load}>{t("common.retry")}</button></li>}
      {shown === null ? <li className="sub">{t("auth.loading")}</li> : shown.map(r => {
        const nm = r.profileName || r.name, bd = r.profileBirthday || r.birthday, ph = r.profilePhone || r.phone;
        const noGroup = !!grouped && !grouped.has(r.email);
        const openPerson = () => openDialog("member", {email: r.email, person: {name: nm, phone: ph, birthday: bd || null, photo: r.profilePhoto || ""}, manage: {row: r, onChanged: load, noGroup}});
        return <li key={r.email} className="member-open" onClick={e => { if(!(e.target as HTMLElement).closest(SKIP_OPEN)) openPerson(); }}>
        {/* O "Admin" fica logo depois do nome (ou do e-mail, para quem ainda não tem nome). */}
        {/* Tocar na pessoa (foto ou texto) abre os detalhes, como em Grupo → Membros; o nome é o botão. */}
        <span className="people-who">
          <Avatar person={{name: nm, email: r.email, photo: r.profilePhoto}}/><span className="people-id">
          {/* Sempre as três linhas (nome, e-mail, celular), com um texto apagado no que falta: todas as pessoas
              ficam com a mesma altura. */}
          <span className="people-name"><button type="button" className="member-open-btn" aria-label={t("member.open", {name: nm || r.email})} onClick={openPerson}>
            {nm ? <b>{nm}</b> : <span className="people-missing">{t("people.noName")}</span>}</button>{(r.is_owner || r.is_admin) && <span className={"chip " + (r.is_owner ? "owner" : "accent")}>{t(r.is_owner ? "profile.owner" : "profile.admin")}</span>}{r.email === me && <YouChip/>}</span>
          <span className="copy-row"><span className="sub people-email">{r.email}</span><CopyBtn text={r.email} kind="email"/></span>
          {ph ? <span className="copy-row"><PhoneLink phone={ph}/><CopyBtn text={ph} kind="phone"/></span> :<span className="phone-link people-missing"><Icon name="phone" sm/><span>{t("people.noPhone")}</span></span>}</span></span>
        {/* Situação do acesso e do grupo numa linha própria, na mesma posição dos chips da lista de Membros. */}
        <span className="member-roles">{r.joined ? <span className="chip st-yes">{t("people.joined")}</span> : <span className="chip">{t("people.notJoined")}</span>}{noGroup && <span className="chip st-pending">{t("people.noGroup")}</span>}</span>
        {/* Chevron: indica que a linha inteira abre os detalhes. */}
        <span className="member-open-hint" aria-hidden="true">›</span>
      </li>; })}
    </ul>
  </div>;
}
