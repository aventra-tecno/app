import { rpc } from '../supa.js';
import { esc, icon, toast, toastErr, todayStr, addDays, fmtDate, confirmBox } from '../ui.js';
import { saGuard, modsUI } from './superadmin.js';
import { loadModules } from '../modules.js';

// Super admin › Menu & harga: harga tiap menu tambahan + buka SEMUA menu gratis sampai tanggal tertentu.
export default {
  async render(el) {
    if (!saGuard(el)) return;
    el.innerHTML = `<div class="stack" style="max-width:980px">
      <section class="card stack" id="free"><div class="skeleton" style="height:120px"></div></section>
      <section class="card flush" id="mods"></section></div>`;
    const paintFree = async () => {
      const mods = Object.values(await loadModules());
      const box = el.querySelector('#free');
      if (!mods.length) { box.innerHTML = '<div class="alert yellow small">Jalankan <b>supabase/update-2.13.sql</b> dan <b>update-2.14.sql</b> dulu.</div>'; return; }
      const fr = (k) => mods.filter((m) => (k === 'semua' || m.kind === k)).map((m) => m.free_until).filter((d) => d && d >= todayStr());
      const until = (k) => { const l = fr(k); return l.length === mods.filter((m) => k === 'semua' || m.kind === k).length ? l.sort()[0] : null; };
      const cur = until('semua') || until('menu');
      box.innerHTML = `<h2 class="sec-title">${icon('lock', 18)} Buka semua menu gratis (masa coba)</h2>
        <div class="small muted">Semua menu tambahan terbuka tanpa bayar sampai tanggal yang dipilih — cocok untuk masa coba pelanggan baru atau promo. Setelah lewat tanggal itu, menu yang belum dibayar terkunci lagi otomatis. Masa langganan yang sudah dibayar owner tidak berubah.</div>
        ${cur ? `<div class="alert green small">${icon('check', 15)} Sedang gratis: <b>${until('semua') ? 'semua menu & jabatan' : 'semua menu'}</b> sampai <b>${esc(fmtDate(cur, { day: 'numeric', month: 'long', year: 'numeric' }))}</b>. Owner mendapat pengingat 3 hari sebelum masa gratis habis.</div>` : ''}
        <div class="grid gauto fields-end">
          <label class="field">Berlaku untuk<select class="input" id="fk"><option value="semua">Semua menu &amp; jabatan</option><option value="menu">Menu saja</option><option value="jabatan">Jabatan saja</option></select></label>
          <label class="field">Gratis sampai tanggal<input class="input" type="date" id="fu" min="${todayStr()}" value="${cur || addDays(todayStr(), 14)}"></label>
          <div class="row" style="gap:6px">${[7, 14, 30].map((n) => `<button class="btn btn-sm btn-ghost" data-d="${n}">+${n} hari</button>`).join('')}</div></div>
        <div class="row wrap" style="justify-content:flex-end">${cur ? '<button class="btn btn-ghost" id="fs" style="color:var(--red)">Hentikan masa gratis</button>' : ''}<button class="btn btn-primary" id="fo">${icon('lock', 16)} Buka gratis sampai tanggal ini</button></div>`;
      box.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { box.querySelector('#fu').value = addDays(todayStr(), +b.dataset.d); }));
      box.querySelector('#fo').onclick = async () => {
        const d = box.querySelector('#fu').value, k = box.querySelector('#fk').value;
        if (!d || d < todayStr()) return toast('Pilih tanggal mulai hari ini', 'err');
        try { const n = await rpc('sa_modules_free', { p_kind: k, p_until: d }); toast(`${n} menu / jabatan gratis sampai ${fmtDate(d)}`, 'ok'); paintFree(); modsUI(el.querySelector('#mods')); } catch (e) { toastErr(e); }
      };
      box.querySelector('#fs')?.addEventListener('click', async () => {
        if (!await confirmBox('Hentikan masa gratis?', 'Menu yang belum dibayar owner langsung terkunci lagi.', 'Hentikan', true)) return;
        try { await rpc('sa_modules_free', { p_kind: box.querySelector('#fk').value, p_until: null }); toast('Masa gratis dihentikan', 'ok'); paintFree(); modsUI(el.querySelector('#mods')); } catch (e) { toastErr(e); }
      });
    };
    await paintFree();
    modsUI(el.querySelector('#mods'));
  }
};
