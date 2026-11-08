import { supa, rpc } from './supa.js';
import { store } from './store.js';
import { esc, icon, rp, fmtDate, toast, toastErr, todayStr, confirmBox } from './ui.js';
import { callTagihan, returnUrl } from './billing.js';

// Menu & jabatan tambahan yang bisa dikunci. Harga & masa aktif diatur super admin,
// owner membuka dengan bayar lewat Mayar (tagihan otomatis).
export const ROLE_MOD = { keuangan: 'role_keuangan', supervisor: 'role_supervisor', qc: 'role_qc', cs: 'role_cs', marketing: 'role_marketing' };
export const MOD_ICON = {
  kas: 'wallet', laporan: 'chart', kinerja: 'users', saran: 'cart', komplain: 'alert', gudang: 'box', tg_laporan: 'send',
  pajak: 'receipt', katalog: 'tag', absen_lokasi: 'camera', absensi: 'clock', gaji: 'wallet', rekap_absen: 'calendar', integrasi: 'link', role_keuangan: 'wallet', role_supervisor: 'shield', role_qc: 'check', role_cs: 'bell', role_marketing: 'tag'
};

store.modules = {};
let loaded = false;
export async function loadModules() {
  const { data, error } = await supa.from('modules').select('*').order('sort');
  if (error) { loaded = false; store.modules = {}; return {}; }   // database belum update 2.13 -> semua menu tambahan dianggap terkunci
  loaded = true;
  store.modules = Object.fromEntries(data.map((m) => [m.code, m]));
  return store.modules;
}
export const modulesReady = () => loaded;

export function modOn(code) {
  if (!code) return true;
  const m = store.modules[code];
  if (!m) return false;
  const t = todayStr();
  return !!m.forever || (!!m.active_until && m.active_until >= t) || (!!m.free_until && m.free_until >= t);
}
export const modName = (code) => store.modules[code]?.name || code;
export function modStatus(m) {
  if (!m) return ['Belum tersedia', 'red'];
  if (m.forever) return ['Aktif selamanya', 'green'];
  if (m.no_renew && m.active_until && m.active_until >= todayStr()) return ['Tidak lanjut · aktif s/d ' + fmtDate(m.active_until, { day: 'numeric', month: 'short', year: 'numeric' }), 'yellow'];
  if (m.active_until && m.active_until >= todayStr()) return ['Aktif s/d ' + fmtDate(m.active_until, { day: 'numeric', month: 'short', year: 'numeric' }), 'green'];
  if (m.free_until && m.free_until >= todayStr()) return ['Gratis s/d ' + fmtDate(m.free_until, { day: 'numeric', month: 'short', year: 'numeric' }), 'blue'];
  if (m.active_until) return ['Habis ' + fmtDate(m.active_until, { day: 'numeric', month: 'short' }), 'red'];
  return ['Terkunci', ''];
}
export const priceTxt = (m) => (Number(m?.price) > 0 ? rp(m.price) + (m.period === 'bulanan' ? ' / bulan' : ' · sekali bayar') : 'Harga belum diatur');

// owner menekan "Buka sekarang": buat tagihan lalu langsung ke halaman bayar Mayar
export async function buyModule(code, btn) {
  const old = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = 'Membuat tagihan…'; }
  try {
    const id = await rpc('module_buy', { p_code: code });
    if (btn) btn.textContent = 'Membuka pembayaran…';
    try {
      const r = await callTagihan({ action: 'bayar', bill_id: id, return_url: returnUrl(id) });
      location.href = r.link;
      return;
    } catch (e) {
      toast('Tagihan sudah dibuat. ' + (e.message || 'Pembayaran online belum siap') + ' — buka menu Tagihan.', 'err');
      location.hash = '#/tagihan';
    }
  } catch (e) { toastErr(e); }
  if (btn) { btn.disabled = false; btn.innerHTML = old; }
}

// owner memilih "Tidak lanjut": tagihan menu ini dibatalkan & tidak dibuat lagi; menu terkunci setelah masa aktif habis
export async function stopModule(code) {
  const m = store.modules[code]; if (!m) return false;
  const until = m.active_until && m.active_until >= todayStr() ? m.active_until : null;
  const ok = await confirmBox('Tidak lanjut ' + m.name + '?',
    (until ? `Menu ini masih bisa dipakai sampai <b>${esc(fmtDate(until, { day: 'numeric', month: 'long', year: 'numeric' }))}</b>, setelah itu terkunci lagi.` : 'Tagihan menu ini dibatalkan dan menu tetap terkunci.')
    + ' Tagihan perpanjangan tidak dibuat lagi. Data menu tetap aman dan muncul kembali kalau dibuka lagi.', 'Ya, tidak lanjut', true);
  if (!ok) return false;
  try { await rpc('module_stop', { p_code: code }); m.no_renew = true; toast(until ? 'Tidak dilanjutkan. Menu terkunci setelah masa aktif habis.' : 'Tagihan dibatalkan.', 'ok'); return true; }
  catch (e) { toastErr(e); return false; }
}
export async function resumeModule(code) {
  try { await rpc('module_resume', { p_code: code }); if (store.modules[code]) store.modules[code].no_renew = false; toast('Langganan dilanjutkan. Tagihan perpanjangan dibuat otomatis 5 hari sebelum habis.', 'ok'); return true; }
  catch (e) { toastErr(e); return false; }
}

// tampilan halaman yang masih terkunci
export function paywall(el, code, { roleLock = false } = {}) {
  const m = store.modules[code];
  const owner = store.role === 'owner';
  const [st, cls] = modStatus(m);
  const expired = m?.active_until && !modOn(code);
  el.innerHTML = `<div class="paywall">
    <div class="pw-card card">
      <div class="pw-ic">${icon(MOD_ICON[code] || 'lock', 34, 1.9)}<span class="pw-lock">${icon('lock', 16, 2.4)}</span></div>
      <div class="pw-kicker">${roleLock ? 'Jabatan terkunci' : 'Menu tambahan'}</div>
      <h2>${esc(m?.name || 'Menu ini')}</h2>
      ${m?.description ? `<p class="muted">${esc(m.description)}</p>` : ''}
      ${m?.features?.length ? `<ul class="pw-feat">${m.features.map((f) => `<li>${icon('check', 16, 2.6)}<span>${esc(f)}</span></li>`).join('')}</ul>` : ''}
      ${!modulesReady() ? '<div class="alert yellow small">Database belum diperbarui. Jalankan <b>supabase/update-2.13.sql</b> di SQL Editor.</div>' : ''}
      ${owner ? `<div class="pw-price"><b>${esc(priceTxt(m))}</b>${expired ? `<span class="tag red">${esc(st)}</span>` : ''}</div>
        ${Number(m?.price) > 0 ? `<button class="btn btn-primary btn-lg" data-buy="${esc(code)}">${icon('lock', 18)} ${expired ? 'Perpanjang sekarang' : 'Buka sekarang'}</button>
          <div class="xs muted">Bayar lewat QRIS, transfer bank (VA), atau e-wallet. Menu terbuka otomatis setelah pembayaran diterima.</div>`
          : '<div class="small muted">Menu ini belum dijual. Hubungi pembuat aplikasi untuk membukanya.</div>'}`
        : `<div class="alert small">${roleLock ? 'Jabatanmu belum aktif.' : 'Menu ini belum dibuka.'} Minta <b>owner</b> membukanya di menu <b>Menu tambahan</b>.</div>`}
      ${store.superadmin ? `<div class="xs" style="color:#A63A2A">Super admin: buka gratis / atur harga di menu super admin › <b>Menu &amp; harga</b>. Status: ${esc(st)}${cls ? '' : ''}</div>` : ''}
    </div></div>`;
  el.querySelector('[data-buy]')?.addEventListener('click', (e) => buyModule(code, e.currentTarget));
}

// kotak "terkunci" di dalam halaman (untuk bagian halaman yang terkunci, mis. Penggajian di menu Gaji)
export function lockBox(code, note = '') {
  const m = store.modules[code], owner = store.role === 'owner';
  return `<div class="card lock-box"><span class="mod-ic">${icon(MOD_ICON[code] || 'lock', 22, 2)}<span class="pw-lock">${icon('lock', 11, 2.6)}</span></span>
    <div class="grow"><b>${esc(m?.name || 'Menu ini')} terkunci</b><div class="small muted">${esc(note || m?.description || '')}</div>
    ${owner && Number(m?.price) > 0 ? `<button class="btn btn-primary btn-sm" data-lockbuy="${esc(code)}" style="margin-top:8px">${icon('lock', 15)} Buka · ${esc(priceTxt(m))}</button>` : '<div class="xs muted" style="margin-top:6px">Minta owner membuka di Menu tambahan.</div>'}</div></div>`;
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-lockbuy]'); if (b) buyModule(b.dataset.lockbuy, b); });
