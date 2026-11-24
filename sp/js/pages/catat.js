import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, rp, num, fmtTime, fmtDate, todayStr, addDays, on, toast, toastErr, icon, emptyState, confirmBox, promptBox, statusTag, beep, copyBtn } from '../ui.js';
import { scanBox, bindScan } from '../scanner.js';
import { bindProductSearch } from '../daftar-file.js';

// Catat pesanan tanpa SKU marketplace:
// 1) pilih toko  2) scan resi  3) scan setiap barang (kode dari pricelist WIN)
// Barang yang ada di rak langsung diambil. Semua barang tetap dibeli di WIN (menu Beli WIN).
const KEY = 'catat-store';

export default {
  tour: [
    { sel: '#stores', title: '1. Pilih toko', body: 'Pilih toko sekali. Semua resi yang di-scan masuk ke toko itu sampai tokonya diganti.' },
    { sel: '#scanwrap', title: '2. Scan resi, lalu scan barang', body: 'Scan barcode resi di label kirim, lalu scan setiap barangnya. Stok barang WIN dipakai dulu, kalau habis dari stok rak.' },
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
    // 2.57 cara input barang: 'scan' (bawaan) atau 'cari' (ketik nama barang)
    let itemMode = (() => { try { return localStorage.getItem('catat-item-mode') || 'scan'; } catch (_) { return 'scan'; } })();

    el.innerHTML = `<div class="stack">
      <section class="card stack" id="stores">
        <div class="row between wrap"><h2 class="sec-title">1. Toko</h2><span class="xs muted">dipakai untuk semua resi berikutnya</span></div>
        <div class="chips store-chips">${stores.map((s) => `<button class="chip ${s.id === storeId ? 'on' : ''}" data-store="${s.id}">${esc(s.name)}<span class="xs" style="opacity:.6;margin-left:4px">${esc(s.marketplace === 'Shopee' ? '' : s.marketplace)}</span></button>`).join('')}</div>
      </section>
      <section class="card stack" id="scanwrap">
        <div class="ctx-bar" id="ctx"></div>
        <div class="row between wrap"><h2 class="sec-title" id="steptitle"></h2><button class="btn btn-sm hidden" id="next">${icon('check', 16)} Selesai, resi berikutnya</button></div>
        <div class="chips hidden" id="imode" role="tablist" aria-label="Cara input barang"><button class="chip" data-imode="scan">${icon('scan', 15)} Scan barcode</button><button class="chip" data-imode="cari">${icon('search', 15)} Cari nama barang</button></div>
        <div id="sbwrap">${scanBox('sb', 'Scan resi')}</div>
        <div class="stack s8 hidden" id="srch"><input class="input" id="srchin" placeholder="Ketik nama / kode barang, misal: panel vario hitam" autocomplete="off" enterkeyhint="search"><div id="srchhint"></div></div>
        <div id="cur"></div>
      </section>
      ${kg ? '<details class="card meja-card" id="meja"></details>' : `<div class="alert blue small">Barang yang <b>ada di rak langsung diambil</b> (stok berkurang) supaya cepat dipacking. <b>Semua barang tetap dibeli di WIN</b> lewat menu Beli WIN. Saat sopir sampai dan barang di-scan di Terima barang WIN: kalau barangnya ada, pesanan siap dikirim dan rak terisi lagi. Kalau WIN kosong, pesanan otomatis <b>cancel</b> dan barang rak dikembalikan.</div>`}
      <section class="card flush" id="today"></section>
    </div>`;

    const storeName = () => stores.find((s) => s.id === storeId)?.name || '';
    // 2.50: setelah scan, halaman kembali ke kotak scan (tidak perlu geser ke atas lagi)
    const keepTop = () => requestAnimationFrame(() => {
      const t = el.querySelector('#scanwrap'); if (!t) return;
      const bar = document.querySelector('.topbar');
      const off = bar && getComputedStyle(bar).position !== 'static' ? bar.offsetHeight : 0;
      const top = t.getBoundingClientRect().top + scrollY - off - 8;
      if (Math.abs(scrollY - top) > 4) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
    // 2.49: resi dari scan yang belum dipacking (atau sudah cancel) bisa dihapus, barang kembali ke stok
    const canDel = (o) => o && ['owner', 'admin'].includes(store.role) && o.entry === 'scan' && !o.packed_at && (['baru', 'menunggu_win', 'siap_packing', 'cancel'].includes(o.status) || (o.status === 'dikirim' && o.auto_kirim));
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
      paintItemMode();
    };
    function paintItemMode() {
      const cari = mode === 'barang' && itemMode === 'cari';
      el.querySelector('#imode').classList.toggle('hidden', mode !== 'barang');
      el.querySelectorAll('[data-imode]').forEach((b) => b.classList.toggle('on', b.dataset.imode === itemMode));
      el.querySelector('#sbwrap').classList.toggle('hidden', cari);
      el.querySelector('#srch').classList.toggle('hidden', !cari);
      if (el.querySelector('#steptitle')) el.querySelector('#steptitle').textContent = mode === 'resi' ? '2. Scan resi' : cari ? '3. Cari barang' : '3. Scan barang';
    }

    const paintCur = async () => {
      const box = el.querySelector('#cur');
      if (!order) { box.innerHTML = storeId ? '' : '<div class="alert yellow small">Pilih toko dulu sebelum scan resi.</div>'; return; }
      const hint = el.querySelector('#srchhint');
      if (hint) hint.innerHTML = order.shopee?.length && isOpen(order.status) ? `<div class="xs muted">Isi pesanan Shopee, ketuk untuk mencari:</div><div class="chips">${order.shopee.map((l) => `<button class="chip" data-shint="${esc(String(l.name).replace(/\[.*?\]|\(.*?\)/g, ' ').replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4).join(' '))}">×${l.qty} ${esc(String(l.name).slice(0, 40))}</button>`).join('')}</div>` : '';
      const { data: items } = await supa.from('order_items').select('id, name, sku, qty, price, rack_qty, ready_qty, meja_qty, po_id, win_ok, products(rack_code, stock)').eq('order_id', order.id).order('id');
      const total = (items || []).reduce((a, i) => a + i.qty * Number(i.price || 0), 0);
      const editable = isOpen(order.status);
      const newFlow = order.status === 'baru' || (kg && order.status !== 'menunggu_win');
      box.innerHTML = `<div class="cur-order">
        <div class="row between wrap"><div><div class="xs muted">Resi · ${esc(order.store || storeName())}</div><b class="mono" style="font-size:18px">${esc(order.resi)}</b>${copyBtn(order.resi)}</div>${statusTag(order.status)}</div>
        <label class="field small" style="margin-top:6px">No. pesanan (opsional, supaya file Penghasilan bisa dicocokkan)
          <div class="row" style="flex-wrap:nowrap"><input class="input mono grow" id="ono" value="${esc(order.order_no === order.resi ? '' : order.order_no)}" placeholder="ketik / scan no. pesanan" ${editable ? '' : 'disabled'}>${editable ? '<button class="btn btn-sm" id="savno">Simpan</button>' : ''}</div></label>
        ${order.shopee?.length ? `<div class="alert blue small" style="margin-top:8px"><b>Isi pesanan di Shopee:</b>${order.shopee.map((l) => `<div>×${l.qty} ${esc(l.name)}${l.var ? ` <span class="muted">(${esc(l.var)})</span>` : ''}</div>`).join('')}</div>` : ''}
        ${items?.length ? `<div class="list no-page" style="margin-top:8px">${items.map((i) => `<div class="list-item cat-item">
            <div class="grow" style="min-width:0"><b>${esc(i.name)}</b><div class="xs muted mono">${esc(i.sku || '')}</div>
              <div class="xs" style="margin-top:3px">${newFlow ? `${i.meja_qty ? `<span class="tag green">${i.meja_qty} barang WIN</span> ` : ''}${i.rack_qty ? `<span class="tag blue">${i.rack_qty} dari rak ${esc(i.products?.rack_code || '')}</span>` : ''}`
                : `${i.rack_qty ? `<span class="tag green">${i.rack_qty} diambil dari rak ${esc(i.products?.rack_code || '')}</span> ` : ''}${i.qty > i.rack_qty ? `<span class="tag yellow">${i.qty - i.rack_qty} tunggu WIN</span> ` : ''}${i.po_id ? '<span class="tag blue">sudah di daftar beli</span>' : '<span class="tag">belum dibeli</span>'}`}</div></div>
            <div class="right">${editable && !i.po_id ? `<div class="qty-step"><button class="btn btn-ghost btn-sm" data-undo="${i.id}" aria-label="Kurangi 1 (kembali ke stok)">−</button><span class="qs-n">${i.qty}</span><button class="btn btn-ghost btn-sm" data-plus="${esc(i.sku || '')}" aria-label="Tambah 1">+</button></div>` : `<b style="font-size:18px">×${i.qty}</b>`}<div class="xs muted">${rp(i.price)}</div></div></div>`).join('')}</div>
          <div class="line-row total"><span>${items.reduce((a, i) => a + i.qty, 0)} barang</span><span>${rp(total)}</span></div>` : '<div class="muted small" style="margin-top:8px">Belum ada barang. Scan kode barang sekarang.</div>'}
        ${editable || canDel(order) ? `<div class="row wrap" style="margin-top:8px">${editable ? '<button class="btn btn-ghost btn-sm" id="cancelord" style="color:var(--red)">Batalkan pesanan ini</button>' : ''}${canDel(order) ? `<button class="btn btn-ghost btn-sm" id="delord" style="color:var(--red)">${icon('x', 15)} Hapus resi</button>` : ''}</div>` : ''}
        ${editable && order.status === 'baru' ? `<div class="xs muted" style="margin-top:6px">Tekan <b>Enter</b> di kolom ${itemMode === 'cari' ? 'cari' : 'scan'} (kosong) untuk menyelesaikan resi ini.</div>` : ''}
        ${order.auto_kirim && order.status === 'dikirim' ? '<div class="xs muted" style="margin-top:6px">Langsung terkirim (packing dilewati). Masih bisa dibuka lagi / dihapus kalau salah.</div>' : ''}
        ${kg && order.entry === 'scan' && (order.status === 'siap_packing' || (order.status === 'dikirim' && order.auto_kirim)) && !order.packed_at ? `<div class="row wrap" style="margin-top:8px"><button class="btn btn-sm" id="reopen">Buka lagi untuk diperbaiki</button></div>` : ''}
      </div>`;
    };

    let listDate = todayStr(), listAll = false, rq = '';
    const loadToday = async () => {
      const box = el.querySelector('#today');
      if (!storeId && !listAll && !rq) { box.innerHTML = ''; return; }
      const { data } = await (() => {
        let q = supa.from('orders').select('id, resi, order_no, status, total_jual, created_at, store_id, stores(name), order_items(qty, rack_qty)');
        if (rq) {
          // 2.49 cari resi: semua tanggal & semua toko
          const k = rq.replace(/[,%()*]/g, '');
          q = q.or(`resi.ilike.%${k}%,order_no.ilike.%${k}%`).order('created_at', { ascending: false }).limit(50);
          return q;
        }
        q = q.gte('created_at', listDate + 'T00:00:00+07:00').lt('created_at', addDays(listDate, 1) + 'T00:00:00+07:00').order('created_at', { ascending: false }).limit(1000);
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
          <label class="check small"><input type="checkbox" id="lall" ${listAll ? 'checked' : ''}> Semua toko</label></div>
          <div class="row" style="margin-top:8px"><input class="input sm grow" id="rq" placeholder="🔍 Cari no. resi / no. pesanan (semua tanggal)" value="${esc(rq)}" autocomplete="off" spellcheck="false"></div></div>
        ${rq ? `<div class="alert blue small" style="margin:8px 12px 0">Hasil cari “${esc(rq)}” · ${list.length} resi (semua tanggal & toko)</div>` : ''}
        ${list.length ? `<div class="list">${list.map((o) => `<button class="list-item" data-open="${o.id}"><span class="xs muted" style="width:${rq ? 64 : 40}px">${rq ? fmtDate(o.created_at, { day: 'numeric', month: 'short' }) + '<br>' : ''}${fmtTime(o.created_at)}</span>
          <div class="grow" style="min-width:0"><b class="mono">${esc(o.resi || o.order_no)}</b>${copyBtn(o.resi || o.order_no)}${(listAll || rq) && o.stores?.name ? ` <span class="tag">${esc(o.stores.name)}</span>` : ''}<div class="xs muted">${o.order_items.reduce((a, i) => a + i.qty, 0)} barang · ${o.order_items.reduce((a, i) => a + (i.rack_qty || 0), 0)} dari rak · ${rp(o.total_jual)}</div></div>${statusTag(o.status)}</button>`).join('')}</div>`
          : emptyState(rq ? 'Resi tidak ditemukan.' : 'Belum ada resi di tanggal ini' + (listAll ? '.' : ' untuk toko ini.'), 'bag')}`;
      const ri = box.querySelector('#rq');
      if (ri && document.activeElement !== ri && box._rqFocus) { ri.focus(); ri.setSelectionRange(ri.value.length, ri.value.length); }
    };
    let rqTimer = null;
    on(el, 'input', '#rq', (e) => { clearTimeout(rqTimer); rqTimer = setTimeout(() => { rq = e.target.value.trim(); el.querySelector('#today')._rqFocus = true; loadToday(); }, 350); });
    on(el, 'change', '#ld', (e) => { listDate = e.target.value || todayStr(); loadToday(); });
    on(el, 'change', '#lall', (e) => { listAll = e.target.checked; loadToday(); });
    on(el, 'click', '[data-dshift]', (e, b) => { const d = addDays(listDate, +b.dataset.dshift); if (d > todayStr()) return; listDate = d; loadToday(); });

    // resi yang sedang di-scan (alur kepala gudang) ditandai selesai -> siap packing
    const finishCur = async () => {
      if (!order || order.status !== 'baru') return;
      try { const r = await rpc('scan_order_done', { p_order: order.id }); if (r.ok && r.status === 'siap_packing') toast(`Resi ${order.resi} siap packing`, 'ok'); else if (r.ok && r.status === 'dikirim') toast(`Resi ${order.resi} terkirim`, 'ok'); } catch (e) { toastErr(e); }
    };
    const paintMeja = async () => {
      const box = el.querySelector('#meja'); if (!box) return;
      const { data } = await supa.from('products').select('id, sku, name, meja_qty').gt('meja_qty', 0).order('name').limit(300);
      const list = data || [];
      box.innerHTML = `<summary class="row between"><span><b>Barang WIN di stok gudang</b> <span class="small muted">${list.reduce((a, p) => a + p.meja_qty, 0)} pcs · ${list.length} macam</span></span>${icon('chev', 16)}</summary>
        ${list.length ? `<div class="list no-page">${list.map((p) => `<div class="list-item" style="padding:6px 0"><div class="grow" style="min-width:0"><span class="small">${esc(p.name)}</span><div class="xs muted mono">${esc(p.sku)}</div></div><b>${p.meja_qty}</b></div>`).join('')}</div>` : '<div class="small muted" style="padding-top:8px">Kosong. Barang WIN muncul di sini setelah di-scan kepala gudang di Terima barang WIN.</div>'}`;
    };
    const openResi = async (code) => {
      await finishCur();
      const r = await rpc('scan_order_start', { p_store: storeId, p_resi: code });
      if (r.entry === undefined || r.packed_at === undefined) {
        const { data: x } = await supa.from('orders').select('entry, packed_at, auto_kirim').eq('id', r.id).maybeSingle();
        if (x) Object.assign(r, x);
      }
      order = r;
      if (r.other_store) toast(`Resi ini sudah tercatat di toko ${r.store}`, 'err');
      setMode(isOpen(r.status) ? 'barang' : 'resi');
      await paintCur(); loadToday();
      return r;
    };

    // 2.57 mode cari: pilih barang dari hasil pencarian = sama seperti scan kodenya
    bindProductSearch(el.querySelector('#srchin'), async (p) => {
      const r = await onScan(p.sku);
      toast(`${r.ok ? '✓' : '✗'} ${r.title || p.name}${r.info ? ' · ' + r.info : ''}`, r.ok ? 'ok' : 'err');
      keepTop();
    });
    el.querySelector('#srchin').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const first = el.querySelector('#srch .ps-item');
      if (e.target.value.trim()) { first?.click(); return; }   // Enter = pilih hasil teratas
      if (order) el.querySelector('#next').click();            // Enter di kolom kosong = selesai resi
    });
    on(el, 'click', '[data-imode]', (e, b) => {
      itemMode = b.dataset.imode; try { localStorage.setItem('catat-item-mode', itemMode); } catch (_) {}
      paintItemMode();
      (itemMode === 'cari' ? el.querySelector('#srchin') : el.querySelector('#sb input'))?.focus({ preventScroll: true });
    });
    on(el, 'click', '[data-shint]', (e, b) => { const i = el.querySelector('#srchin'); i.value = b.dataset.shint; i.dispatchEvent(new Event('input')); i.focus({ preventScroll: true }); });
    bindScan(el, 'sb', async (code) => {
      try { return await onScan(code); } finally { keepTop(); }
    });
    async function onScan(code) {
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
        if (r.alur_kg) { paintMeja(); return { ok: true, title: r.name, info: r.from_meja ? `Stok barang WIN · sisa ${r.meja_left}` : `Dari rak ${r.rack || '-'} · sisa stok rak ${r.stock_left}` }; }
        return { ok: true, title: r.name, info: r.from_rack ? `Ambil dari rak ${r.rack || '-'} · sisa stok ${r.stock_left} · tetap dibeli di WIN` : 'Stok rak kosong · tunggu barang WIN' };
      } catch (e) { beep(false); toastErr(e); return { ok: false, title: e.message || 'Gagal' }; }
    }

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
    el.querySelector('#next').onclick = async () => { await finishCur(); order = null; setMode('resi'); paintCur(); loadToday(); keepTop(); el.querySelector('#sb input').focus({ preventScroll: true }); };
    on(el, 'click', '[data-undo]', async (e, b) => { try { await rpc('scan_order_undo', { p_item: +b.dataset.undo }); paintCur(); loadToday(); paintMeja(); } catch (err) { toastErr(err); } });
    on(el, 'click', '[data-plus]', async (e, b) => {
      if (!b.dataset.plus) return;
      try { const r = await rpc('scan_order_item', { p_order: order.id, p_code: b.dataset.plus }); if (!r.ok) { toast(r.msg || 'Stok tidak cukup', 'err'); return; } paintCur(); loadToday(); paintMeja(); } catch (err) { toastErr(err); }
    });
    on(el, 'click', '#delord', async () => {
      if (!(await confirmBox('Hapus resi ' + order.resi + '?', order.status === 'cancel' ? 'Resi yang sudah cancel dihapus dari daftar.' : 'Semua barang di resi ini dikembalikan ke stok (stok gudang / rak), lalu resinya dihapus.', 'Hapus resi', true))) return;
      try {
        const r = await rpc('scan_order_delete', { p_order: order.id });
        toast(`Resi ${r.resi} dihapus${r.kembali_ke_rak || r.kembali_ke_meja ? ` · ${(r.kembali_ke_rak || 0) + (r.kembali_ke_meja || 0)} barang kembali ke stok` : ''}`, 'ok');
        order = null; setMode('resi'); paintCur(); loadToday(); paintMeja();
      } catch (err) { toastErr(/scan_order_delete|function/i.test(err.message || '') ? new Error('Butuh update database: jalankan supabase/update-2.49.sql') : err); }
    });
    // 2.49: Enter di kolom scan yang kosong = selesai resi ini, lanjut resi berikutnya
    el.querySelector('#sb input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.value.trim() && mode === 'barang' && order) { e.preventDefault(); el.querySelector('#next').click(); }
    });
    on(el, 'click', '#reopen', async () => {
      try { await rpc('scan_order_reopen', { p_order: order.id }); order.status = 'baru'; order.auto_kirim = false; setMode('barang'); paintCur(); loadToday(); toast('Resi dibuka lagi. Scan / hapus barang lalu tekan Selesai.', 'ok'); } catch (err) { toastErr(err); }
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
      const { data: o } = await supa.from('orders').select('id, resi, order_no, status, store_id, entry, packed_at, auto_kirim, stores(name)').eq('id', +b.dataset.open).single();
      order = { ...o, store: o.stores?.name };
      setMode(isOpen(o.status) && o.entry === 'scan' ? 'barang' : 'resi');
      paintCur(); keepTop();
    });

    setMode('resi'); paintCtx(); paintCur(); loadToday(); paintMeja();
  }
};
