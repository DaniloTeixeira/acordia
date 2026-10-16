// Metrônomo: agenda os cliques no relógio do áudio (precisão de amostra) com uma janela de
// antecedência curta, e avisa a interface de cada tempo para acender o indicador.
import { t } from "./i18n.js";

export const SIGNATURES = {"2/4":{beats:2}, "3/4":{beats:3}, "4/4":{beats:4}, "6/8":{beats:6, mid:[3]}};
const TEMPOS = [[45,"Grave"],[60,"Largo"],[66,"Larghetto"],[76,"Adagio"],[108,"Andante"],[120,"Moderato"],[156,"Allegro"],[176,"Vivace"],[200,"Presto"],[Infinity,"Prestissimo"]];
export const MIN_BPM = 30, MAX_BPM = 240;
export const clampBpm = v => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(+v) || 80));
export function tempoName(bpm){ return TEMPOS.find(([max]) => bpm < max)[1]; }
// BPM pelos últimos toques (em ms). Recomeça se o intervalo mudar muito ou passar de 2 s.
export function tapTempo(times){
  const recent = []; for(let i = times.length - 1; i > 0 && recent.length < 6; i--){
    const d = times[i] - times[i-1]; if(d > 2000) break;
    if(recent.length && Math.abs(d - recent[0]) > recent[0] * 0.4) break;
    recent.push(d);
  }
  if(!recent.length) return null;
  return clampBpm(60000 / (recent.reduce((a, b) => a + b, 0) / recent.length));
}

export function createMetronome(audio, initial = {}){
  const st = Object.assign({bpm:80, sig:"4/4", subdiv:1, accent:true}, initial);
  const listeners = new Set(), changes = new Set();
  let timer = null, next = 0, beat = 0, sub = 0;
  function schedule(){
    const now = audio.audioNow(), sig = SIGNATURES[st.sig] || SIGNATURES["4/4"];
    while(next < now + 0.12){
      const kind = sub ? "sub" : beat === 0 ? (st.accent ? "accent" : "beat") : (sig.mid || []).includes(beat) && st.accent ? "mid" : "beat";
      audio.click(kind, next);
      const b = beat, s = sub, delay = Math.max(0, (next - now) * 1000);
      setTimeout(() => listeners.forEach(f => f(b, s)), delay);
      if(++sub >= st.subdiv){ sub = 0; beat = (beat + 1) % sig.beats; }
      next += 60 / st.bpm / st.subdiv;
    }
  }
  const emit = () => changes.forEach(f => f(Object.assign({}, st), !!timer));
  return {
    get state(){ return Object.assign({}, st); },
    get running(){ return !!timer; },
    async start(){
      if(timer) return true;
      if(!(await audio.audioReady())) return false;
      beat = 0; sub = 0; next = audio.audioNow() + 0.06;
      timer = setInterval(schedule, 25); schedule(); emit();
      return true;
    },
    stop(){ if(!timer) return; clearInterval(timer); timer = null; emit(); },
    async toggle(){ if(timer){ this.stop(); return true; } return this.start(); },
    set(opts){
      if(opts.bpm !== undefined) opts.bpm = clampBpm(opts.bpm);
      if(opts.sig && opts.sig !== st.sig){ beat = 0; sub = 0; }
      Object.assign(st, opts); emit();
    },
    onTick(fn){ listeners.add(fn); return () => listeners.delete(fn); },
    onChange(fn){ changes.add(fn); return () => changes.delete(fn); }
  };
}

// Interface. `compact` é a versão do modo palco: só BPM, indicador e iniciar/parar.
export function mountMetronome(root, engine, {compact = false, icon, esc, toast, seg}){
  const taps = [];
  const dots = () => Array.from({length: (SIGNATURES[engine.state.sig] || SIGNATURES["4/4"]).beats}, (_, i) => `<i data-b="${i}"></i>`).join("");
  root.innerHTML = compact ? `
    <div class="metro-mini">
      <button class="icon-btn sm" data-m="minus" aria-label="${esc(t("hands.slower"))}">${icon("minus","sm")}</button>
      <span class="mini-bpm"><b data-m="bpm"></b> bpm</span>
      <button class="icon-btn sm" data-m="plus" aria-label="${esc(t("hands.faster"))}">${icon("plus","sm")}</button>
      <span class="beat-dots" data-m="dots">${dots()}</span>
      <button class="btn primary sm" data-m="toggle"></button>
    </div>` : `
    <div class="card metro">
      <div class="metro-top">
        <button class="icon-btn metro-step" data-m="minus" aria-label="${esc(t("hands.slower"))}">${icon("minus")}</button>
        <div class="metro-read"><b data-m="bpm"></b><small><span>BPM</span> · <span data-m="tempo"></span></small></div>
        <button class="icon-btn metro-step" data-m="plus" aria-label="${esc(t("hands.faster"))}">${icon("plus")}</button>
      </div>
      <input type="range" data-m="range" min="${MIN_BPM}" max="${MAX_BPM}" step="1" aria-label="BPM">
      <div class="beat-dots big" data-m="dots">${dots()}</div>
      <div class="metro-opts">
        <div><span class="lbl">${esc(t("metro.signature"))}</span><div class="seg sm" data-m="sig">${Object.keys(SIGNATURES).map(k => `<button data-v="${k}">${k}</button>`).join("")}</div></div>
        <div><span class="lbl">${esc(t("metro.subdivision"))}</span><div class="seg sm" data-m="subdiv">${[1,2,3,4].map(n => `<button data-v="${n}" aria-label="${esc(t("metro.sub" + n))}" title="${esc(t("metro.sub" + n))}">${["♩","♫","3","4"][n-1]}</button>`).join("")}</div></div>
        <label class="switch lead">${esc(t("metro.accent"))}<input type="checkbox" data-m="accent"></label>
      </div>
      <div class="metro-actions">
        <button class="btn ghost" data-m="tap" data-tip-key="tip.tap">${esc(t("metro.tap"))}</button>
        <button class="btn primary metro-go" data-m="toggle"></button>
      </div>
      <p class="sub">${esc(t("metro.hint"))}</p>
    </div>`;
  const q = k => root.querySelector(`[data-m="${k}"]`);
  const paint = (s, running) => {
    q("bpm").textContent = s.bpm;
    if(q("tempo")) q("tempo").textContent = tempoName(s.bpm);
    if(q("range")) q("range").value = s.bpm;
    if(q("accent")) q("accent").checked = s.accent;
    const tg = q("toggle"); tg.innerHTML = running ? `${icon("x","sm")} ${esc(t("metro.stop"))}` : `${icon("play","sm")} ${esc(t("metro.start"))}`;
    tg.classList.toggle("running", running);
    const d = q("dots"); if(d.children.length !== (SIGNATURES[s.sig] || SIGNATURES["4/4"]).beats) d.innerHTML = dots();
    if(q("sig") && q("sig").setSeg){ q("sig").setSeg(s.sig); q("subdiv").setSeg(String(s.subdiv)); }
  };
  const start = async () => { if(!(await engine.toggle())) toast(t("study.noAudio")); };
  q("toggle").onclick = start;
  q("minus").onclick = () => engine.set({bpm: engine.state.bpm - (compact ? 2 : 1)});
  q("plus").onclick = () => engine.set({bpm: engine.state.bpm + (compact ? 2 : 1)});
  if(!compact){
    q("range").oninput = e => engine.set({bpm: +e.target.value});
    q("accent").onchange = e => engine.set({accent: e.target.checked});
    seg(q("sig"), engine.state.sig, v => engine.set({sig: v}));
    seg(q("subdiv"), String(engine.state.subdiv), v => engine.set({subdiv: +v}));
    q("tap").onclick = () => { taps.push(performance.now()); if(taps.length > 8) taps.shift(); const b = tapTempo(taps); if(b) engine.set({bpm: b}); };
  }
  const offTick = engine.onTick((b, s) => {
    if(s) return;
    const d = q("dots"); if(!d) return;
    [...d.children].forEach((el, i) => { el.classList.toggle("on", i === b); el.classList.toggle("first", i === 0); });
  });
  const offChange = engine.onChange(paint);
  paint(engine.state, engine.running);
  return {
    destroy(){ offTick(); offChange(); },
    key(e){
      if(e.key === " " ){ e.preventDefault(); start(); return true; }
      if(e.key === "ArrowUp" || e.key === "ArrowRight"){ e.preventDefault(); engine.set({bpm: engine.state.bpm + (e.shiftKey ? 10 : 1)}); return true; }
      if(e.key === "ArrowDown" || e.key === "ArrowLeft"){ e.preventDefault(); engine.set({bpm: engine.state.bpm - (e.shiftKey ? 10 : 1)}); return true; }
      if(!compact && e.key.toLowerCase() === "t"){ q("tap").click(); return true; }
      return false;
    }
  };
}
