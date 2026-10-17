// Conta na nuvem (Supabase): entrar com Google ou com e-mail e senha, o perfil e a lista de quem pode
// entrar. Sem as chaves no build (VITE_SUPABASE_URL e VITE_SUPABASE_KEY), o app fica como antes:
// sem login, tudo só no aparelho.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined, KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
// pkce: o link do e-mail volta com ?code=, sem mexer no #hash que o app usa para as páginas.
export const cloud: SupabaseClient | null = URL && KEY ? createClient(URL, KEY, {auth: {flowType: "pkce", persistSession: true, detectSessionInUrl: true}}) : null;

export type AuthStatus = "off" | "loading" | "out" | "denied" | "in";
export interface Profile { id: string; email: string; name: string }
export interface Allowed { email: string; is_admin: boolean }
// error: o que deu errado na volta do Google ou de um link do e-mail, para a tela de entrar avisar.
// recovery: voltou pelo link de "esqueci minha senha"; a tela pede a senha nova antes de abrir o app.
interface AuthState { status: AuthStatus; email: string; admin: boolean; profile: Profile | null; error: "" | "notAllowed" | "error"; recovery: boolean }
export const useAuth = create<AuthState>(() => ({status: cloud ? "loading" : "off", email: "", admin: false, profile: null, error: "", recovery: false}));

// Último "tem acesso?" que deu certo: sem internet, quem já entrou continua usando o app.
const ACCESS = "acordia-access";
function cachedAccess(email: string): {allowed: boolean; admin: boolean} | null {
  try{ const v = JSON.parse(localStorage.getItem(ACCESS) || "null"); return v && v.email === email ? v : null; }catch(e){ return null; }
}
function cacheAccess(email: string, a: {allowed: boolean; admin: boolean} | null){
  try{ if(a) localStorage.setItem(ACCESS, JSON.stringify({email, ...a})); else localStorage.removeItem(ACCESS); }catch(e){ /* sem armazenamento */ }
}

async function refresh(){
  if(!cloud) return;
  const {data: {session}} = await cloud.auth.getSession();
  if(!session){ useAuth.setState({status: "out", email: "", admin: false, profile: null}); return; }
  const email = (session.user.email || "").toLowerCase();
  const {data, error} = await cloud.rpc("my_access");
  const access = error ? cachedAccess(email) : data as {allowed: boolean; admin: boolean};
  // Sem internet e sem resposta guardada: deixa entrar, o banco protege os dados de qualquer jeito.
  const a = access || {allowed: true, admin: false};
  if(!error) cacheAccess(email, a);
  if(!a.allowed){ useAuth.setState({status: "denied", email, admin: false, profile: null}); return; }
  const prof = await cloud.from("profiles").select("id,email,name").eq("id", session.user.id).maybeSingle();
  useAuth.setState({status: "in", email, admin: a.admin, profile: (prof.data as Profile | null) || {id: session.user.id, email, name: ""}});
}

export async function initAuth(){
  if(!cloud) return;
  cloud.auth.onAuthStateChange(ev => {
    if(ev === "PASSWORD_RECOVERY") useAuth.setState({recovery: true});
    if(ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "USER_UPDATED") setTimeout(refresh);
  });
  // Volta do Google ou do link do e-mail com erro (ex.: e-mail fora da lista, o banco recusou a conta).
  const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.slice(1));
  const err = q.get("error_description") || h.get("error_description") || q.get("error") || h.get("error");
  if(err) useAuth.setState({error: notAllowed(err) ? "notAllowed" : "error"});
  await refresh();
  // O link de "esqueci minha senha" volta com ?reset=1 (o PKCE não avisa sozinho que é recuperação).
  if(q.has("reset") && q.has("code") && useAuth.getState().status !== "out") useAuth.setState({recovery: true});
  // Tira do endereço o ?code=, o ?reset= e os erros da volta, sem mexer no #página.
  if(q.has("code") || q.has("error") || q.has("reset")) history.replaceState(null, "", location.pathname + (h.has("error") ? "" : location.hash));
  else if(h.has("error")) history.replaceState(null, "", location.pathname + location.search);
}
const notAllowed = (msg: string) => /database error|not allowed|signups not allowed/i.test(msg);

// Entrar com o Google: sai para a página do Google e volta para o app já com a sessão.
export async function signInWithGoogle(){
  if(!cloud) return false;
  useAuth.setState({error: ""});
  const {error} = await cloud.auth.signInWithOAuth({provider: "google", options: {redirectTo: location.origin + import.meta.env.BASE_URL, queryParams: {prompt: "select_account"}}});
  return !error;
}

// ---------- e-mail e senha ----------
export const MIN_PASSWORD = 8;
const home = () => location.origin + import.meta.env.BASE_URL;
const clean = (email: string) => email.trim().toLowerCase();
export async function signIn(email: string, password: string): Promise<"ok" | "badLogin" | "notConfirmed" | "error"> {
  if(!cloud) return "error";
  const {error} = await cloud.auth.signInWithPassword({email: clean(email), password});
  if(!error) return "ok";
  return /not confirmed/i.test(error.message) ? "notConfirmed" : /invalid login|invalid credentials/i.test(error.message) ? "badLogin" : "error";
}
// Criar conta: o banco recusa e-mails fora da lista; a conta só vale depois do link de confirmação,
// para ninguém criar a conta com o e-mail de outra pessoa da lista.
export async function signUp(email: string, password: string): Promise<"confirm" | "ok" | "notAllowed" | "exists" | "weak" | "error"> {
  if(!cloud) return "error";
  const {data, error} = await cloud.auth.signUp({email: clean(email), password, options: {emailRedirectTo: home()}});
  if(error) return notAllowed(error.message) ? "notAllowed" : /already registered/i.test(error.message) ? "exists" : /password/i.test(error.message) ? "weak" : "error";
  // Conta que já existe: o Supabase responde sem identidades (para não revelar quem tem conta).
  if(data.user && !(data.user.identities || []).length) return "exists";
  return data.session ? "ok" : "confirm";
}
export async function forgotPassword(email: string){
  if(!cloud) return false;
  const {error} = await cloud.auth.resetPasswordForEmail(clean(email), {redirectTo: home() + "?reset=1"});
  return !error;
}
export async function setNewPassword(password: string){
  if(!cloud) return false;
  const {error} = await cloud.auth.updateUser({password});
  if(!error) useAuth.setState({recovery: false});
  return !error;
}
export async function signOut(){
  if(!cloud) return;
  cacheAccess("", null);
  await cloud.auth.signOut();
  useAuth.setState({status: "out", email: "", admin: false, profile: null, recovery: false});
}
export async function saveName(name: string){
  const p = useAuth.getState().profile; if(!cloud || !p) return false;
  const {error} = await cloud.from("profiles").update({name: name.trim().slice(0, 80)}).eq("id", p.id);
  if(!error) useAuth.setState({profile: {...p, name: name.trim().slice(0, 80)}});
  return !error;
}

// ---------- lista de quem pode entrar (só admins) ----------
export async function listAllowed(): Promise<Allowed[] | null> {
  if(!cloud) return null;
  const {data, error} = await cloud.from("allowed_emails").select("email,is_admin").order("email");
  return error ? null : data as Allowed[];
}
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
export async function addAllowed(email: string, admin: boolean){
  if(!cloud) return false;
  const {error} = await cloud.from("allowed_emails").upsert({email: email.trim().toLowerCase(), is_admin: admin});
  return !error;
}
export async function setAllowedAdmin(email: string, admin: boolean){
  if(!cloud) return false;
  const {error} = await cloud.from("allowed_emails").update({is_admin: admin}).eq("email", email);
  return !error;
}
export async function removeAllowed(email: string){
  if(!cloud) return false;
  const {error} = await cloud.from("allowed_emails").delete().eq("email", email);
  return !error;
}
export function initials(p: {name: string; email: string} | null){
  if(!p) return "";
  const words = (p.name || p.email.split("@")[0]).trim().split(/[\s._-]+/).filter(Boolean);
  return ((words[0] || "")[0] + (words.length > 1 ? words[words.length - 1][0] : (words[0] || "")[1] || "")).toUpperCase();
}
