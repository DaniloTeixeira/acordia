// Aba Voz do Estudo, pensada para cantores: "Cante o grau" (o app firma o tom e você canta o grau
// pedido, com o microfone conferindo a afinação) e "Minha extensão" (mede a voz e sugere o tom das
// músicas do repertório aberto).
import { KEYS, MINOR_KEYS, parseKey, cadence, DEGREE_STEPS, voiceType, voiceShift, transposeKey } from "./core.js";
import { listenPitch, midiName } from "./tuner.js";
import { t, ordinal } from "./i18n.js";

const ROUND = 10;
// Tolerância em cents por nível, e quanto tempo segurar a nota certa para valer.
const TOLERANCE = {facil:40, medio:25, dificil:12}, HOLD_MS = 700;
const midiOf = f => 69 + 12 * Math.log2(f / 440);
const LOWEST = 36, HIGHEST = 96; // C2..C7, limites da medição e das listas de notas

export function initVoice({root, data, store, toast, icon, esc, audio, seg, paintSeg, openEarTraining, getSongs, applyKey, setSongHigh}){
  const st = Object.assign({mode:"sing", key:"random", set:"triad", level:"facil", singer:""}, data.settings.voice || {});
  const persist = () => store.setSetting("voice", {mode:st.mode, key:st.key, set:st.set, level:st.level, singer:st.singer});
  const voices = () => data.settings.voices || {};
  let stopMic = null, game = null, measure = null;

  function micOff(){ if(stopMic){ stopMic(); stopMic = null; } }
  async function micOn(onPitch){
    micOff();
    try{ stopMic = await listenPitch(onPitch); return true; }
    catch(e){ toast(t("tuner.denied")); return false; }
  }
  // Mudo o microfone enquanto o próprio app toca, para o som da caixa não contar como canto.
  let muteUntil = 0;
  const playing = () => performance.now() < muteUntil;
  function playAndMute(fn){
    const now = audio.audioNow(); if(now === null){ toast(t("study.noAudio")); return; }
    const end = fn(now + 0.05);
    muteUntil = performance.now() + (end - now) * 1000 + 300;
  }

  root.innerHTML = `<div class="seg sub-seg" id="voice-mode" role="group"><button data-v="sing"></button><button data-v="range"></button></div><div id="voice-body"></div>`;
  const body = root.querySelector("#voice-body"), modeSeg = root.querySelector("#voice-mode");
  seg(modeSeg, st.mode, v => { st.mode = v; persist(); render(); });

  function render(){
    micOff(); game = null; measure = null;
    modeSeg.querySelector('[data-v="sing"]').textContent = t("voice.sing");
    modeSeg.querySelector('[data-v="range"]').textContent = t("voice.range");
    if(st.mode === "range") renderRange(); else renderSingSetup();
    requestAnimationFrame(() => root.querySelectorAll(".seg").forEach(paintSeg));
  }

  // ---------- Cante o grau ----------
  const keyLabel = k => k === "random" ? t("voice.randomKey") : k;
  function renderSingSetup(){
    body.innerHTML = `
      <div class="card voice-card">
        <h2>${esc(t("voice.singTitle"))}</h2>
        <p class="sub">${esc(t("voice.singD"))}</p>
        <div class="study-row">
          <label class="field inst-field"><span>${esc(t("voice.key"))}</span><select class="input" id="vs-key">${["random", ...KEYS, ...MINOR_KEYS].map(k => `<option value="${k}" ${k === st.key ? "selected" : ""}>${esc(keyLabel(k))}</option>`).join("")}</select></label>
          <div class="field inst-field"><span>${esc(t("voice.degrees"))}</span><div class="seg sm" id="vs-set" role="group" aria-label="${esc(t("voice.degrees"))}"><button data-v="triad">1 · 3 · 5</button><button data-v="scale">${esc(t("voice.wholeScale"))}</button></div></div>
          <div class="field inst-field"><span>${esc(t("voice.precision"))}</span><div class="seg sm" id="vs-level" role="group" aria-label="${esc(t("voice.precision"))}"><button data-v="facil">${esc(t("train.easy"))}</button><button data-v="medio">${esc(t("train.medium"))}</button><button data-v="dificil">${esc(t("train.hard"))}</button></div></div>
        </div>
        <p class="sub">${esc(t("voice.precisionD", {c: TOLERANCE[st.level]}))}</p>
        <div class="study-row"><button class="btn primary" id="vs-start">${icon("play","sm")} ${esc(t("train.start"))}</button>
          ${(data.settings.voiceBest || {})[st.set + ":" + st.level] !== undefined ? `<span class="best">${esc(t("train.best", {n: data.settings.voiceBest[st.set + ":" + st.level], total: ROUND}))}</span>` : ""}</div>
        <p class="note">${esc(t("voice.micNote"))}</p>
      </div>
      <div class="card voice-card voice-link">
        <div><h3>${esc(t("voice.earTitle"))}</h3><p class="sub">${esc(t("voice.earD"))}</p></div>
        <button class="btn soft" id="vs-ear">${esc(t("voice.earGo"))}</button>
      </div>`;
    body.querySelector("#vs-key").onchange = e => { st.key = e.target.value; persist(); };
    seg(body.querySelector("#vs-set"), st.set, v => { st.set = v; persist(); renderSingSetup(); });
    seg(body.querySelector("#vs-level"), st.level, v => { st.level = v; persist(); renderSingSetup(); });
    body.querySelector("#vs-start").onclick = startSing;
    body.querySelector("#vs-ear").onclick = openEarTraining;
  }
  async function startSing(){
    const key = st.key === "random" ? [...KEYS, ...KEYS, ...MINOR_KEYS][Math.floor(Math.random() * 36)] : st.key;
    const k = parseKey(key);
    game = {key, minor: k.minor, tonic: 60 + k.pc - (k.pc > 6 ? 12 : 0), i: 0, right: 0, last: 0, n: 0, held: 0, lastAt: 0, done: false, helped: false};
    if(!(await micOn(onSingPitch))){ game = null; return; }
    nextNote(true);
  }
  function nextNote(first){
    const pool = st.set === "triad" ? [1, 3, 5] : [1, 2, 3, 4, 5, 6, 7];
    let n; do { n = pool[Math.floor(Math.random() * pool.length)]; } while(n === game.n && pool.length > 1);
    Object.assign(game, {n, held: 0, lastAt: 0, done: false, helped: false});
    renderSing();
    // Na primeira nota, a cadência inteira; depois só o acorde da tônica, para não perder o tom.
    playTonality(first);
  }
  const degreeStep = n => DEGREE_STEPS[game.minor ? "menor" : "maior"][n - 1];
  const noteLabel = n => midiName(game.tonic + degreeStep(n)).replace(/-?\d+$/, "");
  function playTonality(full){
    const chords = cadence(game.minor).map(c => c.map(x => game.tonic + x));
    playAndMute(at => audio.playProgression(full ? chords : chords.slice(-1), at, full ? 0.6 : 0.9));
  }
  function renderSing(){
    const g = game;
    body.innerHTML = `
      <button class="btn ghost sm back" id="vs-quit">${icon("back","sm")} ${esc(t("train.change"))}</button>
      <div class="quiz card voice-game">
        <div class="quiz-top"><span>${esc(t("train.question", {n: g.i + 1, total: ROUND}))}</span><div class="progress"><span style="width:${g.i / ROUND * 100}%"></span></div>
          <span class="chip accent">${esc(t("voice.inKey", {key: g.key}))}</span></div>
        <p class="prompt">${esc(t("voice.singThe", {ord: ordinal(g.n), n: g.n}))} <small class="voice-note">(${esc(noteLabel(g.n))})</small></p>
        <div class="voice-meter" aria-live="polite">
          <div class="tuner-meter"><div class="tuner-scale">${[-50,-25,0,25,50].map(v => `<span style="left:${50 + v * 0.9}%">${v > 0 ? "+" + v : v}</span>`).join("")}</div>
            <div class="voice-zone" style="left:${50 - TOLERANCE[st.level] * 0.9}%;width:${TOLERANCE[st.level] * 1.8}%"></div><div class="tuner-needle" id="vs-needle"></div></div>
          <div class="voice-hold"><span id="vs-hold"></span></div>
          <p class="tuner-cents" id="vs-status">${esc(t("voice.listening"))}</p>
        </div>
        <div class="study-row">
          <button class="btn soft sm" id="vs-key-again">${icon("sound","sm")} ${esc(t("voice.keyAgain"))}</button>
          <button class="btn ghost sm" id="vs-hint">${esc(t("voice.hearNote"))}</button>
          <button class="btn ghost sm" id="vs-skip" style="margin-left:auto">${esc(t("voice.skip"))}</button>
        </div>
        <p class="feedback" aria-live="polite"></p>
      </div>`;
    body.querySelector("#vs-quit").onclick = () => { micOff(); game = null; renderSingSetup(); };
    body.querySelector("#vs-key-again").onclick = () => playTonality(true);
    body.querySelector("#vs-hint").onclick = () => { game.helped = true; playAndMute(at => { audio.playNotesAt([game.tonic + degreeStep(game.n)], at, 1.2); return at + 1.2; }); };
    body.querySelector("#vs-skip").onclick = () => finishNote(false);
  }
  function onSingPitch(f){
    const g = game; if(!g || g.done) return;
    const status = body.querySelector("#vs-status"), needle = body.querySelector("#vs-needle"), hold = body.querySelector("#vs-hold");
    if(!status) return;
    const now = performance.now();
    if(playing()){ status.textContent = t("voice.wait"); return; }
    if(!f){ g.held = Math.max(0, g.held - 120); hold.style.width = (g.held / HOLD_MS * 100) + "%"; status.textContent = t("voice.listening"); needle.classList.add("idle"); return; }
    // Desvio até o grau pedido na oitava mais próxima: vale cantar em qualquer oitava.
    const target = g.tonic + degreeStep(g.n), m = midiOf(f);
    const cents = Math.round((((m - target) % 12 + 18) % 12 - 6) * 100);
    needle.classList.remove("idle");
    needle.style.left = (50 + Math.max(-50, Math.min(50, cents)) * 0.9) + "%";
    const ok = Math.abs(cents) <= TOLERANCE[st.level];
    const dt = g.lastAt ? Math.min(150, now - g.lastAt) : 60; g.lastAt = now;
    g.held = ok ? g.held + dt : Math.max(0, g.held - dt * 2);
    hold.style.width = Math.min(100, g.held / HOLD_MS * 100) + "%";
    const sung = midiName(Math.round(m)).replace(/-?\d+$/, "");
    status.textContent = ok ? t("voice.holdIt") : Math.abs(cents) > 300 ? t("voice.youSang", {note: sung}) : t(cents < 0 ? "voice.low" : "voice.high", {c: Math.abs(cents)});
    body.querySelector(".voice-meter").classList.toggle("ok", ok);
    if(g.held >= HOLD_MS) finishNote(true);
  }
  function finishNote(ok){
    const g = game; if(!g || g.done) return;
    g.done = true;
    if(ok) g.right++;
    const fb = body.querySelector(".feedback");
    fb.className = "feedback " + (ok ? "ok" : "bad");
    fb.textContent = ok ? (g.helped ? t("voice.rightHelped") : t("train.right")) : t("voice.skipped", {note: noteLabel(g.n)});
    body.querySelector(".progress span").style.width = ((g.i + 1) / ROUND * 100) + "%";
    if(!ok) playAndMute(at => { audio.playNotesAt([g.tonic + degreeStep(g.n)], at, 1); return at + 1; });
    setTimeout(() => {
      if(game !== g) return;
      g.i++;
      if(g.i >= ROUND) singSummary(); else nextNote(false);
    }, ok ? 900 : 1600);
  }
  function singSummary(){
    micOff();
    const g = game, k = st.set + ":" + st.level, best = Object.assign({}, data.settings.voiceBest || {}), prev = best[k], isBest = prev === undefined || g.right > prev;
    if(isBest){ best[k] = g.right; store.setSetting("voiceBest", best); }
    const pct = g.right / ROUND, msg = pct >= 0.9 ? "great" : pct >= 0.6 ? "good" : "try";
    body.innerHTML = `
      <button class="btn ghost sm back" id="vs-setup">${icon("back","sm")} ${esc(t("train.change"))}</button>
      <div class="card summary" style="max-width:720px">
        <div class="big">${Math.round(pct * 100)}%</div>
        <h2>${esc(t("train.result", {right: g.right, total: ROUND}))}</h2>
        <p>${esc(t("train.msg." + msg))}</p>
        <p class="best">${isBest && g.right ? esc(t("train.newBest")) : esc(t("train.best", {n: Math.max(prev ?? 0, g.right), total: ROUND}))}</p>
        <div class="study-row" style="justify-content:center"><button class="btn primary" id="vs-again">${esc(t("train.again"))}</button></div>
      </div>`;
    game = null;
    body.querySelector("#vs-setup").onclick = renderSingSetup;
    body.querySelector("#vs-again").onclick = startSing;
  }

  // ---------- Minha extensão ----------
  const noteSelect = (attr, value, empty) => `<select class="input" ${attr}>${empty ? `<option value="">${esc(empty)}</option>` : ""}${Array.from({length: HIGHEST - LOWEST + 1}, (_, i) => LOWEST + i).map(m => `<option value="${m}" ${m === value ? "selected" : ""}>${midiName(m)}</option>`).join("")}</select>`;
  function current(){ return voices()[st.singer] || null; }
  function saveVoice(v){
    const all = Object.assign({}, voices());
    if(v) all[st.singer] = v; else delete all[st.singer];
    store.setSetting("voices", all);
  }
  function renderRange(){
    if(!st.singer) st.singer = Object.keys(voices())[0] || t("voice.me");
    const v = current(), names = Object.keys(voices());
    const type = v && v.low && v.high ? voiceType(v.low, v.high) : null;
    body.innerHTML = `
      <div class="card voice-card">
        <h2>${esc(t("voice.rangeTitle"))}</h2>
        <p class="sub">${esc(t("voice.rangeD"))}</p>
        <div class="study-row">
          <label class="field inst-field"><span>${esc(t("voice.singer"))}</span><input class="input" id="vr-name" list="vr-names" maxlength="40" value="${esc(st.singer)}" autocomplete="off"></label>
          <datalist id="vr-names">${names.map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        </div>
        <div class="voice-steps">
          ${["low", "high"].map(which => `
            <div class="voice-step" data-step="${which}">
              <span class="lbl">${esc(t(which === "low" ? "voice.lowest" : "voice.highest"))}</span>
              <b class="voice-val">${v && v[which] ? esc(midiName(v[which])) : "—"}</b>
              <span class="voice-live" hidden></span>
              <div class="voice-step-actions">
                <button class="btn soft sm" data-measure="${which}">${icon("sound","sm")} ${esc(t("voice.measure"))}</button>
                ${v && v[which] ? `<button class="icon-btn sm" data-nudge="${which}:-1" aria-label="${esc(t("voice.lower"))}" title="${esc(t("voice.lower"))}">${icon("minus","sm")}</button><button class="icon-btn sm" data-nudge="${which}:1" aria-label="${esc(t("voice.higher"))}" title="${esc(t("voice.higher"))}">${icon("plus","sm")}</button>` : ""}
              </div>
              <p class="sub">${esc(t(which === "low" ? "voice.lowestD" : "voice.highestD"))}</p>
            </div>`).join("")}
        </div>
        ${type ? `<p class="voice-result">${esc(t("voice.result", {low: midiName(v.low), high: midiName(v.high), type: t("voice.type." + type)}))}</p><p class="sub">${esc(t("voice.typeNote"))}</p>` : ""}
      </div>
      ${v && v.high ? keysCard(v) : ""}`;
    const name = body.querySelector("#vr-name");
    name.onchange = () => { const n = name.value.trim(); if(!n){ name.value = st.singer; return; } micOff(); st.singer = n; persist(); renderRange(); };
    body.querySelectorAll("[data-measure]").forEach(b => b.onclick = () => {
      const which = b.dataset.measure, was = measure && measure.which;
      if(was) stopMeasure(); // salva a medição em andamento (e redesenha)
      if(was !== which) startMeasure(which);
    });
    body.querySelectorAll("[data-nudge]").forEach(b => b.onclick = () => {
      const [which, d] = b.dataset.nudge.split(":"), cur = Object.assign({}, current());
      cur[which] = Math.max(LOWEST, Math.min(HIGHEST, cur[which] + +d)); saveVoice(cur); renderRange();
    });
    if(v && v.high) wireKeys(v);
  }
  // Mede a nota mais grave (ou aguda) que a pessoa sustenta: conta uma nota quando ela fica ~0,5 s estável.
  async function startMeasure(which){
    measure = {which, best: null, run: 0, lastMidi: null};
    const step = body.querySelector(`[data-step="${which}"]`), live = step.querySelector(".voice-live"), btn = step.querySelector("[data-measure]");
    if(!(await micOn(f => {
      if(!measure || measure.which !== which) return;
      if(!f){ measure.run = 0; live.textContent = t("voice.singNow"); return; }
      const m = Math.round(midiOf(f));
      if(m < LOWEST || m > HIGHEST) return;
      measure.run = m === measure.lastMidi ? measure.run + 1 : 1; measure.lastMidi = m;
      live.textContent = t("voice.hearing", {note: midiName(m)});
      if(measure.run >= 8 && (measure.best === null || (which === "low" ? m < measure.best : m > measure.best))){
        measure.best = m; step.querySelector(".voice-val").textContent = midiName(m);
      }
    }))){ measure = null; return; }
    live.hidden = false; live.textContent = t("voice.singNow");
    step.classList.add("measuring");
    btn.innerHTML = `${icon("check","sm")} ${esc(t("voice.done"))}`;
  }
  function stopMeasure(){
    const m = measure; micOff(); measure = null;
    if(m && m.best !== null){
      const cur = Object.assign({}, current() || {}); cur[m.which] = m.best;
      if(cur.low && cur.high && cur.low > cur.high) [cur.low, cur.high] = [cur.high, cur.low];
      saveVoice(cur);
    } else if(m) toast(t("voice.noNote"));
    renderRange();
  }

  // Tom sugerido para cada música do repertório aberto, a partir da nota mais aguda da melodia.
  function keysCard(v){
    const songs = getSongs();
    return `<div class="card voice-card">
      <h2>${esc(t("voice.keysTitle", {name: st.singer}))}</h2>
      <p class="sub">${esc(t("voice.keysD"))}</p>
      ${songs.length ? `<div class="voice-keys">${songs.map(s => {
        const sug = s.high ? transposeKey(s.key, voiceShift(s.high, v.high)) : "";
        const applied = sug && s.target === sug && s.singer === st.singer;
        return `<div class="voice-key-row" data-item="${esc(s.itemId)}" data-song="${esc(s.songId)}">
          <div class="vk-title"><b>${esc(s.title)}</b><span class="sub">${esc(t("voice.original", {key: s.key}))}</span></div>
          <label class="field"><span>${esc(t("voice.songHigh"))}</span>${noteSelect("data-high", s.high, "—")}</label>
          <div class="vk-sug">${sug ? `<span class="lbl">${esc(t("voice.suggested"))}</span><b>${esc(sug)}</b>` : `<span class="sub">${esc(t("voice.needHigh"))}</span>`}</div>
          <button class="btn ${applied ? "ghost" : "soft"} sm" data-apply="${esc(sug)}" ${sug && !applied ? "" : "disabled"}>${esc(applied ? t("voice.applied") : t("voice.apply"))}</button>
        </div>`; }).join("")}</div>` : `<p class="note">${esc(t("voice.noSongs"))}</p>`}
    </div>`;
  }
  function wireKeys(){
    body.querySelectorAll(".voice-key-row").forEach(row => {
      row.querySelector("[data-high]").onchange = e => { setSongHigh(row.dataset.song, e.target.value ? +e.target.value : undefined); renderRange(); };
      row.querySelector("[data-apply]").onclick = e => { applyKey(row.dataset.item, e.currentTarget.dataset.apply, st.singer); toast(t("voice.appliedToast", {key: e.currentTarget.dataset.apply})); renderRange(); };
    });
  }

  return {
    show: render,
    hide(){ micOff(); game = null; measure = null; }
  };
}
