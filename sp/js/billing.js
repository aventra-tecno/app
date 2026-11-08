import { supa } from './supa.js';
import { esc, rp, fmtDate, todayStr } from './ui.js';

// Tagihan aplikasi (dibayar owner lewat Mayar). Dipakai menu Tagihan, super admin, dan bar pengingat.
export const BILL_STATUS = { belum: ['Belum dibayar', 'red'], menunggu: ['Menunggu pembayaran', 'yellow'], lunas: ['Lunas', 'green'], batal: ['Dibatalkan', ''] };
export const billTag = (b) => {
  const overdue = ['belum', 'menunggu'].includes(b.status) && b.due_date < todayStr();
  const [l, c] = overdue ? ['Terlambat', 'red'] : BILL_STATUS[b.status] || [b.status, ''];
  return `<span class="tag ${c}">${esc(l)}</span>`;
};

// panggil Edge Function "tagihan" (pesan error dari server ikut ditampilkan)
export async function callTagihan(body) {
  const { data, error } = await supa.functions.invoke('tagihan', { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (_) {}
    if (/Failed to send|not found|404/i.test(msg)) msg = 'Server pembayaran belum dipasang (Edge Function "tagihan"). Hubungi pembuat aplikasi.';
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// alamat kembali setelah bayar di Mayar -> langsung dicek otomatis
export const returnUrl = (id) => location.origin + location.pathname + '#/tagihan?cek=' + id;

export const billRow = (b, actions = '') => `<div class="list-item bill-item ${['belum', 'menunggu'].includes(b.status) ? 'open' : ''}">
  <div class="grow" style="min-width:0"><div class="row wrap" style="gap:6px">${billTag(b)}<span class="tag">${b.kind === 'bulanan' ? 'Bulanan' : b.module_code ? 'Menu tambahan' : 'Khusus'}</span></div>
    <b style="display:block;margin-top:6px">${esc(b.title)}</b>
    ${b.description ? `<div class="small muted" style="white-space:pre-line">${esc(b.description)}</div>` : ''}
    <div class="xs muted" style="margin-top:4px">Jatuh tempo ${fmtDate(b.due_date)}${b.paid_at ? ' · dibayar ' + fmtDate(b.paid_at) + (b.paid_note ? ' (' + esc(b.paid_note) + ')' : '') : ''}</div></div>
  <div class="right stack" style="gap:6px;flex:none"><b style="font-size:18px">${rp(b.amount)}</b>${actions}</div></div>`;
