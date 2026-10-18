// Sincroniza músicas e repertórios com a nuvem (Supabase). O aparelho continua sendo de onde a tela
// lê, e funciona sem internet: cada mudança entra numa fila (guardada nas preferências do aparelho)
// e sobe quando dá. Primeiro baixa o que mudou em outros aparelhos desde a última vez, depois envia a
// fila. Vale a mudança mais recente (regras em syncrules.ts).
import { create } from "zustand";
import { cloud, useAuth } from "./cloud";
import * as store from "./store";
import { decide, qkey, isAutoSetlist, type Queue, type Remote } from "./syncrules";
import type { Song, Medley } from "./types";

export type SyncState = "off" | "idle" | "syncing" | "offline" | "error";
export const useSync = create<{state: SyncState; pending: number; last: number}>(() => ({state: "off", pending: 0, last: 0}));

// Preferências do aparelho: a fila, de quem são os dados guardados aqui e até onde já baixou.
const QUEUE = "syncQueue", OWNER = "syncUser", PULLED = "syncPulledAt";
const TABLE = {s: "songs", m: "medleys"} as const;
let user = "", timer: ReturnType<typeof setTimeout> | undefined, tick: ReturnType<typeof setInterval> | undefined;
let running: Promise<void> | null = null, again = false;

const queue = (): Queue => ({...((store.data.settings[QUEUE] as Queue) || {})});
function saveQueue(q: Queue){ store.setSetting(QUEUE, q); useSync.setState({pending: Object.keys(q).length}); }
const pulled = (): {s: string; m: string} => { const v = store.data.settings[PULLED] as Partial<{s: string; m: string}> | undefined; return {s: v?.s || "", m: v?.m || ""}; };

// Cada mudança feita aqui vai para a fila e sobe logo depois (várias seguidas viram um envio só).
store.watchChanges((kind, id, op) => {
  if(!user) return;
  const q = queue(); q[qkey(kind, id)] = {op, at: Date.now()}; saveQueue(q);
  schedule();
});
function schedule(ms = 1500){ clearTimeout(timer); timer = setTimeout(() => { syncNow(); }, ms); }

// Liga e desliga sozinha conforme a pessoa entra e sai da conta.
export function initSync(){
  const check = () => {
    const {status, profile} = useAuth.getState();
    if(status === "in" && profile && profile.id !== user) startSync(profile.id);
    else if(status !== "in" && user) stopSync();
  };
  useAuth.subscribe(check); check();
}

function startSync(uid: string){
  const owner = (store.data.settings[OWNER] as string) || "";
  if(owner !== uid){
    // Os dados guardados aqui eram de outra conta: saem, e os desta conta descem da nuvem.
    if(owner){ store.wipeLibrary(); saveQueue({}); store.setSetting(PULLED, {s: "", m: ""}); }
    else {
      // Primeiro login neste aparelho: o que já estava salvo aqui sobe para a conta.
      const q: Queue = {};
      store.data.songs.forEach(s => { q[qkey("s", s.id)] = {op: "put", at: s.updatedAt || Date.now()}; });
      store.data.medleys.forEach(m => { if(!isAutoSetlist(m)) q[qkey("m", m.id)] = {op: "put", at: m.updatedAt || Date.now()}; });
      saveQueue(q); store.setSetting(PULLED, {s: "", m: ""});
    }
    store.setSetting(OWNER, uid);
  }
  user = uid;
  useSync.setState({state: "idle", pending: Object.keys(queue()).length});
  addEventListener("online", wake); document.addEventListener("visibilitychange", wake);
  tick = setInterval(() => { if(!document.hidden) syncNow(); }, 120000);
  syncNow();
}
function stopSync(){
  user = ""; clearTimeout(timer); clearInterval(tick);
  removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake);
  useSync.setState({state: "off"});
}
function wake(){ if(!document.hidden) schedule(200); }

// Ao sair da conta: tenta enviar o que falta; devolve quantas mudanças ficaram sem subir.
export async function flushBeforeSignOut(){ if(user) await syncNow(); return Object.keys(queue()).length; }
// Depois de sair: os dados desta conta saem do aparelho (a próxima pessoa não vê nada seu).
export function forgetLocal(){
  stopSync(); store.wipeLibrary(); saveQueue({});
  store.setSetting(OWNER, ""); store.setSetting(PULLED, {s: "", m: ""}); store.setSetting("currentMedley", "");
}

export function syncNow(): Promise<void> {
  if(!user) return Promise.resolve();
  if(running){ again = true; return running; }
  running = (async () => {
    useSync.setState({state: "syncing"});
    try{
      do{ again = false; await pull(); await push(); } while(again);
      useSync.setState({state: "idle", last: Date.now()});
    }catch(e){
      useSync.setState({state: navigator.onLine === false || /fetch|network/i.test(String((e as Error)?.message || e)) ? "offline" : "error"});
    }finally{ running = null; }
  })();
  return running;
}

// Envia a fila em lotes. Só tira da fila o que não mudou de novo durante o envio.
async function push(){
  const q = queue(), keys = Object.keys(q); if(!keys.length) return;
  for(const kind of ["s", "m"] as const){
    const rows = keys.filter(k => k.startsWith(kind + ":")).map(k => {
      const id = k.slice(2), e = q[k], obj = kind === "s" ? store.data.songs.get(id) : store.data.medleys.get(id);
      return e.op === "del" || !obj ? {id, data: null, updated_at: e.at, deleted: true} : {id, data: obj, updated_at: obj.updatedAt || e.at, deleted: false};
    });
    for(let i = 0; i < rows.length; i += 200){
      const {error} = await cloud.rpc("sync_push", {kind: TABLE[kind], rows: rows.slice(i, i + 200)});
      if(error) throw error;
    }
  }
  const now = queue();
  keys.forEach(k => { if(now[k] && now[k].at === q[k].at) delete now[k]; });
  saveQueue(now);
}

// Baixa o que mudou desde a última vez, em páginas, e aplica (músicas antes dos repertórios).
async function pull(){
  const marks = pulled(), first = !marks.s && !marks.m;
  const received = new Set<string>(); let got = 0;
  for(const kind of ["s", "m"] as const){
    for(;;){
      let req = cloud.from(TABLE[kind]).select("id,data,updated_at,deleted,server_at").order("server_at").limit(500);
      if(marks[kind]) req = req.gt("server_at", marks[kind]);
      const {data, error} = await req;
      if(error) throw error;
      const rows = (data || []) as Remote<Song | Medley>[];
      apply(kind, rows); got += rows.length; if(kind === "m") rows.forEach(r => received.add(r.id));
      if(rows.length) marks[kind] = rows[rows.length - 1].server_at;
      if(rows.length < 500) break;
    }
  }
  store.setSetting(PULLED, marks);
  // Aparelho novo que recebeu repertórios da conta: o "Meu repertório" vazio que o app criou aqui
  // (antes de a conta chegar) sai, e não sobe; senão cada aparelho novo deixaria um a mais.
  if(first && got){
    const q = queue(); let changed = false;
    [...store.data.medleys.values()].forEach(m => {
      if(!isAutoSetlist(m) || received.has(m.id) || [...store.data.medleys.values()].every(x => x === m || x.kind === "medley")) return;
      store.removeRemote("m", m.id);
      if(q[qkey("m", m.id)]){ delete q[qkey("m", m.id)]; changed = true; }
      if(store.data.settings.currentMedley === m.id) store.setSetting("currentMedley", "");
    });
    if(changed) saveQueue(q);
  }
}

function apply(kind: "s" | "m", rows: Remote<Song | Medley>[]){
  if(!rows.length) return;
  const map: Map<string, Song | Medley> = kind === "s" ? store.data.songs : store.data.medleys;
  const q = queue(); let changed = false;
  rows.forEach(r => {
    const key = qkey(kind, r.id), local = map.get(r.id), d = decide(r, local?.updatedAt, q[key]);
    if(d === "keep" || d === "skip") return;
    if(q[key]){ delete q[key]; changed = true; }  // a versão da nuvem é mais nova: a daqui não sobe mais
    if(d === "remove") store.removeRemote(kind, r.id);
    else if(r.data) store.putRemote(kind, {...r.data, id: r.id, updatedAt: r.updated_at} as Song | Medley);
  });
  if(changed) saveQueue(q);
}
