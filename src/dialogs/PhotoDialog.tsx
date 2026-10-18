// Recortar a foto do perfil (círculo) ou do grupo (quadrado de cantos arredondados ou círculo, no formato
// escolhido para a marca do grupo):
// a pessoa arrasta (um dedo), aproxima (pinça, roda do mouse ou o controle de zoom) e o que fica dentro da
// marcação vira um quadrado de até 512 px. A escala é sempre a mesma nos dois eixos (a foto nunca estica).
// No perfil a foto sempre cobre o quadro todo. No grupo (costuma ser um logo) também dá para afastar: a imagem
// fica inteira dentro do quadro e o resto é o fundo escolhido. O fundo também aparece onde a imagem é
// transparente; por isso a escolha dele aparece no grupo e, no perfil, só para imagem com transparência.
import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { savePhoto } from "../lib/cloud";
import { saveGroupPhoto, useGroups } from "../lib/groups";
import { toast, type DialogProps } from "../state";
import { Dialog, DialogHead } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Seg } from "../ui/Seg";
import { useLock, Spin } from "../views/Account";

const OUT = 512, MAX_ZOOM = 4;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
type Pt = {x: number; y: number};
const mid = (p: Pt[]) => ({x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length});
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

// Fundos prontos: cor sólida ou o gradiente da marca (o mesmo das iniciais, 135°). "custom" usa a cor escolhida.
type Bg = {id: string; color?: string; grad?: [string, string]};
const BGS: Bg[] = [
  {id: "white", color: "#ffffff"}, {id: "light", color: "#eef1f9"}, {id: "dark", color: "#121829"},
  {id: "black", color: "#000000"}, {id: "brand", grad: ["#2f6bf0", "#6a3bf2"]},
];
const bgCss = (b: Bg) => b.grad ? `linear-gradient(135deg, ${b.grad[0]}, ${b.grad[1]})` : b.color!;

function canvas(w: number, h = w){
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!; ctx.imageSmoothingQuality = "high";
  return {cv, ctx};
}
// Desenha a imagem num quadrado out × out com o fundo: (cx, cy) é o ponto da imagem no centro e k quantos px
// da saída cada px da imagem ocupa. Reduz a imagem pela metade até chegar perto do tamanho final (numa
// redução só, fotos grandes do celular ficam serrilhadas em alguns navegadores); as reduções guardam a
// transparência, para o fundo aparecer por trás.
function render(img: HTMLImageElement, cx: number, cy: number, k: number, out: number, bg: Bg){
  let src: CanvasImageSource = img, w = img.naturalWidth, h = img.naturalHeight;
  while(k < .5 && w > 1 && h > 1){
    const nw = Math.round(w / 2), nh = Math.round(h / 2), r = nw / w, c = canvas(nw, nh);
    c.ctx.drawImage(src, 0, 0, nw, nh);
    src = c.cv; cx *= r; cy *= r; k /= r; w = nw; h = nh;
  }
  const c = canvas(out);
  if(bg.grad){ const gr = c.ctx.createLinearGradient(0, 0, out, out); gr.addColorStop(0, bg.grad[0]); gr.addColorStop(1, bg.grad[1]); c.ctx.fillStyle = gr; }
  else c.ctx.fillStyle = bg.color!;
  c.ctx.fillRect(0, 0, out, out);
  c.ctx.drawImage(src, out / 2 - cx * k, out / 2 - cy * k, w * k, h * k);
  return new Promise<Blob | null>(r => c.cv.toBlob(r, "image/jpeg", 0.88));
}

// A imagem tem partes transparentes? Olha uma cópia pequena (64 px basta para achar o fundo de um PNG).
function hasAlpha(img: HTMLImageElement){
  try{
    const c = canvas(64); c.ctx.drawImage(img, 0, 0, 64, 64);
    const d = c.ctx.getImageData(0, 0, 64, 64).data;
    for(let i = 3; i < d.length; i += 4) if(d[i] < 250) return true;
  }catch(e){ /* sem acesso aos pixels: trata como opaca */ }
  return false;
}

export function PhotoDialog({src, gid}: DialogProps["photo"]){
  const stage = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null), [bad, setBad] = useState(false);
  // S: lado do quadro na tela (px); z: zoom (1 = a foto cobre o quadro bem justo; abaixo de 1, afastada);
  // c: ponto da foto (em px da imagem original) que fica no centro do quadro.
  const [S, setS] = useState(0), [z, setZ] = useState(1), [c, setC] = useState<Pt>({x: 0, y: 0});
  // Fundo: um dos prontos ou a cor livre (custom).
  const [bg, setBg] = useState<Bg>(BGS[0]), [custom, setCustom] = useState("#ff3b30"), [alpha, setAlpha] = useState(false);
  // Formato da marca do grupo (começa no que o grupo já usa).
  const [round, setRound] = useState(() => !!useGroups.getState().groups.find(x => x.id === gid)?.photo_round);
  const [busy, setBusy] = useState(false), lock = useLock();
  useEffect(() => {
    const i = new Image();
    i.onload = () => {
      if(!i.naturalWidth || !i.naturalHeight) return setBad(true);
      // No perfil, em foto em pé o rosto costuma ficar mais para cima: começa um pouco acima do meio. No grupo
      // (logo, geralmente já centrado no arquivo) começa no centro, para um logo redondo bater com a moldura.
      setImg(i); setAlpha(hasAlpha(i)); setC({x: i.naturalWidth / 2, y: i.naturalHeight * (!gid && i.naturalHeight > i.naturalWidth ? .4 : .5)});
    };
    i.onerror = () => setBad(true);
    i.src = src;
  }, [src]);
  useEffect(() => {
    const el = stage.current; if(!el) return;
    const ro = new ResizeObserver(() => setS(el.clientWidth)); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = img?.naturalWidth || 1, H = img?.naturalHeight || 1;
  const scaleAt = (zz: number) => S / Math.min(W, H) * zz, scale = scaleAt(z);
  // Afastar (só no grupo) vai até a foto inteira caber no quadro com folga (o lado maior em 60% do quadro).
  const MIN_ZOOM = gid ? Math.min(1, Math.min(W, H) / Math.max(W, H) * .6) : 1, showBg = !!gid || alpha;
  // Em cada eixo: com a foto maior que o quadro, o quadro fica dentro da foto (sem borda vazia); menor, a
  // foto fica dentro do quadro (não some pela borda).
  const fit = (p: Pt, sc = scale) => {
    const h = S / 2 / sc, axis = (v: number, len: number) => len >= 2 * h ? clamp(v, h, len - h) : clamp(v, len - h, h);
    return {x: axis(p.x, W), y: axis(p.y, H)};
  };
  const cc = S ? fit(c) : c;
  const zoomTo = (nz: number) => setZ(clamp(nz, MIN_ZOOM, MAX_ZOOM));

  // Um dedo arrasta; dois dedos aproximam (pinça) e arrastam juntos.
  const pts = useRef(new Map<number, Pt>());
  const g = useRef({c: cc, z, d: 0, m: {x: 0, y: 0}});
  const begin = () => { const p = [...pts.current.values()]; g.current = {c: cc, z, d: p.length > 1 ? dist(p[0], p[1]) : 0, m: p.length ? mid(p) : {x: 0, y: 0}}; };
  const down = (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); pts.current.set(e.pointerId, {x: e.clientX, y: e.clientY}); begin(); };
  const move = (e: React.PointerEvent) => {
    if(!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, {x: e.clientX, y: e.clientY});
    const p = [...pts.current.values()], m = mid(p), s = g.current;
    const nz = p.length > 1 && s.d ? clamp(s.z * dist(p[0], p[1]) / s.d, MIN_ZOOM, MAX_ZOOM) : s.z, sc = scaleAt(nz);
    setZ(nz); setC(fit({x: s.c.x - (m.x - s.m.x) / sc, y: s.c.y - (m.y - s.m.y) / sc}, sc));
  };
  const up = (e: React.PointerEvent) => { pts.current.delete(e.pointerId); begin(); };
  // Roda do mouse aproxima; precisa ser nativo (passive: false) para a janela não rolar junto.
  const wheel = useRef((_: WheelEvent) => {}); wheel.current = e => { e.preventDefault(); zoomTo(z * Math.exp(-e.deltaY / 400)); };
  useEffect(() => {
    const el = stage.current; if(!el) return;
    const h = (e: WheelEvent) => wheel.current(e);
    el.addEventListener("wheel", h, {passive: false}); return () => el.removeEventListener("wheel", h);
  }, []);
  // Teclado: setas movem, + e - aproximam.
  const key = (e: React.KeyboardEvent) => {
    const step = 12 / scale, d: Record<string, Pt> = {ArrowLeft: {x: -step, y: 0}, ArrowRight: {x: step, y: 0}, ArrowUp: {x: 0, y: -step}, ArrowDown: {x: 0, y: step}};
    if(d[e.key]){ e.preventDefault(); setC(fit({x: cc.x + d[e.key].x, y: cc.y + d[e.key].y})); }
    else if(e.key === "+" || e.key === "="){ e.preventDefault(); zoomTo(z + .2); }
    else if(e.key === "-"){ e.preventDefault(); zoomTo(z - .2); }
  };

  // A foto posicionada num quadro de lado `size` (o de recortar e as prévias usam a mesma conta).
  const view = (size: number) => {
    const k = size / S || 0;
    return img && S ? <img src={src} alt="" draggable={false} style={{width: W * scale * k, height: H * scale * k,
      left: (S / 2 - cc.x * scale) * k, top: (S / 2 - cc.y * scale) * k}}/> : null;
  };

  const back = bg.id === "custom" ? {id: "custom", color: custom} : bg, backCss = {background: bgCss(back)};

  const save = (e: React.MouseEvent<HTMLButtonElement>) => { const d = e.currentTarget.closest("dialog"); lock(async () => {
    if(!img || !S) return;
    // side: lado do quadro em px da imagem. Foto pequena não é ampliada: sai no tamanho que tem (o avatar
    // ajusta na tela).
    const side = S / scale, out = Math.round(Math.min(OUT, side));
    setBusy(true);
    try{
      const blob = await render(img, cc.x, cc.y, out / side, out, back);
      if(!blob || !await (gid ? saveGroupPhoto(gid, blob, round) : savePhoto(blob))) return toast(t("photo.saveFail"));
    } finally{ setBusy(false); }
    toast(t("photo.saved")); d?.close("ok");
  }); };

  const swatch = (b: Bg) => <button key={b.id} type="button" className={"photo-bg" + (bg.id === b.id ? " on" : "")} style={{background: bgCss(b)}}
    aria-label={t("photo.bg." + b.id)} title={t("photo.bg." + b.id)} aria-pressed={bg.id === b.id} onClick={() => setBg(b)}/>;

  return <Dialog name="photo" id="dlg-photo" className="photo-dlg" labelledBy="photo-h" dirty={() => !!img} onClose={() => URL.revokeObjectURL(src)}>
    <form method="dialog" className="dlg">
      <DialogHead id="photo-h" title={t(gid ? "photo.groupTitle" : "photo.title")} closeLabel={t("common.close")}/>
      <div className="dlg-body">
        {bad ? <p className="note" role="alert">{t("photo.bad")}</p> : <>
          <p className="sub">{t(gid ? "photo.groupHint" : "photo.hint")}</p>
          {gid && <Seg id="photo-shape" className="photo-shape" aria={t("photo.shape")} value={round ? "round" : "square"} onChange={v => setRound(v === "round")}
            options={[{v: "square", label: t("photo.shape.square")}, {v: "round", label: t("photo.shape.round")}]}/>}
          <div className={"photo-stage" + (gid && !round ? " square" : "") + (img ? "" : " loading")} ref={stage} tabIndex={0} role="group" aria-label={t("photo.stageAria")}
            style={img ? backCss : undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
            {view(S) || <Spin/>}</div>
          <div className="photo-tools">
            <div className="photo-zoom">
              <button type="button" className="icon-btn sm" aria-label={t("photo.zoomOut")} disabled={z <= MIN_ZOOM} onClick={() => zoomTo(z - .25)}><Icon name="minus" sm/></button>
              <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={.01} value={z} aria-label={t("photo.zoom")} disabled={!img} onChange={e => zoomTo(+e.target.value)}/>
              <button type="button" className="icon-btn sm" aria-label={t("photo.zoomIn")} disabled={z >= MAX_ZOOM} onClick={() => zoomTo(z + .25)}><Icon name="plus" sm/></button>
            </div>
            {/* Como fica: no perfil (72 px) e nas listas (32 px); a do grupo, no Início (56 px) e no título (32 px). */}
            <div className="photo-previews" aria-hidden="true">
              {gid ? <><span className={"photo-pv group big" + (round ? " round" : "")} style={backCss}>{view(56)}</span>
                <span className={"photo-pv group" + (round ? " round" : "")} style={backCss}>{view(32)}</span></>
                : <><span className="photo-pv big"><span style={backCss}>{view(66)}</span></span><span className="photo-pv"><span style={backCss}>{view(30)}</span></span></>}
            </div>
          </div>
          {/* Fundo: aparece onde a imagem é transparente e em volta dela quando afastada. */}
          {showBg && <div className="photo-bgs" role="group" aria-label={t("photo.bg")}>
            <span className="sub">{t("photo.bg")}</span>
            {BGS.map(swatch)}
            <label className={"photo-bg custom" + (bg.id === "custom" ? " on" : "")} style={{background: custom}} title={t("photo.bg.custom")}>
              <input type="color" value={custom} aria-label={t("photo.bg.custom")} onChange={e => { setCustom(e.target.value); setBg({id: "custom"}); }}
                onClick={() => setBg({id: "custom"})}/><Icon name="edit" sm/></label>
          </div>}
        </>}
      </div>
      <div className="dlg-foot"><button className="btn ghost" value="cancel">{t("common.cancel")}</button>
        <button type="button" className="btn primary" id="photo-ok" disabled={!img} aria-busy={busy} onClick={save}>{busy ? <Spin/> : <Icon name="check" sm/>} {t("photo.save")}</button></div>
    </form>
  </Dialog>;
}
