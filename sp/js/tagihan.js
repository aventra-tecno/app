import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, rp, fmtDate, toast, toastErr, pageHead, emptyState, skeleton, icon, on, todayStr } from '../ui.js';
import { billRow, callTagihan, returnUrl } from '../billing.js';

// Owner: tagihan aplikasi (bulanan & khusus) + bayar lewat Mayar (QRIS, VA bank, e-wallet).
export default {
  tour: [
    { sel: '#sum', title: 'Ringkasan tagihan', body: 'Total yang belum dibayar dan jatuh tempo terdekat. Tagihan bulanan dibuat otomatis setiap tanggal 1.' },
    { sel: '#open', title: 'Bayar', body: 'Tekan "Bayar sekarang" untuk membuka halaman pembayaran Mayar (QRIS, transfer bank / VA, e-wallet). Setelah bayar, status berubah Lunas otomatis.' }
  ],
  async render(el, { params = {} } = {}) {
    el.innerHTML = `${pageHead('Tagihan')}
      <div class="stack"><div id="sum">${skeleton(1)}</div>
        <section class="card flush" id="open"><div class="card-h"><h2>Perlu dibayar</h2></div><div id="openlist">${skeleton(2)}</div></section>
        <section class="card flush" id="hist"><div class="card-h"><h2>Riwayat</h2></div><div id="histlist"></div></section>
        <div class="small muted">Butuh bantuan pembayaran atau ingin bayar dengan cara lain? Hubungi pembuat aplikasi; pembayaran di luar Mayar dicatat lunas oleh super admin.</div>
      </div>`;

    const load = async () => {
      await rpc('billing_ensure').catch(() => {});
      const { data, error } = await supa.from('bills').select('*').order('due_date', { ascending: true }).order('id');
      if (error) { el.querySelector('#sum').innerHTML = `<div class="alert yellow">Menu ini butuh update database. Jalankan <b>supabase/update-2.5.sql</b>. (${esc(error.message)})</div>`; el.querySelector('#openlist').innerHTML = ''; return; }
      el._bills = data;
      const open = data.filter((b) => ['belum', 'menunggu'].includes(b.status));
      // riwayat: hanya 3 terakhir di sini (riwayat lengkap tetap ada di super admin › Tagihan & Mayar)
      const done = data.filter((b) => !['belum', 'menunggu'].includes(b.status)).sort((a, b) => String(b.paid_at || b.due_date).localeCompare(String(a.paid_at || a.due_date)));
      const last = done.find((b) => b.status === 'lunas');
      const total = open.reduce((a, b) => a + Number(b.amount), 0);
      const late = open.filter((b) => b.due_date < todayStr());
      el.querySelector('#sum').innerHTML = `<div class="grid gauto">
        <div class="card kpi ${open.length ? 'bill-alert' : ''}"><div class="label">Belum dibayar</div><div class="value">${rp(total)}</div><div class="sub">${open.length} tagihan${late.length ? ` · ${late.length} terlambat` : ''}</div></div>
        <div class="card kpi"><div class="label">Jatuh tempo terdekat</div><div class="value" style="font-size:20px">${open.length ? fmtDate(open[0].due_date, { day: 'numeric', month: 'long', year: 'numeric' }) : '–'}</div></div>
        <div class="card kpi"><div class="label">Terakhir dibayar</div><div class="value">${last ? rp(last.amount) : '–'}</div><div class="sub">${last ? `${esc(last.title)}${last.paid_at ? ' · ' + fmtDate(last.paid_at, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}` : 'Belum ada pembayaran'}</div></div></div>`;
      el.querySelector('#open').classList.toggle('bill-alert', open.length > 0);
      el.querySelector('#openlist').innerHTML = open.length ? `<div class="list no-page">${open.map((b) => billRow(b,
        `<button class="btn btn-primary btn-sm" data-pay="${b.id}">${icon('wallet', 16)} Bayar sekarang</button>${b.status === 'menunggu' ? `<button class="btn btn-sm" data-cek="${b.id}">Sudah bayar? Cek</button>` : ''}`)).join('')}</div>`
        : emptyState('Tidak ada tagihan yang perlu dibayar. Terima kasih!', 'check');
      el.querySelector('#histlist').innerHTML = done.length ? `<div class="list no-page">${done.slice(0, 3).map((b) => billRow(b)).join('')}</div>` : emptyState('Belum ada riwayat.', 'receipt');
    };

    on(el, 'click', '[data-pay]', async (e, b) => {
      b.disabled = true; const old = b.innerHTML; b.textContent = 'Membuka pembayaran…';
      try {
        const r = await callTagihan({ action: 'bayar', bill_id: +b.dataset.pay, return_url: returnUrl(b.dataset.pay) });
        location.href = r.link;   // halaman bayar Mayar; setelah bayar kembali ke menu ini & dicek otomatis
      } catch (err) { toastErr(err); b.disabled = false; b.innerHTML = old; }
    });
    const cek = async (id, quiet) => {
      try {
        const r = await callTagihan({ action: 'cek', bill_id: +id });
        if (r.status === 'lunas') {
          toast('Pembayaran diterima. Tagihan lunas ✓', 'ok');
          // tagihan untuk membuka menu tambahan: muat ulang supaya menu langsung terbuka
          if ((el._bills || []).find((b) => String(b.id) === String(id))?.module_code) { setTimeout(() => { location.hash = '#/modul'; location.reload(); }, 1400); return; }
        }
        else if (!quiet) toast('Pembayaran belum diterima. Kalau baru bayar, tunggu 1–2 menit lalu cek lagi.');
      } catch (err) { if (!quiet) toastErr(err); }
      load();
    };
    on(el, 'click', '[data-cek]', (e, b) => cek(b.dataset.cek));
    await load();
    // kembali dari halaman Mayar
    if (params.cek) { toast('Mengecek pembayaran…'); setTimeout(() => cek(params.cek, false), 1500); history.replaceState(null, '', '#/tagihan'); }
    if (store.superadmin) el.querySelector('.stack').insertAdjacentHTML('beforeend', '<div class="alert yellow small">Mode super admin: tagihan diatur di menu super admin › <b>Tagihan &amp; Mayar</b> (tekan "Kembali ke super admin").</div>');
  }
};
