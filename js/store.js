// Armazenamento no IndexedDB (músicas, medleys e preferências), com cópia em memória para leitura
// síncrona pela interface. Na primeira vez, migra os dados da versão antiga (localStorage).
import { sanitizeEntry, sanitizeOptions, songTitle, DEFAULT_OPTIONS } from "./core.js";
import { t } from "./i18n.js";

const DB_NAME = "medley-generator", DB_VERSION = 1, STORES = ["songs","medleys","settings"];
export const data = {songs: new Map(), medleys: new Map(), settings: {}};
let db = null, onError = () => {};

export const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2,7);

function openDB(){
  return new Promise((res, rej)=>{
    if(!("indexedDB" in self)) return rej(new Error("sem IndexedDB"));
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => STORES.forEach(s=>{ if(!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, {keyPath: s === "settings" ? "key" : "id"}); });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error("bloqueado"));
  });
}
function all(store){
  return new Promise((res, rej)=>{ const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
function write(store, fn){
  if(!db) return Promise.resolve();
  return new Promise((res, rej)=>{
    const tx = db.transaction(store, "readwrite"); fn(tx.objectStore(store));
    tx.oncomplete = () => res(); tx.onerror = () => { onError(tx.error); rej(tx.error); }; tx.onabort = () => { onError(tx.error); rej(tx.error); };
  }).catch(()=>{});
}

export async function init(errorHandler){
  if(errorHandler) onError = errorHandler;
  try{
    db = await openDB();
    const [songs, medleys, settings] = await Promise.all(STORES.map(all));
    songs.forEach(s=>data.songs.set(s.id, s));
    medleys.forEach(m=>data.medleys.set(m.id, m));
    settings.forEach(s=>{ data.settings[s.key] = s.value; });
  }catch(e){
    db = null; onError(e);
  }
  if(!data.settings.migrated){ await migrateLegacy(); setSetting("migrated", true); }
  cleanup();
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
  return !!db;
}
export const persistent = () => !!db;

export function saveSong(s){ s.updatedAt = Date.now(); data.songs.set(s.id, s); return write("songs", st=>st.put(s)); }
export function deleteSong(id){ data.songs.delete(id); return write("songs", st=>st.delete(id)); }
export function saveMedley(m){ m.updatedAt = Date.now(); data.medleys.set(m.id, m); return write("medleys", st=>st.put(m)); }
export function deleteMedley(id){ data.medleys.delete(id); return write("medleys", st=>st.delete(id)); }
export function setSetting(key, value){ data.settings[key] = value; return write("settings", st=>st.put({key, value})); }

export function createSong(fields = {}){
  const s = Object.assign({id:newId("s"), title:"", text:"", type:"", key:"", bpm:"", createdAt:Date.now()}, fields);
  s.title = songTitle(s.text) || s.title;
  saveSong(s); return s;
}
export function createMedley(name, items = [], options = DEFAULT_OPTIONS){
  const m = {id:newId("m"), name: name || t("medley.defaultName"), items, options: sanitizeOptions(options), createdAt:Date.now()};
  saveMedley(m); return m;
}
export const newItem = (songId, extra = {}) => Object.assign({id:newId("i"), songId, target:"", capo:"", singer:"", notes:""}, extra);

// Músicas vazias que nenhum medley usa são rascunhos abandonados.
function cleanup(){
  const used = new Set([...data.medleys.values()].flatMap(m=>m.items.map(i=>i.songId)));
  [...data.songs.values()].forEach(s=>{ if(!s.text.trim() && !used.has(s.id)) deleteSong(s.id); });
}

async function migrateLegacy(){
  let lib = [], state = null;
  try{ lib = JSON.parse(localStorage.getItem("folha-biblioteca-v1") || "[]"); }catch(e){}
  try{ state = JSON.parse(localStorage.getItem("folha-cifras-v1") || "null"); }catch(e){}
  if(!Array.isArray(lib)) lib = [];
  const byOld = new Map();
  lib.forEach(raw=>{
    const e = sanitizeEntry(raw); if(!e) return;
    const s = createSong({title:e.title, text:e.text, type:e.type, key:e.key, bpm:e.bpm});
    if(e.id) byOld.set(e.id, s);
  });
  if(state && Array.isArray(state.songs) && state.songs.some(t=>typeof t === "string" && t.trim())){
    const at = (a, i) => Array.isArray(a) && typeof a[i] === "string" ? a[i] : "";
    const items = [];
    state.songs.forEach((text, i)=>{
      if(typeof text !== "string" || !text.trim()) return;
      let s = byOld.get(at(state.libIds, i));
      if(!s) s = createSong({text, type: at(state.types, i) === "letra" ? "letra" : "", key: at(state.keys, i)});
      items.push(newItem(s.id, {target: at(state.targets, i)}));
    });
    const m = createMedley(t("medley.defaultName"), items, Object.assign({}, DEFAULT_OPTIONS, {dedupe: state.dedupe !== false}));
    setSetting("currentMedley", m.id);
  }
}
