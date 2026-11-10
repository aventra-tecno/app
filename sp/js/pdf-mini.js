// 2.33: pembuat PDF kecil tanpa library luar (dipakai nota A6 toko offline).
// Mendukung teks Helvetica / Helvetica-Bold, garis, warna abu, beberapa halaman. Satuan mm, y dari atas.
const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const PT = 72 / 25.4;
const SIZES = { a6: [105, 148], a5: [148, 210], a4: [210, 297] };
// huruf di luar ASCII diganti yang mirip supaya tidak rusak
const clean = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[×]/g, 'x').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[·•]/g, '-').replace(/[^\x20-\x7e]/g, '?');
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const n2 = (v) => (Math.round(v * 100) / 100).toString();

export class MiniPDF {
  constructor({ format = 'a6' } = {}) {
    [this.w, this.h] = SIZES[format] || SIZES.a6;
    this.pages = []; this.font = 'F1'; this.size = 10; this.gray = 0; this.draw = 0;
    this.addPage();
  }
  addPage() { this.cur = []; this.pages.push(this.cur); return this; }
  setFont(_name, style = 'normal') { this.font = style === 'bold' ? 'F2' : 'F1'; return this; }
  setFontSize(s) { this.size = s; return this; }
  setTextColor(g) { this.gray = Math.max(0, Math.min(255, g)) / 255; return this; }
  setDrawColor(g) { this.draw = Math.max(0, Math.min(255, g)) / 255; return this; }
  width(str, font = this.font, size = this.size) {
    const W = font === 'F2' ? W_BOLD : W_REG;
    let t = 0; for (const ch of clean(str)) t += W[ch.charCodeAt(0) - 32] ?? 556;
    return (t / 1000) * size / PT;   // mm
  }
  splitTextToSize(str, maxW) {
    const out = [];
    for (const para of String(str ?? '').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? line + ' ' + word : word;
        if (this.width(test) <= maxW || !line) line = test; else { out.push(line); line = word; }
        while (this.width(line) > maxW && line.length > 1) {   // kata yang sangat panjang dipotong
          let k = line.length; while (k > 1 && this.width(line.slice(0, k)) > maxW) k--;
          out.push(line.slice(0, k)); line = line.slice(k);
        }
      }
      out.push(line);
    }
    return out;
  }
  text(str, x, y, { align = 'left' } = {}) {
    const lines = Array.isArray(str) ? str : [str];
    const lh = this.size * 1.15 / PT;
    lines.forEach((ln, i) => {
      const s = clean(ln); const w = this.width(s);
      const xx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      this.cur.push(`BT /${this.font} ${n2(this.size)} Tf ${n2(this.gray)} g ${n2(xx * PT)} ${n2((this.h - y - i * lh) * PT)} Td (${esc(s)}) Tj ET`);
    });
    return this;
  }
  line(x1, y1, x2, y2) { this.cur.push(`${n2(this.draw)} G 0.6 w ${n2(x1 * PT)} ${n2((this.h - y1) * PT)} m ${n2(x2 * PT)} ${n2((this.h - y2) * PT)} l S`); return this; }
  bytes() {
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add('PAGES');
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const p of this.pages) {
      const body = p.join('\n');
      const c = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(this.w * PT)} ${n2(this.h * PT)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const u8 = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 255;
    return u8;
  }
  output(kind = 'blob') {
    const u8 = this.bytes();
    if (kind === 'blob') return new Blob([u8], { type: 'application/pdf' });
    if (kind === 'datauristring') { let s = ''; u8.forEach((b) => (s += String.fromCharCode(b))); return 'data:application/pdf;base64,' + btoa(s); }
    return u8;
  }
}
