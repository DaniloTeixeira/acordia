// Modo Estudo: explorador de escalas e campo harmônico, e o treino em forma de jogo.
import { SCALES, noteName, spellScale, scaleDegrees, harmonicField, relativeKey, rootFor, makeQuestion, makeRepertoireQuestion, QUIZ_KINDS, NOTE_GRID, CHORD_QUALITIES, cadence } from "./core.js";
import * as audio from "./audio.js";
import { initHands } from "./hands.js";
import { initKeys } from "./keys.js";
import { initVoice } from "./voice.js";
import { INSTRUMENTS, voicings } from "./instruments.js";
import { instrumentSelect, timbreSelect, fretboardSVG, diagramSVG, voicingMidis } from "./chordview.js";
const { playChord, playSequence } = audio;
import { t, degLabel } from "./i18n.js";

const ROUND = 10;
const WHITE = [0,2,4,5,7,9,11], BLACK = [1,3,6,8,10];

export function initStudy({explore, train, hands, voice, tabs, seg, paintSeg, data, store, toast, icon, esc, getInstrument, chordDialog, getRepertoire, voiceSongs, applyVoiceKey, setSongHigh}){
  const st = Object.assign({tab:"explore", rootPc:0, scaleId:"maior", sevenths:false, kind:"misto", level:"facil", mode:"choice", handsMode:"rhythm"}, data.settings.study || {});
  const persist = () => store.setSetting("study", {tab:st.tab, rootPc:st.rootPc, scaleId:st.scaleId, sevenths:st.sevenths, kind:st.kind, level:st.level, mode:st.mode, handsMode:st.handsMode});
  // Mãos: ritmo (duas mãos em batidas) ou teclado (exercícios técnicos com notas e dedilhado).
  hands.innerHTML = `<div class="seg sub-seg" id="hands-mode" role="group"><button data-v="rhythm"></button><button data-v="keys"></button></div><div id="hands-rhythm"></div><div id="hands-keys" hidden></div>`;
  const handsUI = initHands({root:hands.querySelector("#hands-rhythm"), data, store, toast, icon, esc, audio});
  const keysUI = initKeys({root:hands.querySelector("#hands-keys"), data, store, toast, icon, esc, audio, seg});
  const handsModeSeg = hands.querySelector("#hands-mode");
  seg(handsModeSeg, st.handsMode, v => { st.handsMode = v; persist(); showHands(); });
  function showHands(){
    handsModeSeg.querySelector('[data-v="rhythm"]').textContent = t("hands.modeRhythm");
    handsModeSeg.querySelector('[data-v="keys"]').textContent = t("hands.modeKeys");
    const keys = st.handsMode === "keys";
    hands.querySelector("#hands-rhythm").hidden = keys; hands.querySelector("#hands-keys").hidden = !keys;
    if(keys){ handsUI.hide(); keysUI.show(); } else { keysUI.hide(); handsUI.show(); }
    requestAnimationFrame(() => paintSeg(handsModeSeg));
  }
  let quiz = null;
  // Voz: exercícios para cantores; o atalho "treinar o ouvido" leva ao Treino com o grau de ouvido escolhido.
  const voiceUI = initVoice({root:voice, data, store, toast, icon, esc, audio, seg, paintSeg, getSongs:voiceSongs, applyKey:applyVoiceKey, setSongHigh,
    openEarTraining(){ st.kind = "grauOuvido"; st.tab = "train"; persist(); quiz = null; show(); }});

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
        // Meio ponto para dentro de cada lado: o contorno não fica embaixo da tecla vizinha.
        // Os nomes ficam escondidos: aparecem só no toque (e na caixa ao lado), para associar posição e som.
        // Só a tônica tem uma marca fixa: um "T" com o gradiente do logo no pé da tecla.
        whites += `<rect class="w${cls}" data-midi="${midi}" x="${x + 0.5}" y="0.5" width="${W - 1}" height="${H - 1}" rx="3"/>` + (root ? `<text class="tonic" x="${x + W/2}" y="${H-7}" text-anchor="middle" fill="url(#tonic-grad)">T</text>` : "");
        x += W;
      } else {
        blacks += `<rect class="b${cls}" data-midi="${midi}" x="${x - BW/2}" y="0" width="${BW}" height="${BH}" rx="2"/>` + (root ? `<text class="tonic sm" x="${x}" y="${BH-5}" text-anchor="middle" fill="url(#tonic-grad)">T</text>` : "");
      }
    }
    return `<svg class="keyboard scale" viewBox="-1 -1 ${x + 2} ${H + 2}" role="img" aria-label="${esc(t("study.keyboardAria"))}"><defs><linearGradient id="tonic-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3BD5FA"/><stop offset=".5" stop-color="#4C82F5"/><stop offset="1" stop-color="#9A5CF8"/></linearGradient></defs>${whites}${blacks}</svg>`;
  }
  function flash(midis, cls = "on"){
    midis.forEach(m => explore.querySelectorAll(`[data-midi="${m}"]`).forEach(k => { k.classList.add(cls); setTimeout(()=>k.classList.remove(cls), 450); }));
  }
  // Contorno por cima da tecla tocada, verde (da escala) ou vermelho (fora); o nome e o grau vão para a caixa ao lado.
  // O contorno das brancas entra antes das pretas (não as cobre), o das pretas no fim.
  function markKey(key, ok){
    const svg = key.ownerSVGElement;
    if(key._mark) key._mark.remove();
    const white = key.classList.contains("w"), a = n => +key.getAttribute(n);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "key-mark " + (ok ? "ok" : "no"));
    g.innerHTML = `<rect class="ring" x="${a("x") + 1}" y="${a("y") + 1}" width="${a("width") - 2}" height="${a("height") - 2}" rx="${white ? 2.5 : 1.5}"/>`;
    if(white) svg.insertBefore(g, svg.querySelector("rect.b")); else svg.appendChild(g);
    key._mark = g;
    setTimeout(() => { g.remove(); if(key._mark === g) key._mark = null; }, 700);
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
    const inst = getInstrument(), I = INSTRUMENTS[inst], strings = I.kind === "strings";
    const marks = {}; sc.iv.forEach((iv, i) => { marks[(st.rootPc + iv) % 12] = {label: names[i], root: i === 0}; });
    const keyLabel = root + (sc.minor ? "m" : "");
    const mini = c => { if(!strings || I.arpeggio) return ""; const v = voicings(c.name, inst, 1)[0]; return v ? diagramSVG(v, inst, {small:true}) : ""; };
    explore.innerHTML = `
      <div class="study-controls">
        <div class="roots" role="group" aria-label="${esc(t("study.root"))}">${Array.from({length:12}, (_, pc) => `<button class="root-btn" data-pc="${pc}" aria-pressed="${pc === st.rootPc}">${esc(rootFor(pc, st.scaleId))}</button>`).join("")}</div>
        <div class="study-row">
          <label class="field inst-field"><span>${esc(t("study.scale"))}</span><select class="input" id="st-scale">${Object.keys(SCALES).map(id => `<option value="${id}" ${id === st.scaleId ? "selected" : ""}>${esc(t("scale." + id))}</option>`).join("")}</select></label>
          ${instrumentSelect(inst)}
          ${timbreSelect()}
          <label class="switch lead" style="margin-left:auto">${esc(t("study.sevenths"))}<input type="checkbox" id="st-7" ${st.sevenths ? "checked" : ""} ${field.length ? "" : "disabled"}></label>
        </div>
      </div>
      <div class="card scale-card">
        <div class="scale-head">
          <div><h2>${esc(t("study.scaleOf", {root, scale: t("scale." + st.scaleId).toLowerCase()}))}</h2><p class="sub">${esc(t(sc.minor ? "study.relMajor" : "study.relMinor", {key: relKey}))}</p></div>
          <button class="btn primary sm" id="st-play">${icon("play","sm")} ${esc(t("study.play"))}</button>
        </div>
        <div class="scale-notes">${names.concat(names[0]).map((n, i) => `<button class="note-chip" data-i="${i}"><b>${esc(n)}</b><small>${esc(degLabel(degs[i % names.length]))}</small></button>`).join("")}</div>
        <div class="board-wrap">${strings ? fretboardSVG(inst, marks, I.frets > 12 ? 12 : I.frets) : `<div class="kb-row">${keyboardSVG(byPc)}<div class="key-box" aria-live="polite"><span class="key-box-h">${esc(t("study.keyBox"))}</span><b class="key-box-note">–</b><span class="key-box-sub">${esc(t("study.keyHint"))}</span><span class="key-box-fn" style="visibility:hidden"></span></div></div>`}</div>
      </div>
      <div class="card">
        <div class="scale-head" style="margin-bottom:12px"><div><h2>${esc(t("study.field"))}</h2><p class="sub">${esc(field.length ? t("study.fieldHint") : t("study.noField"))}</p></div></div>
        ${field.length ? `<div class="field-grid">${field.map((c, i) => `<button class="chord-card" data-i="${i}" style="animation-delay:${i*30}ms"><span class="deg">${esc(c.degree)}</span><span class="name" style="--len:${c.name.length}">${esc(c.name)}</span><span class="tones">${esc(c.notes.join(" · "))}</span>${mini(c)}${c.fn ? `<span class="fn ${c.fn}" title="${esc(fnName[c.fn])}">${c.fn}</span>` : ""}</button>`).join("")}</div>
          ${sc.fn ? fnLegend(field, fnName) : ""}` : ""}
      </div>`;
    explore.querySelectorAll(".root-btn").forEach(b => b.onclick = () => { st.rootPc = +b.dataset.pc; persist(); renderExplore(); });
    explore.querySelector("#st-scale").onchange = e => { st.scaleId = e.target.value; persist(); renderExplore(); };
    explore.querySelector("#st-7").onchange = e => { st.sevenths = e.target.checked; persist(); renderExplore(); };
    // A escala fecha com a tônica uma oitava acima, nos chips e na reprodução.
    const base = startMidi(), seq = sc.iv.concat(12);
    explore.querySelector("#st-play").onclick = () => {
      if(!playSequence(seq, {base})) return toast(t("study.noAudio"));
      const chips = explore.querySelectorAll(".note-chip");
      seq.forEach((iv, i) => setTimeout(() => { flash([base + iv]); showKey(base + iv); const c = chips[i % chips.length]; if(c && i < chips.length){ c.classList.remove("lit"); void c.offsetWidth; c.classList.add("lit"); } }, i * 320));
    };
    // Caixa ao lado do teclado: sempre a última nota tocada, com o grau na escala (ou "fora da escala").
    const box = explore.querySelector(".key-box");
    const showKey = midi => {
      if(!box) return;
      const pc = ((midi % 12) + 12) % 12, i = sc.iv.indexOf((pc - st.rootPc + 12) % 12);
      box.classList.toggle("out", i < 0);
      box.querySelector(".key-box-note").textContent = byPc[pc] || noteName(pc, keyLabel);
      box.querySelector(".key-box-sub").textContent = i < 0 ? t("study.keyOut") : t("study.keyDeg", {degree: degLabel(degs[i])});
      // Função harmônica do grau (só nas escalas que têm T/SD/D), no mesmo selo do campo harmônico.
      const f = i >= 0 && sc.fn ? sc.fn[i] : "", fnEl = box.querySelector(".key-box-fn");
      fnEl.style.visibility = f ? "" : "hidden"; // escondido, mas ocupando o lugar: o rodapé não pula
      if(f){ fnEl.className = "key-box-fn fn " + f; fnEl.textContent = fnName[f]; }
      box.classList.remove("pop"); void box.offsetWidth; box.classList.add("pop");
    };
    explore.querySelectorAll(".note-chip").forEach(b => b.onclick = () => { const iv = seq[+b.dataset.i]; playChord([iv], {base}); flash([base + iv]); showKey(base + iv); });
    // Teclas clicáveis; segurando e arrastando, toca as notas por onde passa.
    const kb = explore.querySelector(".board-wrap"); let down = false, lastKey = null;
    const press = el => {
      const key = el && el.closest && el.closest("[data-midi]");
      if(!key || key === lastKey) return;
      lastKey = key;
      if(!playChord([0], {base: +key.dataset.midi, dur: 1.2})) return toast(t("study.noAudio"));
      const pc = +key.dataset.midi % 12;
      if(key.ownerSVGElement && key.ownerSVGElement.classList.contains("keyboard")){ markKey(key, pc in byPc); showKey(+key.dataset.midi); }
      else flash([+key.dataset.midi], "in-scale");
    };
    kb.addEventListener("pointerdown", e => { down = true; lastKey = null; kb.setPointerCapture(e.pointerId); press(e.target); e.preventDefault(); });
    kb.addEventListener("pointermove", e => { if(down) press(document.elementFromPoint(e.clientX, e.clientY)); });
    const up = () => { down = false; lastKey = null; };
    kb.addEventListener("pointerup", up); kb.addEventListener("pointercancel", up);
    explore.querySelectorAll(".chord-card").forEach(b => b.onclick = () => {
      const c = field[+b.dataset.i];
      flash(c.pcs.map(p => base + p));
      chordDialog.open(c.name, keyLabel);
    });
  }

  // ---------- treino ----------
  const KINDS = ["misto", ...QUIZ_KINDS, "repertorio"];
  const question = () => st.kind === "repertorio" ? makeRepertoireQuestion(getRepertoire()) : makeQuestion(st.kind, st.level);
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
    const noRep = st.kind === "repertorio" && !makeRepertoireQuestion(getRepertoire());
    const startBtn = train.querySelector("#tr-start"); startBtn.disabled = noRep;
    if(noRep) startBtn.insertAdjacentHTML("afterend", `<span class="note">${esc(t("train.needRepertoire"))}</span>`);
    startBtn.onclick = startQuiz;
  }
  function startQuiz(){ quiz = {i:0, right:0, streak:0, answered:false, q:null, last:"", root:null, qual:""}; nextQuestion(); }
  function nextQuestion(){
    let q, tries = 0;
    do { q = question(); } while(q && q.prompt + q.answer === quiz.last && ++tries < 5);
    if(!q) return renderSetup();
    Object.assign(quiz, {q, last:q.prompt + q.answer, answered:false, root:null, qual:""});
    renderQuiz();
    if(q.autoplay) setTimeout(() => playQ(q), 250);
  }
  // Som da pergunta: o acorde, ou (grau de ouvido) a cadência no tom e depois a nota.
  function playQ(q, noteOnly = false){
    if(!q.ear) return playChord(q.play);
    const at = audio.audioNow(); if(at === null) return toast(t("study.noAudio"));
    const tonic = 60 + q.ear.tonic - (q.ear.tonic > 6 ? 12 : 0);
    const end = noteOnly ? at + 0.05 : audio.playProgression(cadence(q.ear.minor).map(c => c.map(x => tonic + x)), at + 0.05) + 0.35;
    audio.playNotesAt([tonic + q.ear.note], end, 1.3);
  }
  const optBtn = (o, i, cls = "answer") => `<button class="${cls}" data-o="${esc(o)}" style="animation-delay:${Math.min(i, 12)*25}ms">${i < 4 && cls === "answer" ? `<span class="sr-only">${i+1}. </span>` : ""}${esc(o)}</button>`;
  const noteGrid = (extra = "") => `<div class="note-grid ${extra}" role="group" aria-label="${esc(t("train.notesAria"))}">${NOTE_GRID.map(row => row.map((n, i) => optBtn(n, i, "answer cell")).join("")).join("")}</div>`;
  function answersHTML(q){
    if(st.mode !== "full") return `<div class="answers">${q.options.map((o, i) => optBtn(o, i)).join("")}</div>`;
    if(q.full.type === "notes") return noteGrid();
    if(q.full.type === "list"){ const w = Math.max(...q.full.options.map(o => o.length)); return `<div class="answer-list" style="--cell:${Math.max(68, w * 11 + 28)}px">${q.full.options.map((o, i) => optBtn(o, i, "answer cell")).join("")}</div>`; }
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
        ${q.kind === "ouvido" || q.ear ? `<div class="study-row"><button class="btn soft sm" id="tr-listen">${icon("sound","sm")} ${esc(t("train.listen"))}</button>${q.ear ? `<button class="btn ghost sm" id="tr-note">${esc(t("train.noteOnly"))}</button>` : ""}</div>` : ""}
        ${answersHTML(q)}
        <p class="feedback" aria-live="polite"></p>
        <div class="study-row" style="justify-content:flex-end"><button class="btn primary" id="tr-next" hidden>${esc(quiz.i + 1 >= ROUND ? t("train.finish") : t("train.next"))}</button></div>
      </div>`;
    const listen = train.querySelector("#tr-listen"); if(listen) listen.onclick = () => playQ(q);
    const noteBtn = train.querySelector("#tr-note"); if(noteBtn) noteBtn.onclick = () => playQ(q, true);
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
    // No grau de ouvido as respostas já são números: a tecla 3 responde "3", não a 3ª opção.
    if(quiz.q.ear && n >= 1 && n <= 7 && !quiz.answered){ const b = train.querySelector(`.answer[data-o="${n}"]`); if(b){ e.preventDefault(); answer(b.dataset.o, b); } }
    else if(st.mode !== "full" && n >= 1 && n <= 4 && !quiz.answered){ const b = train.querySelectorAll(".answer")[n-1]; if(b){ e.preventDefault(); answer(b.dataset.o, b); } }
    else if(e.key === "Enter" && quiz.answered && document.activeElement === document.body){ e.preventDefault(); advance(); }
  });

  function show(){
    tabs.setSeg(st.tab);
    if(st.tab === "metro") st.tab = "explore";
    explore.hidden = st.tab !== "explore"; train.hidden = st.tab !== "train"; hands.hidden = st.tab !== "hands"; voice.hidden = st.tab !== "voice";
    if(st.tab !== "hands"){ handsUI.hide(); keysUI.hide(); }
    if(st.tab !== "voice") voiceUI.hide();
    if(st.tab === "explore") renderExplore();
    else if(st.tab === "hands") showHands();
    else if(st.tab === "voice") voiceUI.show();
    else if(!quiz) renderSetup();
    requestAnimationFrame(() => document.querySelectorAll("#view-study .seg").forEach(paintSeg));
  }
  // Ao trocar de idioma: redesenha (uma pergunta em andamento é refeita no novo idioma).
  function relabel(){ if(quiz && !quiz.answered) nextQuestion(); else if(quiz) renderQuiz(); show(); }
  return {show, relabel, hide: () => { handsUI.hide(); keysUI.hide(); voiceUI.hide(); }, rerender(){ if(!explore.hidden && st.tab === "explore") renderExplore(); }};
}
