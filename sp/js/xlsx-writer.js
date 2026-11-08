// Penulis file Excel (.xlsx) kecil tanpa library luar: warna, garis, format Rupiah, gabung sel,
// rumus, baris judul beku, dan filter. Dipakai untuk Excel pricelist + rekap per toko.
const enc = new TextEncoder();
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
// tanggal 'YYYY-MM-DD' -> nomor tanggal Excel
export const excelDate = (d) => (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
export const colName = (c) => { let s = ''; for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const ref = (r, c) => colName(c) + r;
const BUILTIN_FMT = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, '@': 49 };

class Sheet {
  constructor(name, opt = {}) { this.name = name; this.rows = new Map(); this.merges = []; this.heights = {}; this.cols = opt.cols || []; this.freeze = opt.freezeRow || 0; this.filter = null; this.hidden = !!opt.hidden; this.valids = []; }
  set(r, c, v, s = 0) { if (!this.rows.has(r)) this.rows.set(r, new Map()); this.rows.get(r).set(c, { v, s }); return this; }
  get(r, c) { return this.rows.get(r)?.get(c); }
  style(r, c, s) { const cell = this.get(r, c); if (cell) cell.s = s; else this.set(r, c, null, s); }
  merge(r1, c1, r2, c2) { this.merges.push(`${ref(r1, c1)}:${ref(r2, c2)}`); }
  height(r, h) { this.heights[r] = h; }
  autoFilter(r1, c1, r2, c2) { this.filter = `${ref(r1, c1)}:${ref(r2, c2)}`; }
  // daftar pilihan (dropdown) di sel, sumber = rentang sel mis. TANGGAL!$A$1:$A$90
  listValidation(r, c, source) { this.valids.push(`<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Pilih dari daftar" error="Klik panah di sel ini lalu pilih tanggal." sqref="${ref(r, c)}"><formula1>${xmlEsc(source)}</formula1></dataValidation>`); }
  xml() {
    const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
    out.push('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0">');
    if (this.freeze) out.push(`<pane ySplit="${this.freeze}" topLeftCell="A${this.freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${this.freeze + 1}" sqref="A${this.freeze + 1}"/>`);
    out.push('</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>');
    if (this.cols.length) out.push('<cols>' + this.cols.map((w, i) => { const o = typeof w === 'object' ? w : { w }; return `<col min="${i + 1}" max="${i + 1}" width="${o.w}" customWidth="1"${o.hidden ? ' hidden="1"' : ''}/>`; }).join('') + '</cols>');
    out.push('<sheetData>');
    for (const r of [...this.rows.keys()].sort((a, b) => a - b)) {
      const cells = this.rows.get(r);
      out.push(`<row r="${r}"${this.heights[r] ? ` ht="${this.heights[r]}" customHeight="1"` : ''}>`);
      for (const c of [...cells.keys()].sort((a, b) => a - b)) {
        const { v, s } = cells.get(c), at = `r="${ref(r, c)}"${s ? ` s="${s}"` : ''}`;
        if (v === null || v === undefined || v === '') out.push(`<c ${at}/>`);
        else if (typeof v === 'number') out.push(Number.isFinite(v) ? `<c ${at}><v>${v}</v></c>` : `<c ${at}/>`);
        else if (typeof v === 'object' && v.f) {
          const res = v.v;
          if (typeof res === 'number' && Number.isFinite(res)) out.push(`<c ${at}><f>${xmlEsc(v.f)}</f><v>${res}</v></c>`);
          else out.push(`<c ${at} t="str"><f>${xmlEsc(v.f)}</f><v>${xmlEsc(res ?? '')}</v></c>`);
        } else out.push(`<c ${at} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`);
      }
      out.push('</row>');
    }
    out.push('</sheetData>');
    if (this.filter) out.push(`<autoFilter ref="${this.filter}"/>`);
    if (this.merges.length) out.push(`<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`);
    if (this.valids.length) out.push(`<dataValidations count="${this.valids.length}">${this.valids.join('')}</dataValidations>`);
    out.push('<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>');
    return out.join('');
  }
}

export class Book {
  constructor() {
    this.sheets = [];
    this.fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    this.numFmts = []; this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']; this.cache = new Map();
  }
  sheet(name, opt) { const s = new Sheet(name, opt); this.sheets.push(s); return s; }
  // st: { bold, italic, size, color:'FFFFFF', fill:'FF3EA5', border:true, fmt:'"Rp"#,##0', h:'center', v:'middle', wrap }
  style(st = {}) {
    const key = JSON.stringify(st);
    if (this.cache.has(key)) return this.cache.get(key);
    const font = `<font>${st.bold ? '<b/>' : ''}${st.italic ? '<i/>' : ''}<sz val="${st.size || 11}"/>${st.color ? `<color rgb="FF${st.color}"/>` : ''}<name val="Calibri"/></font>`;
    const fill = st.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="FF${st.fill}"/><bgColor indexed="64"/></patternFill></fill>` : null;
    const side = (n) => `<${n} style="thin"><color rgb="FFBFBFBF"/></${n}>`;
    const border = st.border ? `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>` : null;
    const idx = (arr, x) => { if (x == null) return 0; let i = arr.indexOf(x); if (i < 0) { arr.push(x); i = arr.length - 1; } return i; };
    let fmtId = 0;
    if (st.fmt) {
      if (st.fmt in BUILTIN_FMT) fmtId = BUILTIN_FMT[st.fmt];
      else { let f = this.numFmts.find((x) => x.code === st.fmt); if (!f) { f = { id: 164 + this.numFmts.length, code: st.fmt }; this.numFmts.push(f); } fmtId = f.id; }
    }
    const al = st.h || st.v || st.wrap ? `<alignment${st.h ? ` horizontal="${st.h}"` : ''}${st.v ? ` vertical="${st.v}"` : ''}${st.wrap ? ' wrapText="1"' : ''}/>` : '';
    const xf = `<xf numFmtId="${fmtId}" fontId="${idx(this.fonts, font)}" fillId="${fill ? idx(this.fills, fill) : 0}" borderId="${border ? idx(this.borders, border) : 0}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`;
    this.xfs.push(xf);
    const id = this.xfs.length - 1; this.cache.set(key, id); return id;
  }
  stylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (this.numFmts.length ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${xmlEsc(f.code)}"/>`).join('')}</numFmts>` : '') +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts><fills count="${this.fills.length}">${this.fills.join('')}</fills><borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
  files() {
    const S = this.sheets;
    const f = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        S.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
        S.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
        (S.some((s) => s.filter) ? '<definedNames>' + S.map((s, i) => (s.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlEsc(s.name.replace(/'/g, "''"))}'!${s.filter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>` : '')).join('') + '</definedNames>' : '') +
        '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        S.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${S.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml': this.stylesXml()
    };
    S.forEach((s, i) => { f[`xl/worksheets/sheet${i + 1}.xml`] = s.xml(); });
    return f;
  }
  toBytes() { return zip(this.files()); }
  // dikompres (file jauh lebih kecil) kalau browser mendukung CompressionStream, kalau tidak tetap tanpa kompresi
  async toBlob() {
    const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (typeof CompressionStream === 'undefined') return new Blob([this.toBytes()], { type });
    try {
      const deflate = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
      const entries = [];
      for (const [name, text] of Object.entries(this.files())) { const data = enc.encode(text); entries.push({ name, data, comp: await deflate(data) }); }
      return new Blob([zip(null, entries)], { type });
    } catch (_) { return new Blob([this.toBytes()], { type }); }
  }
}

// ---------- zip (tanpa kompresi) ----------
let CRC;
function crc32(b) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zip(files, entries) {
  const parts = [], central = []; let off = 0;
  const list = entries || Object.entries(files).map(([name, text]) => ({ name, data: enc.encode(text) }));
  const now = new Date();
  const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  for (const { name, data, comp } of list) {
    const nb = enc.encode(name), crc = crc32(data), body = comp || data, method = comp ? 8 : 0;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true);
    h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, body.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nb, body);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true);
    c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + body.length;
  }
  const cSize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, list.length, true); e.setUint16(10, list.length, true);
  e.setUint32(12, cSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0; for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}
