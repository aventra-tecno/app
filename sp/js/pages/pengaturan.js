import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, toast, toastErr, pageHead, icon, on, promptBox, confirmBox, num, parseNum, applyTheme } from '../ui.js';
import { APP_VERSION } from '../config.js';

export default {
  async render(el) {
    const s = store.settings;
    el.innerHTML = `${pageHead('Pengaturan', 'Berlaku untuk semua pegawai.')}
      <form class="stack" id="f">
        <section class="card stack"><h2 class="sec-title">Toko</h2>
          <label class="field">Nama toko (tampil di menu)<input class="input" name="nama_toko" value="${esc(s.nama_toko || '')}"></label></section>
        <section class="card stack"><h2 class="sec-title">Kombinasi warna</h2>
          <div class="theme-pick">${[['biru', 'Biru', 'Navy seperti tampilan HP'], ['hitam', 'Hitam', 'Hitam + kuning seperti desktop lama']].map(([v, l, d]) => `<label class="theme-opt">
            <input type="radio" name="ui_theme" value="${v}" ${(s.ui_theme || 'biru') === v ? 'checked' : ''}>
            <span class="th-prev th-${v}"><i class="th-bar"></i><i class="th-side"></i><i class="th-card"></i><i class="th-dot"></i></span>
            <span class="th-t"><b>${l}</b><span class="xs muted">${d}</span></span></label>`).join('')}</div></section>
        <section class="card stack"><h2 class="sec-title">Cara pesanan masuk</h2>
          <div class="list-item" style="padding:0;border:0"><div class="grow"><b>Upload file pesanan (pencocokan otomatis SKU)</b>
            <div class="small muted">Nyalakan kalau marketplace memakai SKU / kode barang yang sama dengan pricelist. Matikan kalau tidak ada SKU: pesanan dicatat kepala gudang di menu <b>Catat pesanan</b> (scan resi + scan barang).</div></div>
            <label class="switch"><input type="checkbox" name="upload_pesanan" ${s.upload_pesanan !== false ? 'checked' : ''} aria-label="Upload file pesanan"><span></span></label></div></section>
        <section class="card stack" id="stores"><div class="row between wrap"><h2 class="sec-title">Toko / marketplace</h2><button type="button" class="btn btn-sm" id="addstore">${icon('plus', 16)} Tambah toko</button></div>
          <div class="small muted">Dipilih kepala gudang saat scan resi. Rekap harian bisa dilihat per toko.</div><div id="storelist"></div></section>
        <section class="card stack"><h2 class="sec-title">Biaya & laba</h2><div class="grid gauto">
          <label class="field">Biaya bahan packing per resi<input class="input num" name="packing_cost" inputmode="numeric" data-money value="${num(s.packing_cost)}"></label>
          <label class="field">Hari kerja per bulan (pembagi gaji harian)<input class="input num" name="hari_kerja" inputmode="numeric" value="${s.hari_kerja}"></label>
          <label class="field">Estimasi potongan Shopee (%)<input class="input num" name="shopee_fee_pct" inputmode="decimal" value="${s.shopee_fee_pct}"></label></div>
          <div class="small muted">Rumus Harga 5% & harga beli diatur di menu <a href="#/harga">Atur harga</a>.</div></section>
        <section class="card stack"><h2 class="sec-title">Aturan deteksi masalah</h2><div class="grid gauto">
          <label class="field">Jam kerja mulai<input class="input" type="time" name="jam_mulai" value="${(s.jam_mulai || '07:00').slice(0, 5)}"></label>
          <label class="field">Jam kerja selesai<input class="input" type="time" name="jam_selesai" value="${(s.jam_selesai || '18:00').slice(0, 5)}"></label>
          <label class="field">Batas retur / cancel belum kembali (hari)<input class="input num" name="retur_grace_days" inputmode="numeric" value="${s.retur_grace_days}"></label></div>
          <label class="check"><input type="checkbox" name="wajib_foto_packing" ${s.wajib_foto_packing ? 'checked' : ''}> Wajib foto paket sebelum packing selesai</label>
          <div class="small muted">Stok yang diubah manual di luar jam kerja dilaporkan ke owner.</div></section>
        <button class="btn btn-primary btn-lg">Simpan pengaturan</button>
      </form>
      <section class="card stack" id="tg" style="margin-top:16px"><h2 class="sec-title">${icon('send', 18)} Notifikasi Telegram</h2><div class="skeleton" style="height:90px"></div></section>
      <div class="xs muted" style="margin-top:12px">Versi aplikasi ${APP_VERSION}</div>`;
    // pratinjau langsung saat dipilih; tersimpan setelah tekan Simpan pengaturan
    el.querySelectorAll('[name="ui_theme"]').forEach((r) => r.addEventListener('change', () => applyTheme(r.value)));
    el.querySelector('#f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const upd = {
        nama_toko: fd.get('nama_toko').trim() || 'Stok Gudang', packing_cost: parseNum(fd.get('packing_cost')) || 0, hari_kerja: +fd.get('hari_kerja') || 26,
        shopee_fee_pct: +fd.get('shopee_fee_pct') || 0, jam_mulai: fd.get('jam_mulai'), jam_selesai: fd.get('jam_selesai'),
        ui_theme: fd.get('ui_theme') || 'biru', retur_grace_days: +fd.get('retur_grace_days') || 2, wajib_foto_packing: fd.get('wajib_foto_packing') === 'on', upload_pesanan: fd.get('upload_pesanan') === 'on', updated_at: new Date().toISOString()
      };
      const { error } = await supa.from('settings').update(upd).eq('id', 1);
      if (error) return toastErr(error);
      Object.assign(store.settings, upd); toast('Pengaturan tersimpan', 'ok');
    });

    // ---------- toko ----------
    const loadStores = async () => {
      const box = el.querySelector('#storelist');
      const { data, error } = await supa.from('stores').select('*').order('sort').order('name');
      if (error) { box.innerHTML = '<div class="alert yellow small">Jalankan <b>supabase/update-2.0.sql</b> dulu untuk memakai toko.</div>'; return; }
      box.innerHTML = data.length ? `<div class="list no-page">${data.map((t) => `<div class="list-item" style="padding:8px 0">
          <div class="grow"><b>${esc(t.name)}</b> <span class="tag">${esc(t.marketplace)}</span> ${t.active ? '' : '<span class="tag red">nonaktif</span>'}</div>
          <button type="button" class="btn btn-sm" data-sedit="${t.id}">Ubah</button><button type="button" class="btn btn-sm btn-ghost" data-stog="${t.id}" data-v="${t.active ? 0 : 1}">${t.active ? 'Nonaktifkan' : 'Aktifkan'}</button></div>`).join('')}</div>` : '<div class="muted small">Belum ada toko.</div>';
      el._stores = data;
    };
    const askStore = async (t = {}) => {
      const name = await promptBox(t.id ? 'Ubah toko' : 'Tambah toko', 'Nama toko (mis. AYRA)', { value: t.name || '' });
      if (!name) return null;
      const mk = await promptBox('Marketplace', 'Shopee / TikTok Shop / Tokopedia / Lazada / lainnya', { value: t.marketplace || 'Shopee' });
      if (!mk) return null;
      return { name: name.trim().toUpperCase(), marketplace: mk.trim() };
    };
    el.querySelector('#addstore').onclick = async () => {
      const v = await askStore(); if (!v) return;
      const { error } = await supa.from('stores').insert({ ...v, sort: (el._stores?.length || 0) + 1 });
      if (error) return toastErr(error); toast('Toko ditambahkan', 'ok'); loadStores();
    };
    on(el, 'click', '[data-sedit]', async (e, b) => {
      const t = el._stores.find((x) => x.id === +b.dataset.sedit); const v = await askStore(t); if (!v) return;
      const { error } = await supa.from('stores').update(v).eq('id', t.id); if (error) return toastErr(error); loadStores();
    });
    on(el, 'click', '[data-stog]', async (e, b) => {
      const { error } = await supa.from('stores').update({ active: b.dataset.v === '1' }).eq('id', +b.dataset.stog); if (error) return toastErr(error); loadStores();
    });
    loadStores();
    telegramUI(el.querySelector('#tg'));
  }
};

// ---------- notifikasi Telegram (owner) ----------
// Bot milik pembuat aplikasi (diatur super admin). Owner cukup menekan Hubungkan lalu Start di Telegram.
const TG_CATS = [['tagihan', 'Tagihan aplikasi', 'tagihan baru, pengingat jatuh tempo, pembayaran diterima', true], ['masalah', 'Masalah & kecurangan', 'barang hilang, kirim tanpa packing, harga janggal, dll.'], ['tugas', 'Tugas', 'daftar ambil, barang WIN datang, upload, dll. (bisa ramai)'], ['info', 'Info & pengumuman', 'info umum dari sistem']];
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function telegramUI(box) {
  let st;
  try { st = await rpc('tg_status'); } catch (e) { box.innerHTML = `<h2 class="sec-title">${icon('send', 18)} Notifikasi Telegram</h2><div class="alert yellow small">Jalankan <b>supabase/update-2.6.sql</b> dulu. (${esc(e.message)})</div>`; return; }
  st = st || { prefs: {} };
  const ready = st.token_set && st.bot;
  // kode sambung disiapkan dulu supaya tombol berupa link biasa (tidak diblokir browser / langsung membuka aplikasi Telegram)
  let link = null;
  if (ready) link = await rpc('tg_link_start', { p_app_url: location.origin + location.pathname }).catch(() => null);
  box.innerHTML = `<h2 class="sec-title">${icon('send', 18)} Notifikasi Telegram</h2>
    <div class="small muted">Notifikasi penting dikirim juga ke Telegram owner (pribadi atau grup), selain lonceng & notifikasi HP.</div>
    ${!ready ? '<div class="alert yellow small">Bot Telegram belum disiapkan oleh pembuat aplikasi. Hubungi pembuat aplikasi.</div>' : `
    <div class="tg-status ${st.chat_id ? 'on' : ''}">${icon(st.chat_id ? 'check' : 'send', 18)}<div class="grow"><b>${st.chat_id ? 'Terhubung' : 'Belum terhubung'}</b><div class="small">${st.chat_id ? esc(st.chat_name || 'Chat ID ' + st.chat_id) + ' · lewat bot @' + esc(st.bot) : 'Tekan tombol di bawah, lalu tekan <b>Start / Mulai</b> di Telegram.'}</div></div></div>
    ${link ? `<div class="row wrap"><a class="btn btn-primary" target="_blank" rel="noopener" href="https://t.me/${esc(link.bot)}?start=${esc(link.code)}" data-tglink="start">${icon('send', 16)} ${st.chat_id ? 'Hubungkan ulang (pribadi)' : 'Hubungkan ke Telegram saya'}</a><a class="btn" target="_blank" rel="noopener" href="https://t.me/${esc(link.bot)}?startgroup=${esc(link.code)}" data-tglink="startgroup">${icon('users', 16)} Hubungkan ke grup</a></div>` : ''}
    <div class="small" id="tg-link-st"></div>
    <div class="small" style="font-weight:600">Kirim kategori:</div>
    <div class="grid g2">${TG_CATS.map(([k, l, d, must]) => `<label class="check" style="align-items:flex-start"><input type="checkbox" data-tgc="${k}" ${must || st.prefs?.[k] ? 'checked' : ''} ${must ? 'disabled' : ''}><span><b>${l}</b>${must ? ' <span class="tag">wajib</span>' : ''}<div class="xs muted">${d}</div></span></label>`).join('')}</div>
    <details><summary class="small" style="cursor:pointer">Isi chat ID manual</summary>
      <label class="field" style="margin-top:8px">Chat ID (pribadi / grup)<input class="input mono" id="tg-chat" value="${esc(st.chat_id || '')}" placeholder="mis. 123456789 atau -100…"></label></details>
    ${st.net === false ? '<div class="alert yellow small">Pengiriman dari server (pg_net) belum aktif. Aktifkan di Supabase › Database › Extensions › pg_net.</div>' : ''}
    <div class="row wrap between"><span class="small" id="tg-res"></span><div class="row wrap">${st.chat_id ? '<button class="btn btn-ghost btn-sm" id="tg-del" style="color:var(--red)">Putuskan</button><button class="btn" id="tg-test">Kirim tes</button>' : ''}<button class="btn btn-dark" id="tg-save">Simpan</button></div></div>`}`;
  if (!ready) return;
  const prefs = () => Object.fromEntries(TG_CATS.map(([k]) => [k, box.querySelector(`[data-tgc="${k}"]`).checked]));
  const appUrl = location.origin + location.pathname;
  box.querySelector('#tg-save').onclick = async (e) => {
    e.target.disabled = true;
    try { await rpc('tg_save', { p_chat: box.querySelector('#tg-chat').value.trim(), p_prefs: prefs(), p_app_url: appUrl }); toast('Pengaturan Telegram tersimpan', 'ok'); telegramUI(box); } catch (err) { toastErr(err); } finally { e.target.disabled = false; }
  };
  box.querySelector('#tg-del')?.addEventListener('click', async () => {
    if (!(await confirmBox('Putuskan Telegram?', 'Notifikasi (termasuk tagihan) berhenti dikirim ke Telegram.', 'Putuskan', true))) return;
    try { await rpc('tg_save', { p_chat: '', p_prefs: prefs() }); telegramUI(box); } catch (err) { toastErr(err); }
  });
  // Hubungkan: buka bot dengan kode, lalu cek berkala sampai pesan /start <kode> diterima
  let polling = false;
  box.querySelectorAll('[data-tglink]').forEach((b) => b.addEventListener('click', async () => {
    const out = box.querySelector('#tg-link-st');
    if (polling) return; polling = true;
    try {
      out.className = 'small muted';
      out.innerHTML = b.dataset.tglink === 'startgroup'
        ? 'Telegram terbuka: pilih grupnya, tambahkan bot, lalu kembali ke sini. Menunggu…'
        : 'Telegram terbuka: tekan <b>Start / Mulai</b>, lalu kembali ke sini. Menunggu…';
      for (let i = 0; i < 40; i++) {
        await wait(i < 3 ? 4000 : 3000);
        if (!box.isConnected) return;
        const id = await rpc('tg_link_poll');
        let r = { done: false };
        for (let k = 0; k < 5 && !r.done; k++) { await wait(900); r = await rpc('tg_link_result', { p_id: id }); }
        if (r.linked) { toast('Telegram terhubung: ' + (r.chat_name || r.chat_id), 'ok'); await rpc('tg_save', { p_chat: r.chat_id, p_prefs: prefs(), p_app_url: appUrl }).catch(() => {}); telegramUI(box); return; }
        if (r.error) { out.className = 'small neg'; out.textContent = 'Gagal: ' + r.error; if (/kedaluwarsa/.test(r.error)) telegramUI(box); return; }
      }
      out.className = 'small neg'; out.textContent = 'Belum ada balasan dari Telegram. Pastikan sudah menekan Start, lalu tekan Hubungkan lagi.';
    } catch (err) { toastErr(err); } finally { polling = false; }
  }));
  box.querySelector('#tg-test')?.addEventListener('click', async (e) => {
    const res = box.querySelector('#tg-res');
    e.target.disabled = true; res.textContent = 'Mengirim…'; res.className = 'small muted';
    try {
      const id = await rpc('tg_test');
      let r = { done: false };
      for (let i = 0; i < 6 && !r.done; i++) { await wait(1200); r = await rpc('tg_result', { p_id: id }); }
      if (!r.done) { res.textContent = 'Terkirim ke server. Cek Telegram dalam beberapa detik.'; return; }
      let tg = {}; try { tg = JSON.parse(r.content || '{}'); } catch (_) {}
      if (r.status === 200 && tg.ok) { res.textContent = '✓ Berhasil. Cek Telegram.'; res.className = 'small pos'; return; }
      const d = String(tg.description || r.error || 'status ' + r.status);
      res.className = 'small neg';
      res.textContent = /chat not found/i.test(d) ? 'Gagal: chat tidak ditemukan. Tekan Hubungkan lagi.' : /blocked|kicked/i.test(d) ? 'Gagal: bot diblokir / dikeluarkan dari grup. Hubungkan lagi.' : 'Gagal: ' + d;
    } catch (err) { res.textContent = ''; toastErr(err); } finally { e.target.disabled = false; }
  });
}
