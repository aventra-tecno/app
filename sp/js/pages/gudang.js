import { supa, rpc } from '../supa.js';
import { nameOf } from '../store.js';
import { esc, num, fmtDateTime, chips, on, modal, toast, toastErr, pageHead, emptyState, skeleton, icon, debounce, confirmBox, promptBox } from '../ui.js';

// Multi gudang / cabang: stok per lokasi, kirim & terima pindahan barang antar gudang.
// Gudang utama = stok rak biasa (menu Stok & rak). Gudang lain punya stok sendiri.
const TS = { dikirim: ['Dalam perjalanan', 'yellow'], diterima: ['Diterima', 'green'], batal: ['Dibatalkan', ''] };

export default {
  tour: [
    { sel: '#whs', title: 'Daftar gudang', body: 'Gudang utama memakai stok rak biasa. Tambah cabang / gudang lain di sini.' },
    { sel: '#send', title: 'Kirim pindahan', body: 'Pilih gudang asal & tujuan, scan / ketik barang dan jumlahnya. Stok asal langsung berkurang.' },
    { sel: '#tr', title: 'Terima pindahan', body: 'Setelah barang sampai, tekan Terima. Stok gudang tujuan bertambah.' }
  ],
  async render(el) {
    let tab = 'stok', whs = [], trs = [], q = '';
    el.innerHTML = `${pageHead('Multi gudang', 'Stok per lokasi dan pindah barang antar gudang / cabang.', `<button class="btn btn-primary" id="send">${icon('truck', 18)} Kirim pindahan</button><button class="btn" id="addwh">${icon('plus', 18)} Gudang</button>`)}
      <div class="stack"><div id="whs">${skeleton(1)}</div>
        <div id="tr"></div>
        ${chips('t', [['stok', 'Stok per lokasi'], ['riwayat', 'Riwayat pindahan']], tab)}
        <section class="card flush" id="body">${skeleton()}</section></div>`;
    const load = async () => {
      const [a, b] = await Promise.all([supa.from('warehouses').select('*').order('is_main', { ascending: false }).order('name'),
        supa.from('wh_transfers').select('*, wh_transfer_items(qty, product_id, products(sku, name))').order('created_at', { ascending: false }).limit(200)]);
      if (a.error) return toastErr(a.error);
      whs = a.data; trs = b.data || [];
      const { data: st } = await supa.from('warehouse_stock').select('warehouse_id, qty').gt('qty', 0);
      el.querySelector('#whs').innerHTML = `<div class="wh-grid">${whs.map((w) => {
        const l = (st || []).filter((s) => s.warehouse_id === w.id);
        return `<button class="card wh ${w.active ? '' : 'off'}" data-wh="${w.id}"><div class="row between"><b>${esc(w.name)}</b>${w.is_main ? '<span class="tag dark">utama</span>' : w.active ? '' : '<span class="tag red">nonaktif</span>'}</div>
          <div class="xs muted">${esc(w.address || (w.is_main ? 'Stok rak di menu Stok & rak' : ''))}</div>${w.is_main ? '' : `<div class="small" style="margin-top:6px"><b>${num(l.length)}</b> macam · <b>${num(l.reduce((s, x) => s + x.qty, 0))}</b> pcs</div>`}</button>`;
      }).join('')}</div>`;
      const otw = trs.filter((t) => t.status === 'dikirim');
      el.querySelector('#tr').innerHTML = otw.length ? `<section class="card flush"><div class="card-h"><h2>Dalam perjalanan</h2><b>${otw.length}</b></div><div class="list no-page">${otw.map(trRow).join('')}</div></section>` : '';
      paint();
    };
    const whName = (id) => whs.find((w) => w.id === id)?.name || '–';
    const trRow = (t) => `<div class="list-item"><div class="grow" style="min-width:0"><b class="mono">${esc(t.code)}</b> <span class="tag ${TS[t.status][1]}">${TS[t.status][0]}</span>
        <div class="small">${esc(whName(t.from_wh))} → <b>${esc(whName(t.to_wh))}</b> · ${t.wh_transfer_items.length} macam / ${num(t.wh_transfer_items.reduce((s, i) => s + i.qty, 0))} pcs</div>
        <div class="xs muted">${esc(t.wh_transfer_items.slice(0, 4).map((i) => (i.products?.name || '') + ' ×' + i.qty).join(', '))}${t.wh_transfer_items.length > 4 ? '…' : ''}</div>
        <div class="xs muted">Dikirim ${esc(nameOf(t.created_by))} · ${esc(fmtDateTime(t.created_at))}${t.received_at ? ' · diterima ' + esc(nameOf(t.received_by)) + ' ' + esc(fmtDateTime(t.received_at)) : ''}${t.note ? ' · ' + esc(t.note) : ''}</div></div>
      ${t.status === 'dikirim' ? `<div class="row"><button class="btn btn-sm btn-ghost" data-cancel="${t.id}">Batal</button><button class="btn btn-sm btn-primary" data-recv="${t.id}">Terima</button></div>` : ''}</div>`;
    const paint = async () => {
      const box = el.querySelector('#body');
      if (tab === 'riwayat') { box.innerHTML = trs.length ? `<div class="list">${trs.map(trRow).join('')}</div>` : emptyState('Belum ada pindahan.', 'truck'); return; }
      const others = whs.filter((w) => !w.is_main && w.active);
      box.innerHTML = `<div class="card-h"><input class="input" id="wq" placeholder="Cari kode / nama barang…" value="${esc(q)}" style="max-width:360px"></div><div id="wt">${skeleton(2)}</div>`;
      box.querySelector('#wq').addEventListener('input', debounce((e) => { q = e.target.value; table(); }, 300));
      const table = async () => {
        let rows; try { rows = await rpc('wh_stock', { p_q: q || null, p_limit: 200 }); } catch (e) { return toastErr(e); }
        box.querySelector('#wt').innerHTML = rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Barang</th><th class="right">${esc(whs.find((w) => w.is_main)?.name || 'Utama')}</th>${others.map((w) => `<th class="right">${esc(w.name)}</th>`).join('')}<th class="right">Total</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td><b>${esc(r.name)}</b><div class="xs muted mono">${esc(r.sku)}${r.rack_code ? ' · rak ' + esc(r.rack_code) : ''}</div></td><td class="num">${num(r.utama)}</td>
            ${others.map((w) => `<td class="num"><button class="linkbtn" data-set="${w.id}" data-sku="${esc(r.sku)}" data-cur="${r.cabang[w.id] || 0}" title="Ubah stok ${esc(w.name)}">${num(r.cabang[w.id] || 0)}</button></td>`).join('')}
            <td class="num"><b>${num(r.utama + others.reduce((s, w) => s + (r.cabang[w.id] || 0), 0))}</b></td></tr>`).join('')}</tbody></table></div>`
          : emptyState(q ? 'Barang tidak ditemukan.' : 'Belum ada stok di gudang cabang. Cari barang untuk melihat stoknya, atau kirim pindahan.', 'box');
      };
      table();
    };

    const whForm = async (w = {}) => {
      const r = await modal({ title: w.id ? 'Ubah gudang' : 'Gudang / cabang baru', body: `<div class="stack"><label class="field">Nama<input class="input" id="w-n" value="${esc(w.name || '')}" placeholder="mis. Cabang Bekasi"></label>
        <label class="field">Alamat / keterangan<input class="input" id="w-a" value="${esc(w.address || '')}"></label>
        ${w.id && !w.is_main ? `<label class="check"><input type="checkbox" id="w-x" ${w.active ? 'checked' : ''}> Aktif</label>` : ''}</div>`,
        actions: [{ label: 'Batal', value: null }, { label: 'Simpan', cls: 'btn-primary', onClick: async (ov) => {
          await rpc('wh_save', { p: { id: w.id, name: ov.querySelector('#w-n').value, address: ov.querySelector('#w-a').value, active: ov.querySelector('#w-x') ? ov.querySelector('#w-x').checked : true } });
          return true;
        } }] });
      if (r) { toast('Tersimpan', 'ok'); load(); }
    };
    el.querySelector('#addwh').onclick = () => whForm();
    on(el, 'click', '[data-wh]', (e, b) => whForm(whs.find((w) => String(w.id) === b.dataset.wh)));

    el.querySelector('#send').onclick = async () => {
      const act = whs.filter((w) => w.active);
      if (act.length < 2) { toast('Tambah gudang / cabang dulu', 'err'); return whForm(); }
      const items = [];
      const r = await modal({ title: 'Kirim pindahan barang', wide: true, body: `<div class="stack">
        <div class="grid g2"><label class="field">Dari<select class="input" id="t-f">${act.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></label>
          <label class="field">Ke<select class="input" id="t-t">${act.map((w, i) => `<option value="${w.id}" ${i === 1 ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label></div>
        <form class="row" id="t-add"><input class="input grow" id="t-c" placeholder="Scan / ketik kode barang" autocomplete="off"><input class="input num" id="t-q" type="number" min="1" value="1" style="width:80px" aria-label="Jumlah"><button class="btn">${icon('plus', 18)}</button></form>
        <div id="t-l" class="list no-page"></div>
        <label class="field">Catatan<input class="input" id="t-n" placeholder="mis. dibawa sopir Andi"></label></div>`,
        onOpen: (ov) => {
          const paintL = () => { ov.querySelector('#t-l').innerHTML = items.map((it, i) => `<div class="list-item"><span class="grow mono">${esc(it.code)}</span><b>×${it.qty}</b><button class="btn btn-sm btn-ghost" data-rm="${i}">${icon('x', 15)}</button></div>`).join('') || '<div class="xs muted">Belum ada barang.</div>'; };
          ov.querySelector('#t-add').addEventListener('submit', (e) => { e.preventDefault(); const c = ov.querySelector('#t-c').value.trim(), n = +ov.querySelector('#t-q').value || 1; if (!c) return; const ex = items.find((x) => x.code === c); if (ex) ex.qty += n; else items.push({ code: c, qty: n }); ov.querySelector('#t-c').value = ''; ov.querySelector('#t-q').value = 1; ov.querySelector('#t-c').focus(); paintL(); });
          ov.querySelector('#t-l').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { items.splice(+b.dataset.rm, 1); paintL(); } });
          paintL();
        },
        actions: [{ label: 'Batal', value: null }, { label: 'Kirim', cls: 'btn-primary', onClick: async (ov) => {
          if (!items.length) { toast('Tambahkan barang', 'err'); return false; }
          return rpc('wh_transfer_create', { p: { from: +ov.querySelector('#t-f').value, to: +ov.querySelector('#t-t').value, note: ov.querySelector('#t-n').value, items } });
        } }] });
      if (r) { toast(`Pindahan ${r.code} dikirim (${r.items} macam)`, 'ok'); load(); }
    };
    on(el, 'click', '[data-recv]', async (e, b) => { b.disabled = true; try { await rpc('wh_transfer_receive', { p_id: +b.dataset.recv }); toast('Pindahan diterima, stok bertambah', 'ok'); load(); } catch (err) { toastErr(err); b.disabled = false; } });
    on(el, 'click', '[data-cancel]', async (e, b) => { if (!await confirmBox('Batalkan pindahan?', 'Barang dikembalikan ke stok gudang asal.', 'Batalkan', true)) return; try { await rpc('wh_transfer_cancel', { p_id: +b.dataset.cancel }); load(); } catch (err) { toastErr(err); } });
    on(el, 'click', '[data-set]', async (e, b) => {
      const v = await promptBox('Stok ' + whName(+b.dataset.set), 'Jumlah fisik sekarang (hasil hitung)', { value: b.dataset.cur, type: 'number' });
      if (v == null) return;
      try { await rpc('wh_set_stock', { p_wh: +b.dataset.set, p_code: b.dataset.sku, p_qty: +v, p_note: 'Hitung fisik' }); toast('Stok diperbarui', 'ok'); paint(); } catch (err) { toastErr(err); }
    });
    on(el, 'click', '[data-chips] .chip', (e, b) => { b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); tab = b.dataset.v; paint(); });
    load();
  }
};
