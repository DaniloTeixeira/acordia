// Armazenamento no IndexedDB (músicas, medleys e preferências), com cópia em memória para leitura
// síncrona pela interface. Cada mudança avisa os inscritos (a interface redesenha) e a gravação no
// banco é agrupada por registro, para digitar numa música não gravar a cada tecla.
import { sanitizeOptions, songTitle, DEFAULT_OPTIONS } from "./core";
import { t } from "./i18n";
import type { Song, Medley, Item, SongItem, MedleyItem, Options, Settings } from "./types";

const DB_NAME = "acordia", DB_VERSION = 1, STORES = ["songs","medleys","settings"] as const;
type StoreName = typeof STORES[number];
export const data = {songs: new Map<string, Song>(), medleys: new Map<string, Medley>(), settings: {} as Settings};
let db: IDBDatabase | null = null, onError: (e: unknown) => void = () => {};

export const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2,7);

// ---------- avisos de mudança ----------
let version = 0;
const listeners = new Set<() => void>();
export function subscribe(fn: () => void){ listeners.add(fn); return () => { listeners.delete(fn); }; }
export const getVersion = () => version;
// Várias mudanças seguidas viram um só aviso (e nenhuma acontece no meio de um desenho do React).
let queued = false;
export function touch(){
  version++;
  if(queued) return; queued = true;
  queueMicrotask(() => { queued = false; listeners.forEach(fn => fn()); });
}
// Aviso imediato, para redesenhar dentro de uma transição animada (com flushSync).
export function touchNow(){ version++; listeners.forEach(fn => fn()); }

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej)=>{
    if(!("indexedDB" in self)) return rej(new Error("sem IndexedDB"));
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => STORES.forEach(s=>{ if(!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, {keyPath: s === "settings" ? "key" : "id"}); });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error("bloqueado"));
  });
}
function all<T>(store: StoreName): Promise<T[]> {
  return new Promise((res, rej)=>{ const q = db!.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
function write(store: StoreName, fn: (st: IDBObjectStore) => void): Promise<void> {
  if(!db) return Promise.resolve();
  return new Promise<void>((res, rej)=>{
    const tx = db!.transaction(store, "readwrite"); fn(tx.objectStore(store));
    tx.oncomplete = () => res(); tx.onerror = () => { onError(tx.error); rej(tx.error); }; tx.onabort = () => { onError(tx.error); rej(tx.error); };
  }).catch(()=>{});
}
// Gravações pendentes por registro: a última versão vence.
const pending = new Map<string, {timer: ReturnType<typeof setTimeout>; run: () => void}>();
function later(key: string, run: () => void, ms = 300){
  const p = pending.get(key); if(p) clearTimeout(p.timer);
  pending.set(key, {timer: setTimeout(() => { pending.delete(key); run(); }, ms), run});
}
function cancel(key: string){ const p = pending.get(key); if(p){ clearTimeout(p.timer); pending.delete(key); } }
// Grava agora tudo o que estava esperando (ao sair da página).
export function flush(){ [...pending.values()].forEach(p => { clearTimeout(p.timer); p.run(); }); pending.clear(); }

export async function init(errorHandler?: (e: unknown) => void){
  if(errorHandler) onError = errorHandler;
  try{
    db = await openDB();
    const [songs, medleys, settings] = await Promise.all([all<Song>("songs"), all<Medley>("medleys"), all<{key: string; value: unknown}>("settings")]);
    songs.forEach(s=>data.songs.set(s.id, s));
    medleys.forEach(m=>data.medleys.set(m.id, m));
    settings.forEach(s=>{ data.settings[s.key] = s.value; });
  }catch(e){
    db = null; onError(e);
  }
  cleanup();
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
  touch();
  return !!db;
}
export const persistent = () => !!db;

// Quem quer saber de cada mudança feita aqui (a sincronização com a nuvem põe na fila de envio).
type Change = (kind: "s" | "m", id: string, op: "put" | "del") => void;
// Quem acompanha as mudanças feitas aqui (a sincronização e a publicação no grupo).
const changeFns = new Set<Change>();
export function watchChanges(fn: Change){ changeFns.add(fn); return () => { changeFns.delete(fn); }; }
const changed: Change = (kind, id, op) => changeFns.forEach(f => f(kind, id, op));

// Salvar atualiza a memória na hora (a interface já mostra) e grava no banco logo depois.
export function saveSong(s: Song){ s.updatedAt = Date.now(); data.songs.set(s.id, s); later("s:" + s.id, () => write("songs", st=>st.put(s))); touch(); changed("s", s.id, "put"); }
export function deleteSong(id: string){ cancel("s:" + id); data.songs.delete(id); write("songs", st=>st.delete(id)); touch(); changed("s", id, "del"); }
export function saveMedley(m: Medley){ m.updatedAt = Date.now(); data.medleys.set(m.id, m); later("m:" + m.id, () => write("medleys", st=>st.put(m))); touch(); changed("m", m.id, "put"); }
export function deleteMedley(id: string){ cancel("m:" + id); data.medleys.delete(id); write("medleys", st=>st.delete(id)); touch(); changed("m", id, "del"); }

// ---------- o que vem da nuvem ----------
// Grava a versão de outro aparelho como está (sem mudar a hora nem voltar para a fila de envio).
export function putRemote(kind: "s" | "m", obj: Song | Medley){
  if(kind === "s"){ cancel("s:" + obj.id); data.songs.set(obj.id, obj as Song); write("songs", st=>st.put(obj)); }
  else { cancel("m:" + obj.id); data.medleys.set(obj.id, obj as Medley); write("medleys", st=>st.put(obj)); }
  touch();
}
export function removeRemote(kind: "s" | "m", id: string){
  if(kind === "s"){ cancel("s:" + id); data.songs.delete(id); write("songs", st=>st.delete(id)); }
  else { cancel("m:" + id); data.medleys.delete(id); write("medleys", st=>st.delete(id)); }
  touch();
}
// Apaga as músicas e os repertórios deste aparelho (ao sair da conta, ou ao entrar outra pessoa).
export function wipeLibrary(){
  [...pending.keys()].filter(k => !k.startsWith("k:")).forEach(cancel);
  data.songs.clear(); data.medleys.clear();
  write("songs", st=>st.clear()); write("medleys", st=>st.clear());
  touch();
}
export function setSetting(key: string, value: unknown){ data.settings[key] = value; later("k:" + key, () => write("settings", st=>st.put({key, value})), 150); touch(); }
export function setting<T>(key: string, fallback: T): T { const v = data.settings[key]; return v === undefined || v === null ? fallback : v as T; }

export function createSong(fields: Partial<Song> = {}): Song {
  const s: Song = Object.assign({id:newId("s"), title:"", text:"", type:"" as const, key:"", bpm:"", createdAt:Date.now()}, fields);
  s.title = songTitle(s.text) || s.title;
  saveSong(s); return s;
}
export function createMedley(name: string, items: Item[] = [], options: Options = DEFAULT_OPTIONS, kind: Medley["kind"] = "setlist"): Medley {
  const m: Medley = {id:newId("m"), kind: kind === "medley" ? "medley" : "setlist", name: name || t("medley.defaultName"), items, options: sanitizeOptions(options), createdAt:Date.now()};
  saveMedley(m); return m;
}
export const newItem = (songId: string, extra: Partial<SongItem> | null = {}): SongItem => Object.assign({id:newId("i"), type:"song" as const, songId, arrangementId:"", target:"", capo:"", singer:"", notes:""}, extra);
export const newMedleyItem = (medleyId: string): MedleyItem => ({id:newId("i"), type:"medley", medleyId});

// Músicas vazias que nenhum medley usa são rascunhos abandonados.
function cleanup(){
  const used = new Set([...data.medleys.values()].flatMap(m=>m.items.map(i=>i.type === "medley" ? "" : i.songId)));
  [...data.songs.values()].forEach(s=>{ if(!s.text.trim() && !used.has(s.id)) deleteSong(s.id); });
}
