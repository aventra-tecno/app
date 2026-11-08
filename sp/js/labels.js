import { esc, modal, toast, loadScript } from './ui.js';

// Cetak label barcode sekaligus banyak, tersusun rapi per lembar supaya hemat kertas.
const TEMPLATES = {
  a4_3x7:  { label: 'A4 · 3 × 7 (21 label, ±64×38 mm)', page: [210, 297], cols: 3, rows: 7, margin: [10, 7], gap: 2.5, bar: 14, font: 8 },
  a4_4x10: { label: 'A4 · 4 × 10 (40 label kecil, ±48×27 mm)', page: [210, 297], cols: 4, rows: 10, margin: [8, 6], gap: 1.5, bar: 10, font: 6.5 },
  a4_2x5:  { label: 'A4 · 2 × 5 (10 label besar, cocok untuk rak)', page: [210, 297], cols: 2, rows: 5, margin: [10, 8], gap: 4, bar: 22, font: 11 },
  t50x30:  { label: 'Printer thermal · 50 × 30 mm (1 label per stiker)', page: [50, 30], cols: 1, rows: 1, margin: [1.5, 1.5], gap: 0, bar: 12, font: 7 },
  t40x30:  { label: 'Printer thermal · 40 × 30 mm', page: [40, 30], cols: 1, rows: 1, margin: [1.5, 1.5], gap: 0, bar: 11, font: 6.5 },
  t33x15x3: { label: 'Printer thermal · 3 kolom 33 × 15 mm (rol 105 mm)', page: [105, 15], cols: 3, rows: 1, margin: [1.5, 1], gap: 2, bar: 7, font: 5 }
};

// items: [{sku, name, rack_code?, stock?}], kind: 'barang' | 'rak'
let dialogOpen = false;
export async function openLabelDialog(items, kind = 'barang') {
  if (!items.length) return toast('Tidak ada label untuk dicetak', 'err');
  if (dialogOpen || document.querySelector('.overlay [data-label-dlg]')) return;   // cegah jendela cetak muncul berkali-kali
  dialogOpen = true;
  try { return await labelDialog(items, kind); } finally { dialogOpen = false; }
}
async function labelDialog(items, kind) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('label-opt') || '{}'); } catch (_) {}
  const def = { tpl: kind === 'rak' ? 'a4_2x5' : (saved.tpl || 'a4_3x7'), copies: saved.copies || 'one', n: saved.n || 1, start: 1, name: saved.name !== false, rack: saved.rack !== false };
  const opt = await modal({
    title: `Cetak ${items.length} label ${kind === 'rak' ? 'rak' : 'barang'}`,
    body: `<div class="stack">
      <label class="field">Ukuran kertas / stiker<select class="input" id="l-tpl">${Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}" ${k === def.tpl ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
      ${kind === 'barang' ? `<div class="grid g2">
        <label class="field">Jumlah label per barang<select class="input" id="l-copies">
          <option value="one" ${def.copies === 'one' ? 'selected' : ''}>1 label per barang</option>
          <option value="stock" ${def.copies === 'stock' ? 'selected' : ''}>Sesuai stok (1 label per pcs)</option>
          <option value="n" ${def.copies === 'n' ? 'selected' : ''}>Jumlah tetap…</option></select></label>
        <label class="field">Jumlah tetap<input class="input num" id="l-n" inputmode="numeric" value="${def.n}"></label></div>` : ''}
      <label class="field">Mulai dari label ke- (untuk lembar stiker yang sudah terpakai sebagian)<input class="input num" id="l-start" inputmode="numeric" value="1"></label>
      ${kind === 'barang' ? `<div class="row wrap"><label class="check"><input type="checkbox" id="l-name" ${def.name ? 'checked' : ''}> Tampilkan nama barang</label><label class="check"><input type="checkbox" id="l-rack" ${def.rack ? 'checked' : ''}> Tampilkan rak</label></div>` : ''}
      <div class="alert blue small" id="l-sum"></div>
      <div class="small muted">Saat dialog cetak muncul: pilih ukuran kertas yang sama, <b>Margin: None</b>, dan <b>Scale 100%</b> supaya label pas dengan stiker.</div>
    </div>`,
    actions: [{ label: 'Batal', value: null }, { label: 'Buka halaman cetak', cls: 'btn-primary', onClick: (ov) => read(ov) }],
    onOpen: (ov) => { const upd = () => { const o = read(ov); ov.querySelector('#l-sum').innerHTML = summary(o); }; ov.addEventListener('input', upd); ov.addEventListener('change', upd); upd(); }
  });
  if (!opt) return;
  try { localStorage.setItem('label-opt', JSON.stringify({ tpl: kind === 'rak' ? saved.tpl : opt.tpl, copies: opt.copies, n: opt.n, name: opt.name, rack: opt.rack })); } catch (_) {}
  await printSheet(items, kind, opt);

  function read(ov) {
    return {
      tpl: ov.querySelector('#l-tpl').value,
      copies: ov.querySelector('#l-copies')?.value || 'one',
      n: Math.max(1, parseInt(ov.querySelector('#l-n')?.value, 10) || 1),
      start: Math.max(1, parseInt(ov.querySelector('#l-start').value, 10) || 1),
      name: ov.querySelector('#l-name') ? ov.querySelector('#l-name').checked : true,
      rack: ov.querySelector('#l-rack') ? ov.querySelector('#l-rack').checked : true
    };
  }
  function summary(o) {
    const t = TEMPLATES[o.tpl], per = t.cols * t.rows;
    const total = expand(items, o).length;
    const sheets = Math.ceil((total + o.start - 1) / per);
    return `<b>${total} label</b> → ${sheets} ${t.page[0] === 210 ? 'lembar A4' : 'halaman / stiker'} (${per} label per ${t.page[0] === 210 ? 'lembar' : 'baris'}).`;
  }
}

function expand(items, o) {
  const out = [];
  for (const it of items) {
    const c = o.copies === 'stock' ? Math.max(0, it.stock || 0) : o.copies === 'n' ? o.n : 1;
    for (let i = 0; i < c; i++) out.push(it);
  }
  return out;
}

async function printSheet(items, kind, o) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js');
  const t = TEMPLATES[o.tpl];
  const list = expand(items, o);
  if (!list.length) return toast('Jumlah label 0 (stok barang kosong?)', 'err');
  const per = t.cols * t.rows;
  const cells = [...Array(o.start - 1).fill(null), ...list];
  const pages = [];
  for (let i = 0; i < cells.length; i += per) pages.push(cells.slice(i, i + per));
  const [pw, ph] = t.page, [mx, my] = t.margin;
  const lw = (pw - mx * 2 - t.gap * (t.cols - 1)) / t.cols, lh = (ph - my * 2 - t.gap * (t.rows - 1)) / t.rows;
  const w = window.open('', '_blank');
  if (!w) return toast('Izinkan pop-up untuk mencetak label', 'err');
  const big = kind === 'rak';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Label ${kind}</title><style>
    @page { size: ${pw}mm ${ph}mm; margin: 0; }
    * { box-sizing: border-box; } body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
    .page { width: ${pw}mm; height: ${ph}mm; padding: ${my}mm ${mx}mm; display: grid; grid-template-columns: repeat(${t.cols}, ${lw}mm); grid-template-rows: repeat(${t.rows}, ${lh}mm); gap: ${t.gap}mm; page-break-after: always; overflow: hidden; }
    .page:last-child { page-break-after: auto; }
    .l { overflow: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 0.8mm 1.2mm; font-size: ${t.font}pt; line-height: 1.15; }
    .l.cut { outline: 0.2mm dashed #bbb; outline-offset: -0.1mm; }
    .nm { font-weight: 700; max-height: 2.3em; overflow: hidden; width: 100%; }
    .rk { font-size: 0.9em; }
    .big { font-size: ${big ? t.font * 2.4 : t.font * 1.1}pt; font-weight: 700; }
    svg { width: 100%; height: ${t.bar}mm; display: block; }
    .bar { padding: 3mm; text-align: center; font-family: Arial; font-size: 13px; background: #FFF6D8; border-bottom: 1px solid #E3C66C; }
    .bar button { font-size: 14px; padding: 6px 14px; margin-left: 8px; }
    @media print { .bar { display: none; } .l.cut { outline: none; } }
  </style></head><body>
  <div class="bar">${list.length} label · ${pages.length} halaman · ${esc(t.label)} <button onclick="print()">Cetak</button></div>
  ${pages.map((pg) => `<div class="page">${pg.map((it, i) => it == null ? '<div class="l"></div>' : `<div class="l cut">
      ${big ? `<div class="big">${esc(it.sku)}</div>${it.note ? `<div class="rk">${esc(it.note)}</div>` : ''}`
            : `${o.name ? `<div class="nm">${esc(it.name)}</div>` : ''}${o.rack && it.rack_code ? `<div class="rk">Rak ${esc(it.rack_code)}</div>` : ''}`}
      <svg class="bc" data-v="${esc(it.sku)}"></svg></div>`).join('')}</div>`).join('')}
  </body></html>`);
  w.document.close();
  const opts = { format: 'CODE128', displayValue: !big, fontSize: Math.round(t.font * 1.6), textMargin: 1, margin: 2, height: 40, width: 1.6, font: 'monospace', fontOptions: 'bold' };
  w.document.querySelectorAll('svg.bc').forEach((s) => {
    try { window.JsBarcode(s, s.dataset.v, opts); s.setAttribute('preserveAspectRatio', 'none'); } catch (_) { s.outerHTML = `<div>${esc(s.dataset.v)}</div>`; }
  });
  setTimeout(() => { try { w.focus(); w.print(); } catch (_) {} }, 500);
}
