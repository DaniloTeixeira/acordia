// Conta na nuvem (Supabase): entrar com Google ou com e-mail e senha, o perfil e a lista de quem pode
// entrar. O app só funciona com login: o build precisa das chaves (VITE_SUPABASE_URL e VITE_SUPABASE_KEY).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined, KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
if(!URL || !KEY) throw new Error("Faltam VITE_SUPABASE_URL e VITE_SUPABASE_KEY (ver o README, Conta e nuvem).");
// pkce: o link do e-mail volta com ?code=, sem mexer no #hash que o app usa para as páginas.
export const cloud: SupabaseClient = createClient(URL, KEY, {auth: {flowType: "pkce", persistSession: true, detectSessionInUrl: true}});

export type AuthStatus = "loading" | "out" | "denied" | "in";
// photo: a foto que a pessoa enviou pelo app (bucket avatars) ou, sem ela, a da conta Google (vem com o
// login e é copiada para o perfil, para o grupo ver); vazia em quem entra com e-mail e senha e não enviou.
export interface Profile { id: string; email: string; name: string; birthday?: string | null; photo?: string; phone?: string }
// name/birthday/phone: os informados por quem liberou o acesso; profileName/profileBirthday/profilePhone: os do
// perfil da pessoa (vazios enquanto ela não entrou ou não preencheu). O perfil vale mais.
export interface Allowed { email: string; is_admin: boolean; is_owner: boolean; name: string; birthday: string | null; phone: string; profileName: string; profileBirthday: string | null; profilePhone: string; profilePhoto: string; created_at: string }
// error: o que deu errado na volta do Google ou de um link do e-mail, para a tela de entrar avisar.
// recovery: voltou pelo link de "esqueci minha senha"; a tela pede a senha nova antes de abrir o app.
// errorFrom: de onde veio a volta com erro ("google" ou um link do e-mail); errorDetail: o texto do Supabase.
interface AuthState { status: AuthStatus; email: string; admin: boolean; owner: boolean; profile: Profile | null; error: "" | "notAllowed" | "error"; errorFrom: "" | "google" | "link"; errorDetail: string; recovery: boolean }
export const useAuth = create<AuthState>(() => ({status: "loading", email: "", admin: false, owner: false, profile: null, error: "", errorFrom: "", errorDetail: "", recovery: false}));

// Último "tem acesso?" que deu certo: sem internet, quem já entrou continua usando o app.
const ACCESS = "acordia-access";
function cachedAccess(email: string): {allowed: boolean; admin: boolean; owner?: boolean} | null {
  try{ const v = JSON.parse(localStorage.getItem(ACCESS) || "null"); return v && v.email === email ? v : null; }catch(e){ return null; }
}
function cacheAccess(email: string, a: {allowed: boolean; admin: boolean; owner?: boolean} | null){
  try{ if(a) localStorage.setItem(ACCESS, JSON.stringify({email, ...a})); else localStorage.removeItem(ACCESS); }catch(e){ /* sem armazenamento */ }
}

async function refresh(){
  const {data: {session}} = await cloud.auth.getSession();
  if(!session){ useAuth.setState({status: "out", email: "", admin: false, owner: false, profile: null}); return; }
  const email = (session.user.email || "").toLowerCase();
  const {data, error} = await cloud.rpc("my_access");
  const access = error ? cachedAccess(email) : data as {allowed: boolean; admin: boolean; owner?: boolean};
  // Sem internet e sem resposta guardada: deixa entrar, o banco protege os dados de qualquer jeito.
  const a = access || {allowed: true, admin: false};
  if(!error) cacheAccess(email, a);
  if(!a.allowed){ useAuth.setState({status: "denied", email, admin: false, owner: false, profile: null}); return; }
  setPendingConfirm("");
  let prof = await cloud.from("profiles").select("id,email,name,birthday,phone,photo").eq("id", session.user.id).maybeSingle();
  // Banco ainda sem as colunas do celular ou da data de nascimento (antes da migração subir): lê sem elas.
  if(prof.error) prof = await cloud.from("profiles").select("id,email,name,birthday,photo").eq("id", session.user.id).maybeSingle();
  if(prof.error) prof = await cloud.from("profiles").select("id,email,name").eq("id", session.user.id).maybeSingle();
  const saved = prof.data as Profile | null, google = googlePhoto(session.user.user_metadata);
  // A foto enviada pelo app vale mais que a do Google; sem ela, guarda a do Google no perfil para o grupo ver.
  const photo = ownPhoto(saved?.photo) ? saved!.photo! : google;
  if(google && photo === google && saved?.photo !== google) cloud.from("profiles").update({photo}).eq("id", session.user.id).then(() => {}, () => {});
  // Perfil sem nome: usa o da conta Google, para a lista de quem pode entrar e o grupo mostrarem quem é.
  const gName = googleName(session.user.user_metadata), name = saved?.name || gName;
  if(saved && !saved.name && gName) cloud.from("profiles").update({name}).eq("id", session.user.id).then(() => {}, () => {});
  useAuth.setState({status: "in", email, admin: a.admin, owner: !!a.owner, profile: {...(saved || {id: session.user.id, email, name: ""}), name, photo}});
}

// ---------- foto do perfil ----------
const AVATARS = "avatars";
function googlePhoto(meta: Record<string, unknown> | undefined){
  const pic = String(meta?.avatar_url || meta?.picture || "");
  return /^https:\/\//.test(pic) && pic.length <= 1000 ? pic : "";
}
function googleName(meta: Record<string, unknown> | undefined){
  return String(meta?.full_name || meta?.name || "").trim().slice(0, 80);
}
// Foto que a pessoa enviou pelo app (link público do bucket), e não a do Google.
export const ownPhoto = (url?: string) => !!url && url.startsWith(cloud.storage.from(AVATARS).getPublicUrl("").data.publicUrl);
// Apaga as fotos antigas da pasta, menos a que está em uso (keep).
export async function cleanPhotos(folder: string, keep = ""){
  const {data} = await cloud.storage.from(AVATARS).list(folder);
  const old = (data || []).map(f => folder + "/" + f.name).filter(p => p !== keep);
  if(old.length) await cloud.storage.from(AVATARS).remove(old);
}
// Envia a foto já recortada (quadrada, ver PhotoDialog) para a pasta e grava o link com save(). Cada envio
// tem um nome novo, para o navegador e o grupo não ficarem com a antiga em cache. Deu certo: apaga as antigas.
export async function uploadPhoto(folder: string, img: Blob, save: (url: string) => PromiseLike<{error: unknown}>){
  const path = folder + "/" + Date.now() + ".jpg";
  const up = await cloud.storage.from(AVATARS).upload(path, img, {contentType: "image/jpeg", cacheControl: "31536000", upsert: false});
  if(up.error) return "";
  const url = cloud.storage.from(AVATARS).getPublicUrl(path).data.publicUrl;
  const {error} = await save(url);
  if(error){ cloud.storage.from(AVATARS).remove([path]).then(() => {}, () => {}); return ""; }
  cleanPhotos(folder, path).then(() => {}, () => {});
  return url;
}
// Foto do perfil: a pasta é o id da conta.
export async function savePhoto(img: Blob){
  const p = useAuth.getState().profile; if(!p) return false;
  const photo = await uploadPhoto(p.id, img, url => cloud.from("profiles").update({photo: url}).eq("id", p.id));
  if(photo) useAuth.setState({profile: {...p, photo}});
  return !!photo;
}
// Tira a foto enviada: volta a do Google (quem entra com Google) ou as iniciais.
export async function removePhoto(){
  const p = useAuth.getState().profile; if(!p) return false;
  const {data: {session}} = await cloud.auth.getSession();
  const photo = googlePhoto(session?.user.user_metadata);
  const {error} = await cloud.from("profiles").update({photo}).eq("id", p.id);
  if(error) return false;
  useAuth.setState({profile: {...p, photo}});
  cleanPhotos(p.id).then(() => {}, () => {});
  return true;
}

export async function initAuth(){
  cloud.auth.onAuthStateChange(ev => {
    if(ev === "PASSWORD_RECOVERY") useAuth.setState({recovery: true});
    if(ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "USER_UPDATED") setTimeout(refresh);
  });
  // Volta do Google ou do link do e-mail com erro (ex.: e-mail fora da lista, o banco recusou a conta).
  const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.slice(1));
  const err = q.get("error_description") || h.get("error_description") || q.get("error") || h.get("error");
  // Quem saiu para o Google deixou uma marca: o erro da volta é do Google, não de um link do e-mail.
  let fromGoogle = false;
  try{ fromGoogle = sessionStorage.getItem(OAUTH) === "google"; sessionStorage.removeItem(OAUTH); }catch(e){ /* sem armazenamento */ }
  if(err) useAuth.setState({error: notAllowed(err) ? "notAllowed" : "error", errorFrom: fromGoogle ? "google" : "link", errorDetail: err.replace(/\+/g, " ")});
  // Fim da troca do ?code= pela sessão; error quando o link já foi usado ou expirou.
  const init = await cloud.auth.initialize();
  await refresh();
  // O link de "esqueci minha senha" volta com ?reset=1 (o PKCE não avisa sozinho que é recuperação).
  // Só vale se o link funcionou: quem já estava logado e abre um link velho segue no app, não fica
  // preso na tela de senha nova.
  if(q.has("reset") && q.has("code") && !init.error && useAuth.getState().status !== "out") useAuth.setState({recovery: true});
  // Tira do endereço o ?code=, o ?reset= e os erros da volta, sem mexer no #página.
  if(q.has("code") || q.has("error") || q.has("reset")) history.replaceState(null, "", location.pathname + (h.has("error") ? "" : location.hash));
  else if(h.has("error")) history.replaceState(null, "", location.pathname + location.search);
}
const notAllowed = (msg: string) => /database error|not allowed|signups not allowed/i.test(msg);

// Entrar com o Google: sai para a página do Google e volta para o app já com a sessão.
const OAUTH = "acordia-oauth";
export async function signInWithGoogle(){
  useAuth.setState({error: "", errorFrom: "", errorDetail: ""});
  try{ sessionStorage.setItem(OAUTH, "google"); }catch(e){ /* sem armazenamento */ }
  const {error} = await cloud.auth.signInWithOAuth({provider: "google", options: {redirectTo: location.origin + import.meta.env.BASE_URL, queryParams: {prompt: "select_account"}}});
  return !error;
}

// ---------- e-mail e senha ----------
export { MIN_PASSWORD, validEmail } from "./password";
const home = () => location.origin + import.meta.env.BASE_URL;
const clean = (email: string) => email.trim().toLowerCase();
export async function signIn(email: string, password: string): Promise<"ok" | "badLogin" | "notConfirmed" | "error"> {
  const {error} = await cloud.auth.signInWithPassword({email: clean(email), password});
  if(!error) return "ok";
  return /not confirmed/i.test(error.message) ? "notConfirmed" : /invalid login|invalid credentials/i.test(error.message) ? "badLogin" : "error";
}
// Criar conta: o banco recusa e-mails fora da lista; a conta só vale depois do link de confirmação,
// para ninguém criar a conta com o e-mail de outra pessoa da lista.
// "weak": o Supabase recusou a senha; detail traz a mensagem dele (diz o que falta, ver password.ts).
export async function signUp(email: string, password: string): Promise<{r: "confirm" | "ok" | "notAllowed" | "exists" | "weak" | "error"; detail?: string}> {
  const {data, error} = await cloud.auth.signUp({email: clean(email), password, options: {emailRedirectTo: home()}});
  if(error) return notAllowed(error.message) ? {r: "notAllowed"} : /already registered/i.test(error.message) ? {r: "exists"}
    : /password/i.test(error.message) ? {r: "weak", detail: error.message} : {r: "error"};
  // Conta que já existe: o Supabase responde sem identidades (para não revelar quem tem conta).
  if(data.user && !(data.user.identities || []).length) return {r: "exists"};
  return {r: data.session ? "ok" : "confirm"};
}
// E-mail esperando confirmação, guardado no aparelho: quem sai para o app de e-mail e volta (ou
// recarrega a página) continua vendo o aviso, com o e-mail preenchido. Some ao entrar.
const PENDING = "acordia-confirm";
export function pendingConfirm(){ try{ return localStorage.getItem(PENDING) || ""; }catch(e){ return ""; } }
export function setPendingConfirm(email: string){
  try{ if(email) localStorage.setItem(PENDING, email); else localStorage.removeItem(PENDING); }catch(e){ /* sem armazenamento */ }
}

// Manda de novo o link de confirmação de quem criou a conta e ainda não confirmou.
export async function resendConfirmation(email: string){
  const {error} = await cloud.auth.resend({type: "signup", email: clean(email), options: {emailRedirectTo: home()}});
  return !error;
}
export async function forgotPassword(email: string){
  const {error} = await cloud.auth.resetPasswordForEmail(clean(email), {redirectTo: home() + "?reset=1"});
  return !error;
}
// "" quando deu certo; senão a mensagem do Supabase.
export async function setNewPassword(password: string): Promise<string> {
  const {error} = await cloud.auth.updateUser({password});
  if(!error) useAuth.setState({recovery: false});
  return error ? error.message || "error" : "";
}
export async function signOut(){
  cacheAccess("", null);
  await cloud.auth.signOut();
  useAuth.setState({status: "out", email: "", admin: false, owner: false, profile: null, recovery: false});
}
export async function saveName(name: string){
  const p = useAuth.getState().profile; if(!p) return false;
  const {error} = await cloud.from("profiles").update({name: name.trim().slice(0, 80)}).eq("id", p.id);
  if(!error) useAuth.setState({profile: {...p, name: name.trim().slice(0, 80)}});
  return !error;
}

// Data de nascimento: "AAAA-MM-DD" válida e no passado, senão vazio.
export function validBirthday(v: string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v || "")) return "";
  const d = new Date(v + "T00:00:00Z");
  return !isNaN(+d) && d.toISOString().slice(0, 10) === v && d.getUTCFullYear() >= 1900 && +d <= Date.now() ? v : "";
}
export async function saveBirthday(v: string){
  const p = useAuth.getState().profile; if(!p) return false;
  const b = validBirthday(v) || null;
  const {error} = await cloud.from("profiles").update({birthday: b}).eq("id", p.id);
  if(!error) useAuth.setState({profile: {...p, birthday: b}});
  return !error;
}

// Celular: só dígitos, espaço, +, parênteses e hífen, até 30 caracteres.
export const cleanPhone = (v: string) => (v || "").replace(/[^\d+()\- ]/g, "").replace(/\s+/g, " ").trim().slice(0, 30);
export async function savePhone(v: string){
  const p = useAuth.getState().profile; if(!p) return false;
  const ph = cleanPhone(v);
  const {error} = await cloud.from("profiles").update({phone: ph}).eq("id", p.id);
  if(!error) useAuth.setState({profile: {...p, phone: ph}});
  return !error;
}

// ---------- lista de quem pode entrar (só admins) ----------
export async function listAllowed(): Promise<Allowed[] | null> {
  let [a, p]: {data: unknown; error: unknown}[] = await Promise.all([cloud.from("allowed_emails").select("email,is_admin,is_owner,name,birthday,phone,created_at").order("email"),
    cloud.from("profiles").select("email,name,birthday,phone,photo")]);
  // Banco ainda sem as colunas do celular, do nome ou da data (antes da migração subir): lê sem elas.
  if(p.error) p = await cloud.from("profiles").select("email,name,birthday,phone");
  // Banco ainda sem o Dono: lê sem ele.
  if(a.error) a = await cloud.from("allowed_emails").select("email,is_admin,name,birthday,phone,created_at").order("email");
  if(a.error) a = await cloud.from("allowed_emails").select("email,is_admin,name,birthday,created_at").order("email");
  if(p.error) p = await cloud.from("profiles").select("email,name,birthday");
  if(a.error) a = await cloud.from("allowed_emails").select("email,is_admin,created_at").order("email");
  if(p.error) p = await cloud.from("profiles").select("email,name");
  if(a.error || p.error) return null;
  const prof = new Map((p.data as {email: string; name: string; birthday: string | null; phone?: string; photo?: string}[]).map(x => [x.email, x]));
  return (a.data as Partial<Allowed>[]).map(r => ({email: r.email!, is_admin: !!r.is_admin, is_owner: !!r.is_owner, name: r.name || "", birthday: r.birthday || null, phone: r.phone || "",
    profileName: prof.get(r.email!)?.name || "", profileBirthday: prof.get(r.email!)?.birthday || null, profilePhone: prof.get(r.email!)?.phone || "",
    profilePhoto: prof.get(r.email!)?.photo || "", created_at: r.created_at || ""}));
}
// Nome, data e celular vazios não vão juntos, para não apagar o que já estava na lista.
export async function addAllowed(email: string, admin: boolean, name = "", birthday = "", phone = ""){
  const n = name.trim().slice(0, 80), b = validBirthday(birthday), ph = cleanPhone(phone);
  const row = {email: email.trim().toLowerCase(), is_admin: admin}, info = {...(n ? {name: n} : {}), ...(b ? {birthday: b} : {})};
  let {error} = await cloud.from("allowed_emails").upsert({...row, ...info, ...(ph ? {phone: ph} : {})});
  // Banco ainda sem a coluna do celular, ou sem as de nome e data (antes da migração subir): inclui o que der.
  if(error && ph) ({error} = await cloud.from("allowed_emails").upsert({...row, ...info}));
  if(error && (n || b)) ({error} = await cloud.from("allowed_emails").upsert(row));
  return !error;
}
// Nome e data de quem já está na lista. Chegam ao perfil só se a pessoa ainda não preencheu.
export async function setAllowedInfo(email: string, name: string, birthday: string, phone?: string){
  const info = {name: name.trim().slice(0, 80), birthday: validBirthday(birthday) || null};
  let {error} = await cloud.from("allowed_emails").update(phone === undefined ? info : {...info, phone: cleanPhone(phone)}).eq("email", email);
  // Banco ainda sem a coluna do celular: salva o resto.
  if(error && phone !== undefined) ({error} = await cloud.from("allowed_emails").update(info).eq("email", email));
  return !error;
}
// Admin: nome e celular valem também por cima do que a pessoa preencheu no perfil (admin_set_person). Banco ainda
// sem a função: false, e quem chama volta ao setAllowedInfo (só a lista de acesso).
export async function setPersonInfo(email: string, name: string, phone: string, birthday: string){
  const {error} = await cloud.rpc("admin_set_person", {person_email: email, person_name: name, person_phone: cleanPhone(phone), person_birthday: validBirthday(birthday) || null});
  return !error;
}
export async function setAllowedAdmin(email: string, admin: boolean){
  const {error} = await cloud.from("allowed_emails").update({is_admin: admin}).eq("email", email);
  return !error;
}
export async function removeAllowed(email: string){
  const {error} = await cloud.from("allowed_emails").delete().eq("email", email);
  return !error;
}
export function initials(p: {name: string; email: string} | null){
  if(!p) return "";
  const words = (p.name || p.email.split("@")[0]).trim().split(/[\s._-]+/).filter(Boolean);
  return ((words[0] || "")[0] + (words.length > 1 ? words[words.length - 1][0] : (words[0] || "")[1] || "")).toUpperCase();
}
