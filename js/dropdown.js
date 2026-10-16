// Listas suspensas no visual do app. Cada <select> continua na página (escondido) e guarda o valor,
// então o resto do código lê .value e ouve "change" como sempre; aqui só trocamos a aparência.
const chev = `<svg class="i sm chev-down" aria-hidden="true"><use href="#i-chev"/></svg>`;
const check = `<svg class="i sm" aria-hidden="true"><use href="#i-check"/></svg>`;
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// Abre/fecha um popover junto do botão, sem reabrir quando o clique no próprio botão já o fechou.
export function bindToggle(btn, pop, open){
  btn.addEventListener("pointerdown", () => { btn._wasOpen = pop.matches(":popover-open") && pop._owner === btn; });
  btn.addEventListener("click", e => {
    e.preventDefault();
    if(btn._wasOpen || (pop.matches(":popover-open") && pop._owner === btn)){ btn._wasOpen = false; if(pop.matches(":popover-open")) pop.hidePopover(); return; }
    pop._owner = btn; open();
  });
}
export function placeNear(pop, btn, minW = 0){
  const r = btn.getBoundingClientRect(), w = Math.max(minW, r.width);
  pop.style.minWidth = w + "px";
  pop.style.left = "0px"; pop.style.top = "0px"; pop.style.maxHeight = "none";
  if(!pop.matches(":popover-open")) pop.showPopover();
  const pw = pop.offsetWidth, natural = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pw - 8)) + "px";
  // Abre para baixo se couber (ou se houver mais espaço embaixo); senão para cima. Sempre dentro da tela.
  const below = innerHeight - r.bottom - 14, above = r.top - 14;
  const down = natural <= below || below >= above;
  pop.style.maxHeight = Math.max(120, Math.min(360, down ? below : above)) + "px";
  const h = pop.offsetHeight;
  pop.style.top = Math.max(8, down ? r.bottom + 6 : r.top - h - 6) + "px";
}

export function initDropdowns(){
  const pop = document.createElement("div");
  pop.className = "popover menu-pop select-pop"; pop.popover = "auto"; pop.setAttribute("role", "listbox");
  document.body.appendChild(pop);
  let owner = null;

  function label(sel){ const o = sel.options[sel.selectedIndex]; return o ? o.textContent : ""; }
  function sync(sel){
    const b = sel._btn; if(!b) return;
    b.innerHTML = `<span class="select-label">${esc(label(sel))}</span>${chev}`;
    b.disabled = sel.disabled;
  }
  function enhance(sel){
    if(sel._btn || sel.multiple) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "input select-btn";
    b.setAttribute("aria-haspopup", "listbox"); b.setAttribute("aria-expanded", "false");
    const al = sel.getAttribute("aria-label"); if(al) b.setAttribute("aria-label", al);
    if(sel.getAttribute("style")) b.setAttribute("style", sel.getAttribute("style"));
    sel._btn = b; sel.classList.add("native-hidden"); sel.tabIndex = -1;
    sel.after(b); sync(sel);
    bindToggle(b, pop, () => open(sel));
    b.addEventListener("keydown", e => { if(["ArrowDown","ArrowUp"].includes(e.key)){ e.preventDefault(); pop._owner = b; open(sel); } });
    new MutationObserver(() => { sync(sel); const al2 = sel.getAttribute("aria-label"); if(al2) b.setAttribute("aria-label", al2); })
      .observe(sel, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:["disabled","aria-label"]});
  }
  function open(sel){
    owner = sel;
    const item = o => `<button type="button" class="menu-item" role="option" data-value="${esc(o.value)}" aria-selected="${o.selected}">${esc(o.textContent)}${o.selected ? check : ""}</button>`;
    pop.innerHTML = [...sel.children].map(c => c.tagName === "OPTGROUP"
      ? `<div class="menu-group" role="presentation">${esc(c.label)}</div>${[...c.children].map(item).join("")}` : item(c)).join("");
    pop.querySelectorAll(".menu-item").forEach(b => b.onclick = () => choose(b.dataset.value));
    placeNear(pop, sel._btn, 160);
    sel._btn.setAttribute("aria-expanded", "true");
    const cur = pop.querySelector('[aria-selected="true"]') || pop.querySelector(".menu-item");
    if(cur){ cur.scrollIntoView({block:"nearest"}); cur.focus({preventScroll:true}); }
  }
  function choose(v){
    const sel = owner; if(!sel) return;
    pop.hidePopover();
    if(sel.value !== v){ sel.value = v; sel.dispatchEvent(new Event("input", {bubbles:true})); sel.dispatchEvent(new Event("change", {bubbles:true})); }
    sel._btn.focus();
  }
  pop.addEventListener("toggle", e => { if(e.newState === "closed" && owner){ owner._btn.setAttribute("aria-expanded", "false"); owner = null; } });
  pop.addEventListener("keydown", e => {
    const items = [...pop.querySelectorAll(".menu-item")], i = items.indexOf(document.activeElement);
    if(e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); const n = items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]; if(n) n.focus(); }
    else if((e.key === "Enter" || e.key === " ") && i >= 0){ e.preventDefault(); items[i].click(); }
    else if(e.key === "Home" || e.key === "End"){ e.preventDefault(); (e.key === "Home" ? items[0] : items.at(-1)).focus(); }
    else if(e.key === "Escape"){ e.preventDefault(); const b = owner && owner._btn; pop.hidePopover(); if(b) b.focus(); }
    else if(e.key === "Tab"){ pop.hidePopover(); }
    else if(e.key.length === 1 && /\S/.test(e.key)){ // vai para o primeiro item que começa com a letra
      const k = e.key.toLowerCase(), start = i + 1, n = items.slice(start).concat(items.slice(0, start)).find(b => b.textContent.trim().toLowerCase().startsWith(k));
      if(n) n.focus();
    }
  });
  // Quando o código muda o valor (sel.value = ...), o botão acompanha.
  for(const prop of ["value", "selectedIndex"]){
    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
    Object.defineProperty(HTMLSelectElement.prototype, prop, {configurable:true, enumerable:d.enumerable, get(){ return d.get.call(this); }, set(v){ d.set.call(this, v); if(this._btn) sync(this); }});
  }
  document.querySelectorAll("select").forEach(enhance);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
    if(n.nodeType !== 1) return;
    if(n.tagName === "SELECT") enhance(n); else n.querySelectorAll && n.querySelectorAll("select").forEach(enhance);
  }))).observe(document.body, {childList:true, subtree:true});
}
