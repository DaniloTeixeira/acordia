// Gera o PDF a partir das páginas do layout. O jsPDF é carregado por <script> (window.jspdf).

// [arquivo, nome no jsPDF, estilo no jsPDF]
const FONTS = [
  ["atkinson-mono-regular","ahmono","normal"], ["atkinson-mono-bold","ahmono","bold"],
  ["atkinson-regular","ahsans","normal"], ["atkinson-bold","ahsans","bold"],
  ["lexend-regular","lexend","normal"], ["lexend-bold","lexend","bold"]
];
// O jsPDF recebe as fontes em base64; só busca na primeira vez que alguém baixa um PDF.
let pdfFonts = null;
function loadPdfFonts(){
  if(!pdfFonts) pdfFonts = Promise.all(FONTS.map(async ([f])=>{
    const r = await fetch("fonts/" + f + ".ttf"); if(!r.ok) throw new Error(f);
    const u = new Uint8Array(await r.arrayBuffer()); let s = "";
    for(let i=0;i<u.length;i+=0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i+0x8000));
    return btoa(s);
  })).catch(e=>{ pdfFonts = null; throw e; });
  return pdfFonts;
}
export const pdfAvailable = () => !!window.jspdf;

export async function toPDF(pages){
  const fonts = await loadPdfFonts();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:"pt", format:"a4"});
  FONTS.forEach(([f,n,st], i)=>{ doc.addFileToVFS(f+".ttf", fonts[i]); doc.addFont(f+".ttf", n, st); });
  pages.forEach((ops, pi)=>{
    if(pi) doc.addPage();
    ops.forEach(o=>{
      if(o.t==="text"){
        doc.setFont(o.f==="mono" ? "ahmono" : o.f==="lex" ? "lexend" : "ahsans", o.b ? "bold" : "normal"); doc.setFontSize(o.s); doc.setTextColor(...o.c);
        doc.text(o.txt, o.x, o.y);
      } else {
        doc.setDrawColor(...o.c); doc.setLineWidth(o.w);
        if(o.v) doc.line(o.x1,o.y1,o.x2,o.y2); else doc.line(o.x1,o.y,o.x2,o.y);
      }
    });
  });
  return doc.output("blob");
}

export function saveBlob(blob, filename){
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
}
