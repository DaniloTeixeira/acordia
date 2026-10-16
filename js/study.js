// Modo Estudo: explorador de escalas e campo harmônico, e o treino em forma de jogo.
import { SCALES, spellScale, scaleDegrees, harmonicField, relativeKey, rootFor, makeQuestion, QUIZ_KINDS, NOTE_GRID, CHORD_QUALITIES } from "./core.js";
import * as audio from "./audio.js";
import { initHands } from "./hands.js";
import { mountMetronome } from "./metronome.js";
const { playChord, playSequence } = audio;
import { t } from "./i18n.js";

const ROUND = 10;
const WHITE = [0,2,4,5,7,9,11], BLACK = [1,3,6,8,10];

export function initStudy({explore, train, hands, metroRoot, metro, tabs, seg, paintSeg, data, store, toast, icon, esc}){
  const st = Object.assign({tab:"explore", rootPc:0, scaleId:"maior", sevenths:false, kind:"misto", level:"facil", mode:"choice"}, data.settings.study || {});
  const persist = () => store.setSetting("study", {tab:st.tab, rootPc:st.rootPc, scaleId:st.scaleId, sevenths:st.sevenths, kind:st.kind, level:st.level, mode:st.mode});
  const handsUI = initHands({root:hands, data, store, toast, icon, esc, audio});
  let metroUI = null;
  document.addEventListener("keydown", e => {
    if(!metroUI || metroRoot.hidden || metroRoot.closest("[hidden]") || (e.target instanceof Element && e.target.closest("input:not([type=range]):not([type=checkbox]),textarea,select,button"))) return;
    metroUI.key(e);
  });
  let quiz = null;

  seg(tabs, st.tab, v => { st.tab = v; persist(); show(); });

  // ---------- explorador ----------
  const startMidi = () => (st.rootPc < 5 ? 60 : 48) + st.rootPc;
  function keyboardSVG(notesByPc){
    const kbStart = startMidi() - st.rootPc, W = 24, H = 96, BW = 15, BH = 58;
    let whites = "", blacks = "", x = 0;
    for(let o = 0; o < 2; o++) for(const pc of [0,1,2,3,4,5,6,7,8,9,10,11]){
      const midi = kbStart + o*12 + pc, name = notesByPc[pc], root = pc === st.rootPc;
      const cls = (name ? " in" : "") + (root ? " root" : "");
      if(WHITE.includes(pc)){
        whites += `<rect class="w${cls}" data-midi="${midi}" x="${x}" y="0" width="${W}" height="${H}" rx="3"/>` + (name ? `<text class="${root?"root":"in"}" x="${x + W/2}" y="${H-8}" text-anchor="middle">${esc(name)}</text>` : "");
        x += W;
      } else {
        blacks += `<rect class="b${cls}" data-midi="${midi}" x="${x - BW/2}" y="0" width="${BW}" height="${BH}" rx="2"/>` + (name ? `<text class="${root?"root":"in"}" x="${x}" y="${BH-6}" text-anchor="middle" style="fill:#fff;font-size:8px">${esc(name)}</text>` : "");
      }
    }
    return `<svg class="keyboard" viewBox="-1 -1 ${x + 2} ${H + 2}" role="img" aria-label="${esc(t("study.keyboardAria"))}">${whites}${blacks}</svg>`;
  }
  function flash(midis){
    midis.forEach(m => { const k = explore.querySelector(`[data-midi="${m}"]`); if(k){ k.classList.add("on"); setTimeout(()=>k.classList.remove("on"), 450); } });
  }
  function fnLegend(field, fnName){
    const by = f => field.filter(c => c.fn === f);
    const ex = ["T","SD","D","T"].map((f, i) => { const c = by(f)[0]; return c ? c.name : ""; }).filter(Boolean).join(" → ");
    return `<div class="fn-legend">
      <h3>${esc(t("study.fnTitle"))}</h3><p class="sub">${esc(t("study.fnIntro"))}</p>
      <div class="fn-grid">${["T","SD","D"].map(f => `<div class="fn-item ${f}">
        <div class="fn-name"><span class="fn ${f}">${f}</span> ${esc(fnName[f])}</div>
        <p>${esc(t("study.fn" + f + "D"))}</p>
        <p class="fn-here">${esc(t("study.fnHere", {degrees: by(f).map(c => c.degree + " (" + c.name + ")").join(", ")}))}</p></div>`).join("")}</div>
      <p class="sub">${esc(t("study.fnFlow", {example: ex}))}</p></div>`;
  }
  function renderExplore(){
    const sc = SCALES[st.scaleId], root = rootFor(st.rootPc, st.scaleId);
    const names = spellScale(root, st.scaleId), degs = scaleDegrees(st.scaleId);
    const byPc = {}; sc.iv.forEach((iv, i) => byPc[(st.rootPc + iv) % 12] = names[i]);
    const field = harmonicField(root, st.scaleId, st.sevenths);
    const relKey = sc.minor ? relativeKey(root + "m") : relativeKey(root);
    const fnName = {T:t("study.fnT"), SD:t("study.fnSD"), D:t("study.fnD")};
    explore.innerHTML = `
      <div class="study-controls">
        <div class="roots" role="group" aria-label="${esc(t("study.root"))}">${Array.from({length:12}, (_, pc) => `<button class="root-btn" data-pc="${pc}" aria-pressed="${pc === st.rootPc}">${esc(rootFor(pc, st.scaleId))}</button>`).join("")}</div>
        <div class="study-row">
          <select class="input" id="st-scale" aria-label="${esc(t("study.scale"))}">${Object.keys(SCALES).map(id => `<option value="${id}" ${id === st.scaleId ? "selected" : ""}>${esc(t("scale." + id))}</option>`).join("")}</select>
          <label class="switch" style="gap:10px">${esc(t("study.sevenths"))}<input type="checkbox" id="st-7" ${st.sevenths ? "checked" : ""} ${field.length ? "" : "disabled"}></label>
        </div>
      </div>
      <div class="card scale-card">
        <div class="scale-head">
          <div><h2>${esc(t("study.scaleOf", {root, scale: t("scale." + st.scaleId).toLowerCase()}))}</h2><p class="sub">${esc(t(sc.minor ? "study.relMajor" : "study.relMinor", {key: relKey}))}</p></div>
          <button class="btn primary sm" id="st-play">${icon("play","sm")} ${esc(t("study.play"))}</button>
        </div>
        <div class="scale-notes">${names.map((n, i) => `<button class="note-chip" data-i="${i}"><b>${esc(n)}</b><small>${esc(degs[i])}</small></button>`).join("")}</div>
        ${keyboardSVG(byPc)}
      </div>
      <div class="card">
        <div class="scale-head" style="margin-bottom:12px"><div><h2>${esc(t("study.field"))}</h2><p class="sub">${esc(field.length ? t("study.fieldHint") : t("study.noField"))}</p></div></div>
        ${field.length ? `<div class="field-grid">${field.map((c, i) => `<button class="chord-card" data-i="${i}" style="animation-delay:${i*30}ms"><span class="deg">${esc(c.degree)}</span><span class="name">${esc(c.name)}</span><span class="tones">${esc(c.notes.join(" · "))}</span>${c.fn ? `<span class="fn ${c.fn}" title="${esc(fnName[c.fn])}">${c.fn}</span>` : ""}</button>`).join("")}</div>
          ${sc.fn ? fnLegend(field, fnName) : ""}` : ""}
      </div>`;
    explore.querySelectorAll(".root-btn").forEach(b => b.onclick = () => { st.rootPc = +b.dataset.pc; persist(); renderExplore(); });
    explore.querySelector("#st-scale").onchange = e => { st.scaleId = e.target.value; persist(); renderExplore(); };
    explore.querySelector("#st-7").onchange = e => { st.sevenths = e.target.checked; persist(); renderExplore(); };
    const base = startMidi();
    explore.querySelector("#st-play").onclick = () => {
      const seq = sc.iv.concat(12);
      if(!playSequence(seq, {base})) return toast(t("study.noAudio"));
      const chips = explore.querySelectorAll(".note-chip");
      seq.forEach((iv, i) => setTimeout(() => { flash([base + iv]); const c = chips[i % chips.length]; if(c && i < chips.length){ c.classList.remove("lit"); void c.offsetWidth; c.classList.add("lit"); } }, i * 320));
    };
    explore.querySelectorAll(".note-chip").forEach(b => b.onclick = () => { const iv = sc.iv[+b.dataset.i]; playChord([iv], {base}); flash([base + iv]); });
    // Teclas clicáveis; segurando e arrastando, toca as notas por onde passa.
    const kb = explore.querySelector(".keyboard"); let down = false, lastKey = null;
    const press = el => {
      const key = el && el.closest && el.closest("rect[data-midi]");
      if(!key || key === lastKey) return;
      lastKey = key;
      if(!playChord([0], {base: +key.dataset.midi, dur: 1.2})) return toast(t("study.noAudio"));
      flash([+key.dataset.midi]);
    };
    kb.addEventListener("pointerdown", e => { down = true; lastKey = null; kb.setPointerCapture(e.pointerId); press(e.target); e.preventDefault(); });
    kb.addEventListener("pointermove", e => { if(down) press(document.elementFromPoint(e.clientX, e.clientY)); });
    const up = () => { down = false; lastKey = null; };
    kb.addEventListener("pointerup", up); kb.addEventListener("pointercancel", up);
    explore.querySelectorAll(".chord-card").forEach(b => b.onclick = () => { const c = field[+b.dataset.i]; if(!playChord(c.pcs, {base})) return toast(t("study.noAudio")); flash(c.pcs.map(p => base + p)); });
  }

  // ---------- treino ----------
  const KINDS = ["misto", ...QUIZ_KINDS];
  const kindLabel = k => k === "misto" ? [t("train.mixed"), t("train.mixedD")] : [t("train." + k), t("train." + k + "D")];
  const bestKey = () => st.kind + ":" + st.level + (st.mode === "full" ? ":full" : "");
  const QUAL_LABEL = {"":"train.qM", "m":"train.qm", "°":"train.qd", "+":"train.qa"};
  function renderSetup(){
    quiz = null;
    const best = (data.settings.best || {})[bestKey()];
    train.innerHTML = `
      <div class="train-setup" style="margin-top:16px">
        <h2>${esc(t("train.kind"))}</h2>
        <div class="kinds">${KINDS.map(k => { const [a, b] = kindLabel(k); return `<button class="kind" data-k="${k}" aria-pressed="${k === st.kind}"><b>${esc(a)}</b><span>${esc(b)}</span></button>`; }).join("")}</div>
        <div class="setup-row">
          <div><h2>${esc(t("train.level"))}</h2>
            <div class="seg" id="tr-level" role="group" aria-label="${esc(t("train.level"))}"><button data-v="facil">${esc(t("train.easy"))}</button><button data-v="medio">${esc(t("train.medium"))}</button><button data-v="dificil">${esc(t("train.hard"))}</button></div>
            <p class="sub" style="margin-top:6px">${esc(t("train.levelD." + st.level))}</p></div>
          <div><h2>${esc(t("train.answers"))}</h2>
            <div class="seg" id="tr-mode" role="group" aria-label="${esc(t("train.answers"))}"><button data-v="choice">${esc(t("train.choice"))}</button><button data-v="full">${esc(t("train.full"))}</button></div>
            <p class="sub" style="margin-top:6px">${esc(t(st.mode === "full" ? "train.fullD" : "train.choiceD"))}</p></div>
        </div>
        <div class="study-row"><button class="btn primary" id="tr-start">${icon("play","sm")} ${esc(t("train.start"))}</button>${best !== undefined ? `<span class="best">${esc(t("train.best", {n:best, total:ROUND}))}</span>` : ""}</div>
      </div>`;
    train.querySelectorAll(".kind").forEach(b => b.onclick = () => { st.kind = b.dataset.k; persist(); renderSetup(); });
    seg(train.querySelector("#tr-level"), st.level, v => { st.level = v; persist(); renderSetup(); });
    seg(train.querySelector("#tr-mode"), st.mode, v => { st.mode = v; persist(); renderSetup(); });
    train.querySelector("#tr-start").onclick = startQuiz;
  }
  function startQuiz(){ quiz = {i:0, right:0, streak:0, answered:false, q:null, last:"", root:null, qual:""}; nextQuestion(); }
  function nextQuestion(){
    let q, tries = 0;
    do { q = makeQuestion(st.kind, st.level); } while(q.prompt + q.answer === quiz.last && ++tries < 5);
    Object.assign(quiz, {q, last:q.prompt + q.answer, answered:false, root:null, qual:""});
    renderQuiz();
    if(q.autoplay) setTimeout(() => playChord(q.play), 250);
  }
  const optBtn = (o, i, cls = "answer") => `<button class="${cls}" data-o="${esc(o)}" style="animation-delay:${Math.min(i, 12)*25}ms">${i < 4 && cls === "answer" ? `<span class="sr-only">${i+1}. </span>` : ""}${esc(o)}</button>`;
  const noteGrid = (extra = "") => `<div class="note-grid ${extra}" role="group" aria-label="${esc(t("train.notesAria"))}">${NOTE_GRID.map(row => row.map((n, i) => optBtn(n, i, "answer cell")).join("")).join("")}</div>`;
  function answersHTML(q){
    if(st.mode !== "full") return `<div class="answers">${q.options.map((o, i) => optBtn(o, i)).join("")}</div>`;
    if(q.full.type === "notes") return noteGrid();
    if(q.full.type === "list") return `<div class="answer-list">${q.full.options.map((o, i) => optBtn(o, i, "answer cell")).join("")}</div>`;
    return `<p class="sub">${esc(t("train.pickChord"))}</p>${noteGrid("pick")}
      <div class="study-row"><div class="seg" id="tr-qual" role="group" aria-label="${esc(t("train.quality"))}">${CHORD_QUALITIES.map(x => `<button data-v="${esc(x)}">${esc(t(QUAL_LABEL[x]))}</button>`).join("")}</div>
      <button class="btn primary" id="tr-confirm" disabled>${esc(t("train.confirm"))}</button></div>`;
  }
  function renderQuiz(){
    const q = quiz.q;
    train.innerHTML = `
      <button class="btn ghost sm back" id="tr-quit">${icon("back","sm")} ${esc(t("train.change"))}</button>
      <div class="quiz card">
        <div class="quiz-top"><span>${esc(t("train.question", {n:quiz.i + 1, total:ROUND}))}</span><div class="progress"><span style="width:${quiz.i / ROUND * 100}%"></span></div>
          <span class="streak" title="${esc(t("train.streak"))}">${icon("flame","sm")} ${quiz.streak}</span></div>
        <p class="prompt">${esc(q.prompt)}</p>
        ${q.kind === "ouvido" ? `<div><button class="btn soft sm" id="tr-listen">${icon("sound","sm")} ${esc(t("train.listen"))}</button></div>` : ""}
        ${answersHTML(q)}
        <p class="feedback" aria-live="polite"></p>
        <div class="study-row" style="justify-content:flex-end"><button class="btn primary" id="tr-next" hidden>${esc(quiz.i + 1 >= ROUND ? t("train.finish") : t("train.next"))}</button></div>
      </div>`;
    const listen = train.querySelector("#tr-listen"); if(listen) listen.onclick = () => playChord(q.play);
    train.querySelector("#tr-next").onclick = advance;
    train.querySelector("#tr-quit").onclick = renderSetup;
    if(st.mode === "full" && q.full.type === "chord"){
      const confirm = train.querySelector("#tr-confirm");
      const sync = () => { confirm.disabled = !quiz.root; confirm.textContent = quiz.root ? t("train.confirmChord", {chord: quiz.root + quiz.qual}) : t("train.confirm"); };
      train.querySelectorAll(".note-grid .answer").forEach(b => b.onclick = () => {
        if(quiz.answered) return; quiz.root = b.dataset.o;
        train.querySelectorAll(".note-grid .answer").forEach(x => x.setAttribute("aria-pressed", String(x === b))); sync();
      });
      seg(train.querySelector("#tr-qual"), "", v => { quiz.qual = v; sync(); });
      confirm.onclick = () => answer(quiz.root + quiz.qual, confirm);
    } else train.querySelectorAll(".answer").forEach(b => b.onclick = () => answer(b.dataset.o, b));
  }
  function answer(value, btn){
    if(quiz.answered) return;
    quiz.answered = true;
    const q = quiz.q, ok = value === q.answer, fb = train.querySelector(".feedback");
    const building = btn && btn.id === "tr-confirm";
    train.querySelectorAll(".answer").forEach(b => { b.disabled = true; if(!building){ if(b.dataset.o === q.answer) b.classList.add("right"); else if(b !== btn) b.classList.add("dim"); } });
    const qual = train.querySelector("#tr-qual"); if(qual) qual.querySelectorAll("button").forEach(b => b.disabled = true);
    if(ok){ quiz.right++; quiz.streak++; fb.className = "feedback ok"; fb.textContent = t("train.right"); if(q.play && q.kind !== "ouvido") playChord(q.play);
      if(building) btn.classList.add("right-btn");
      const s = train.querySelector(".streak"); s.innerHTML = icon("flame","sm") + " " + quiz.streak; s.classList.add("bump"); }
    else { quiz.streak = 0; if(btn) btn.classList.add(building ? "wrong-btn" : "wrong"); fb.className = "feedback bad"; fb.textContent = t("train.wrong", {answer:q.answer}); }
    train.querySelector(".progress span").style.width = ((quiz.i + 1) / ROUND * 100) + "%";
    const next = train.querySelector("#tr-next"); next.hidden = false; next.focus({preventScroll:true});
  }
  function advance(){ quiz.i++; if(quiz.i >= ROUND) summary(); else nextQuestion(); }
  function summary(){
    const best = Object.assign({}, data.settings.best || {}), prev = best[bestKey()], isBest = prev === undefined || quiz.right > prev;
    if(isBest){ best[bestKey()] = quiz.right; store.setSetting("best", best); }
    const pct = quiz.right / ROUND, msg = pct >= 0.9 ? "great" : pct >= 0.6 ? "good" : "try";
    train.innerHTML = `
      <button class="btn ghost sm back" id="tr-setup">${icon("back","sm")} ${esc(t("train.change"))}</button>
      <div class="card summary" style="max-width:720px">
        <div class="big">${Math.round(pct * 100)}%</div>
        <h2>${esc(t("train.result", {right:quiz.right, total:ROUND}))}</h2>
        <p>${esc(t("train.msg." + msg))}</p>
        <p class="best">${isBest && quiz.right ? esc(t("train.newBest")) : esc(t("train.best", {n: Math.max(prev ?? 0, quiz.right), total:ROUND}))}</p>
        <div class="study-row" style="justify-content:center"><button class="btn primary" id="tr-again">${esc(t("train.again"))}</button></div>
      </div>`;
    train.querySelector("#tr-again").onclick = startQuiz;
    train.querySelector("#tr-setup").onclick = renderSetup;
    train.querySelector("#tr-again").focus({preventScroll:true});
  }
  document.addEventListener("keydown", e => {
    if(!quiz || train.hidden || train.closest("[hidden]") || (e.target instanceof Element && e.target.closest("input,textarea,select"))) return;
    const n = +e.key;
    if(st.mode !== "full" && n >= 1 && n <= 4 && !quiz.answered){ const b = train.querySelectorAll(".answer")[n-1]; if(b){ e.preventDefault(); answer(b.dataset.o, b); } }
    else if(e.key === "Enter" && quiz.answered && document.activeElement === document.body){ e.preventDefault(); advance(); }
  });

  function show(){
    tabs.setSeg(st.tab);
    explore.hidden = st.tab !== "explore"; train.hidden = st.tab !== "train"; hands.hidden = st.tab !== "hands"; metroRoot.hidden = st.tab !== "metro";
    if(st.tab !== "hands") handsUI.hide();
    if(st.tab !== "metro") metro.stop();
    if(st.tab === "metro"){ if(metroUI) metroUI.destroy(); metroUI = mountMetronome(metroRoot, metro, {icon, esc, toast, seg}); }
    if(st.tab === "explore") renderExplore();
    else if(st.tab === "hands") handsUI.show();
    else if(!quiz) renderSetup();
    requestAnimationFrame(() => document.querySelectorAll("#view-study .seg").forEach(paintSeg));
  }
  // Ao trocar de idioma: redesenha (uma pergunta em andamento é refeita no novo idioma).
  function relabel(){ if(quiz && !quiz.answered) nextQuestion(); else if(quiz) renderQuiz(); show(); }
  return {show, relabel, hide: () => { handsUI.hide(); metro.stop(); }};
}
