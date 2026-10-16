import { KEYS, MINOR_KEYS, parseSong, dedupeBlocks, detectKey, keyShift, songTitle, sanitizeEntry, sanitizeItem,
  sanitizeOptions, transition, isChordLine, sanitizeUrl, youtubeId, youtubeStart } from "./core.js";
import { createMetronome, mountMetronome } from "./metronome.js";
import { mountTuner } from "./tuner.js";
import { createChordDialog, instrumentSelect } from "./chordview.js";
import * as audio from "./audio.js";
import { fit, toSVG, lyricsOnly, chordText, chordLine } from "./layout.js";
import { toPDF, saveBlob, pdfAvailable } from "./pdf.js";
import { encodeMedley, decodeMedley } from "./share.js";
import { t, tn, setLang, getLang, detectLang, locale, translateDOM } from "./i18n.js";
import * as store from "./store.js";
import { initStudy } from "./study.js";

const { data } = store;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const icon = (n, cls = "") => `<svg class="i ${cls}"><use href="#i-${n}"/></svg>`;
const norm = s => (s||"").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const songs = n => tn("song", n), medleys = n => tn("medley", n);
function debounce(fn, ms){ let h; const d = (...a) => { clearTimeout(h); h = setTimeout(()=>fn(...a), ms); }; d.flush = (...a) => { clearTimeout(h); fn(...a); }; return d; }

// ---------- utilidades de interface ----------
function toast(msg, action){
  const box = $("#toasts"), el = document.createElement("div");
  el.className = "toast"; el.innerHTML = `<span></span>`; el.firstChild.textContent = msg;
  const close = () => { el.classList.add("out"); setTimeout(()=>el.remove(), 260); };
  if(action){ const b = document.createElement("button"); b.textContent = action.label; b.onclick = () => { action.run(); close(); }; el.appendChild(b); }
  box.appendChild(el);
  setTimeout(close, action ? 6000 : 3200);
}
// Controle segmentado com indicador deslizante.
const segObserver = new ResizeObserver(es => es.forEach(e => paintSeg(e.target)));
function paintSeg(el){
  const b = el.querySelector('[aria-pressed="true"]');
  if(!b || !b.offsetWidth) return;
  el.style.setProperty("--x", b.offsetLeft + "px"); el.style.setProperty("--w", b.offsetWidth + "px");
}
function seg(el, value, onChange){
  const set = v => { $$("button[data-v]", el).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === String(v)))); paintSeg(el); };
  set(value);
  el.addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if(!b || !el.contains(b)) return; e.preventDefault(); set(b.dataset.v); onChange && onChange(b.dataset.v); });
  segObserver.observe(el);
  el.setSeg = set;
  return set;
}
// Botão destrutivo pede um segundo clique em até 3 s.
function armed(btn, run, label = t("common.confirm")){
  let h = null; const orig = btn.innerHTML, origLabel = btn.getAttribute("aria-label");
  btn.addEventListener("click", e => {
    e.stopPropagation();
    if(h){ clearTimeout(h); h = null; run(); return; }
    btn.classList.add("armed"); btn.setAttribute("aria-label", label); btn.title = label;
    h = setTimeout(()=>{ h = null; btn.classList.remove("armed"); btn.innerHTML = orig; if(origLabel) btn.setAttribute("aria-label", origLabel); btn.title = ""; }, 3000);
  });
}
function keyOptions(selected, first){
  const opt = k => `<option value="${k}" ${selected===k?"selected":""}>${k}</option>`;
  return `<option value="">${esc(first)}</option><optgroup label="${esc(t("keys.major"))}">${KEYS.map(opt).join("")}</optgroup><optgroup label="${esc(t("keys.minor"))}">${MINOR_KEYS.map(opt).join("")}</optgroup>`;
}
function ago(ts){
  if(!ts) return "";
  const rel = new Intl.RelativeTimeFormat(locale(), {numeric:"auto"});
  const s = (ts - Date.now())/1000, a = Math.abs(s);
  if(a < 60) return t("common.now");
  if(a < 3600) return rel.format(Math.round(s/60), "minute");
  if(a < 86400) return rel.format(Math.round(s/3600), "hour");
  if(a < 86400*30) return rel.format(Math.round(s/86400), "day");
  return new Date(ts).toLocaleDateString(locale());
}
function slug(s){ return norm(s).replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"") || "medley"; }
// Transição animada entre estados; sem suporte, com movimento reduzido ou com a aba oculta, aplica direto.
function vt(run){
  if(!document.startViewTransition || reduced() || document.hidden){ run(); return null; }
  const tr = document.startViewTransition(run);
  tr.ready.catch(()=>{}); tr.finished.catch(()=>{});
  return tr;
}

// Medida de texto no canvas, com cache: o ajuste da folha mede os mesmos textos dezenas de vezes.
const mctx = document.createElement("canvas").getContext("2d"), mcache = new Map();
function measure(s, fs, font){
  const k = font + "|" + s; let w = mcache.get(k);
  if(w === undefined){
    if(mcache.size > 20000) mcache.clear();
    mctx.font = "100px " + (font === "lex" ? "Lexend, AHSans, sans-serif" : "AHSans, sans-serif");
    w = mctx.measureText(s).width / 100; mcache.set(k, w);
  }
  return w * fs;
}

// ---------- tema e idioma ----------
const THEME_ICON = {system:"monitor", light:"sun", dark:"moon"};
function applyTheme(th){
  if(th === "light" || th === "dark") document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme;
  try{ localStorage.setItem("mg-theme", th); }catch(e){}
  const name = t("theme." + th);
  $$("[data-theme-toggle]").forEach(b=>{
    b.querySelector("use").setAttribute("href", "#i-" + THEME_ICON[th]);
    const span = b.querySelector("span"); if(span) span.textContent = t("theme.label", {name});
    b.setAttribute("aria-label", t("theme.aria", {name}));
  });
  $$('meta[name="theme-color"]').forEach(m => { const dark = th === "dark" || (th === "system" && m.media.includes("dark")); m.content = dark ? "#0B1018" : "#F4F6FA"; });
}
function cycleTheme(){
  const order = ["system","light","dark"], th = order[(order.indexOf(data.settings.theme || "system") + 1) % 3];
  store.setSetting("theme", th);
  vt(() => applyTheme(th));
}
function applyLang(){
  translateDOM();
  $$("[data-lang-toggle]").forEach(b => { const s = b.querySelector("span"); if(s) s.textContent = t("lang.toggle"); b.setAttribute("aria-label", t("lang.aria")); b.title = t("lang.toggle"); });
  applyTheme(data.settings.theme || "system");
}
function toggleLang(){
  const l = getLang() === "pt" ? "en" : "pt";
  store.setSetting("lang", l);
  vt(() => {
    const oldDefault = t("medley.defaultName");
    setLang(l); applyLang(); mcache.clear();
    data.medleys.forEach(m => { if(m.name === oldDefault){ m.name = t("medley.defaultName"); store.saveMedley(m); } });
    renderMedley(); if(view === "library") renderLibrary(); study.relabel();
    $$(".seg").forEach(paintSeg);
  });
}

// ---------- navegação ----------
let view = "medley";
function go(v, {instant} = {}){
  if(!["medley","library","study","tools"].includes(v)) v = "medley";
  if(view === "tools" && v !== "tools") tools && tools.leave();
  const run = () => {
    view = v;
    $$("[data-view]").forEach(s => s.hidden = s.dataset.view !== v);
    $$("[data-nav]").forEach(b => b.dataset.nav === v ? b.setAttribute("aria-current","page") : b.removeAttribute("aria-current"));
    if(v === "library") renderLibrary();
    if(v === "study") study.show(); else study.hide();
    if(v === "tools") tools.show();
    if(v === "medley") renderSheet.flush();
    $$(".seg").forEach(paintSeg);
    window.scrollTo({top:0});
  };
  store.setSetting("view", v);
  if(instant) run(); else vt(run);
}

// ---------- medley atual ----------
function current(){
  let m = data.medleys.get(data.settings.currentMedley);
  if(!m){
    m = [...data.medleys.values()].sort((a,b)=>b.updatedAt-a.updatedAt)[0] || store.createMedley(t("medley.defaultName"));
    store.setSetting("currentMedley", m.id);
  }
  m.options = sanitizeOptions(m.options);
  return m;
}
const saveMedley = debounce(m => store.saveMedley(m), 300);
const saveSong = debounce(s => store.saveSong(s), 400);
const expanded = new Set();
function openMedley(id){
  saveMedley.flush(current());
  store.setSetting("currentMedley", id);
  expanded.clear();
  const m = current(); if(m.items.length) expanded.add(m.items[m.items.length-1].id);
  renderMedley();
}
function newMedley(){
  saveMedley.flush(current());
  const m = store.createMedley(t("medley.newName", {date: new Date().toLocaleDateString(locale(), {day:"2-digit", month:"2-digit"})}));
  store.setSetting("currentMedley", m.id);
  expanded.clear();
  renderMedley(); go("medley");
  const name = $("#medley-name"); name.focus(); name.select();
  toast(t("medley.created"));
}
function renderMedley(){
  $("#medley-name").value = current().name;
  renderItems();
  renderSheet.flush();
  updateCounts();
}
function updateMedleySub(){
  const m = current();
  $("#medley-sub").textContent = m.items.length ? t("medley.saved", {songs: songs(m.items.length)}) : t("medley.startHint");
}
function updateCounts(){
  const n = [...data.songs.values()].filter(s=>s.title).length;
  $$('[data-count="songs"]').forEach(e => e.textContent = n || "");
  updateMedleySub();
}

function renderItems(){
  const m = current(), list = $("#items");
  list.innerHTML = "";
  if(!m.items.length) list.innerHTML = `<li class="empty-state">${icon("music")}<strong>${esc(t("medley.emptyTitle"))}</strong><span>${esc(t("medley.emptyText"))}</span></li>`;
  m.items.forEach((it, i) => list.appendChild(itemCard(m, it, i)));
  updateMedleySub();
}
function itemCard(m, it, i){
  let s = data.songs.get(it.songId);
  if(!s){ s = store.createSong({}); it.songId = s.id; }
  const open = expanded.has(it.id), letra = s.type === "letra";
  const li = document.createElement("li");
  li.className = "item" + (open ? "" : " collapsed"); li.dataset.id = it.id;
  li.innerHTML = `
    <div class="item-head">
      <span class="num">${i+1}</span>
      <button class="item-toggle" aria-expanded="${open}"><span class="item-title"></span><span class="item-chips"></span></button>
      <div class="item-actions">
        <button class="icon-btn sm ref-btn" data-a="ref" aria-label="${esc(t("ref.listen"))}" title="${esc(t("ref.listen"))}" ${s.ref?"":"hidden"}>${icon("play","sm")}</button>
        <button class="icon-btn sm" data-a="up" aria-label="${esc(t("item.up"))}" ${i===0?"disabled":""}>${icon("up","sm")}</button>
        <button class="icon-btn sm" data-a="down" aria-label="${esc(t("item.down"))}" ${i===m.items.length-1?"disabled":""}>${icon("down","sm")}</button>
        <button class="icon-btn sm danger" data-a="rm" aria-label="${esc(t("item.remove"))}">${icon("x","sm")}</button>
        <button class="icon-btn sm" data-a="toggle" aria-label="${esc(t("item.toggle"))}">${icon("chev","sm chev")}</button>
      </div>
    </div>
    <div class="item-body"><div><div class="item-inner">
      <div class="seg sm" data-f="type" role="group" aria-label="${esc(t("item.typeAria"))}"><button data-v="">${esc(t("item.withChords"))}</button><button data-v="letra">${esc(t("item.lyricsOnly"))}</button></div>
      <textarea class="input song-text" spellcheck="false" aria-label="${esc(t("item.textAria", {n:i+1}))}"></textarea>
      <div class="fields">
        <label class="field" data-chords>${esc(t("item.key"))}<select class="input" data-f="key">${keyOptions(s.key, t("item.auto"))}</select></label>
        <label class="field" data-chords>${esc(t("item.target"))}<select class="input" data-f="target">${keyOptions(it.target, t("item.sameKey"))}</select></label>
        <label class="field" data-chords>${esc(t("item.capo"))}<select class="input" data-f="capo"><option value="">—</option>${Array.from({length:11},(_,k)=>`<option ${it.capo==String(k+1)?"selected":""}>${k+1}</option>`).join("")}</select></label>
        <label class="field" data-chords>${esc(t("item.bpm"))}<input class="input" data-f="bpm" type="number" inputmode="numeric" min="20" max="300" placeholder="—"></label>
        <label class="field" style="grid-column:span 2">${esc(t("item.singer"))}<input class="input" data-f="singer" maxlength="80" placeholder="—"></label>
        <label class="field wide">${esc(t("item.notes"))}<input class="input" data-f="notes" maxlength="300" placeholder="${esc(t("item.notesPh"))}"></label>
        <label class="field wide">${esc(t("item.ref"))}<input class="input" data-f="ref" type="url" inputmode="url" autocomplete="off" placeholder="${esc(t("item.refPh"))}"></label>
      </div>
    </div></div></div>`;
  const ta = $("textarea", li); ta.value = s.text; ta.placeholder = t(letra ? "item.phLyrics" : "item.phChords");
  $('[data-f="bpm"]', li).value = s.bpm || "";
  $('[data-f="singer"]', li).value = it.singer || "";
  $('[data-f="notes"]', li).value = it.notes || "";
  $('[data-f="ref"]', li).value = s.ref || "";
  const showChordFields = () => { $$("[data-chords]", li).forEach(e => e.hidden = s.type === "letra"); ta.placeholder = t(s.type === "letra" ? "item.phLyrics" : "item.phChords"); };
  showChordFields();
  const head = () => updateItemHead(li, s, it);
  head();
  const toggle = () => {
    const nowOpen = li.classList.toggle("collapsed") === false;
    nowOpen ? expanded.add(it.id) : expanded.delete(it.id);
    $(".item-toggle", li).setAttribute("aria-expanded", String(nowOpen));
    if(nowOpen){ paintSeg($('[data-f="type"]', li)); setTimeout(()=>ta.focus({preventScroll:true}), 120); }
  };
  $(".item-toggle", li).onclick = toggle;
  $('[data-a="toggle"]', li).onclick = toggle;
  $('[data-a="up"]', li).onclick = () => moveItem(it.id, -1);
  $('[data-a="down"]', li).onclick = () => moveItem(it.id, 1);
  $('[data-a="rm"]', li).onclick = () => removeItem(it.id, li);
  $('[data-a="ref"]', li).onclick = () => openRef(s.ref, s.title);
  $('[data-f="ref"]', li).onchange = e => {
    const v = sanitizeUrl(e.target.value);
    if(e.target.value.trim() && !v) toast(t("ref.bad"));
    s.ref = v; e.target.value = v; saveSong(s); $('[data-a="ref"]', li).hidden = !v;
  };
  seg($('[data-f="type"]', li), s.type || "", v => { s.type = v; saveSong(s); showChordFields(); head(); renderSheet(); });
  ta.addEventListener("input", () => { s.text = ta.value; s.title = songTitle(ta.value); saveSong(s); head(); renderSheet(); updateCounts(); });
  $('[data-f="key"]', li).onchange = e => { s.key = e.target.value; saveSong(s); head(); renderSheet(); };
  $('[data-f="bpm"]', li).oninput = e => { const v = +e.target.value; s.bpm = v > 0 && v < 400 ? String(Math.round(v)) : ""; saveSong(s); head(); renderSheet(); };
  ["target","capo"].forEach(f => $(`[data-f="${f}"]`, li).onchange = e => { it[f] = e.target.value; saveMedley(m); head(); renderSheet(); });
  ["singer","notes"].forEach(f => $(`[data-f="${f}"]`, li).oninput = e => { it[f] = e.target.value; saveMedley(m); head(); renderSheet(); });
  return li;
}
function updateItemHead(li, s, it){
  $(".item-title", li).textContent = s.title || t("item.newSong");
  const chips = [];
  if(s.type === "letra") chips.push(`<span class="chip">${esc(t("item.lyricsOnly"))}</span>`);
  else {
    const key = s.key || (s.text.trim() ? detectKey(parseSong(s.text)) : "");
    if(key && s.text.trim()) chips.push(`<span class="chip accent">${esc(it.target && it.target !== key ? key + " → " + it.target : key)}</span>`);
    if(it.capo) chips.push(`<span class="chip">${esc(t("item.capoChip", {n:it.capo}))}</span>`);
    if(s.bpm) chips.push(`<span class="chip">${esc(t("sheet.bpm", {n:s.bpm}))}</span>`);
  }
  if(it.singer) chips.push(`<span class="chip">${esc(it.singer)}</span>`);
  $(".item-chips", li).innerHTML = chips.join("");
}
function addItem(type){
  const m = current(), s = store.createSong({type});
  const it = store.newItem(s.id); m.items.push(it); expanded.add(it.id);
  store.saveMedley(m); renderItems(); setPane("edit");
  const li = $(`.item[data-id="${it.id}"]`);
  li.scrollIntoView({behavior: reduced() ? "auto" : "smooth", block:"center"});
  $("textarea", li).focus({preventScroll:true});
}
function moveItem(id, dir){
  const m = current(), i = m.items.findIndex(x=>x.id===id), j = i + dir;
  if(i < 0 || j < 0 || j >= m.items.length) return;
  [m.items[i], m.items[j]] = [m.items[j], m.items[i]];
  store.saveMedley(m);
  const run = () => {
    renderItems();
    const li = $(`.item[data-id="${id}"]`); li.classList.add("moved");
    const b = $(`[data-a="${dir<0?"up":"down"}"]`, li); (b.disabled ? $(`[data-a="${dir<0?"down":"up"}"]`, li) : b).focus();
  };
  $$("#items .item").forEach(el => el.style.viewTransitionName = "it-" + el.dataset.id);
  const tr = vt(run);
  const clear = () => $$("#items .item").forEach(el => el.style.viewTransitionName = "");
  if(tr) tr.finished.finally(clear); else clear();
  renderSheet();
}
function removeItem(id, li){
  const m = current(), i = m.items.findIndex(x=>x.id===id); if(i < 0) return;
  const [it] = m.items.splice(i, 1); store.saveMedley(m);
  expanded.delete(id);
  const s = data.songs.get(it.songId);
  li.classList.add("leaving");
  setTimeout(()=>{ renderItems(); renderSheet(); }, reduced() ? 0 : 220);
  if(s && !s.text.trim()){ store.deleteSong(s.id); return; }
  toast(t("item.removed", {title: (s && s.title) || t("item.song")}), {label:t("common.undo"), run:()=>{ m.items.splice(i, 0, it); store.saveMedley(m); renderItems(); renderSheet(); }});
}

// ---------- folha ----------
let sheetMode = "cifras", lastPages = [];
function sheetSongs(m){
  let list = m.items.map(it=>{
    const s = data.songs.get(it.songId); if(!s || !s.text.trim()) return null;
    const letra = s.type === "letra", p = parseSong(s.text, letra);
    if(!p.title) return null;
    const auto = letra ? "" : detectKey(p), key = letra ? "" : (s.key || auto), target = letra ? "" : (it.target || "");
    return Object.assign(p, {key, target, shift: target ? keyShift(key, target) : 0, auto, itemId: it.id, ref: s.ref || "",
      meta: {bpm: letra ? "" : s.bpm, capo: letra ? "" : it.capo, singer: it.singer, notes: it.notes}});
  }).filter(Boolean);
  if(m.options.dedupe) list = dedupeBlocks(list);
  return list;
}
const renderSheet = debounce(() => {
  const m = current(), pv = $("#pages"), warn = $("#sheet-warn");
  const list = sheetSongs(m);
  list.forEach(s=>{ const o = $(`.item[data-id="${s.itemId}"] [data-f="key"] option[value=""]`); if(o) o.textContent = s.auto ? t("item.autoKey", {key:s.auto}) : t("item.auto"); });
  if(!list.length){
    lastPages = []; warn.hidden = true;
    pv.innerHTML = `<div class="sheet-empty empty-state">${icon("file")}<strong>${esc(t("sheet.emptyTitle"))}</strong><span>${esc(t("sheet.emptyText"))}</span></div>`;
    return;
  }
  const res = fit(sheetMode === "letra" ? lyricsOnly(list) : list, Object.assign({}, m.options, {mode: sheetMode, measure}));
  lastPages = res.pages;
  warn.hidden = !res.warn; warn.textContent = res.warn || "";
  const label = t("sheet.label." + sheetMode), total = res.pages.length;
  pv.innerHTML = res.pages.map((p, i) => `<div class="paper">${toSVG(p, t("sheet.aria", {label, n:i+1}))}</div>` + (total > 1 ? `<p class="page-label">${esc(t("sheet.page", {n:i+1, total}))}</p>` : "")).join("");
}, 180);
function setMode(v){ sheetMode = v; store.setSetting("sheetMode", v); renderSheet.flush(); }
function setPane(v){
  $("#medley-grid").dataset.pane = v; $("#pane-toggle").setSeg(v); store.setSetting("pane", v);
  if(v === "sheet") renderSheet.flush();
}
async function downloadPDF(){
  renderSheet.flush();
  if(!lastPages.length) return toast(t("sheet.needSong"));
  if(!pdfAvailable()) return toast(t("sheet.noPdf"));
  const btn = $("#btn-pdf"); btn.disabled = true;
  try{ saveBlob(await toPDF(lastPages), `${slug(current().name)}-${sheetMode}.pdf`); toast(t("sheet.pdfSaved")); }
  catch(e){ toast(t("sheet.pdfFail")); }
  btn.disabled = false;
}
function initOptions(){
  const pop = $("#sheet-options"), btn = $("#btn-options");
  const sync = () => {
    const o = current().options;
    $$("[data-opt]", pop).forEach(el => { const k = el.dataset.opt;
      if(el.type === "checkbox") el.checked = k === "maxPages" ? o.maxPages === 2 : !!o[k]; else el.value = String(o[k]); });
    $$("[data-opt-seg]", pop).forEach(el => el.setSeg(String(o[el.dataset.optSeg])));
  };
  const change = (k, v) => { const m = current(); m.options[k] = v; m.options = sanitizeOptions(m.options); store.saveMedley(m); renderSheet(); };
  $$("[data-opt]", pop).forEach(el => el.addEventListener("change", () => {
    const k = el.dataset.opt;
    change(k, el.type === "checkbox" ? (k === "maxPages" ? (el.checked ? 2 : 1) : el.checked) : +el.value);
  }));
  $$("[data-opt-seg]", pop).forEach(el => seg(el, "", v => change(el.dataset.optSeg, el.dataset.optSeg === "columns" && v !== "auto" ? +v : v)));
  pop.addEventListener("beforetoggle", e => {
    if(e.newState !== "open") return;
    sync();
    const r = btn.getBoundingClientRect(), w = Math.min(320, innerWidth - 32);
    pop.style.top = Math.min(r.bottom + 8, innerHeight - 20) + "px";
    pop.style.left = Math.max(16, Math.min(r.right - w, innerWidth - w - 16)) + "px";
  });
  pop.addEventListener("toggle", () => $$(".seg", pop).forEach(paintSeg));
}

// ---------- adicionar da biblioteca ----------
function openPicker(){
  const dlg = $("#dlg-picker"), list = $("#picker-list"), q = $("#picker-q"), ok = $("#picker-ok");
  const chosen = new Set(), inMedley = new Set(current().items.map(i=>i.songId));
  const label = () => { ok.disabled = !chosen.size; ok.textContent = chosen.size > 1 ? t("common.addN", {n:chosen.size}) : t("common.add"); };
  const draw = () => {
    const nq = norm(q.value);
    const rows = [...data.songs.values()].filter(s=>s.title && (!nq || norm(s.title).includes(nq) || norm(s.text).includes(nq))).sort((a,b)=>a.title.localeCompare(b.title, locale()));
    list.innerHTML = rows.length ? "" : `<li class="empty-state"><span>${esc(t([...data.songs.values()].some(s=>s.title) ? "picker.none" : "picker.emptyLib"))}</span></li>`;
    rows.forEach(s=>{
      const li = document.createElement("li");
      li.innerHTML = `<label><input type="checkbox" value="${s.id}" ${chosen.has(s.id)?"checked":""}><span class="t"></span></label>${s.type==="letra"?`<span class="chip">${esc(t("item.lyricsOnly"))}</span>`:""}${inMedley.has(s.id)?`<span class="chip accent">${esc(t("picker.inMedley"))}</span>`:""}`;
      $(".t", li).textContent = s.title;
      $("input", li).onchange = e => { e.target.checked ? chosen.add(s.id) : chosen.delete(s.id); label(); };
      list.appendChild(li);
    });
  };
  q.value = ""; label(); q.oninput = draw; draw();
  dlg.onclose = () => {
    if(dlg.returnValue !== "ok" || !chosen.size) return;
    const m = current();
    chosen.forEach(id => m.items.push(store.newItem(id)));
    store.saveMedley(m); renderItems(); renderSheet();
    toast(tn("picker.added", chosen.size));
  };
  dlg.showModal();
}
function addSongToMedley(id){
  const m = current(); m.items.push(store.newItem(id)); store.saveMedley(m);
  renderItems(); renderSheet();
  toast(t("picker.addedTo", {title: data.songs.get(id).title, medley: m.name}), {label:t("common.see"), run:()=>go("medley")});
  renderLibrary();
}

// ---------- compartilhar ----------
function medleyPayload(m){
  return {name: m.name, options: m.options, songs: m.items.map(it=>{ const s = data.songs.get(it.songId); return s && s.text.trim() ? {text:s.text, type:s.type, key:s.key, bpm:s.bpm, ref:s.ref, target:it.target, capo:it.capo, singer:it.singer, notes:it.notes} : null; }).filter(Boolean)};
}
async function shareMedley(m = current()){
  const payload = medleyPayload(m);
  if(!payload.songs.length) return toast(t("share.needSong"));
  const url = location.href.split("#")[0] + "#m=" + await encodeMedley(payload);
  $("#share-url").value = url;
  $("#share-size").textContent = url.length > 8000 ? t("share.long", {n: url.length.toLocaleString(locale())}) : t("share.count", {songs: songs(payload.songs.length)});
  const nat = $("#share-native"); nat.hidden = !navigator.share;
  nat.onclick = () => navigator.share({title: m.name, text: t("share.text", {name:m.name}), url}).catch(()=>{});
  $("#share-copy").onclick = async () => {
    try{ await navigator.clipboard.writeText(url); }catch(e){ $("#share-url").select(); document.execCommand("copy"); }
    toast(t("share.copied"));
  };
  $("#dlg-share").showModal(); $("#share-url").select();
}
function findOrCreateSong(e){
  const same = [...data.songs.values()].find(s => norm(s.title) === norm(songTitle(e.text)) && s.text.trim() === e.text.trim());
  if(same && e.ref && !same.ref){ same.ref = e.ref; store.saveSong(same); }
  return same || store.createSong({text:e.text, type:e.type, key:e.key, bpm:e.bpm, ref:e.ref});
}
async function checkIncoming(){
  const m = /^#m=(.+)$/.exec(location.hash); if(!m) return;
  const med = await decodeMedley(m[1]);
  history.replaceState(null, "", location.pathname + location.search);
  if(!med) return toast(t("incoming.bad"));
  const dlg = $("#dlg-incoming");
  $("#incoming-desc").textContent = t("incoming.desc", {name: med.name, songs: songs(med.songs.length)});
  $("#incoming-list").innerHTML = med.songs.map(s => `<li>${esc(s.title)}${s.target ? ` <span class="chip accent">${esc(s.target)}</span>` : ""}</li>`).join("");
  dlg.onclose = () => {
    if(dlg.returnValue !== "ok") return;
    const items = med.songs.map(e => store.newItem(findOrCreateSong(e).id, sanitizeItem(e)));
    const nm = store.createMedley(med.name, items, med.options);
    // Um medley vazio aberto (ex.: primeiro acesso pelo link) não precisa ficar sobrando.
    const prev = current(); if(prev.id !== nm.id && !prev.items.length) store.deleteMedley(prev.id);
    openMedley(nm.id); go("medley");
    toast(t("incoming.saved"));
  };
  dlg.showModal();
}

// ---------- biblioteca ----------
let libTab = "songs", libFilter = "all", libSort = "az";
function usage(){
  const u = new Map();
  data.medleys.forEach(m => new Set(m.items.map(i=>i.songId)).forEach(id => u.set(id, (u.get(id)||0) + 1)));
  return u;
}
function excerpt(s){
  return s.text.split("\n").slice(1).map(l=>l.trim()).filter(l=>l && !isChordLine(l) && !/^\[.*\]$/.test(l)).slice(0, 2).join(" / ");
}
function card(idx){ const li = document.createElement("li"); li.className = "lib-card"; li.style.animationDelay = Math.min(idx, 12) * 25 + "ms"; return li; }
function emptyCard(ic, title, text){ return `<li class="empty-state" style="grid-column:1/-1">${icon(ic)}<strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ""}</li>`; }
function renderLibrary(){
  const list = $("#lib-list"), q = norm($("#lib-q").value);
  const all = [...data.songs.values()].filter(s=>s.title), meds = [...data.medleys.values()];
  $("#lib-sub").textContent = t("lib.sub", {songs: songs(all.length), medleys: medleys(meds.length)});
  $('#lib-tabs [data-v="songs"]').textContent = t("lib.songs", {n: all.length});
  $('#lib-tabs [data-v="medleys"]').textContent = t("lib.medleys", {n: meds.length});
  paintSeg($("#lib-tabs"));
  $("#lib-filter").hidden = libTab !== "songs"; $("#lib-sort").hidden = libTab !== "songs";
  list.innerHTML = "";
  if(libTab === "songs"){
    const u = usage(), cur = new Set(current().items.map(i=>i.songId));
    const rows = all.filter(s => (!q || norm(s.title).includes(q) || norm(s.text).includes(q)) && (libFilter === "all" || (libFilter === "letra") === (s.type === "letra")))
      .sort(libSort === "recent" ? (a,b)=>(b.updatedAt||0)-(a.updatedAt||0) : (a,b)=>a.title.localeCompare(b.title, locale()));
    if(!rows.length){ list.innerHTML = all.length ? emptyCard("search", t("lib.noResults"), t("lib.noResultsText")) : emptyCard("library", t("lib.empty"), t("lib.emptyText")); return; }
    rows.forEach((s, idx) => {
      const li = card(idx), n = u.get(s.id) || 0;
      const key = s.type === "letra" ? "" : (s.key || detectKey(parseSong(s.text)));
      li.innerHTML = `<h3></h3>
        <div class="meta">${s.type==="letra" ? `<span class="chip">${esc(t("item.lyricsOnly"))}</span>` : key ? `<span class="chip accent">${esc(t("lib.key", {key}))}</span>` : ""}${s.bpm ? `<span class="chip">${esc(t("sheet.bpm", {n:s.bpm}))}</span>` : ""}${n ? `<span class="chip">${esc(medleys(n))}</span>` : ""}</div>
        <p class="excerpt"></p>
        <div class="foot">${cur.has(s.id) ? `<span class="chip accent">${icon("check","sm")} ${esc(t("lib.inCurrent"))}</span><span style="margin-right:auto"></span>` : `<button class="btn soft sm" data-a="add">${icon("plus","sm")} ${esc(t("common.add"))}</button>`}
          <span class="when">${esc(ago(s.updatedAt))}</span>
          ${s.ref ? `<button class="icon-btn sm ref-btn" data-a="ref" aria-label="${esc(t("ref.listen"))}" title="${esc(t("ref.listen"))}">${icon("play","sm")}</button>` : ""}
          <button class="icon-btn sm" data-a="edit" aria-label="${esc(t("common.edit"))}" title="${esc(t("common.edit"))}">${icon("edit","sm")}</button>
          <button class="icon-btn sm danger" data-a="del" aria-label="${esc(t("common.delete"))}" title="${esc(t("common.delete"))}">${icon("trash","sm")}</button></div>`;
      $("h3", li).textContent = s.title; $(".excerpt", li).textContent = excerpt(s);
      const refBtn = $('[data-a="ref"]', li); if(refBtn) refBtn.onclick = () => openRef(s.ref, s.title);
      const add = $('[data-a="add"]', li); if(add) add.onclick = () => addSongToMedley(s.id);
      $('[data-a="edit"]', li).onclick = () => editSong(s);
      armed($('[data-a="del"]', li), () => deleteSong(s), n ? t("lib.deleteUsed", {medleys: medleys(n)}) : t("common.confirmDelete"));
      list.appendChild(li);
    });
  } else {
    const curId = current().id;
    const rows = meds.filter(m => !q || norm(m.name).includes(q) || m.items.some(i => norm((data.songs.get(i.songId)||{}).title).includes(q))).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    if(!rows.length){ list.innerHTML = emptyCard("list", t("lib.noMedleys")); return; }
    rows.forEach((m, idx) => {
      const li = card(idx), titles = m.items.map(i => (data.songs.get(i.songId)||{}).title).filter(Boolean);
      li.innerHTML = `<h3></h3>
        <div class="meta"><span class="chip">${esc(songs(titles.length))}</span>${m.id === curId ? `<span class="chip accent">${esc(t("lib.open"))}</span>` : ""}</div>
        <p class="excerpt"></p>
        <div class="foot"><button class="btn soft sm" data-a="open">${esc(t("common.open"))}</button>
          <span class="when">${esc(ago(m.updatedAt))}</span>
          <button class="icon-btn sm" data-a="dup" aria-label="${esc(t("common.duplicate"))}" title="${esc(t("common.duplicate"))}">${icon("copy","sm")}</button>
          <button class="icon-btn sm" data-a="share" aria-label="${esc(t("common.share"))}" title="${esc(t("common.share"))}">${icon("share","sm")}</button>
          <button class="icon-btn sm danger" data-a="del" aria-label="${esc(t("common.delete"))}" title="${esc(t("common.delete"))}">${icon("trash","sm")}</button></div>`;
      $("h3", li).textContent = m.name; $(".excerpt", li).textContent = titles.join(" · ") || t("lib.emptyMedley");
      $('[data-a="open"]', li).onclick = () => { openMedley(m.id); go("medley"); };
      $('[data-a="dup"]', li).onclick = () => {
        const c = store.createMedley(t("lib.copyName", {name:m.name}), m.items.map(i => store.newItem(i.songId, sanitizeItem(i))), m.options);
        toast(t("lib.created", {name:c.name}), {label:t("common.open"), run:()=>{ openMedley(c.id); go("medley"); }}); renderLibrary();
      };
      $('[data-a="share"]', li).onclick = () => shareMedley(m);
      armed($('[data-a="del"]', li), () => deleteMedley(m), t("common.confirmDelete"));
      list.appendChild(li);
    });
  }
}
function deleteSong(s){
  let n = 0;
  data.medleys.forEach(m => { const before = m.items.length; m.items = m.items.filter(i => i.songId !== s.id); if(m.items.length !== before){ n++; store.saveMedley(m); } });
  store.deleteSong(s.id);
  toast(n ? t("lib.songDeletedUsed", {title:s.title, medleys: medleys(n)}) : t("lib.songDeleted", {title:s.title}));
  renderLibrary(); renderItems(); renderSheet(); updateCounts();
}
function deleteMedley(m){
  const wasCurrent = m.id === current().id;
  store.deleteMedley(m.id);
  if(wasCurrent){ store.setSetting("currentMedley", ""); renderMedley(); }
  toast(t("lib.medleyDeleted", {name:m.name}));
  renderLibrary();
}
function editSong(s){
  const dlg = $("#dlg-song"), isNew = !s;
  let type = s ? s.type : "";
  $("#song-h").textContent = t(isNew ? "song.newTitle" : "song.editTitle");
  $("#song-text").value = s ? s.text : "";
  $("#song-key").innerHTML = keyOptions(s ? s.key : "", t("item.auto"));
  $("#song-bpm").value = s ? s.bpm : "";
  $("#song-ref").value = s ? (s.ref || "") : "";
  const typeSeg = $("#song-type"), keyField = $("#song-key").closest(".field");
  if(!typeSeg.setSeg) seg(typeSeg, "", v => { type = v; keyField.hidden = v === "letra"; });
  typeSeg.setSeg(type); keyField.hidden = type === "letra";
  dlg.onclose = () => {
    if(dlg.returnValue !== "ok") return;
    const text = $("#song-text").value;
    if(!songTitle(text)) return toast(t("song.needTitle"));
    const bpm = +$("#song-bpm").value, fields = {text, title: songTitle(text), type, key: $("#song-key").value, bpm: bpm > 0 && bpm < 400 ? String(Math.round(bpm)) : "", ref: sanitizeUrl($("#song-ref").value)};
    if(isNew) store.createSong(fields); else { Object.assign(s, fields); store.saveSong(s); }
    toast(t(isNew ? "song.saved" : "song.updated"));
    renderLibrary(); renderItems(); renderSheet(); updateCounts();
  };
  dlg.showModal(); requestAnimationFrame(() => { paintSeg(typeSeg); $("#song-text").focus(); });
}
function exportLibrary(){
  const all = [...data.songs.values()].filter(s=>s.title);
  if(!all.length) return toast(t("lib.emptyExport"));
  const json = JSON.stringify({app:"sonora", version:2, exportedAt:new Date().toISOString(),
    songs: all.map(({id,title,text,type,key,bpm,ref,updatedAt})=>({id,title,text,type,key,bpm,ref,updatedAt})),
    medleys: [...data.medleys.values()].map(({id,name,items,options,updatedAt})=>({id,name,options,updatedAt,items:items.map(({songId,target,capo,singer,notes})=>({songId,target,capo,singer,notes}))}))}, null, 2);
  saveBlob(new Blob([json], {type:"application/json"}), "sonora-backup-" + new Date().toISOString().slice(0,10) + ".json");
  toast(t("lib.exported"));
}
async function importLibrary(file){
  try{
    const d = JSON.parse(await file.text());
    const rows = Array.isArray(d) ? d : d && d.songs;
    if(!Array.isArray(rows)) throw 0;
    const idMap = new Map(); let ns = 0, nm = 0;
    rows.forEach(raw => {
      const e = sanitizeEntry(raw); if(!e) return;
      const fields = {text:e.text, title:e.title, type:e.type, key:e.key, bpm:e.bpm, ref:e.ref};
      let s = (e.id && data.songs.get(e.id)) || [...data.songs.values()].find(x => norm(x.title) === norm(e.title));
      if(s){ Object.assign(s, fields); store.saveSong(s); }
      else s = store.createSong(Object.assign(fields, e.id ? {id:e.id} : {}));
      if(e.id) idMap.set(e.id, s.id);
      ns++;
    });
    (Array.isArray(d.medleys) ? d.medleys : []).forEach(r => {
      if(!r || !Array.isArray(r.items)) return;
      const items = r.items.map(i => i && idMap.get(i.songId) ? store.newItem(idMap.get(i.songId), sanitizeItem(i)) : null).filter(Boolean);
      const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0,80) : t("lib.importedMedley");
      const ex = typeof r.id === "string" && data.medleys.get(r.id);
      if(ex){ Object.assign(ex, {name, items, options: sanitizeOptions(r.options)}); store.saveMedley(ex); }
      else { const m = store.createMedley(name, items, r.options); if(typeof r.id === "string" && r.id){ store.deleteMedley(m.id); m.id = r.id; store.saveMedley(m); } }
      nm++;
    });
    toast(nm ? t("lib.importedBoth", {songs: songs(ns), medleys: medleys(nm)}) : t("lib.imported", {songs: songs(ns)}));
    renderLibrary(); renderMedley();
  }catch(err){ toast(t("lib.badFile")); }
}

// ---------- modo palco ----------
let stageMode = "cifras", wakeLock = null;
const stageFsDefault = () => innerWidth < 700 ? 19 : 24;
function renderStage(){
  const m = current(), L = stageMode === "letra", list = sheetSongs(m), src = L ? lyricsOnly(list) : list;
  const box = $("#stage-content");
  $("#stage").classList.toggle("letra", L);
  box.style.setProperty("--stage-fs", (data.settings.stageFs || stageFsDefault()) + "px");
  box.innerHTML = src.map((s, si) => {
    const key = s.target || s.key;
    const meta = [!L && s.meta.bpm && t("sheet.bpm", {n:s.meta.bpm}), !L && s.meta.capo && t("sheet.capo", {n:s.meta.capo}), s.meta.singer && t("sheet.voice", {name:s.meta.singer}), s.meta.notes].filter(Boolean).join(" · ");
    const blocks = s.blocks.map(b => `<div class="stage-block">${b.map(it => {
      let h = "";
      if(it.chord !== undefined && it.chord !== null && !L) h += `<p class="stage-line ch">${chordSpans(chordLine(it.chord, s, stageMode, m.options.degreeStyle), key)}</p>`;
      if(it.lyric !== undefined) h += `<p class="stage-line">${esc(it.lyric)}</p>`;
      return h; }).join("")}</div>`).join("");
    const next = src[si+1], tr = m.options.transitions && !L && next ? transition(key, next.target || next.key) : null;
    const ref = s.ref ? `<button class="btn soft sm stage-ref" data-url="${esc(s.ref)}" data-title="${esc(s.title)}">${icon("play","sm")} ${esc(t("ref.listen"))}</button>` : "";
    return `<section class="stage-song"><h2>${esc(s.title)}${key && !L ? ` <small>(${esc(key)})</small>` : ""}</h2>${meta || ref ? `<p class="meta">${esc(meta)} ${ref}</p>` : ""}${blocks}</section>`
      + (tr && !tr.same ? `<p class="stage-trans">→ ${esc(next.target || next.key)}: ${esc(tr.text)}${tr.passing ? " · " + esc(t("sheet.passing", {chord: stageMode === "graus" ? "V7" : tr.passing})) : ""}</p>` : "");
  }).join("") || `<div class="empty-state"><strong>${esc(t("stage.empty"))}</strong><span>${esc(t("stage.emptyText"))}</span></div>`;
  $$(".stage-ref", box).forEach(b => b.addEventListener("click", e => { e.stopPropagation(); openRef(b.dataset.url, b.dataset.title); }));
  $$(".chd", box).forEach(b => b.addEventListener("click", e => { e.stopPropagation(); chordDialog.open(b.dataset.chord, b.dataset.key); }));
}
// Linha de cifra com cada acorde clicável (abre os detalhes no instrumento escolhido).
function chordSpans(cl, key){
  let out = "", at = 0;
  cl.chords.forEach(c => { out += esc(cl.text.slice(at, c.pos)) + `<span class="chd" data-chord="${esc(c.chord)}" data-key="${esc(key || "")}">${esc(cl.text.slice(c.pos, c.pos + c.len))}</span>`; at = c.pos + c.len; });
  return out + esc(cl.text.slice(at));
}
async function lockScreen(){ try{ if("wakeLock" in navigator && !document.hidden) wakeLock = await navigator.wakeLock.request("screen"); }catch(e){} }
function openStage(){
  stageMode = sheetMode; $("#stage-mode").setSeg(stageMode);
  renderStage();
  const st = $("#stage"); st.hidden = false; document.body.style.overflow = "hidden";
  $("#stage-scroll").scrollTop = 0; $("#stage-scroll").focus();
  paintSeg($("#stage-mode"));
  if(!$(".stage-hint", st)) st.insertAdjacentHTML("beforeend", `<div class="stage-hint">${esc(t("stage.hint"))}</div>`);
  if(document.documentElement.requestFullscreen && matchMedia("(pointer:coarse)").matches) document.documentElement.requestFullscreen().catch(()=>{});
  lockScreen();
}
function closeStage(){
  $("#stage").hidden = true; document.body.style.overflow = "";
  metro.stop(); $("#stage-metro-panel").hidden = true; $("#stage-metro").setAttribute("aria-pressed", "false");
  const hint = $(".stage-hint"); if(hint) hint.remove();
  if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  if(wakeLock){ wakeLock.release().catch(()=>{}); wakeLock = null; }
  $("#btn-stage").focus();
}
function stagePage(dir){ const sc = $("#stage-scroll"); sc.scrollBy({top: dir * sc.clientHeight * 0.82, behavior: reduced() ? "auto" : "smooth"}); }
function stageFont(d){ const v = Math.max(12, Math.min(48, (data.settings.stageFs || stageFsDefault()) + d)); store.setSetting("stageFs", v); $("#stage-content").style.setProperty("--stage-fs", v + "px"); }
function initStage(){
  seg($("#stage-mode"), "cifras", v => { stageMode = v; renderStage(); });
  $("#stage-close").onclick = closeStage;
  let mini = null;
  $("#stage-metro").onclick = () => {
    const panel = $("#stage-metro-panel"), open = panel.hidden;
    panel.hidden = !open; $("#stage-metro").setAttribute("aria-pressed", String(open));
    if(!open){ metro.stop(); return; }
    if(!mini) mini = mountMetronome(panel, metro, {compact:true, icon, esc, toast, seg});
    // Começa no BPM da primeira música que tiver um.
    const withBpm = sheetSongs(current()).find(s => +s.meta.bpm);
    if(withBpm && !metro.running) metro.set({bpm: +withBpm.meta.bpm});
  };
  $("#stage-smaller").onclick = () => stageFont(-2);
  $("#stage-bigger").onclick = () => stageFont(2);
  $("#stage-scroll").addEventListener("click", e => {
    if(getSelection().toString()) return;
    const r = e.currentTarget.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    if(y > 0.6) stagePage(1); else if(y < 0.3) stagePage(-1);
  });
  document.addEventListener("keydown", e => {
    if($("#stage").hidden) return;
    if(e.target instanceof Element && e.target.closest("button,input,select")) return;
    if(["ArrowDown","PageDown","ArrowRight"," "].includes(e.key)){ e.preventDefault(); stagePage(1); }
    else if(["ArrowUp","PageUp","ArrowLeft"].includes(e.key)){ e.preventDefault(); stagePage(-1); }
    else if(e.key === "Escape"){ e.preventDefault(); closeStage(); }
    else if(e.key === "+" || e.key === "=") stageFont(2);
    else if(e.key === "-") stageFont(-2);
  });
  document.addEventListener("visibilitychange", () => { if(!$("#stage").hidden && !document.hidden) lockScreen(); });
}

// ---------- instalar e atualizar ----------
function initInstall(){
  let deferred = null;
  const btns = $$("[data-install]");
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if(isIOS && !standalone) btns.forEach(b => b.hidden = false);
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; btns.forEach(b => b.hidden = false); });
  addEventListener("appinstalled", () => { btns.forEach(b => b.hidden = true); toast(t("install.done")); });
  btns.forEach(b => b.onclick = async () => {
    if(deferred){ deferred.prompt(); const r = await deferred.userChoice.catch(()=>null); if(r && r.outcome === "accepted") btns.forEach(x => x.hidden = true); deferred = null; }
    else $("#dlg-install").showModal();
  });
}
function initServiceWorker(){
  if(!("serviceWorker" in navigator)) return;
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if(had) toast(t("update.ready"), {label:t("update.reload"), run:()=>location.reload()}); });
  // O módulo termina de iniciar depois do IndexedDB, quase sempre após o evento load.
  const register = () => navigator.serviceWorker.register("sw.js").catch(()=>{});
  if(document.readyState === "complete") register(); else addEventListener("load", register);
}

// ---------- início ----------
// ---------- link de referência (YouTube toca dentro do app) ----------
function openRef(url, title){
  if(!url) return;
  const id = youtubeId(url);
  if(!id){ window.open(url, "_blank", "noopener"); return; }
  const dlg = $("#dlg-player"), box = $("#player-box");
  $("#player-h").textContent = title || t("ref.title");
  $("#player-open").href = url;
  $("#player-offline").hidden = navigator.onLine !== false;
  const start = youtubeStart(url);
  box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1${start ? "&start=" + start : ""}" title="${esc(title || "YouTube")}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  dlg.onclose = () => { box.innerHTML = ""; };
  dlg.showModal();
}

// ---------- instrumento escolhido ----------
const getInstrument = () => data.settings.instrument || "keys";
function setInstrument(v){
  if(v === getInstrument()) return;
  store.setSetting("instrument", v);
  $$("select[data-instrument]").forEach(s => { s.value = v; });
  study.rerender(); tools.instrumentChanged(); chordDialog.refresh();
}

// ---------- ferramentas: metrônomo e afinador ----------
function initTools(){
  let tab = data.settings.toolsTab === "tuner" ? "tuner" : "metro", metroUI = null, tuner = null;
  const show = () => {
    $("#tools-metro").hidden = tab !== "metro"; $("#tools-tuner").hidden = tab !== "tuner";
    if(tab === "metro"){ if(metroUI) metroUI.destroy(); metroUI = mountMetronome($("#tools-metro"), metro, {icon, esc, toast, seg}); if(tuner) tuner.stop(); }
    else { metro.stop(); if(!tuner) tuner = mountTuner($("#tools-tuner"), {icon, esc, toast, data, store, instrumentSelect: () => instrumentSelect(getInstrument())}); }
    $$("#view-tools .seg").forEach(paintSeg);
  };
  seg($("#tools-tabs"), tab, v => { tab = v; store.setSetting("toolsTab", v); show(); });
  document.addEventListener("keydown", e => {
    if(view !== "tools" || tab !== "metro" || !metroUI || (e.target instanceof Element && e.target.closest("input:not([type=range]):not([type=checkbox]),textarea,select,button"))) return;
    metroUI.key(e);
  });
  return {
    show,
    leave(){ metro.stop(); if(tuner) tuner.stop(); },
    instrumentChanged(){ if(tuner) tuner.render(); }
  };
}

let study, metro, tools, chordDialog;
async function main(){
  await store.init(() => toast(t("lib.saveFail")));
  setLang(data.settings.lang || detectLang());
  // Nomes padrão antigos (de quando o app se chamava Medley Generator) passam para o nome atual.
  data.medleys.forEach(m => { if(["Meu medley", "My medley", "Meu repertório", "My setlist"].includes(m.name) && m.name !== t("medley.defaultName")){ m.name = t("medley.defaultName"); store.saveMedley(m); } });
  applyLang();
  sheetMode = ["cifras","graus","letra"].includes(data.settings.sheetMode) ? data.settings.sheetMode : "cifras";
  metro = createMetronome(audio, data.settings.metro || {});
  metro.onChange(debounce(s => store.setSetting("metro", s), 500));
  chordDialog = createChordDialog({dlg: $("#dlg-chord"), audio, getInstrument, setInstrument, icon});
  tools = initTools();
  document.addEventListener("change", e => { if(e.target.matches && e.target.matches("select[data-instrument]")) setInstrument(e.target.value); });
  $("#pages").addEventListener("click", e => { const r = e.target.closest && e.target.closest("rect.hit"); if(r) chordDialog.open(r.dataset.chord, r.dataset.key); });
  study = initStudy({explore: $("#study-explore"), train: $("#study-train"), hands: $("#study-hands"), getInstrument, chordDialog, tabs: $("#study-tabs"), seg, paintSeg, data, store, toast, icon, esc});

  $$("[data-nav]").forEach(b => b.onclick = () => go(b.dataset.nav));
  $$(".brand").forEach(a => a.addEventListener("click", e => { e.preventDefault(); go("medley"); }));
  $$("[data-theme-toggle]").forEach(b => b.onclick = cycleTheme);
  $$("[data-lang-toggle]").forEach(b => b.onclick = toggleLang);
  seg($("#mode-seg"), sheetMode, setMode);
  const pane = data.settings.pane === "sheet" ? "sheet" : "edit";
  seg($("#pane-toggle"), pane, setPane); $("#medley-grid").dataset.pane = pane;
  $("#medley-name").addEventListener("input", e => { const m = current(); m.name = e.target.value.trim() || t("medley.noName"); saveMedley(m); });
  $("#medley-name").addEventListener("keydown", e => { if(e.key === "Enter") e.target.blur(); });
  $("#btn-new-medley").onclick = newMedley;
  $("#btn-share").onclick = () => shareMedley();
  $("#btn-stage").onclick = openStage;
  $("#add-chords").onclick = () => addItem("");
  $("#add-lyrics").onclick = () => addItem("letra");
  $("#add-library").onclick = openPicker;
  $("#btn-pdf").onclick = downloadPDF;
  $("#btn-print").onclick = () => { renderSheet.flush(); if(!lastPages.length) return toast(t("sheet.needSong")); window.print(); };
  initOptions(); initStage(); initInstall();

  seg($("#lib-tabs"), libTab, v => { libTab = v; renderLibrary(); });
  seg($("#lib-filter"), libFilter, v => { libFilter = v; renderLibrary(); });
  $("#lib-sort").onchange = e => { libSort = e.target.value; renderLibrary(); };
  $("#lib-q").addEventListener("input", debounce(renderLibrary, 120));
  $("#lib-new").onclick = () => editSong(null);
  $("#lib-export").onclick = exportLibrary;
  $("#lib-import").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if(f) importLibrary(f); };
  $("#lib-import-btn").addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); $("#lib-import").click(); } });

  const m = current();
  if(m.items.length === 1 || m.items.some(i => !(data.songs.get(i.songId)||{text:""}).text.trim())) m.items.forEach(i => expanded.add(i.id));
  renderMedley();
  go(data.settings.view || "medley", {instant:true});
  // As fontes da folha precisam estar carregadas para medir o texto certo.
  Promise.all(["700 10px AHMono","400 10px AHMono","400 10px AHSans","700 10px AHSans","400 10px Lexend","700 10px Lexend"].map(f => document.fonts.load(f).catch(()=>null)))
    .then(() => { mcache.clear(); renderSheet.flush(); $$(".seg").forEach(paintSeg); });
  addEventListener("resize", debounce(() => $$(".seg").forEach(paintSeg), 100));
  addEventListener("pagehide", () => saveMedley.flush(current()));
  checkIncoming();
  addEventListener("hashchange", checkIncoming);
  initServiceWorker();
  document.documentElement.classList.add("ready");
}
main();
