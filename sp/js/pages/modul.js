import { store } from '../store.js';
import { PAGES } from '../nav.js';
import { esc, icon, pageHead, on, todayStr, fmtDate } from '../ui.js';
import { loadModules, modOn, modStatus, priceTxt, buyModule, stopModule, resumeModule, MOD_ICON } from '../modules.js';

// Owner: daftar menu & jabatan tambahan, statusnya, dan tombol buka / perpanjang.
const pageOf = (code) => Object.entries(PAGES).find(([, p]) => p.mod === code)?.[0];

export default {
  tour: [{ sel: '#mods', title: 'Menu tambahan', body: 'Menu & jabatan yang bisa dibuka sesuai kebutuhan. Tekan "Buka sekarang", bayar lewat QRIS / transfer / e-wallet, lalu menu langsung aktif.' }],
  async render(el) {
    await loadModules().catch(() => {});
    const all = Object.values(store.modules);
    const card = (m) => {
      const on = modOn(m.code), [st, cls] = modStatus(m), pg = pageOf(m.code);
      return `<div class="mod-card ${on ? 'on' : ''}">
        <div class="mod-top"><span class="mod-ic">${icon(MOD_ICON[m.code] || 'grid', 22, 2)}${on ? '' : `<span class="pw-lock">${icon('lock', 11, 2.6)}</span>`}</span>
          <div class="grow" style="min-width:0"><b>${esc(m.name)}</b><div class="xs"><span class="tag ${cls}">${esc(st)}</span></div></div></div>
        <div class="small muted">${esc(m.description || '')}</div>
        ${m.free_until && m.free_until >= todayStr() && !m.forever ? `<div class="alert blue small" style="padding:6px 10px">Gratis sampai ${esc(fmtDate(m.free_until, { day: 'numeric', month: 'long' }))}. Setelah itu terkunci kalau belum dibayar.</div>` : ''}
        ${m.features?.length ? `<ul class="pw-feat sm">${m.features.slice(0, 4).map((f) => `<li>${icon('check', 14, 2.6)}<span>${esc(f)}</span></li>`).join('')}</ul>` : ''}
        <div class="mod-foot"><span class="mod-price">${esc(priceTxt(m))}</span>
          ${on ? (pg ? `<a class="btn btn-sm" href="#/${pg}">Buka menu</a>` : m.kind === 'jabatan' ? '<a class="btn btn-sm" href="#/pegawai">Atur pegawai</a>' : '')
               + (!m.forever && Number(m.price) > 0 && (m.period === 'bulanan' || !(m.active_until >= todayStr())) ? `<button class="btn btn-sm btn-ghost" data-buy="${esc(m.code)}">${m.no_renew ? 'Lanjutkan lagi' : m.active_until >= todayStr() ? 'Perpanjang' : m.period === 'sekali' ? 'Beli permanen' : 'Langganan'}</button>` : '')
               + (!m.forever && m.period === 'bulanan' && m.active_until >= todayStr() && !m.no_renew ? `<button class="btn btn-sm btn-ghost mod-stop" data-stop="${esc(m.code)}">Tidak lanjut</button>` : '')
             : Number(m.price) > 0 ? `<button class="btn btn-sm btn-primary" data-buy="${esc(m.code)}">${icon('lock', 15)} ${m.active_until ? 'Perpanjang' : 'Buka sekarang'}</button>` : '<span class="xs muted">Hubungi pembuat aplikasi</span>'}
        </div></div>`;
    };
    const menus = all.filter((m) => m.kind === 'menu'), roles = all.filter((m) => m.kind === 'jabatan');
    el.innerHTML = `${pageHead('Menu tambahan', 'Buka menu & jabatan sesuai kebutuhan toko. Pembayaran lewat Mayar (QRIS, transfer bank / VA, e-wallet), menu terbuka otomatis setelah lunas.')}
      <div class="stack" id="mods">
        ${!all.length ? '<div class="alert yellow">Menu ini butuh update database. Jalankan <b>supabase/update-2.13.sql</b> di Supabase › SQL Editor.</div>' : ''}
        ${menus.length ? `<h3 class="sec-h">Menu</h3><div class="mod-grid">${menus.map(card).join('')}</div>` : ''}
        ${roles.length ? `<h3 class="sec-h">Jabatan</h3><div class="mod-grid">${roles.map(card).join('')}</div>` : ''}
        <div class="small muted">Langganan bulanan: tagihan perpanjangan dibuat otomatis 5 hari sebelum masa aktif habis. Tekan <b>Tidak lanjut</b> kalau tidak mau memperpanjang: tagihannya dibatalkan dan menu terkunci lagi setelah masa aktif habis (data tetap aman dan muncul kembali setelah dibuka).</div>
      </div>`;
    on(el, 'click', '[data-buy]', async (e, b) => { if (store.modules[b.dataset.buy]?.no_renew && modOn(b.dataset.buy)) { if (await resumeModule(b.dataset.buy)) this.render(el); return; } buyModule(b.dataset.buy, b); });
    on(el, 'click', '[data-stop]', async (e, b) => { if (await stopModule(b.dataset.stop)) this.render(el); });
  }
};
