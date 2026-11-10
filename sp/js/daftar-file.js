// 2.33: daftar barang dari file (foto / screenshot, PDF, Excel / CSV) atau teks yang ditempel,
// dicocokkan dengan master barang memakai aturan yang sama dengan scan (kode tanpa strip, barcode +1 angka).
// Dipakai kepala gudang: daftar beli WIN (langsung ke meja) dan tugas ambil picker.
import { supa } from './supa.js';
import { esc, normSku, codeOr, loadScript, modal, debounce, parseNum } from './ui.js';

const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
export const LIST_ACCEPT = 'image/*,.pdf,.xlsx,.xls,.csv,.txt';

// baris teks -> sel (pisah tab, |, atau 2+ spasi)
const splitCells = (t) => String(t || '').split(/\t|\s*\|\s*|\s{2,}/).map((c) => c.trim()).filter(Boolean);

// file -> [[sel, sel, ...], ...]
export async function readListFile(file, onProgress = () => {}) {
  const name = file.name || '';
  if (/\.pdf$/i.test(name) || file.type === 'application/pdf') {
    onProgress('Membaca PDF…');
    const { readPdfLines } = await import('./pdf-read.js');
    const lines = await readPdfLines(file);
    if (lines.length) return lines;
    throw new Error('PDF tidak berisi teks (hasil scan). Foto / screenshot halamannya lalu upload sebagai gambar.');
  }
  if (/\.(xlsx|xls|csv)$/i.test(name)) {
    onProgress('Membaca file…');
    const { readSheet } = await import('./shopee.js');
    return (await readSheet(file)).map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some(Boolean));
  }
  if (/\.txt$/i.test(name) || file.type === 'text/plain') return textLines(await file.text());
  if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(name)) {
    onProgress('Menyiapkan pembaca gambar… (pertama kali agak lama)');
    await loadScript(TESS);
    const r = await window.Tesseract.recognize(file, 'eng', {
      logger: (m) => { if (m.status === 'recognizing text') onProgress(`Membaca tulisan di gambar… ${Math.round((m.progress || 0) * 100)}%`); }
    });
    return textLines(r.data.text || '');
  }
  throw new Error('Jenis file tidak dikenali. Pakai foto / screenshot, PDF, Excel, atau CSV.');
}
export const textLines = (t) => String(t || '').split(/\r?\n/).map(splitCells).filter((r) => r.length);

const HEAD = {
  qty: /^(qty|qtt|jml|jumlah|kuantitas|quantity|banyak|pcs)$/i,
  code: /^(kode|kode barang|sku|item code|part ?(no|number)|barcode|kode part)$/i,
  name: /^(nama|nama barang|barang|item|item name|keterangan|deskripsi|description|produk)$/i,
  price: /^(harga|price|harga satuan|unit price|harga beli)$/i
};
const WORD = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 2 && !/^\d+$/.test(w));
const looksCode = (n) => n.length >= 4 && /\d/.test(n) && (/[A-Z]/.test(n) || n.length >= 8);
const PRICE_RE = /(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+)(?![\d])/ig;

// produk -> indeks pencarian
export function buildIndex(products) {
  const bySku = new Map(), byWord = new Map();
  for (const p of products) {
    const n = normSku(p.sku); if (n && !bySku.has(n)) bySku.set(n, p);
    p._w = [...new Set(WORD(p.name))];
    for (const w of p._w) { if (!byWord.has(w)) byWord.set(w, []); byWord.get(w).push(p); }
  }
  return { bySku, byWord, products };
}
const findCode = (idx, raw) => {
  const n = normSku(raw); if (!looksCode(n)) return null;
  return idx.bySku.get(n) || (n.length > 6 && /[0-9]$/.test(n) ? idx.bySku.get(n.slice(0, -1)) : null) || null;
};
// cari produk dengan nama paling mirip (kata yang sama / jumlah kata nama barang)
export function nameCandidates(idx, text, limit = 3) {
  const ws = [...new Set(WORD(text))]; if (!ws.length) return [];
  const score = new Map();
  for (const w of ws) for (const p of idx.byWord.get(w) || []) score.set(p, (score.get(p) || 0) + 1);
  return [...score.entries()].map(([p, n]) => ({ p, n, s: n / Math.max(p._w.length, 1) }))
    .filter((x) => x.n >= Math.min(2, x.p._w.length)).sort((a, b) => b.s - a.s || b.n - a.n).slice(0, limit);
}

// baris -> { items: [{ p, qty, price, how, raw }], unknown: [raw] }
export function matchLines(lines, products) {
  const idx = buildIndex(products);
  let cols = null;
  const items = new Map(), unknown = [];
  for (const cells of lines) {
    // judul tabel (Excel / PDF): tentukan kolom
    const heads = {};
    cells.forEach((c, i) => { for (const [k, re] of Object.entries(HEAD)) if (re.test(c.trim()) && heads[k] === undefined) heads[k] = i; });
    if (Object.keys(heads).length >= 2 && (heads.code !== undefined || heads.name !== undefined)) { cols = heads; continue; }
    const text = cells.join(' ');
    if (!/[A-Za-z0-9]/.test(text) || text.length < 3) continue;
    if (/^\W*(sub ?total|total|grand|ongkir|ongkos|biaya|diskon|potongan|voucher|bayar|kembali|ppn|pajak|tanggal|no\.? ?order)\b/i.test(text)) continue;
    // 1) kode barang
    let p = null, how = 'kode', codeTok = '';
    const tryCands = cols?.code !== undefined ? [cells[cols.code] || ''] : [];
    const toks = text.split(/\s+/);
    tryCands.push(...cells, ...toks, ...toks.slice(1).map((t, i) => toks[i] + t), ...toks.slice(2).map((t, i) => toks[i] + toks[i + 1] + t));
    for (const c of tryCands) { const hit = findCode(idx, c); if (hit) { p = hit; codeTok = c; break; } }
    // 2) nama barang
    if (!p) {
      const best = nameCandidates(idx, cols?.name !== undefined ? cells[cols.name] : text, 1)[0];
      if (best && best.s >= 0.6) { p = best.p; how = 'nama'; }
    }
    // jumlah
    let qty = null;
    if (cols?.qty !== undefined) qty = parseInt(String(cells[cols.qty] || '').replace(/\D/g, ''), 10) || null;
    if (!qty) {
      const rest = codeTok ? text.replace(codeTok, ' ') : text;
      const m = rest.match(/(?:^|\s)(?:x|qty|jml|jumlah|×)\s*:?\s*(\d{1,4})(?!\d)/i) || rest.match(/(?:^|\s)(\d{1,4})\s*(?:pcs|pc|bh|buah|set|unit|biji|x)\b/i);
      if (m) qty = +m[1];
      else {
        const nums = cells.map((c, i) => ({ c: c.trim(), i })).filter(({ c, i }) => /^\d{1,3}$/.test(c) && !(i === 0 && cells.length > 2) && c !== codeTok);
        if (nums.length) qty = +nums[nums.length - 1].c;
      }
    }
    qty = Math.max(1, Math.min(qty || 1, 9999));
    // harga per pcs (kalau ada di daftar)
    let price = null;
    if (cols?.price !== undefined) price = parseNum(cells[cols.price]) || null;
    if (!price) { const ps = [...text.matchAll(PRICE_RE)].map((m) => parseNum(m[1])).filter((v) => v >= 500); if (ps.length) price = ps[0]; }
    if (p) {
      const cur = items.get(p.id);
      if (cur) { cur.qty += qty; cur.raw += ' / ' + text; }
      else items.set(p.id, { p, qty, price, how, raw: text });
    } else if (/[A-Za-z]{3,}/.test(text) && (/\d/.test(text) || WORD(text).length >= 2)) unknown.push(text);
  }
  return { items: [...items.values()], unknown, idx };
}

// semua barang aktif (untuk mencocokkan daftar)
export async function allProducts() {
  const { allProductsCached } = await import('./products-cache.js');
  return allProductsCached({ force: true, active: true });
}

// kotak cari barang (nama / kode, aturan sama dengan scan) dengan daftar hasil di bawahnya
export function bindProductSearch(input, onPick, { extraInfo } = {}) {
  const wrap = document.createElement('div'); wrap.className = 'ps-res'; input.after(wrap);
  let seq = 0;
  const run = debounce(async () => {
    const q = input.value.trim(); const my = ++seq;
    if (q.length < 2) { wrap.innerHTML = ''; return; }
    const { data } = await supa.from('products').select('id, sku, name, rack_code, stock, meja_qty, harga_beli, harga_shopee').eq('active', true).or(codeOr(q)).order('name').limit(8);
    if (my !== seq) return;
    wrap._data = data || [];
    wrap.innerHTML = (data || []).length ? data.map((p, i) => `<button type="button" class="ps-item" data-ps="${i}"><span class="grow"><b>${esc(p.name)}</b><span class="xs muted mono"> ${esc(p.sku)}</span></span><span class="xs muted">${extraInfo ? extraInfo(p) : `rak ${esc(p.rack_code || '–')} · stok ${p.stock}${p.meja_qty ? ' · meja ' + p.meja_qty : ''}`}</span></button>`).join('')
      : '<div class="xs muted" style="padding:8px">Tidak ada barang yang cocok.</div>';
  }, 250);
  input.addEventListener('input', run);
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ps]'); if (!b) return;
    onPick(wrap._data[+b.dataset.ps]); input.value = ''; wrap.innerHTML = ''; input.focus();
  });
  return { clear: () => { input.value = ''; wrap.innerHTML = ''; } };
}

// pop up pilih barang untuk baris yang tidak dikenali
export async function pickProduct(title, hint = '') {
  let picked = null;
  await modal({
    title,
    body: `${hint ? `<div class="small muted mono" style="margin-bottom:8px">${esc(hint)}</div>` : ''}<input class="input" id="pps" placeholder="Cari nama / kode barang" autocomplete="off">`,
    actions: [{ label: 'Batal', value: null }],
    onOpen: (ov, close) => {
      const inp = ov.querySelector('#pps');
      bindProductSearch(inp, (p) => { picked = p; close(null); });
      if (hint) { inp.value = hint.replace(/\d{1,3}([.,]\d{3})+/g, '').replace(/\s+/g, ' ').trim().slice(0, 40); inp.dispatchEvent(new Event('input')); }
      setTimeout(() => inp.focus(), 50);
    }
  });
  return picked;
}

// ---------- editor daftar barang (tabel jumlah / harga + tombol upload file + cari manual) ----------
// opts: { price: true|false, title, emptyText, onChange }
export function listEditor(box, opts = {}) {
  const st = { rows: [], unknown: [], file: '' };
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID');
  box.innerHTML = `<div class="stack s8">
    <div class="le-tools">
      <label class="btn le-up">${'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>'} Upload foto / PDF / Excel<input type="file" accept="${LIST_ACCEPT}" hidden data-le-file></label>
      <button type="button" class="btn" data-le-paste>Tempel teks</button>
    </div>
    <div data-le-msg></div>
    <input class="input" data-le-q placeholder="Tambah manual: cari nama / kode barang" autocomplete="off">
    <div data-le-list></div>
    <div data-le-unk></div>
  </div>`;
  const q = box.querySelector('[data-le-q]');
  const msg = (t, c = 'blue') => { box.querySelector('[data-le-msg]').innerHTML = t ? `<div class="alert ${c} small">${t}</div>` : ''; };
  const changed = () => { paint(); opts.onChange && opts.onChange(st); };
  const add = (p, qty = 1, price = null, how = 'manual') => {
    const cur = st.rows.find((r) => r.p.id === p.id);
    if (cur) cur.qty += qty; else st.rows.push({ p, qty, price: price ?? (Number(p.harga_beli) || 0), how });
    changed();
  };
  bindProductSearch(q, (p) => add(p, 1));
  const paint = () => {
    const L = box.querySelector('[data-le-list]');
    const tot = st.rows.reduce((a, r) => a + r.qty * (r.price || 0), 0);
    L.innerHTML = st.rows.length ? `<div class="card flush" style="border:1px solid var(--line)"><div class="list no-page">${st.rows.map((r, i) => `<div class="list-item le-row">
        <div class="grow" style="min-width:0"><b>${esc(r.p.name)}</b>${r.how === 'nama' ? ' <span class="tag yellow" title="Dicocokkan dari nama, cek lagi">cek nama</span>' : ''}
          <div class="xs muted mono">${esc(r.p.sku)} · rak ${esc(r.p.rack_code || '–')} · stok ${r.p.stock}${r.p.meja_qty ? ' · meja ' + r.p.meja_qty : ''}</div></div>
        <div class="le-in"><label class="xs muted">Jumlah<input class="input sm num" data-le-qty="${i}" value="${r.qty}" inputmode="numeric"></label>
          ${opts.price ? `<label class="xs muted">Harga / pcs<input class="input sm num" data-le-price="${i}" data-money value="${fmt(r.price)}" inputmode="numeric"></label>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" data-le-del="${i}" aria-label="Hapus" style="color:var(--red)">✕</button></div></div>`).join('')}</div>
      <div class="line-row total" style="padding:10px 14px"><span>${st.rows.length} macam · ${st.rows.reduce((a, r) => a + r.qty, 0)} pcs</span>${opts.price ? `<span>Rp${fmt(tot)}</span>` : ''}</div></div>`
      : `<div class="small muted">${opts.emptyText || 'Belum ada barang. Upload daftar atau cari manual.'}</div>`;
    const U = box.querySelector('[data-le-unk]');
    U.innerHTML = st.unknown.length ? `<details class="card le-unk"><summary><b>${st.unknown.length} baris tidak dikenali</b> <span class="xs muted">— tekan untuk cari barangnya</span></summary>
      <div class="list no-page">${st.unknown.map((t, i) => `<div class="list-item" style="padding:8px 0"><span class="grow small mono" style="min-width:0;overflow-wrap:anywhere">${esc(t)}</span><button type="button" class="btn btn-sm btn-see" data-le-fix="${i}">Cari</button><button type="button" class="btn btn-ghost btn-sm" data-le-skip="${i}" aria-label="Abaikan">✕</button></div>`).join('')}</div></details>` : '';
  };
  const load = async (lines, label) => {
    msg('Mencocokkan dengan master barang…');
    const res = matchLines(lines, await allProducts());
    res.items.forEach((it) => add(it.p, it.qty, it.price, it.how));
    st.unknown.push(...res.unknown);
    st.file = label || st.file;
    msg(`${res.items.length} barang cocok${res.items.filter((x) => x.how === 'nama').length ? ` (${res.items.filter((x) => x.how === 'nama').length} dari nama — cek lagi)` : ''}${res.unknown.length ? `, ${res.unknown.length} baris tidak dikenali` : ''}. Periksa jumlahnya sebelum disimpan.`, res.items.length ? 'green' : 'yellow');
    changed();
  };
  box.querySelector('[data-le-file]').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const lines = await readListFile(f, (t) => msg(esc(t))); await load(lines, f.name); }
    catch (err) { msg(esc(err.message || String(err)), 'red'); }
  });
  box.querySelector('[data-le-paste]').addEventListener('click', async () => {
    const t = await modal({ title: 'Tempel daftar barang', body: '<textarea class="input" id="lept" rows="8" placeholder="Satu barang per baris: kode / nama + jumlah"></textarea>',
      actions: [{ label: 'Batal', value: null }, { label: 'Cocokkan', cls: 'btn-primary', onClick: (ov) => ov.querySelector('#lept').value }] });
    if (t && t.trim()) load(textLines(t), 'teks');
  });
  box.addEventListener('input', (e) => {
    const qi = e.target.dataset.leQty, pi = e.target.dataset.lePrice;
    if (qi !== undefined) { st.rows[+qi].qty = Math.max(1, parseInt(e.target.value, 10) || 1); opts.onChange && opts.onChange(st); }
    if (pi !== undefined) { st.rows[+pi].price = parseNum(e.target.value); opts.onChange && opts.onChange(st); }
  });
  box.addEventListener('change', (e) => { if (e.target.dataset.leQty !== undefined || e.target.dataset.lePrice !== undefined) paint(); });
  box.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-le-del]'); if (d) { st.rows.splice(+d.dataset.leDel, 1); changed(); return; }
    const s = e.target.closest('[data-le-skip]'); if (s) { st.unknown.splice(+s.dataset.leSkip, 1); paint(); return; }
    const f = e.target.closest('[data-le-fix]');
    if (f) { const t = st.unknown[+f.dataset.leFix]; const p = await pickProduct('Pilih barang', t); if (p) { st.unknown.splice(+f.dataset.leFix, 1); const m = t.match(/(?:^|\s)(\d{1,3})\s*(?:pcs|pc|x)?\s*$/i); add(p, m ? +m[1] : 1); } }
  });
  paint();
  return { state: st, add, clear: () => { st.rows = []; st.unknown = []; st.file = ''; msg(''); changed(); }, load };
}
