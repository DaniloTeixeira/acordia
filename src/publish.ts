// Repertórios da equipe: tudo o que um admin do grupo monta aparece para o grupo sozinho, sem botão de
// compartilhar. A cada mudança (no repertório ou numa música dele) publica a versão nova; excluído ou
// sem músicas, sai do grupo. Para membros comuns o banco responde -1 e nada mais é enviado na sessão.
// Do que já foi publicado guarda só um resumo (por conta, neste aparelho) para não reenviar o igual.
import { cloud, useAuth } from "./lib/cloud";
import * as store from "./lib/store";
import { useSync } from "./lib/sync";
import { encodeMedley } from "./lib/share";
import { loadGroups, useGroups } from "./lib/groups";
import { isMedley, medleyPayload } from "./repertoire";

type Published = Record<string, {s: string; h: string}>;
let user = "", notAdmin = false, timer: ReturnType<typeof setTimeout> | undefined, running = false, again = false;

const KEY = () => "acordia.published." + user;
function load(): Published { try{ return JSON.parse(localStorage.getItem(KEY()) || "{}"); }catch{ return {}; } }
function save(p: Published){ try{ localStorage.setItem(KEY(), JSON.stringify(p)); }catch{ /* sem armazenamento: reenvia na próxima */ } }
// Resumo curto do conteúdo (só para saber se mudou).
function hash(s: string){ let h = 5381; for(let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ":" + s.length; }

export function initPublish(){
  const check = () => {
    const {status, profile} = useAuth.getState();
    if(status === "in" && profile && profile.id !== user){ user = profile.id; notAdmin = false; schedule(3000); }
    else if(status !== "in" && user){ user = ""; clearTimeout(timer); }
  };
  useAuth.subscribe(check); check();
  // Mudança feita aqui: publica logo depois (várias seguidas viram um envio só).
  store.watchChanges((kind, id, op) => {
    if(!user || notAdmin) return;
    if(kind === "m" && op === "del"){ const p = load(), e = p[id]; if(e){ delete p[id]; save(p); unpublish(e.s); } return; }
    schedule();
  });
  // Terminou de sincronizar (o que veio de outro aparelho também conta).
  useSync.subscribe((s, prev) => { if(s.last !== prev.last) schedule(); });
}

function schedule(ms = 2000){ clearTimeout(timer); timer = setTimeout(run, ms); }

async function unpublish(src: string){ await cloud.rpc("unpublish_setlist", {src}); }

async function run(){
  if(!user || notAdmin) return;
  if(running){ again = true; return; }
  running = true;
  let changed = false;
  try{
    do{
      again = false;
      const p = load();
      for(const m of [...store.data.medleys.values()]){
        if(isMedley(m)) continue;
        const payload = medleyPayload(m);
        // Sem músicas com texto: não aparece para a equipe (e sai, se já estava).
        if(!payload.songs.length){
          if(p[m.id]){ await unpublish(p[m.id].s); delete p[m.id]; save(p); changed = true; }
          continue;
        }
        const h = hash(JSON.stringify(payload));
        if(p[m.id]?.h === h) continue;
        const {data, error} = await cloud.rpc("publish_setlist", {src: payload.sourceId, setlist_name: m.name, n: payload.songs.length, setlist_code: await encodeMedley(payload)});
        if(error) return;  // sem internet ou erro: tenta de novo na próxima mudança ou sincronização
        if(data === -1){ notAdmin = true; return; }
        p[m.id] = {s: payload.sourceId, h}; save(p); changed = true;
      }
    } while(again);
  }finally{
    running = false;
    if(changed && useGroups.getState().gid) loadGroups(useGroups.getState().gid);
  }
}
