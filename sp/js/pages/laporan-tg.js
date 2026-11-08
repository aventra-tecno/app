import { supa, rpc } from '../supa.js';
import { esc, icon, toast, toastErr, pageHead, skeleton } from '../ui.js';

// Laporan Telegram otomatis: rekap harian / mingguan / bulanan dikirim ke Telegram owner.
const tgHtml = (t) => esc(t || '').replace(/&lt;(\/?)(b|i)&gt;/g, '<$1$2>').replace(/\n/g, '<br>');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  tour: [
    { sel: '#jad', title: 'Jadwal', body: 'Pilih laporan yang dikirim dan jamnya. Mingguan dikirim hari Senin, bulanan tanggal 1.' },
    { sel: '#pv', title: 'Contoh laporan', body: 'Seperti inilah pesan yang masuk ke Telegram. Tekan "Kirim sekarang" untuk mencoba.' }
  ],
  async render(el) {
    el.innerHTML = `${pageHead('Laporan Telegram otomatis', 'Ringkasan penjualan & laba dikirim otomatis ke Telegram, tanpa perlu membuka aplikasi.')}<div class="stack" id="b">${skeleton(2)}</div>`;
    const [st, cfg] = await Promise.all([rpc('tg_status').catch(() => null), supa.from('telegram_config').select('rep_daily, rep_weekly, rep_monthly, rep_hour, rep_last').eq('id', 1).maybeSingle()]);
    const c = cfg.data || {};
    const linked = !!st?.chat_id;
    el.querySelector('#b').innerHTML = `
      ${linked ? `<div class="alert green small">${icon('check', 16)} Terhubung ke Telegram <b>${esc(st.chat_name || st.chat_id)}</b>.</div>`
        : `<div class="alert yellow small">Telegram belum terhubung. Hubungkan dulu di <a href="#/pengaturan">Pengaturan › Notifikasi Telegram</a>.</div>`}
      ${c.rep_hour == null ? '<div class="alert yellow small">Jalankan <b>supabase/update-2.13.sql</b> dulu.</div>' : ''}
      <section class="card stack" id="jad"><h2 class="sec-title">${icon('calendar', 18)} Jadwal kirim</h2>
        <label class="check"><input type="checkbox" id="r-d" ${c.rep_daily ? 'checked' : ''}> <span><b>Harian</b> — rekap hari itu</span></label>
        <label class="check"><input type="checkbox" id="r-w" ${c.rep_weekly ? 'checked' : ''}> <span><b>Mingguan</b> — setiap Senin, rekap 7 hari sebelumnya</span></label>
        <label class="check"><input type="checkbox" id="r-m" ${c.rep_monthly ? 'checked' : ''}> <span><b>Bulanan</b> — setiap tanggal 1, rekap bulan lalu</span></label>
        <label class="field" style="max-width:220px">Jam kirim (WIB)<select class="input" id="r-h">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${+c.rep_hour === h ? 'selected' : ''}>${String(h).padStart(2, '0')}.00</option>`).join('')}</select></label>
        <div class="xs muted">Laporan dikirim sekitar menit ke-2 pada jam yang dipilih (butuh pg_cron aktif di Supabase › Database › Extensions).${c.rep_last?.harian ? ' Terakhir terkirim: harian ' + esc(c.rep_last.harian) + '.' : ''}</div>
        <div><button class="btn btn-primary" id="sv">Simpan jadwal</button></div></section>
      <section class="card stack" id="pv"><div class="row between wrap"><h2 class="sec-title">${icon('send', 18)} Contoh laporan</h2>
        <div class="chips" id="pk"><button class="chip on" data-k="harian">Harian</button><button class="chip" data-k="mingguan">Mingguan</button><button class="chip" data-k="bulanan">Bulanan</button></div></div>
        <div class="tg-bubble" id="pvt">${skeleton(1)}</div>
        <div><button class="btn" id="now" ${linked ? '' : 'disabled'}>${icon('send', 16)} Kirim sekarang ke Telegram</button></div></section>`;
    let kind = 'harian';
    const preview = async () => { try { el.querySelector('#pvt').innerHTML = tgHtml(await rpc('tg_report_preview', { p_kind: kind })); } catch (e) { el.querySelector('#pvt').innerHTML = `<span class="small">${esc(e.message || e)}</span>`; } };
    el.querySelector('#pk').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; el.querySelectorAll('#pk .chip').forEach((x) => x.classList.toggle('on', x === b)); preview(); });
    el.querySelector('#sv').onclick = async (e) => {
      e.target.disabled = true;
      try { await rpc('tg_report_save', { p: { rep_daily: el.querySelector('#r-d').checked, rep_weekly: el.querySelector('#r-w').checked, rep_monthly: el.querySelector('#r-m').checked, rep_hour: +el.querySelector('#r-h').value } }); toast('Jadwal tersimpan', 'ok'); } catch (err) { toastErr(err); }
      e.target.disabled = false;
    };
    el.querySelector('#now').onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; const old = b.innerHTML; b.textContent = 'Mengirim…';
      try {
        const id = await rpc('tg_report_now', { p_kind: kind });
        let r = { done: false };
        for (let i = 0; i < 6 && !r.done; i++) { await wait(1200); r = await rpc('tg_result', { p_id: id }); }
        if (!r.done) toast('Sedang dikirim. Cek Telegram sebentar lagi.');
        else if (r.status === 200) toast('Terkirim ke Telegram ✓', 'ok');
        else toast('Gagal kirim: ' + (r.error || r.content || r.status), 'err');
      } catch (err) { toastErr(err); }
      b.disabled = false; b.innerHTML = old;
    };
    preview();
  }
};
