import { rpc, logEvent } from '../supa.js';
import { store } from '../store.js';
import { esc, rp, fmtDateTime, statusTag, beep, icon, emptyState } from '../ui.js';
import { scanBox, bindScan } from '../scanner.js';

// Scan / ketik kode apa saja: sistem menjelaskan kode itu barang, resi pesanan, atau rak.
export default {
  tour: [
    { sel: '#scan', title: 'Cek kode apa saja', body: 'Scan barcode barang, resi Shopee, atau label rak. Sistem langsung menampilkan keterangannya.' },
    { sel: '#hist', title: 'Riwayat cek', body: 'Kode yang baru saja dicek tercatat di sini (hanya di perangkat ini).' }
  ],
  async render(el) {
    const history = [];
    el.innerHTML = `<div class="stack">
      <div class="alert blue small">Scan atau ketik kode apa saja untuk melihat keterangannya: <b>barang</b> (nama, rak, stok), <b>resi</b> (isi pesanan, status), atau <b>rak</b> (isi rak). Halaman ini hanya melihat, tidak mengubah stok.</div>
      <div class="card stack" id="scan">${scanBox('sb', 'Scan / ketik kode barang, resi, atau rak')}</div>
      <div id="res"></div>
      <section class="card flush" id="hist"><div class="card-h"><h2>Riwayat cek</h2></div><div id="hl">${emptyState('Belum ada kode yang dicek.', 'scan')}</div></section>
    </div>`;
    const money = ['owner', 'admin'].includes(store.role);
    bindScan(el, 'sb', async (code) => {
      let r;
      try { r = await rpc('lookup_code', { p_code: code }); } catch (e) { beep(false); el.querySelector('#res').innerHTML = `<div class="alert red">${esc(e.message || e)}</div>`; return { ok: false, title: 'Gagal mengecek kode' }; }
      const box = el.querySelector('#res');
      let out, title, info, ok = true;
      if (r.type === 'barang') {
        title = r.name; info = `Barang · Rak ${r.rack || '-'} · stok ${r.stock}`;
        out = `<div class="card stack outline"><div class="row between wrap"><span class="tag blue">Barang</span><span class="mono small">${esc(r.sku)}</span></div>
          <div style="font-size:20px;font-weight:700">${esc(r.name)}</div>
          <div class="grid gkpi"><div class="stat gray"><b class="mono">${esc(r.rack || '—')}</b><span>rak</span></div><div class="stat ${r.stock > 0 ? 'green' : 'red'}"><b>${r.stock}</b><span>stok di rak</span></div>
            <div class="stat gray"><b>${r.dipesan}</b><span>menunggu diambil picker</span></div>${r.karantina ? `<div class="stat red"><b>${r.karantina}</b><span>karantina (rusak)</span></div>` : ''}
            ${money ? `<div class="stat gray"><b>${rp(r.harga_beli)}</b><span>harga beli</span></div><div class="stat gray"><b>${rp(r.harga_shopee)}</b><span>harga Shopee</span></div>` : ''}</div>
          ${r.category ? `<div class="small muted">Kategori: ${esc(r.category)}</div>` : ''}</div>`;
      } else if (r.type === 'resi') {
        const items = r.items || [];
        title = 'Resi ' + (r.resi || r.order_no); info = items.map((i) => i.name + ' ×' + i.qty).join(', ');
        out = `<div class="card stack outline"><div class="row between wrap"><span class="tag yellow">Resi pesanan</span>${statusTag(r.status)}</div>
          <div><div class="xs muted">No. resi</div><b class="mono" style="font-size:18px">${esc(r.resi || '–')}</b></div>
          <div class="small muted">No. pesanan <span class="mono">${esc(r.order_no)}</span> · ${fmtDateTime(r.order_date)}${r.packed_at ? ' · dipacking ' + fmtDateTime(r.packed_at) : ''}${money && r.total_jual != null ? ' · ' + rp(r.total_jual) : ''}</div>
          <div>${items.map((i) => `<div class="line-row"><span>${esc(i.name)} ${i.source === 'win' ? '<span class="tag yellow">WIN</span>' : ''}</span><b>×${i.qty}</b></div><div class="xs muted" style="margin:-2px 0 6px">siap ${i.ready}/${i.qty} · dipacking ${i.packed}/${i.qty}</div>`).join('')}</div></div>`;
      } else if (r.type === 'rak') {
        const items = r.items || [];
        title = 'Rak ' + r.code; info = items.length + ' jenis barang';
        out = `<div class="card stack outline"><div class="row between wrap"><span class="tag dark">Rak</span><b class="mono" style="font-size:20px">${esc(r.code)}</b></div>
          ${r.note ? `<div class="small muted">${esc(r.note)}</div>` : ''}
          ${items.length ? items.map((i) => `<div class="line-row"><span>${esc(i.name)}<div class="xs muted mono">${esc(i.sku)}</div></span><b>${i.stock}</b></div>`).join('') : '<div class="muted small">Rak ini kosong.</div>'}</div>`;
      } else {
        ok = false; title = 'Kode tidak dikenal'; info = 'Belum ada di master barang, pesanan, atau rak';
        out = `<div class="card stack" style="border:2px solid var(--red)"><span class="tag red">Tidak dikenal</span><div class="mono" style="font-size:18px">${esc(code)}</div>
          <div class="small">Kode ini belum terdaftar sebagai barang, resi, atau rak.${['owner', 'admin', 'kepala_gudang', 'supervisor'].includes(store.role) ? ` <a href="#/barang">Tambahkan di Master barang</a>.` : ''}</div></div>`;
      }
      beep(ok);
      logEvent('cek', 'Cek kode ' + code + ' → ' + title, code);
      box.innerHTML = out;
      history.unshift({ code, title, ok, at: new Date() });
      el.querySelector('#hl').innerHTML = `<div class="list">${history.slice(0, 20).map((h) => `<div class="list-item"><span style="color:${h.ok ? 'var(--green)' : 'var(--red)'}">${icon(h.ok ? 'check' : 'x', 18, 3)}</span><div class="grow"><b>${esc(h.title)}</b><div class="xs muted mono">${esc(h.code)}</div></div><span class="xs muted">${fmtDateTime(h.at)}</span></div>`).join('')}</div>`;
      return { ok, title, info };
    });
  }
};
