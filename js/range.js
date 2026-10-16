// Barras deslizantes (volume, BPM): o CSS pinta o trecho até a bolinha com o gradiente do logo e
// precisa saber quanto já foi preenchido (--f, de 0 a 1). Atualiza ao arrastar, quando o código
// muda o valor e quando uma tela nova cria a barra.
const isRange = el => el instanceof HTMLInputElement && el.type === "range";

export function fillRange(el){
  const min = +el.min || 0, max = el.max === "" ? 100 : +el.max;
  el.style.setProperty("--f", max > min ? Math.min(1, Math.max(0, (+el.value - min) / (max - min))) : 0);
}

export function initRanges(){
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  Object.defineProperty(HTMLInputElement.prototype, "value", {
    configurable: true, enumerable: desc.enumerable, get: desc.get,
    set(v){ desc.set.call(this, v); if(isRange(this)) fillRange(this); }
  });
  document.addEventListener("input", e => { if(isRange(e.target)) fillRange(e.target); }, true);
  const scan = root => root.querySelectorAll('input[type="range"]').forEach(fillRange);
  new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => {
    if(isRange(n)) fillRange(n); else if(n instanceof Element) scan(n);
  }))).observe(document.body, {childList: true, subtree: true});
  scan(document);
}
