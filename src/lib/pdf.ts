// Gera o PDF a partir das páginas do layout. O jsPDF e as fontes só são baixados no primeiro PDF.
import type { Page } from "./layout";
import monoR from "../../fonts/atkinson-mono-regular.ttf?url";
import monoB from "../../fonts/atkinson-mono-bold.ttf?url";
import sansR from "../../fonts/atkinson-regular.ttf?url";
import sansB from "../../fonts/atkinson-bold.ttf?url";
import lexR from "../../fonts/lexend-regular.ttf?url";
import lexB from "../../fonts/lexend-bold.ttf?url";

// [arquivo, nome no jsPDF, estilo no jsPDF]
const FONTS: [string, string, string, string][] = [
  [monoR, "atkinson-mono-regular", "ahmono", "normal"], [monoB, "atkinson-mono-bold", "ahmono", "bold"],
  [sansR, "atkinson-regular", "ahsans", "normal"], [sansB, "atkinson-bold", "ahsans", "bold"],
  [lexR, "lexend-regular", "lexend", "normal"], [lexB, "lexend-bold", "lexend", "bold"]
];
// O jsPDF recebe as fontes em base64.
let pdfFonts: Promise<string[]> | null = null;
function loadPdfFonts(){
  if(!pdfFonts) pdfFonts = Promise.all(FONTS.map(async ([url])=>{
    const r = await fetch(url); if(!r.ok) throw new Error(url);
    const u = new Uint8Array(await r.arrayBuffer()); let s = "";
    for(let i=0;i<u.length;i+=0x8000) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i+0x8000)));
    return btoa(s);
  })).catch(e=>{ pdfFonts = null; throw e; });
  return pdfFonts;
}

export async function toPDF(pages: Page[]): Promise<Blob> {
  const [fonts, { jsPDF }] = await Promise.all([loadPdfFonts(), import("jspdf")]);
  const doc = new jsPDF({unit:"pt", format:"a4"});
  FONTS.forEach(([, f, n, st], i)=>{ doc.addFileToVFS(f+".ttf", fonts[i]); doc.addFont(f+".ttf", n, st); });
  pages.forEach((ops, pi)=>{
    if(pi) doc.addPage();
    ops.forEach(o=>{
      if(o.t==="text"){
        doc.setFont(o.f==="mono" ? "ahmono" : o.f==="lex" ? "lexend" : "ahsans", o.b ? "bold" : "normal"); doc.setFontSize(o.s); doc.setTextColor(...o.c);
        doc.text(o.txt, o.x, o.y);
      } else {
        doc.setDrawColor(...o.c); doc.setLineWidth(o.w);
        if(o.v) doc.line(o.x1,o.y1!,o.x2,o.y2!); else doc.line(o.x1,o.y!,o.x2,o.y!);
      }
    });
  });
  return doc.output("blob");
}

export function saveBlob(blob: Blob, filename: string){
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
}
