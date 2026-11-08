import { supa } from '../supa.js';
import { store } from '../store.js';
import { esc, on, toast, toastErr, pageHead, icon } from '../ui.js';
import { PAGES, canOpen } from '../nav.js';

export default {
  async render(el) {
    const p = store.profile;
    const pagesWithTour = [];
    for (const key of Object.keys(PAGES)) {
      if (!canOpen(key, store.role) || ['panduan', 'akun', 'notifikasi'].includes(key)) continue;
      pagesWithTour.push(key);
    }
    const done = p.tour_done || {};
    const st = (s) => (s === 'selesai' ? '<span class="tag green">Selesai</span>' : s === 'dilewati' ? '<span class="tag">Dilewati</span>' : '<span class="tag yellow">Belum</span>');
    el.innerHTML = `${pageHead('Panduan aplikasi', 'Pengenalan menu & fitur. Bisa diputar ulang kapan saja.')}
      <div class="stack">
        <div class="card flush"><div class="list">
          <div class="list-item"><div class="grow"><b>Tampilkan panduan saat login</b><div class="xs muted">Muncul lagi di login berikutnya kalau belum selesai</div></div><label class="switch"><input type="checkbox" id="auto" ${p.tour_auto ? 'checked' : ''} aria-label="Tampilkan panduan saat login"><span></span></label></div>
        </div></div>
        <button class="btn btn-primary btn-lg" id="play">${icon('compass', 20)} Putar ulang panduan lengkap</button>
        <div class="row between"><h2 class="sec-title">Panduan per halaman</h2>${st(done.main)}</div>
        <div class="card flush"><div class="list">${pagesWithTour.map((k) => `<div class="list-item"><span>${icon(PAGES[k].icon, 20)}</span><div class="grow"><b>${esc(PAGES[k].label)}</b></div><a class="btn btn-sm" href="#/${k}" data-page-tour="${k}">Buka & jelaskan</a></div>`).join('')}</div></div>
        <div class="small muted">Di setiap halaman ada tombol <b>?</b> di pojok kanan atas untuk melihat penjelasan halaman itu.</div>
      </div>`;
    el.querySelector('#auto').addEventListener('change', async (e) => {
      const { error } = await supa.from('profiles').update({ tour_auto: e.target.checked, ...(e.target.checked ? { tour_done: {} } : {}) }).eq('id', p.id);
      if (error) return toastErr(error);
      p.tour_auto = e.target.checked; if (e.target.checked) p.tour_done = {};
      toast(e.target.checked ? 'Panduan akan muncul saat login berikutnya' : 'Panduan tidak muncul otomatis', 'ok');
    });
    el.querySelector('#play').onclick = () => window.__startMainTour(false);
    on(el, 'click', '[data-page-tour]', () => setTimeout(() => document.querySelector('[data-help]')?.click(), 900));
  }
};
