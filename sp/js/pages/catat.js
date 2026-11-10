import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, rp, num, fmtTime, fmtDate, todayStr, addDays, on, toast, toastErr, icon, emptyState, confirmBox, promptBox, statusTag, beep } from '../ui.js';
import { scanBox, bindScan } from '../scanner.js';

// Catat pesanan tanpa SKU marketplace:
// 1) pilih toko  2) scan resi  3) scan setiap barang (kode dari pricelist WIN)
// Barang yang ada di rak langsung diambil. Semua barang tetap dibeli di WIN (menu Beli WIN).
const KEY = 'catat-store';

export default {
  tour: [
    { sel: '#stores', title: '1. Pilih toko', body: 'Pilih toko sekali. Semua resi yang di-scan masuk ke toko itu sampai tokonya diganti.' },
    { sel: '#scanwrap', title: '2. Scan resi, lalu scan barang', body: 'Scan barcode resi di label kirim, lalu scan setiap barangnya. Barang diambil dari meja kepala gudang (kalau meja kosong, dari rak).' },
    { sel: '#today', title: 'Resi per tanggal & toko', body: 'Daftar resi yang sudah dicatat. Pilih tanggal lain atau centang Semua toko. Tekan resi untuk membukanya lagi.' }
  ],
  async render(el) {
    const { data: allStores, error } = await supa.from('stores').select('*').eq('active', true).order('sort').order('name');
    const stores = (allStores || []).filter((s) => s.marketplace !== 'Offline');
    // 2.33 alur kepala gudang: barang sudah disiapkan (picker + WIN) di meja kepala gudang, admin scan resi & barang di sini
    const kg = store.settings.alur_kg !== false;
    const isOpen = (st) => st === 'menunggu_win' || st === 'baru';
    if (error) {
      el.innerHTML = `<div class="alert yellow">Menu ini butuh update database. Jalankan <b>supabase/update-2.0.sql</b> di Supabase › SQL Editor.</div>`;
      return;
    }
    if (!stores.length) { el.innerHTML = `<div class="card">${emptyState('Belum ada toko. Owner menambahkan toko di menu Pengaturan.', 'bag')}</div>`; return; }
    let storeId = (() => { try { return +localStorage.getItem(KEY) || null; } catch (_) { return null; } })();
    if (!stores.some((s) => s.id === storeId)) storeId = null;
    let order = null;       // pesanan yang sedang dicatat
    let mode = 'resi';      // 'resi' | 'barang'

    el.innerHTML = `<div class="stack">
      <section class="card stack" id="stores">
        <div class="row between wrap"><h2 class="sec-title">1. Toko</h2><span class="xs muted">dipakai untuk semua resi berikutnya</span></div>
        <div class="chips store-chips">${stores.map((s) => `<button class="chip ${s.id === storeId ? 'on' : ''}" data-store="${s.id}">${esc(s.name)}<span class="xs" style="opacity:.6;margin-left:4px">${esc(s.marketplace === 'Shopee' ? '' : s.marketplace)}</span></button>`).join('')}</div>
      </section>
      <section class="card stack" id="scanwrap">
        <div class="ctx-bar" id="ctx"></div>
        <div class="row between wrap"><h2 class="sec-title" id="steptitle"></h2><button class="btn btn-sm hidden" id="next">${icon('check', 16)} Selesai, resi berikutnya</button></div>
        ${scanBox('sb', 'Scan resi')}
        <div id="cur"></div>
      </section>
      ${kg ? '<details class="card meja-card" id="meja"></details>' : `<div class="alert blue small">Barang yang <b>ada di rak langsung diambil</b> (stok berkurang) supaya cepat dipacking. <b>Semua barang tetap dibeli di WIN</b> lewat menu Beli WIN. Saat sopir sampai dan barang di-scan di Terima barang WIN: kalau barangnya ada, pesanan siap dikirim dan rak terisi lagi. Kalau WIN kosong, pesanan otomatis <b>cancel</b> dan barang rak dikembalikan.</div>`}
      <section class="card flush" id="today"></section>
    </div>`;

    const storeName = () => stores.find((s) => s.id === storeId)?.name || '';
    const longDate = (d) => fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    // penanda besar: sedang mencatat untuk toko & tanggal apa (resi baru selalu tercatat hari ini)
    const paintCtx = () => {
      el.querySelector('#ctx').innerHTML = storeId
        ? `<span class="ctx-lbl">Sedang mencatat</span><span class="ctx-pill store">${icon('bag', 15)} ${esc(storeName())}</span><span class="ctx-pill date">${icon('calendar', 15)} ${esc(longDate(todayStr()))}</span>`
        : `<span class="ctx-lbl">Pilih toko dulu di atas</span>`;
      el.querySelector('#ctx').classList.toggle('none', !storeId);
    };
    const setMode = (m) => {
      mode = m;
      el.querySelector('#steptitle').textContent = m === 'resi' ? '2. Scan resi' : '3. Scan barang';
      const inp = el.querySelector('#sb input');
      inp.placeholder = m === 'resi' ? 'Scan / ketik no. resi' : 'Scan kode barang (pricelist WIN)';
      el.querySelector('#sb').closest('.scanwrap').dataset.ph = inp.placeholder;
      el.querySelector('#next').classList.toggle('hidden', m !== 'barang');
      el.querySelector('#scanwrap').classList.toggle('mode-barang', m === 'barang');
    };

    const paintCur = async () => {
      const box = el.querySelector('#cur');
      if (!order) { box.innerHTML = storeId ? '' : '<div class="alert yellow small">Pilih toko dulu sebelum scan resi.</div>'; return; }
      const { data: items } = await supa.from('order_items').select('id, name, sku, qty, price, rack_qty, ready_qty, meja_qty, po_id, win_ok, products(rack_code, stock)').eq('order_id', order.id).order('id');
      const total = (items || []).reduce((a, i) => a + i.qty * Number(i.price || 0), 0);
      const editable = isOpen(order.status);
      const newFlow = order.status === 'baru' || (kg && order.status !== 'menunggu_win');
      box.innerHTML = `<div class="cur-order">
        <div class="row between wrap"><div><div class="xs muted">Resi · ${esc(order.store || storeName())}</div><b class="mono" style="font-size:18px">${esc(order.resi)}</b></div>${statusTag(order.status)}</div>
        <label class="field small" style="margin-top:6px">No. pesanan (opsional, supaya file Penghasilan bisa dicocokkan)
          <div class="row" style="flex-wrap:nowrap"><input class="input mono grow" id="ono" value="${esc(order.order_no === order.resi ? '' : order.order_no)}" placeholder="ketik / scan no. pesanan" ${editable ? '' : 'disabled'}>${editable ? '<button class="btn btn-sm" id="savno">Simpan</button>' : ''}</div></label>
        ${items?.length ? `<div class="list no-page" style="margin-top:8px">${items.map((i) => `<div class="list-item cat-item">
            <div class="grow" style="min-width:0"><b>${esc(i.name)}</b><div class="xs muted mono">${esc(i.sku || '')}</div>
              <div class="xs" style="margin-top:3px">${newFlow ? `${i.meja_qty ? `<span class="tag green">${i.meja_qty} dari meja</span> ` : ''}${i.rack_qty ? `<span class="tag blue">${i.rack_qty} dari rak ${esc(i.products?.rack_code || '')}</span>` : ''}`
                : `${i.rack_qty ? `<span class="tag green">${i.rack_qty} diambil dari rak ${esc(i.products?.rack_code || '')}</span> ` : ''}${i.qty > i.rack_qty ? `<span class="tag yellow">${i.qty - i.rack_qty} tunggu WIN</span> ` : ''}${i.po_id ? '<span class="tag blue">sudah di daftar beli</span>' : '<span class="tag">belum dibeli</span>'}`}</div></div>
            <div class="right"><b style="font-size:18px">×${i.qty}</b><div class="xs muted">${rp(i.price)}</div>${editable && !i.po_id ? `<button class="btn btn-ghost btn-sm" data-undo="${i.id}" style="color:var(--red);padding:0 6px">−1</button>` : ''}</div></div>`).join('')}</div>
          <div class="line-row total"><span>${items.reduce((a, i) => a + i.qty, 0)} barang</span><span>${rp(total)}</span></div>` : '<div class="muted small" style="margin-top:8px">Belum ada barang. Scan kode barang sekarang.</div>'}
        ${editable ? `<div class="row wrap" style="margin-top:8px"><button class="btn btn-ghost btn-sm" id="cancelord" style="color:var(--red)">Batalkan pesanan ini</button></div>` : ''}
        ${kg && order.entry === 'scan' && order.status === 'siap_packing' && !order.packed_at ? `<div class="row wrap" style="margin-top:8px"><button class="btn btn-sm" id="reopen">Buka lagi untuk diperbaiki</button></div>` : ''}
      </div>`;
    };

    let listDate = todayStr(), listAll = false;
    const loadToday = async () => {
      const box = el.querySelector('#today');
      if (!storeId && !listAll) { box.innerHTML = ''; return; }
      const { data } = await (() => {
        let q = supa.from('orders').select('id, resi, order_no, status, total_jual, created_at, store_id, stores(name), order_items(qty, rack_qty)')
          .gte('created_at', listDate + 'T00:00:00+07:00').lt('created_at', addDays(listDate, 1) + 'T00:00:00+07:00').order('created_at', { ascending: false }).limit(1000);
        if (!listAll) q = q.eq('store_id', storeId);
        return q;
      })();
      const list = data || [];
      const n = (s) => list.filter((o) => o.status === s).length;
      const isToday = listDate === todayStr();
      box.innerHTML = `<div class="card-h cat-head ${isToday ? '' : 'past'}"><div><h2>Resi <span class="ctx-pill date">${icon('calendar', 15)} ${isToday ? 'Hari ini · ' : ''}${esc(fmtDate(listDate, { day: 'numeric', month: 'long', year: 'numeric' }))}</span> <span class="ctx-pill store">${icon('bag', 15)} ${listAll ? 'Semua toko' : esc(storeName())}</span></h2>
          ${isToday ? '' : '<div class="ctx-warn small">Melihat tanggal lain. Resi yang di-scan sekarang tetap masuk hari ini.</div>'}
          <div class="small muted">${list.length} resi · ${kg ? n('baru') + ' sedang di-scan' : n('menunggu_win') + ' tunggu WIN'} · ${n('siap_packing')} siap packing · ${n('dikirim') + n('selesai')} dikirim · ${n('cancel')} cancel</div></div>
          <div class="row wrap"><button class="btn btn-sm" data-dshift="-1" aria-label="Hari sebelumnya">${icon('back', 16)}</button><input type="date" class="input sm" id="ld" value="${listDate}" max="${todayStr()}" style="max-width:160px"><button class="btn btn-sm" data-dshift="1" aria-label="Hari berikutnya" ${isToday ? 'disabled' : ''}>${icon('chev', 16)}</button>
          <label class="check small"><input type="checkbox" id="lall" ${listAll ? 'checked' : ''}> Semua toko</label></div></div>
        ${list.length ? `<div class="list">${list.map((o) => `<button class="list-item" data-open="${o.id}"><span class="xs muted" style="width:40px">${fmtTime(o.created_at)}</span>
          <div class="grow" style="min-width:0"><b class="mono">${esc(o.resi || o.order_no)}</b>${listAll && o.stores?.name ? ` <span class="tag">${esc(o.stores.name)}</span>` : ''}<div class="xs muted">${o.order_items.reduce((a, i) => a + i.qty, 0)} barang · ${o.order_items.reduce((a, i) => a + (i.rack_qty || 0), 0)} dari rak · ${rp(o.total_jual)}</div></div>${statusTag(o.status)}</button>`).join('')}</div>`
          : emptyState('Belum ada resi di tanggal ini' + (listAll ? '.' : ' untuk toko ini.'), 'bag')}`;
    };
    on(el, 'change', '#ld', (e) => { listDate = e.target.value || todayStr(); loadToday(); });
    on(el, 'change', '#lall', (e) => { listAll = e.target.checked; loadToday(); });
    on(el, 'click', '[data-dshift]', (e, b) => { const d = addDays(listDate, +b.dataset.dshift); if (d > todayStr()) return; listDate = d; loadToday(); });

    // resi yang sedang di-scan (alur kepala gudang) ditandai selesai -> siap packing
    const finishCur = async () => {
      if (!order || order.status !== 'baru') return;
      try { const r = await rpc('scan_order_done', { p_order: order.id }); if (r.ok && r.status === 'siap_packing') toast(`Resi ${order.resi} siap packing`, 'ok'); } catch (e) { toastErr(e); }
    };
    const paintMeja = async () => {
      const box = el.querySelector('#meja'); if (!box) return;
      const { data } = await supa.from('products').select('id, sku, name, meja_qty').gt('meja_qty', 0).order('name').limit(300);
      const list = data || [];
      box.innerHTML = `<summary class="row between"><span><b>Barang di meja kepala gudang</b> <span class="small muted">${list.reduce((a, p) => a + p.meja_qty, 0)} pcs · ${list.length} macam</span></span>${icon('chev', 16)}</summary>
        ${list.length ? `<div class="list no-page">${list.map((p) => `<div class="list-item" style="padding:6px 0"><div class="grow" style="min-width:0"><span class="small">${esc(p.name)}</span><div class="xs muted mono">${esc(p.sku)}</div></div><b>${p.meja_qty}</b></div>`).join('')}</div>` : '<div class="small muted" style="padding-top:8px">Meja kosong. Barang dari picker & WIN muncul di sini setelah dicek kepala gudang.</div>'}`;
    };
    const openResi = async (code) => {
      await finishCur();
      const r = await rpc('scan_order_start', { p_store: storeId, p_resi: code });
      order = r;
      if (r.other_store) toast(`Resi ini sudah tercatat di toko ${r.store}`, 'err');
      setMode(isOpen(r.status) ? 'barang' : 'resi');
      await paintCur(); loadToday();
      return r;
    };

    bindScan(el, 'sb', async (code) => {
      if (!storeId) { beep(false); return { ok: false, title: 'Pilih toko dulu', info: 'Ketuk nama toko di atas' }; }
      try {
        if (mode === 'resi') {
          const r = await openResi(code);
          beep(true);
          if (!isOpen(r.status)) return { ok: false, title: 'Resi sudah diproses', info: 'Status: ' + r.status };
          return { ok: true, title: (r.new ? 'Resi baru · ' : 'Lanjutkan resi · ') + (r.store || storeName()), info: 'Sekarang scan barangnya' };
        }
        const r = await rpc('scan_order_item', { p_order: order.id, p_code: code });
        if (!r.ok) {
          beep(false);
          if (r.unknown) {
            // mungkin resi berikutnya yang di-scan
            const isResi = await confirmBox('Kode tidak ada di pricelist', `<span class="mono">${esc(code)}</span> bukan kode barang di pricelist WIN.<br><br>Apakah ini <b>resi berikutnya</b>?`, 'Ya, ini resi baru');
            if (isResi) { const o = await openResi(code); return { ok: true, title: 'Resi baru · ' + (o.store || storeName()), info: 'Sekarang scan barangnya' }; }
            return { ok: false, title: 'Kode barang tidak dikenal', info: 'Tambahkan dulu di Master barang / upload pricelist WIN' };
          }
          return { ok: false, title: r.empty ? 'Barang belum ada' : r.msg, info: r.empty ? r.msg : '' };
        }
        beep(true); await paintCur();
        if (r.alur_kg) { paintMeja(); return { ok: true, title: r.name, info: r.from_meja ? `Dari meja · sisa meja ${r.meja_left}` : `Meja kosong · ambil di rak ${r.rack || '-'} (sisa stok ${r.stock_left})` }; }
        return { ok: true, title: r.name, info: r.from_rack ? `Ambil dari rak ${r.rack || '-'} · sisa stok ${r.stock_left} · tetap dibeli di WIN` : 'Stok rak kosong · tunggu barang WIN' };
      } catch (e) { beep(false); toastErr(e); return { ok: false, title: e.message || 'Gagal' }; }
    });

    on(el, 'click', '[data-store]', (e, b) => {
      storeId = +b.dataset.store; try { localStorage.setItem(KEY, String(storeId)); } catch (_) {}
      el.querySelectorAll('[data-store]').forEach((c) => c.classList.toggle('on', c === b));
      paintCtx();
      if (order && isOpen(order.status) && order.store_id !== storeId) {
        confirmBox('Pindahkan resi ini?', `Resi <b>${esc(order.resi)}</b> sedang terbuka. Pindahkan ke toko <b>${esc(storeName())}</b>?`, 'Pindahkan').then(async (y) => {
          if (y) { try { await rpc('scan_order_update', { p_order: order.id, p_store: storeId }); order.store_id = storeId; order.store = storeName(); paintCur(); toast('Dipindah', 'ok'); } catch (err) { toastErr(err); } }
        });
      }
      paintCur(); loadToday();
    });
    el.querySelector('#next').onclick = async () => { await finishCur(); order = null; setMode('resi'); paintCur(); loadToday(); el.querySelector('#sb input').focus(); };
    on(el, 'click', '[data-undo]', async (e, b) => { try { await rpc('scan_order_undo', { p_item: +b.dataset.undo }); paintCur(); loadToday(); paintMeja(); } catch (err) { toastErr(err); } });
    on(el, 'click', '#reopen', async () => {
      try { await rpc('scan_order_reopen', { p_order: order.id }); order.status = 'baru'; setMode('barang'); paintCur(); loadToday(); toast('Resi dibuka lagi. Scan / hapus barang lalu tekan Selesai.', 'ok'); } catch (err) { toastErr(err); }
    });
    on(el, 'click', '#savno', async () => {
      const v = el.querySelector('#ono').value.trim();
      try { await rpc('scan_order_update', { p_order: order.id, p_order_no: v || null }); if (v) order.order_no = v; toast('No. pesanan tersimpan', 'ok'); } catch (err) { toastErr(err); }
    });
    on(el, 'click', '#cancelord', async () => {
      const reason = await promptBox('Batalkan pesanan ' + order.resi + '?', 'Alasan (mis. pembeli cancel)', { required: false });
      if (reason === null) return;
      try { const r = await rpc('scan_order_cancel', { p_order: order.id, p_reason: reason }); toast(`Dibatalkan. ${r.kembali_ke_meja ? r.kembali_ke_meja + ' barang kembali ke meja, ' : ''}${r.kembali_ke_rak} barang dikembalikan ke rak.`, 'ok'); order.status = 'cancel'; setMode('resi'); paintCur(); loadToday(); paintMeja(); } catch (err) { toastErr(err); }
    });
    on(el, 'click', '[data-open]', async (e, b) => {
      await finishCur();
      const { data: o } = await supa.from('orders').select('id, resi, order_no, status, store_id, entry, packed_at, stores(name)').eq('id', +b.dataset.open).single();
      order = { ...o, store: o.stores?.name };
      setMode(isOpen(o.status) && o.entry === 'scan' ? 'barang' : 'resi');
      paintCur(); window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    setMode('resi'); paintCtx(); paintCur(); loadToday(); paintMeja();
  }
};
