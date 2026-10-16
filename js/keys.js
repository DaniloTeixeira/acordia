// Exercícios de teclado: técnica para as duas mãos, em qualquer tom, com dedilhado.
// A parte pura (exercícios, transposição, passos e avaliação) não usa DOM e é testada no Node.
import { spellScale, rootFor, NOTES } from "./core.js";
import { t } from "./i18n.js";

const MAJOR = [0,2,4,5,7,9,11];
// Grau da escala maior (0 = tônica, pode passar de 7 ou ficar negativo) -> semitons.
export const degSemis = d => MAJOR[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);

// Cada evento: [tempo inicial, duração, graus, dedos]. Compasso 4/4; mão direita a partir do C4, esquerda do C3.
const seq = (degs, fingers, dur = 1, start = 0) => degs.map((d, i) => [start + i * dur, dur, [d], [fingers[i]]]);
const blocks = (chords, fingers, dur, start = 0) => chords.map((c, i) => [start + i * dur, dur, c, fingers[i] || fingers[0]]);
const hanonBar = (k) => [0,2,3,4,5,4,3,2].map(d => d + k);
export const KEY_EXERCISES = [
  {id:"cinco", level:1, bars:2,
    rh: seq([0,1,2,3,4,3,2,1], [1,2,3,4,5,4,3,2]),
    lh: seq([0,1,2,3,4,3,2,1], [5,4,3,2,1,2,3,4])},
  {id:"contrario", level:1, bars:2,
    rh: seq([0,1,2,3,4,3,2,1], [1,2,3,4,5,4,3,2]),
    lh: seq([7,6,5,4,3,4,5,6].map(d => d - 7), [1,2,3,4,5,4,3,2])},
  {id:"escala", level:2, bars:4, fingerKeys:["C","G","D","A","E"],
    rh: seq([0,1,2,3,4,5,6,7,7,6,5,4,3,2,1,0], [1,2,3,1,2,3,4,5,5,4,3,2,1,3,2,1]),
    lh: seq([0,1,2,3,4,5,6,7,7,6,5,4,3,2,1,0], [5,4,3,2,1,3,2,1,1,2,3,1,2,3,4,5])},
  {id:"arpejo", level:2, bars:4,
    lh: seq([0,2,4,7], [5,3,2,1]).concat(seq([7,4,2,0], [1,2,3,5], 1, 12)),
    rh: seq([7,9,11,14], [1,2,3,5], 1, 4).concat(seq([14,11,9,7], [5,3,2,1], 1, 8))},
  {id:"acordes", level:2, bars:4,
    lh: blocks([[0,2,4],[0,3,5],[-1,1,4],[0,2,4]], [[5,3,1],[5,2,1],[5,3,1],[5,3,1]], 4),
    rh: seq([2,1,0,1, 5,4,3,4, 4,3,1,3], [3,2,1,2, 5,4,3,4, 4,3,1,3]).concat([[12, 2, [2], [3]], [14, 2, [0], [1]]])},
  {id:"alberti", level:2, bars:4,
    // Baixo de Alberti: grave–agudo–médio–agudo em colcheias, duas vezes por compasso (I, IV, V6, I).
    lh: seq([[0,4,2,4],[0,5,3,5],[-1,4,1,4],[0,4,2,4]].flatMap(p => p.concat(p)), [[5,1,3,1],[5,1,2,1],[5,1,3,1],[5,1,3,1]].flatMap(p => p.concat(p)), 0.5),
    rh: [[0,2,[4],[5]],[2,2,[2],[3]],[4,2,[5],[5]],[6,2,[3],[3]],[8,2,[4],[4]],[10,2,[1],[2]],[12,4,[0],[1]]]},
  {id:"hanon", level:3, bars:4,
    rh: [0,1,2,3].flatMap(k => seq(hanonBar(k), [1,2,3,4,5,4,3,2], 0.5, k * 4)),
    lh: [0,1,2,3].flatMap(k => seq(hanonBar(k), [5,4,3,2,1,2,3,4], 0.5, k * 4))},
  {id:"inversoes", level:3, bars:4,
    rh: blocks([[0,2,4],[2,4,7],[4,7,9],[7,9,11],[4,7,9],[2,4,7],[0,2,4]], [[1,3,5],[1,2,5],[1,3,5],[1,3,5],[1,3,5],[1,2,5],[1,3,5]], 2),
    lh: [[0,8,[0],[5]],[8,4,[-7],[5]],[12,2,[0],[1]]]},
  {id:"pop", level:3, bars:4,
    lh: blocks([[0],[-3],[-2],[-4]], [[5]], 1).flatMap(([s, d, c, f], i) => [0,1,2,3].map(b => [i * 4 + b, 1, c, f])),
    rh: [[0,2,4],[1,4,6],[0,2,5],[0,3,5]].flatMap((c, i) => [0.5,1.5,2.5,3.5].map(b => [i * 4 + b, 0.5, c, [1,3,5]]))}
];

// Base da mão direita perto do C4, sem subir demais nos tons agudos.
export const baseFor = rootPc => 60 + (rootPc <= 5 ? rootPc : rootPc - 12);

// Eventos concretos em MIDI para um tom; `hands` = "rh" | "lh" | "both" diz quais são da pessoa (as outras o app toca).
export function buildExercise(ex, rootPc){
  const rb = baseFor(rootPc), lb = rb - 12, root = rootFor(rootPc, "maior"), names = spellScale(root, "maior");
  const nameOf = d => names[((d % 7) + 7) % 7];
  const events = [];
  for(const hand of ["rh","lh"]) for(const [start, dur, degs, fingers] of ex[hand]){
    events.push({hand, t: start, dur, midis: degs.map(d => (hand === "rh" ? rb : lb) + degSemis(d)), names: degs.map(nameOf), fingers});
  }
  events.sort((a, b) => a.t - b.t || (a.hand === "lh" ? -1 : 1));
  const times = [...new Set(events.map(e => e.t))].sort((a, b) => a - b);
  const steps = times.map(time => ({t: time, rh: events.find(e => e.t === time && e.hand === "rh") || null, lh: events.find(e => e.t === time && e.hand === "lh") || null}));
  const all = events.flatMap(e => e.midis);
  const fingering = !ex.fingerKeys || ex.fingerKeys.includes(root);
  return {events, steps, beats: ex.bars * 4, lo: Math.min(...all), hi: Math.max(...all), root, fingering};
}

// Notas que a pessoa precisa tocar num passo, conforme as mãos escolhidas.
export function required(step, hands){
  const out = [];
  if(step.rh && hands !== "lh") out.push(...step.rh.midis);
  if(step.lh && hands !== "rh") out.push(...step.lh.midis);
  return out;
}
// Modo espera: com as notas já tocadas neste passo, diz se completou e se a última foi errada.
export function checkStep(req, pressed, last){
  const need = new Set(req), got = new Set(pressed.filter(n => need.has(n)));
  return {done: need.size > 0 && got.size === need.size, wrong: last !== undefined && !need.has(last)};
}
// Modo no tempo: casa cada nota tocada com a esperada de mesma altura mais próxima, dentro da tolerância (s).
export function scoreNotes(expected, played, tol){
  const used = new Set(); let hits = 0; const offsets = [];
  for(const e of expected){
    let best = -1;
    played.forEach((p, i) => { if(!used.has(i) && p.midi === e.midi && Math.abs(p.t - e.t) <= tol && (best < 0 || Math.abs(p.t - e.t) < Math.abs(played[best].t - e.t))) best = i; });
    if(best >= 0){ used.add(best); hits++; offsets.push(played[best].t - e.t); }
  }
  const extras = played.length - used.size, total = expected.length + extras;
  return {hits, misses: expected.length - hits, extras, accuracy: total ? Math.round(hits / total * 100) : 0,
    meanOffset: offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : 0};
}

// ---------- interface ----------
export function initKeys({root, data, store, toast, icon, esc, audio, seg}){
  const st = Object.assign({id:null, key:0, hands:"both", bpm:{}, sound:true}, data.settings.keys || {});
  const persist = () => store.setSetting("keys", {id:st.id, key:st.key, hands:st.hands, bpm:st.bpm, sound:st.sound});
  let run = null, midi = null, midiName = "", raf = 0;
  const bpmOf = ex => st.bpm[ex.id] || (ex.level === 1 ? 72 : ex.level === 2 ? 66 : 60);
  const levelDots = n => `<span class="dots" aria-label="${esc(t("hands.level", {n}))}">${[1,2,3].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
  const best = () => data.settings.keysBest || {};

  // Teclado MIDI (Chrome/Edge): avisa quando alguém toca uma nota.
  async function connectMIDI(){
    if(midi || !navigator.requestMIDIAccess) return;
    try{
      midi = await navigator.requestMIDIAccess();
      const bind = () => { midiName = ""; midi.inputs.forEach(inp => { midiName = midiName || inp.name || "MIDI"; inp.onmidimessage = onMIDI; }); paintMidi(); };
      midi.onstatechange = bind; bind();
    }catch(e){ midi = null; }
  }
  function onMIDI(e){
    const [s, n, v] = e.data, cmd = s & 0xf0;
    if(cmd === 0x90 && v > 0) noteOn(n, "midi");
  }
  function paintMidi(){
    const el = root.querySelector("#k-midi"); if(!el) return;
    el.className = "chip" + (midiName ? " accent" : "");
    el.textContent = midiName ? t("keys.midiOn", {name: midiName}) : t("keys.midiOff");
  }

  function keyboardSVG(lo, hi){
    const start = lo - (((lo % 12) + 12) % 12), end = hi + (11 - hi % 12);
    const W = 26, H = 110, BW = 16, BH = 66; let whites = "", blacks = "", x = 0;
    for(let m = start; m <= end; m++){
      const pc = m % 12;
      if([0,2,4,5,7,9,11].includes(pc)){ whites += `<rect class="w" data-midi="${m}" x="${x}" y="0" width="${W}" height="${H}" rx="3"/>${pc === 0 ? `<text class="oct" x="${x + W/2}" y="${H - 6}">C${Math.floor(m / 12) - 1}</text>` : ""}<text class="fing" data-f="${m}" x="${x + W/2}" y="${H - 22}"></text>`; x += W; }
      else blacks += `<rect class="b" data-midi="${m}" x="${x - BW/2}" y="0" width="${BW}" height="${BH}" rx="2"/><text class="fing light" data-f="${m}" x="${x}" y="${BH - 10}"></text>`;
    }
    return `<svg class="keyboard practice" viewBox="-1 -1 ${x + 2} ${H + 2}" role="img" aria-label="${esc(t("study.keyboardAria"))}">${whites}${blacks}</svg>`;
  }
  function gridHTML(b, hands){
    const cell = (ev, h) => ev ? `<span class="kc ${h}${hands !== "both" && hands !== h ? " auto" : ""}"><b>${esc(ev.names.join(" "))}</b>${b.fingering ? `<small>${ev.fingers.join(" ")}</small>` : ""}</span>` : `<span class="kc empty"></span>`;
    return `<div class="kgrid"><div class="kstep klabels" aria-hidden="true"><span class="kbeat">${esc(t("keys.beat"))}</span><span class="kc lbl rh">${esc(t("keys.rh"))}</span><span class="kc lbl lh">${esc(t("keys.lh"))}</span></div>${b.steps.map((s, i) => `<div class="kstep" data-i="${i}"><span class="kbeat">${Number.isInteger(s.t) ? s.t % 4 + 1 : "&"}</span>${cell(s.rh, "rh")}${cell(s.lh, "lh")}</div>`).join("")}</div>`;
  }

  function renderList(){
    stop();
    const b = best();
    root.innerHTML = `
      <div class="hands-intro"><h2>${esc(t("keys.title"))}</h2><p class="sub">${esc(t("keys.intro"))}</p></div>
      <div class="kinds hands-list">${KEY_EXERCISES.map(ex => `<button class="kind ex" data-id="${ex.id}">
        <span class="ex-top"><b>${esc(t("keys.p." + ex.id))}</b>${levelDots(ex.level)}</span>
        <span>${esc(t("keys.p." + ex.id + "D"))}</span>
        ${b[ex.id] !== undefined ? `<span class="chip accent">${esc(t("hands.best", {n:b[ex.id]}))}</span>` : ""}</button>`).join("")}</div>`;
    root.querySelectorAll(".ex").forEach(el => el.onclick = () => { st.id = el.dataset.id; persist(); renderPractice(); });
  }

  let built = null, cur = null;
  function renderPractice(result){
    stop();
    const ex = KEY_EXERCISES.find(x => x.id === st.id); if(!ex) return renderList();
    built = buildExercise(ex, st.key);
    const bpm = bpmOf(ex);
    root.innerHTML = `
      <button class="btn ghost sm back" id="k-back">${icon("back","sm")} ${esc(t("hands.all"))}</button>
      <div class="card hands-card">
        <div class="scale-head"><div><h2>${esc(t("keys.p." + ex.id))} ${levelDots(ex.level)}</h2><p class="sub">${esc(t("keys.p." + ex.id + "D"))}</p></div><span id="k-midi" class="chip"></span></div>
        <div class="study-row k-controls">
          <label class="field inst-field"><span>${esc(t("study.root"))}</span><select class="input" id="k-key">${Array.from({length:12}, (_, pc) => `<option value="${pc}" ${pc === st.key ? "selected" : ""}>${esc(rootFor(pc, "maior"))}</option>`).join("")}</select></label>
          <div class="field inst-field"><span>${esc(t("keys.youPlay"))}</span><div class="seg sm" id="k-hands" role="group" aria-label="${esc(t("keys.youPlay"))}"><button data-v="rh">${esc(t("keys.rh"))}</button><button data-v="lh">${esc(t("keys.lh"))}</button><button data-v="both">${esc(t("keys.both"))}</button></div></div>
          <div class="bpm"><button class="icon-btn sm" id="k-slower" aria-label="${esc(t("hands.slower"))}">${icon("minus","sm")}</button>
            <label><input type="range" id="k-bpm" min="30" max="160" step="2" value="${bpm}" aria-label="BPM"><span><b id="k-bpm-v">${bpm}</b> bpm</span></label>
            <button class="icon-btn sm" id="k-faster" aria-label="${esc(t("hands.faster"))}">${icon("plus","sm")}</button></div>
        </div>
        ${built.fingering ? "" : `<p class="note">${esc(t("keys.noFingering"))}</p>`}
        <div class="board-wrap k-board">${keyboardSVG(built.lo, built.hi)}</div>
        <div class="kgrid-head"><h3>${esc(t("keys.gridTitle"))}</h3><p class="sub">${esc(t(built.fingering ? "keys.gridHint" : "keys.gridHintNoFing"))}</p></div>
        <div class="kgrid-wrap">${gridHTML(built, st.hands)}</div>
        ${st.hands !== "both" ? `<p class="sub k-auto">${esc(t(st.hands === "rh" ? "keys.autoLh" : "keys.autoRh"))}</p>` : ""}
        <div class="study-row k-actions">
          <button class="btn soft" id="k-demo">${icon("sound","sm")} ${esc(t("hands.listen"))}</button>
          <button class="btn primary" id="k-wait">${icon("play","sm")} ${esc(t("keys.wait"))}</button>
          <button class="btn ghost" id="k-timed" ${midiName ? "" : "disabled"} title="${esc(midiName ? "" : t("keys.timedNeedsMidi"))}">${icon("metro","sm")} ${esc(t("keys.timed"))}</button>
          <label class="switch k-sound">${esc(t("keys.sound"))}<input type="checkbox" id="k-sound" ${st.sound ? "checked" : ""}></label>
        </div>
        <p class="sub" id="k-status">${esc(t(navigator.requestMIDIAccess ? "keys.tip" : "keys.tipNoMidi"))}</p>
        <div id="k-result">${result ? resultHTML(result) : ""}</div>
      </div>`;
    const q = s => root.querySelector(s);
    seg(q("#k-hands"), st.hands, v => { st.hands = v; persist(); renderPractice(); });
    q("#k-key").onchange = e => { st.key = +e.target.value; persist(); renderPractice(); };
    const setBpm = v => { v = Math.max(30, Math.min(160, v)); st.bpm[ex.id] = v; q("#k-bpm").value = v; q("#k-bpm-v").textContent = v; persist(); };
    q("#k-bpm").oninput = e => setBpm(+e.target.value);
    q("#k-slower").onclick = () => setBpm(bpmOf(ex) - 4);
    q("#k-faster").onclick = () => setBpm(bpmOf(ex) + 4);
    q("#k-back").onclick = renderList;
    q("#k-sound").onchange = e => { st.sound = e.target.checked; persist(); };
    q("#k-demo").onclick = () => startTimed(ex, true);
    q("#k-wait").onclick = () => startWait(ex);
    q("#k-timed").onclick = () => startTimed(ex, false);
    q(".k-board").addEventListener("pointerdown", e => { const k = e.target.closest("[data-midi]"); if(k){ e.preventDefault(); noteOn(+k.dataset.midi, "screen"); } });
    paintMidi(); connectMIDI().then(() => { const b = q("#k-timed"); if(b && midiName){ b.disabled = false; b.title = ""; } });
    showStep(0, false);
  }
  // Destaca no teclado as notas do passo i (e mostra os dedos).
  function showStep(i, scroll = true){
    const svg = root.querySelector(".keyboard.practice"); if(!svg || !built) return;
    svg.querySelectorAll("rect.rh,rect.lh,rect.next").forEach(r => r.classList.remove("rh","lh","next"));
    svg.querySelectorAll("text.fing").forEach(tx => tx.textContent = "");
    const s = built.steps[i], nx = built.steps[i + 1];
    const mark = (ev, h) => ev && ev.midis.forEach((m, j) => { const r = svg.querySelector(`rect[data-midi="${m}"]`); if(r) r.classList.add(h); const f = svg.querySelector(`[data-f="${m}"]`); if(f && built.fingering) f.textContent = ev.fingers[j]; });
    if(nx){ [nx.rh, nx.lh].forEach(ev => ev && ev.midis.forEach(m => { const r = svg.querySelector(`rect[data-midi="${m}"]`); if(r) r.classList.add("next"); })); }
    if(s){ mark(s.lh, "lh"); mark(s.rh, "rh"); }
    root.querySelectorAll(".kstep").forEach(el => el.classList.toggle("on", +el.dataset.i === i));
    const on = root.querySelector(`.kstep[data-i="${i}"]`);
    if(on && scroll) on.scrollIntoView({block:"nearest", inline:"center", behavior:"smooth"});
  }
  function flashKey(m, cls){
    const r = root.querySelector(`.keyboard.practice rect[data-midi="${m}"]`); if(!r) return;
    r.classList.remove("hit","bad"); void r.getBoundingClientRect(); r.classList.add(cls); setTimeout(() => r.classList.remove(cls), 300);
  }

  // ---------- modo espera ----------
  function startWait(ex){
    stop();
    cur = {mode:"wait", i:0, pressed:[], errors:0, start: performance.now(), hands: st.hands};
    root.querySelector("#k-result").innerHTML = "";
    root.querySelector("#k-status").textContent = t("keys.waitHint");
    autoPlay(0); showStep(0);
  }
  // Toca a mão que a pessoa não está estudando, no passo atual.
  function autoPlay(i){
    if(!cur || cur.hands === "both") return;
    const s = built.steps[i], ev = s && s[cur.hands === "rh" ? "lh" : "rh"];
    if(ev) audio.playChord(ev.midis, {base:0, dur: Math.min(2.5, ev.dur * 0.8), strum:0});
  }
  function noteOn(m, src){
    if(st.sound || src === "screen") audio.playChord([m], {base:0, dur:0.9, strum:0});
    if(!cur){ flashKey(m, "hit"); return; }
    if(cur.mode === "timed"){ cur.played.push({midi:m, t: audio.audioNow()}); flashKey(m, "hit"); return; }
    let s = built.steps[cur.i], req = required(s, cur.hands);
    while(!req.length && cur.i < built.steps.length - 1){ cur.i++; s = built.steps[cur.i]; req = required(s, cur.hands); }
    cur.pressed.push(m);
    const r = checkStep(req, cur.pressed, m);
    if(r.wrong){ cur.errors++; flashKey(m, "bad"); cur.pressed = cur.pressed.filter(n => n !== m); return; }
    flashKey(m, "hit");
    if(!r.done) return;
    cur.pressed = []; cur.i++;
    while(cur.i < built.steps.length && !required(built.steps[cur.i], cur.hands).length){ autoPlay(cur.i); cur.i++; }
    if(cur.i >= built.steps.length) return finishWait();
    autoPlay(cur.i); showStep(cur.i);
  }
  function finishWait(){
    const c = cur; cur = null;
    const total = built.steps.reduce((n, s) => n + required(s, c.hands).length, 0);
    const acc = Math.max(0, Math.round(total / (total + c.errors) * 100));
    saveBest(acc);
    renderPractice({mode:"wait", accuracy: acc, errors: c.errors, secs: Math.round((performance.now() - c.start) / 1000)});
  }

  // ---------- ouvir (demonstração) e no tempo (com MIDI) ----------
  async function startTimed(ex, demo){
    stop();
    if(!(await audio.audioReady())) return toast(t("study.noAudio"));
    const bpm = bpmOf(ex), spb = 60 / bpm, t0 = audio.audioNow() + 0.15, count = demo ? 0 : 4;
    for(let i = 0; i < count + built.beats; i++) if(!demo || i % 1 === 0) audio.click(i % 4 ? "beat" : "accent", t0 + i * spb);
    const mine = h => !demo && (st.hands === "both" || st.hands === h);
    const expected = [];
    built.events.forEach(ev => {
      const at = t0 + (count + ev.t) * spb;
      if(mine(ev.hand)) ev.midis.forEach(m => expected.push({midi:m, t:at}));
      else audio.playNotesAt(ev.midis, at, Math.min(2.5, ev.dur * spb * 0.95));
    });
    cur = {mode: demo ? "demo" : "timed", t0, spb, count, played: [], expected, end: t0 + (count + built.beats) * spb, ex};
    cur.timer = setTimeout(() => finishTimed(), (cur.end - audio.audioNow() + 0.4) * 1000);
    root.querySelector("#k-result").innerHTML = "";
    root.querySelector("#k-status").textContent = t(demo ? "keys.demoHint" : "keys.timedHint");
    frame();
  }
  function frame(){
    if(!cur || cur.mode === "wait") return;
    const beat = (audio.audioNow() - cur.t0) / cur.spb - cur.count;
    let i = -1; built.steps.forEach((s, k) => { if(s.t <= beat + 0.02) i = k; });
    if(i !== cur.shown){ cur.shown = i; if(i >= 0) showStep(i); }
    const cnt = root.querySelector("#k-status");
    if(beat < 0 && cnt) cnt.textContent = t("keys.countIn", {n: Math.floor(beat + cur.count) + 1});
    raf = requestAnimationFrame(frame);
  }
  function finishTimed(){
    const c = cur; if(!c || c.mode === "wait") return;
    stop();
    if(c.mode === "demo") return renderPractice();
    const tol = Math.min(0.12, c.spb * 0.3), r = scoreNotes(c.expected, c.played, tol);
    saveBest(r.accuracy);
    renderPractice({mode:"timed", ...r});
  }
  function saveBest(acc){
    const b = Object.assign({}, best()); if(b[st.id] === undefined || acc > b[st.id]){ b[st.id] = acc; store.setSetting("keysBest", b); }
  }
  function resultHTML(r){
    const msg = r.accuracy >= 90 ? "great" : r.accuracy >= 70 ? "good" : "try";
    const ms = Math.round((r.meanOffset || 0) * 1000);
    const feel = r.mode !== "timed" || !r.hits ? "" : Math.abs(ms) < 15 ? t("hands.onTime") : ms < 0 ? t("hands.early", {ms:-ms}) : t("hands.late", {ms});
    return `<div class="hands-result"><div class="big">${r.accuracy}%</div>
      <div class="stats">${r.mode === "wait" ? `<span><b>${r.errors}</b> ${esc(t("keys.errors"))}</span><span><b>${r.secs}s</b> ${esc(t("keys.time"))}</span>`
        : `<span><b>${r.hits}</b> ${esc(t("keys.hits"))}</span><span><b>${r.misses}</b> ${esc(t("hands.missed"))}</span><span><b>${r.extras}</b> ${esc(t("hands.extra"))}</span>`}</div>
      <p>${esc(feel)} ${esc(t("hands.msg." + msg))}</p></div>`;
  }
  function stop(){
    cancelAnimationFrame(raf);
    if(cur && cur.timer) clearTimeout(cur.timer);
    cur = null;
  }
  return {
    show(){ if(st.id && KEY_EXERCISES.some(x => x.id === st.id)) renderPractice(); else renderList(); },
    hide: stop
  };
}
