import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, rp, num, fmtDateTime, on, modal, toast, toastErr, pageHead, emptyState, skeleton, icon, beep, confirmBox, parseNum, statusTag } from '../ui.js';
import { scanBox, bindScan } from '../scanner.js';
import { bindProductSearch } from '../daftar-file.js';
import { MiniPDF } from '../pdf-mini.js';

// 2.33 Toko offline: pembeli datang langsung. Dibuka kepala gudang.
// Barang diambil dari rak (atau meja) langsung, atau dibeli dulu di WIN lalu diserahkan. Nota A6 bisa dicetak.
const PAY = ['Tunai', 'Transfer', 'QRIS'];
const P_COLS = 'id, sku, name, rack_code, stock, meja_qty, harga_beli, harga_shopee';

export default {
  tour: [
    { sel: '#new', title: 'Pesanan baru', body: 'Isi nama & no. HP pembeli, scan barang, pilih ambil di rak atau beli di WIN, lalu simpan & cetak nota.' },
    { sel: '#hist', title: 'Riwayat', body: 'Tekan pesanan untuk cetak ulang nota, serahkan barang WIN, atau batalkan.' }
  ],
  async render(el) {
    let items = [];
    el.innerHTML = `${pageHead('Toko offline')}
      <div class="stack">
        <section class="card stack" id="new">
          <div class="grid g2"><label class="field">Nama pembeli<input class="input" id="cn" placeholder="mis. Pak Joko" autocomplete="off"></label>
            <label class="field">No. HP<input class="input" id="cp" inputmode="tel" placeholder="08…" autocomplete="off"></label></div>
          ${scanBox('sbo', 'Scan barang')}
          <input class="input" id="oq" placeholder="atau cari nama / kode barang" autocomplete="off">
          <div id="items"></div>
          <div class="grid g2"><label class="field">Pembayaran<select class="input" id="pay">${PAY.map((p) => `<option>${p}</option>`).join('')}</select></label>
            <label class="field">Catatan<input class="input" id="nt" placeholder="opsional"></label></div>
          <button class="btn btn-primary btn-lg" id="save" disabled>${icon('print', 18)} Simpan & cetak nota</button>
        </section>
        <section class="card flush" id="hist"></section>
      </div>`;

    const avail = (p) => Number(p.stock || 0) + Number(p.meja_qty || 0);
    const add = (p) => {
      const cur = items.find((i) => i.p.id === p.id);
      if (cur) cur.qty++; else items.push({ p, qty: 1, price: Number(p.harga_shopee) || 0, source: avail(p) > 0 ? 'rak' : 'win' });
      const it = items.find((i) => i.p.id === p.id);
      if (it.source === 'rak' && it.qty > avail(p)) it.source = 'win';
      paint();
    };
    const paint = () => {
      const tot = items.reduce((a, i) => a + i.qty * i.price, 0);
      el.querySelector('#items').innerHTML = items.length ? `<div class="list no-page">${items.map((i, k) => `<div class="list-item ofl-row">
          <div class="grow" style="min-width:0"><b>${esc(i.p.name)}</b><div class="xs muted mono">${esc(i.p.sku)} · rak ${esc(i.p.rack_code || '–')} · stok ${avail(i.p)}</div>
            <div class="seg" role="group" aria-label="Sumber barang"><button type="button" class="${i.source === 'rak' ? 'on' : ''}" data-src="${k}:rak" ${avail(i.p) < i.qty ? 'disabled' : ''}>Ambil di rak</button><button type="button" class="${i.source === 'win' ? 'on' : ''}" data-src="${k}:win">Beli WIN</button></div></div>
          <div class="le-in"><label class="xs muted">Jumlah<input class="input sm num" data-q="${k}" value="${i.qty}" inputmode="numeric"></label>
            <label class="xs muted">Harga<input class="input sm num" data-pr="${k}" data-money value="${num(i.price)}" inputmode="numeric"></label>
            <button type="button" class="btn btn-ghost btn-sm" data-del="${k}" aria-label="Hapus" style="color:var(--red)">✕</button></div></div>`).join('')}</div>
        <div class="line-row total"><span>${items.reduce((a, i) => a + i.qty, 0)} barang${items.some((i) => i.source === 'win') ? ' · ada yang beli WIN' : ''}</span><span>${rp(tot)}</span></div>`
        : '<div class="small muted">Belum ada barang. Scan atau cari barangnya.</div>';
      el.querySelector('#save').disabled = !items.length;
    };
    bindProductSearch(el.querySelector('#oq'), (p) => add(p), { extraInfo: (p) => `stok ${avail(p)} · ${rp(p.harga_shopee)}` });
    bindScan(el, 'sbo', async (code) => {
      try {
        const r = await rpc('lookup_code', { p_code: code });
        if (r.type !== 'barang') { beep(false); return { ok: false, title: 'Kode barang tidak dikenal', info: code }; }
        const { data: p } = await supa.from('products').select(P_COLS).eq('id', r.id).single();
        add(p); beep(true);
        return { ok: true, title: p.name, info: `stok ${avail(p)} · ${rp(p.harga_shopee)}` };
      } catch (e) { beep(false); toastErr(e); return false; }
    });
    on(el, 'input', '[data-q]', (e) => { const i = items[+e.target.dataset.q]; i.qty = Math.max(1, parseInt(e.target.value, 10) || 1); });
    on(el, 'input', '[data-pr]', (e) => { items[+e.target.dataset.pr].price = parseNum(e.target.value); });
    on(el, 'change', '[data-q], [data-pr]', () => { items.forEach((i) => { if (i.source === 'rak' && i.qty > avail(i.p)) i.source = 'win'; }); paint(); });
    on(el, 'click', '[data-src]', (e, b) => { const [k, s] = b.dataset.src.split(':'); items[+k].source = s; paint(); });
    on(el, 'click', '[data-del]', (e, b) => { items.splice(+b.dataset.del, 1); paint(); });
    el.querySelector('#save').onclick = async (e) => {
      e.target.disabled = true;
      try {
        const r = await rpc('offline_order_save', { p: { name: el.querySelector('#cn').value, phone: el.querySelector('#cp').value, pay_method: el.querySelector('#pay').value, note: el.querySelector('#nt').value,
          items: items.map((i) => ({ product_id: i.p.id, qty: i.qty, price: i.price, source: i.source })) } });
        toast(`Tersimpan ${r.order_no}${r.win ? ` · ${r.win} pcs beli di WIN` : ''}`, 'ok');
        items = []; ['#cn', '#cp', '#nt'].forEach((s) => (el.querySelector(s).value = '')); paint(); loadHist();
        printNota(r.id);
      } catch (err) { toastErr(err); e.target.disabled = false; }
    };

    const loadHist = async () => {
      const box = el.querySelector('#hist');
      const { data, error } = await supa.from('orders').select('id, order_no, status, total_jual, customer_name, customer_phone, created_at, order_items(qty, ready_qty)').eq('entry', 'offline').order('created_at', { ascending: false }).limit(40);
      if (error) { box.innerHTML = `<div class="alert yellow" style="margin:14px">Menu ini butuh update database. Jalankan <b>supabase/update-2.33.sql</b>. (${esc(error.message)})</div>`; return; }
      box.innerHTML = `<div class="card-h"><h2>Riwayat toko offline</h2></div>${data.length ? `<div class="list">${data.map((o) => `<button class="list-item" data-o="${o.id}"><div class="grow" style="min-width:0"><b class="mono">${esc(o.order_no)}</b> <span class="small">${esc(o.customer_name || 'Pembeli')}</span>
          <div class="xs muted">${fmtDateTime(o.created_at)} · ${o.order_items.reduce((a, i) => a + i.qty, 0)} barang${o.status === 'menunggu_win' ? ` · <span class="neg">${o.order_items.reduce((a, i) => a + i.qty - i.ready_qty, 0)} belum diserahkan</span>` : ''}</div></div>
          <div class="right"><b>${rp(o.total_jual)}</b><div>${o.status === 'menunggu_win' ? '<span class="tag yellow">Tunggu WIN</span>' : statusTag(o.status)}</div></div></button>`).join('')}</div>` : emptyState('Belum ada pesanan toko offline.', 'receipt')}`;
    };
    on(el, 'click', '[data-o]', async (e, b) => {
      const id = +b.dataset.o;
      const { data: o } = await supa.from('orders').select('*, order_items(name, sku, qty, price, ready_qty, source)').eq('id', id).single();
      const r = await modal({
        title: o.order_no,
        body: `<div class="stack s8"><div class="row wrap">${o.status === 'menunggu_win' ? '<span class="tag yellow">Tunggu barang WIN</span>' : statusTag(o.status)}<span class="small muted">${fmtDateTime(o.created_at)} · ${esc(o.pay_method || '')}</span></div>
          <div><b>${esc(o.customer_name || 'Pembeli')}</b> <span class="small muted">${esc(o.customer_phone || '')}</span></div>
          <div class="list no-page">${o.order_items.map((i) => `<div class="list-item" style="padding:6px 0"><div class="grow" style="min-width:0">${esc(i.name)}<div class="xs muted">${i.qty} × ${rp(i.price)}${i.source === 'win' ? (i.ready_qty >= i.qty ? ' · WIN sudah diserahkan' : ' · <span class="neg">beli WIN, belum diserahkan</span>') : ' · dari rak'}</div></div><b>${rp(i.qty * i.price)}</b></div>`).join('')}</div>
          <div class="line-row total"><span>Total</span><span>${rp(o.total_jual)}</span></div></div>`,
        actions: [
          ...(o.status !== 'cancel' ? [{ label: 'Batalkan', cls: 'btn-danger', value: 'cancel' }] : []),
          ...(o.status === 'menunggu_win' ? [{ label: 'Barang WIN diserahkan', cls: 'btn-primary', value: 'hand' }] : []),
          { label: 'Cetak nota', cls: o.status === 'menunggu_win' ? '' : 'btn-primary', value: 'print' }
        ]
      });
      try {
        if (r === 'print') printNota(id);
        if (r === 'hand') { await rpc('offline_order_handover', { p_order: id }); toast('Selesai, barang sudah diserahkan', 'ok'); loadHist(); }
        if (r === 'cancel' && await confirmBox('Batalkan pesanan?', 'Barang yang sudah diambil dikembalikan ke rak. Uang dikembalikan ke pembeli secara manual.', 'Batalkan', true)) {
          await rpc('offline_order_cancel', { p_order: id, p_reason: null }); toast('Dibatalkan', 'ok'); loadHist();
        }
      } catch (err) { toastErr(err); }
    });
    paint(); loadHist();
  }
};

// ---------- nota PDF ukuran A6 (105 × 148 mm) ----------
export async function printNota(id) {
  try {
    const { data: o, error } = await supa.from('orders').select('*, order_items(name, sku, qty, price, ready_qty, source)').eq('id', id).single();
    if (error) throw error;
    const doc = await notaPdf(o, store.settings?.nama_toko || 'Toko Sparepart');
    const url = URL.createObjectURL(doc.output('blob'));
    const r = await modal({ title: 'Nota ' + o.order_no, body: `<iframe src="${url}" title="Nota" style="width:100%;height:60vh;border:1px solid var(--line);border-radius:8px;background:#fff"></iframe>`,
      actions: [{ label: 'Tutup', value: null }, { label: 'Unduh PDF', value: 'dl' }, { label: 'Cetak', cls: 'btn-primary', value: 'print' }] });
    if (r === 'dl') { const a = document.createElement('a'); a.href = url; a.download = `nota-${o.order_no}.pdf`; document.body.appendChild(a); a.click(); a.remove(); }
    if (r === 'print') { const w = window.open(url, '_blank'); if (w) w.addEventListener('load', () => { try { w.print(); } catch (_) {} }); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { toastErr(e); }
}

export async function notaPdf(o, shop) {
  const doc = new MiniPDF({ format: 'a6' });
  const W = 105, M = 7, R = W - M;
  const money = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
  const dt = new Date(o.created_at || Date.now()).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
  let y = 12;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(String(shop).toUpperCase(), W / 2, y, { align: 'center' });
  y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text('NOTA PENJUALAN', W / 2, y, { align: 'center' });
  y += 4; doc.setDrawColor(150); doc.line(M, y, R, y);
  y += 5; doc.setFontSize(8.5);
  const kv = (k, v) => { doc.setFont('helvetica', 'normal'); doc.text(k, M, y); doc.setFont('helvetica', 'bold'); doc.text(String(v || '-'), M + 20, y); y += 4.4; };
  kv('No. nota', o.order_no); kv('Tanggal', dt); kv('Pembeli', o.customer_name || '-'); if (o.customer_phone) kv('No. HP', o.customer_phone);
  y += 1; doc.line(M, y, R, y); y += 4.5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('Barang', M, y); doc.text('Qty', 66, y, { align: 'right' }); doc.text('Jumlah', R, y, { align: 'right' });
  y += 2; doc.line(M, y, R, y); y += 4;
  doc.setFont('helvetica', 'normal');
  const win = o.order_items.filter((i) => i.source === 'win' && i.ready_qty < i.qty).reduce((a, i) => a + i.qty - i.ready_qty, 0);
  for (const i of o.order_items) {
    const lines = doc.splitTextToSize(String(i.name), 52);
    if (y + lines.length * 3.6 + 6 > 140) { doc.addPage(); y = 12; }
    doc.setFontSize(8); doc.text(lines, M, y);
    doc.text(String(i.qty), 66, y, { align: 'right' }); doc.text(money(i.qty * i.price), R, y, { align: 'right' });
    y += lines.length * 3.6;
    doc.setFontSize(6.8); doc.setTextColor(110); doc.text(`${i.sku || ''}  @ ${money(i.price)}${i.source === 'win' && i.ready_qty < i.qty ? '  (menyusul)' : ''}`, M, y); doc.setTextColor(0);
    y += 4.2;
  }
  if (y > 122) { doc.addPage(); y = 12; }
  doc.line(M, y, R, y); y += 5.5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('TOTAL', M, y); doc.text(money(o.total_jual), R, y, { align: 'right' });
  y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(`Pembayaran: ${o.pay_method || '-'}${o.status === 'cancel' ? '  ·  DIBATALKAN' : ''}`, M, y);
  if (win) { y += 4.4; doc.setFont('helvetica', 'bold'); doc.text(`${win} barang menyusul (dipesan dulu ke supplier)`, M, y); doc.setFont('helvetica', 'normal'); }
  if (o.note) { y += 4.4; doc.text(doc.splitTextToSize('Catatan: ' + o.note, R - M), M, y); }
  doc.setFontSize(8); doc.text('Terima kasih atas kunjungan Anda', W / 2, 141, { align: 'center' });
  return doc;
}
