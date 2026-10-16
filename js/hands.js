// Independência das mãos: exercícios rítmicos em duas mãos com metrônomo e avaliação de precisão.
// A parte pura (padrões, linha do tempo, pontuação) não usa DOM e é testada no Node.
import { t } from "./i18n.js";

// Posições em tempos (semínimas) dentro de um compasso 4/4.
const range = (step, n = 4) => Array.from({length: Math.round(n / step)}, (_, i) => +(i * step).toFixed(4));
export const PATTERNS = [
  {id:"juntas",      level:1, lh:range(1),           rh:range(1)},
  {id:"alternadas",  level:1, lh:[0, 2],             rh:[1, 3]},
  {id:"minimas",     level:1, lh:[0, 2],             rh:range(1)},
  {id:"colcheias",   level:2, lh:range(1),           rh:range(0.5)},
  {id:"contratempo", level:2, lh:range(1),           rh:[0.5, 1.5, 2.5, 3.5]},
  {id:"baixo",       level:2, lh:[0, 1.5, 2, 3.5],   rh:range(1)},
  {id:"tresillo",    level:3, lh:range(1),           rh:[0, 1.5, 3]},
  {id:"tercinas",    level:3, lh:range(1),           rh:[0, 2/3, 4/3, 2, 8/3, 10/3].map(x => +x.toFixed(4))},
  {id:"tresContra4", level:3, lh:[0, 4/3, 8/3].map(x => +x.toFixed(4)), rh:range(1)},
  {id:"semis",       level:3, lh:range(1),           rh:range(0.25)}
];
export const BARS = 4, COUNT_IN = 4;

// Notas esperadas (em segundos a partir de `start`) para `bars` compassos depois da contagem.
export function timeline(p, bpm, bars = BARS, start = 0){
  const spb = 60 / bpm, out = [];
  for(let b = 0; b < bars; b++) for(const hand of ["lh","rh"]) for(const beat of p[hand])
    out.push({hand, bar:b, beat, t: start + (COUNT_IN + b*4 + beat) * spb});
  return out.sort((a, b) => a.t - b.t);
}
// Tolerância de acerto: 90 ms, ou menos quando as notas ficam muito próximas.
export function tolerance(p, bpm){
  const spb = 60 / bpm;
  const gaps = ["lh","rh"].flatMap(h => p[h].map((x, i, a) => ((a[i+1] ?? (a[0] + 4)) - x) * spb));
  return Math.min(0.09, Math.min(...gaps) * 0.4);
}
// Casa cada toque com a nota esperada mais próxima da mesma mão, dentro da tolerância.
export function scoreTaps(expected, taps, tol){
  const result = {hits:0, misses:0, extras:0, offsets:[], perHand:{lh:{hits:0,total:0}, rh:{hits:0,total:0}}, notes:[]};
  for(const hand of ["lh","rh"]){
    const exp = expected.filter(e => e.hand === hand), tp = taps.filter(x => x.hand === hand).map(x => ({t:x.t, used:false}));
    result.perHand[hand].total = exp.length;
    for(const e of exp){
      let best = null;
      for(const x of tp) if(!x.used && Math.abs(x.t - e.t) <= tol && (!best || Math.abs(x.t - e.t) < Math.abs(best.t - e.t))) best = x;
      if(best){ best.used = true; result.hits++; result.perHand[hand].hits++; result.offsets.push(best.t - e.t); result.notes.push(Object.assign({hit:true, off:best.t - e.t}, e)); }
      else { result.misses++; result.notes.push(Object.assign({hit:false}, e)); }
    }
    result.extras += tp.filter(x => !x.used).length;
  }
  const total = expected.length + result.extras;
  result.accuracy = total ? Math.round(result.hits / total * 100) : 0;
  result.meanOffset = result.offsets.length ? result.offsets.reduce((a, b) => a + b, 0) / result.offsets.length : 0;
  return result;
}

// ---------- interface ----------
export function initHands({root, data, store, toast, icon, esc, audio}){
  const st = Object.assign({id:null, bpm:{}}, data.settings.hands || {});
  const persist = () => store.setSetting("hands", {id:st.id, bpm:st.bpm});
  let run = null, raf = 0;

  const bpmOf = p => st.bpm[p.id] || (p.level === 1 ? 70 : p.level === 2 ? 64 : 56);
  const best = () => data.settings.handsBest || {};
  const levelDots = n => `<span class="dots" aria-label="${esc(t("hands.level", {n}))}">${[1,2,3].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;

  function laneSVG(p, marks){
    const W = 640, H = 110, x0 = 92, w = W - x0 - 12, y = {rh:32, lh:80};
    const X = beat => x0 + beat / 4 * w;
    let s = `<svg class="lanes" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("hands.lanesAria"))}">`;
    s += `<text x="8" y="${y.rh + 4}" class="lane-l">${esc(t("hands.right"))}</text><text x="8" y="${y.lh + 4}" class="lane-l">${esc(t("hands.left"))}</text>`;
    for(let b = 0; b <= 4; b++) s += `<line x1="${X(b)}" x2="${X(b)}" y1="10" y2="${H-8}" class="${b % 4 ? "beat" : "bar"}"/>` + (b < 4 ? `<text x="${X(b) + 4}" y="${H - 1}" class="beat-n">${b + 1}</text>` : "");
    s += `<line x1="${x0}" x2="${x0 + w}" y1="${y.rh}" y2="${y.rh}" class="lane"/><line x1="${x0}" x2="${x0 + w}" y1="${y.lh}" y2="${y.lh}" class="lane"/>`;
    for(const hand of ["rh","lh"]) for(const beat of p[hand]){
      const m = marks && marks[hand + ":" + beat];
      const cls = m === undefined ? "" : m >= 1 ? " ok" : m > 0 ? " part" : " miss";
      s += `<circle cx="${X(beat)}" cy="${y[hand]}" r="${p[hand].length > 8 ? 6 : 9}" class="note ${hand}${cls}" data-k="${hand}:${beat}"/>`;
    }
    s += `<line class="playhead" x1="${x0}" x2="${x0}" y1="8" y2="${H - 10}" style="opacity:0"/></svg>`;
    return s;
  }

  function renderList(){
    stop();
    const b = best();
    root.innerHTML = `
      <div class="hands-intro"><h2>${esc(t("hands.title"))}</h2><p class="sub">${esc(t("hands.intro"))}</p></div>
      <div class="kinds hands-list">${PATTERNS.map(p => `<button class="kind ex" data-id="${p.id}">
        <span class="ex-top"><b>${esc(t("hands.p." + p.id))}</b>${levelDots(p.level)}</span>
        <span>${esc(t("hands.p." + p.id + "D"))}</span>
        ${b[p.id] !== undefined ? `<span class="chip accent">${esc(t("hands.best", {n:b[p.id]}))}</span>` : ""}</button>`).join("")}</div>`;
    root.querySelectorAll(".ex").forEach(el => el.onclick = () => { st.id = el.dataset.id; persist(); renderPractice(); });
  }

  function renderPractice(result){
    const p = PATTERNS.find(x => x.id === st.id); if(!p) return renderList();
    const bpm = bpmOf(p), marks = result && markMap(result);
    root.innerHTML = `
      <button class="btn ghost sm back" id="h-back">${icon("back","sm")} ${esc(t("hands.all"))}</button>
      <div class="card hands-card">
        <div class="scale-head"><div><h2>${esc(t("hands.p." + p.id))} ${levelDots(p.level)}</h2><p class="sub">${esc(t("hands.p." + p.id + "D"))}</p></div></div>
        <div class="lane-wrap">${laneSVG(p, marks)}<div class="hands-count" id="h-count" aria-live="assertive"></div></div>
        <div class="study-row hands-controls">
          <div class="bpm"><button class="icon-btn sm" id="h-slower" aria-label="${esc(t("hands.slower"))}">−</button>
            <label><input type="range" id="h-bpm" min="40" max="160" step="2" value="${bpm}" aria-label="BPM"><span><b id="h-bpm-v">${bpm}</b> bpm</span></label>
            <button class="icon-btn sm" id="h-faster" aria-label="${esc(t("hands.faster"))}">+</button></div>
          <button class="btn soft" id="h-demo">${icon("sound","sm")} ${esc(t("hands.listen"))}</button>
          <button class="btn primary" id="h-start">${icon("play","sm")} ${esc(t(result ? "hands.again" : "hands.start"))}</button>
        </div>
        <div class="pads">
          <button class="pad lh" data-hand="lh"><b>${esc(t("hands.left"))}</b><kbd>F</kbd></button>
          <button class="pad rh" data-hand="rh"><b>${esc(t("hands.right"))}</b><kbd>J</kbd></button>
        </div>
        <p class="sub hands-tip">${esc(t("hands.tip"))}</p>
        <div id="h-result">${result ? resultHTML(p, result) : ""}</div>
      </div>`;
    const range = root.querySelector("#h-bpm"), val = root.querySelector("#h-bpm-v");
    const setBpm = v => { v = Math.max(40, Math.min(160, v)); st.bpm[p.id] = v; range.value = v; val.textContent = v; persist(); };
    range.oninput = () => setBpm(+range.value);
    root.querySelector("#h-slower").onclick = () => setBpm(bpmOf(p) - 4);
    root.querySelector("#h-faster").onclick = () => setBpm(bpmOf(p) + 4);
    root.querySelector("#h-back").onclick = renderList;
    root.querySelector("#h-demo").onclick = () => start(p, true);
    root.querySelector("#h-start").onclick = () => start(p, false);
    root.querySelectorAll(".pad").forEach(b => b.addEventListener("pointerdown", e => { e.preventDefault(); tap(b.dataset.hand); }));
  }
  function markMap(r){
    const m = {};
    r.notes.forEach(n => { const k = n.hand + ":" + n.beat; m[k] = m[k] || {h:0, n:0}; m[k].n++; if(n.hit) m[k].h++; });
    Object.keys(m).forEach(k => m[k] = m[k].h / m[k].n);
    return m;
  }
  function resultHTML(p, r){
    const ms = Math.round(r.meanOffset * 1000);
    const feel = !r.hits ? "" : Math.abs(ms) < 15 ? t("hands.onTime") : ms < 0 ? t("hands.early", {ms:-ms}) : t("hands.late", {ms});
    const pct = h => r.perHand[h].total ? Math.round(r.perHand[h].hits / r.perHand[h].total * 100) : 0;
    const msg = r.accuracy >= 90 ? "great" : r.accuracy >= 70 ? "good" : "try";
    return `<div class="hands-result">
      <div class="big">${r.accuracy}%</div>
      <div class="stats">
        <span><b>${pct("lh")}%</b> ${esc(t("hands.left"))}</span><span><b>${pct("rh")}%</b> ${esc(t("hands.right"))}</span>
        <span><b>${r.misses}</b> ${esc(t("hands.missed"))}</span><span><b>${r.extras}</b> ${esc(t("hands.extra"))}</span>
      </div>
      <p>${esc(feel)} ${esc(t("hands.msg." + msg))}</p>
      ${r.newBest ? `<p class="chip accent">${esc(t("train.newBest"))}</p>` : ""}</div>`;
  }

  // ---------- execução ----------
  async function start(p, demo){
    stop();
    if(!(await audio.audioReady())) return toast(t("study.noAudio"));
    const bpm = bpmOf(p), spb = 60 / bpm, now = audio.audioNow();
    const t0 = now + 0.15, bars = demo ? 2 : BARS;
    const expected = timeline(p, bpm, bars, t0);
    for(let i = 0; i < COUNT_IN + bars * 4; i++) audio.click(i % 4 ? "beat" : "accent", t0 + i * spb);
    if(demo) expected.forEach(e => audio.click(e.hand, e.t));
    run = {p, demo, bpm, spb, t0, bars, expected, taps:[], end: t0 + (COUNT_IN + bars * 4) * spb};
    // Encerra pelo relógio mesmo se a animação ficar pausada (aba em segundo plano).
    run.timer = setTimeout(finish, (run.end + 0.25 - now) * 1000);
    root.querySelector("#h-result").innerHTML = "";
    root.querySelectorAll(".lanes .note").forEach(n => n.classList.remove("ok","part","miss","flash"));
    root.querySelector("#h-start").disabled = true; root.querySelector("#h-demo").disabled = true;
    frame();
  }
  function frame(){
    if(!run) return;
    const now = audio.audioNow(), r = run, svg = root.querySelector(".lanes");
    if(!svg) return stop();
    const el = (now - r.t0) / r.spb, count = root.querySelector("#h-count"), head = svg.querySelector(".playhead");
    if(el < COUNT_IN){ count.textContent = el >= 0 ? String(Math.floor(el) + 1) : ""; head.style.opacity = 0; }
    else {
      count.textContent = "";
      const pos = (el - COUNT_IN) % 4, x = 92 + pos / 4 * (640 - 92 - 12);
      head.setAttribute("x1", x); head.setAttribute("x2", x); head.style.opacity = 1;
      // Acende cada nota quando o cursor passa por ela.
      for(const n of svg.querySelectorAll(".note")){
        const beat = +n.dataset.k.split(":")[1];
        n.classList.toggle("flash", pos >= beat && pos - beat < 0.18);
      }
    }
    if(now >= r.end + 0.2) return finish();
    raf = requestAnimationFrame(frame);
  }
  function tap(hand){
    audio.click(hand);
    const pad = root.querySelector(`.pad.${hand}`); if(pad){ pad.classList.remove("hit"); void pad.offsetWidth; pad.classList.add("hit"); }
    if(run && !run.demo) run.taps.push({hand, t: audio.audioNow()});
  }
  function finish(){
    const r = run; if(!r) return; stop();
    if(r.demo) return renderPractice();
    const res = scoreTaps(r.expected, r.taps, tolerance(r.p, r.bpm));
    const b = Object.assign({}, best());
    if(b[r.p.id] === undefined || res.accuracy > b[r.p.id]){ b[r.p.id] = res.accuracy; store.setSetting("handsBest", b); res.newBest = res.accuracy > 0; }
    renderPractice(res);
    const out = root.querySelector("#h-result"); if(out) out.scrollIntoView({block:"nearest", behavior:"smooth"});
  }
  function stop(){
    cancelAnimationFrame(raf); if(run) clearTimeout(run.timer); run = null;
    const s = root.querySelector("#h-start"), d = root.querySelector("#h-demo");
    if(s) s.disabled = false; if(d) d.disabled = false;
  }
  document.addEventListener("keydown", e => {
    if(root.closest("[hidden]") || root.hidden || !root.querySelector(".pads") || e.repeat || (e.target instanceof Element && e.target.closest("input:not([type=range]),textarea,select"))) return;
    const k = e.key.toLowerCase();
    if(k === "f" || k === "j"){ e.preventDefault(); tap(k === "f" ? "lh" : "rh"); }
  });

  return {
    show(){ if(st.id && PATTERNS.some(p => p.id === st.id)) renderPractice(); else renderList(); },
    hide: stop
  };
}
