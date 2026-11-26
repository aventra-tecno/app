// Aventra Leads · Klik tombol WA (v1.15.0: nama & HP pelanggan, filter nomor WA & status, 20 data per halaman)
import { api } from '../api.js';
import { esc, num, pct, waktu, range, ymdLocal, icon, klikUnik, potong, pagerHtml, bindPager, petaIklan, opsiIklan, lolosIklan, $ } from '../ui.js';
import { openLeadModal } from './leads.js';

let status = '', nomor = '', cari = '', hal = 1;
let sel = { c: '', a: '', d: '' };
const STATUS = { belum: 'Belum jadi chat', chat: 'Sudah chat', closing: 'Closing' };

export async function render(el, ctx) {
  const { state } = ctx;
  const { from, to } = range(state.period);
  const tid = state.tenant.id;
  const [allClicks, leads, ins] = await Promise.all([
    api.clicks(tid, from, to), api.leads(tid, from, new Date(Date.parse(to) + 864e5).toISOString()),
    api.insights(tid, ymdLocal(new Date(Date.parse(from) - 60 * 864e5)), ymdLocal(new Date(Date.parse(to) - 1))).catch(() => []),
  ]);
  const leadOf = Object.fromEntries(leads.filter((l) => l.click_id).map((l) => [l.click_id, l]));
  const waLabel = Object.fromEntries(state.wa.map((w) => [w.id, w.label]));
  const iklan = petaIklan(ins);
  allClicks.forEach((c) => { c._m = iklan(c); c._l = leadOf[c.id] || null; c._s = !c._l ? 'belum' : c._l.paid_at ? 'closing' : 'chat'; });

  const ops = opsiIklan(allClicks.map((c) => c._m), sel);
  if (!ops.ada(sel)) sel = { c: '', a: '', d: '' };
  const clicks = allClicks.filter((c) => lolosIklan(c._m, sel) && (!nomor || c.wa_number_id === nomor));
  const belum = clicks.filter((c) => c._s === 'belum');
  const withFbc = clicks.filter((c) => c.fbc).length;
  const unik = klikUnik(clicks, new Set(Object.keys(leadOf))).length;
  const nomorAda = state.wa.filter((w) => allClicks.some((c) => c.wa_number_id === w.id));

  el.innerHTML = `
  <div class="filters lipat" id="filters">
    <div class="search">${icon('search')}<input id="cari" placeholder="Kode, nama, atau nomor HP pelanggan" value="${esc(cari)}"></div>
    <button type="button" class="btn flt-toggle" id="fltBtn">${icon('funnel')}Filter${sel.c || sel.a || sel.d || (typeof nomor !== 'undefined' && nomor) || (typeof status !== 'undefined' && status) || (typeof fSumber !== 'undefined' && fSumber) ? ' •' : ''}</button>
    ${ops.html}
    <select data-f="n"><option value="">Semua nomor WA</option>${nomorAda.map((w) => `<option value="${w.id}" ${nomor === w.id ? 'selected' : ''}>${esc(w.label)} · ${esc(w.phone)}</option>`).join('')}</select>
    <select data-f="s"><option value="">Semua status</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
  </div>
  <div class="kpis three">
    <div class="kpi"><small>Klik tombol WA</small><b>${num(clicks.length)}</b><span>${unik < clicks.length ? `<b>${num(unik)} orang unik</b> (klik berulang ≤30 menit dihitung 1) · ` : ''}${num(withFbc)} membawa jejak iklan</span></div>
    <div class="kpi"><small>Sudah jadi chat</small><b>${num(clicks.length - belum.length)}</b><span>${pct(clicks.length - belum.length, unik)} dari orang unik</span></div>
    <div class="kpi"><small>Belum terhubung</small><b>${num(belum.length)}</b><span>bisa jadi kode dihapus pelanggan</span></div>
  </div>
  <p class="muted small" style="margin:-4px 0 12px">Chat masuk tanpa kode? Cocokkan dengan klik yang waktunya paling dekat, lalu tekan <b>Hubungkan</b>.</p>
  <div class="card flush">
    <table class="tbl">
      <thead><tr><th>Waktu klik</th><th>Kode</th><th>Nama</th><th>No. HP</th><th>Nomor WA</th><th>Iklan</th><th>Jejak iklan</th><th>Contact</th><th>Status</th><th></th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
    <div id="pager"></div>
  </div>`;

  const draw = () => {
    const q = cari.trim().toLowerCase();
    const d = q.replace(/\D/g, '').replace(/^0/, '').replace(/^62/, '');
    const list = clicks.filter((c) => {
      if (status && c._s !== status) return false;
      if (!q) return true;
      return c.kode.toLowerCase().includes(q) || (c._l?.nama || '').toLowerCase().includes(q)
        || (d.length >= 3 && (c._l?.phone || '').replace(/\D/g, '').includes(d));
    });
    const pg = potong(list, hal);
    hal = pg.page;
    $('#rows', el).innerHTML = pg.rows.map((c) => {
      const l = c._l;
      const hp = l?.phone ? '0' + String(l.phone).replace(/^62/, '') : '';
      return `<tr data-id="${c.id}">
        <td data-l="Waktu" class="nw">${waktu(c.created_at)}</td>
        <td data-l="Kode"><code>${esc(c.kode)}</code></td>
        <td data-l="Nama">${l?.nama ? `<b>${esc(l.nama)}</b>` : '<span class="muted">-</span>'}</td>
        <td data-l="No. HP" class="nw">${hp ? `<a class="wa-link" href="https://wa.me/${esc(l.phone)}" target="_blank" rel="noopener">${esc(hp)}</a>` : '<span class="muted">-</span>'}</td>
        <td data-l="Nomor WA">${esc(waLabel[c.wa_number_id] || '-')}</td>
        <td data-l="Iklan" class="ad" title="${esc(c._m.cn)}${c._m.a !== '-' ? ' › ' + esc(c._m.an) : ''}">${esc(c._m.dn)}<small class="muted block">${esc(c._m.cn)}</small></td>
        <td data-l="Jejak iklan">${c.fbc ? '<span class="badge ok">fbc</span>' : (c.ad_id || c.ad_name || c.utm_source) ? '<span class="badge warn" title="Dari iklan, tapi tanpa fbclid. Contact tetap terkirim, pencocokan Meta lebih lemah.">iklan, tanpa fbclid</span>' : '<span class="badge">organik</span>'}</td>
        <td data-l="Contact">${c.contact_sent ? '<span class="badge ok">Terkirim</span>' : '<span class="badge bad">Belum</span>'}</td>
        <td data-l="Status">${c._s === 'closing' ? '<span class="tag tE">Closing</span>' : c._s === 'chat' ? '<span class="badge ok">Sudah chat</span>' : '<span class="badge warn">Belum</span>'}</td>
        <td class="act">${l ? '' : '<button class="btn sm" data-a="link">Hubungkan</button>'}</td></tr>`;
    }).join('') || '<tr><td colspan="10" class="empty">Tidak ada klik di periode / filter ini</td></tr>';
    $('#pager', el).innerHTML = pagerHtml(pg);
    bindPager($('#pager', el), (n) => { hal = n; draw(); el.querySelector('.card.flush')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  };
  draw();
  $('#fltBtn', el).onclick = () => $('#filters', el).classList.toggle('buka');

  $('#cari', el).oninput = (e) => { cari = e.target.value; hal = 1; draw(); };
  $('#filters', el).onchange = (e) => {
    const s = e.target.closest('select[data-f]'); if (!s) return;
    hal = 1;
    if (s.dataset.f === 's') { status = s.value; draw(); return; }
    if (s.dataset.f === 'n') { nomor = s.value; render(el, ctx); return; }
    sel[s.dataset.f] = s.value;
    if (s.dataset.f === 'c') { sel.a = ''; sel.d = ''; }
    if (s.dataset.f === 'a') sel.d = '';
    render(el, ctx);
  };
  $('#rows', el).onclick = (e) => {
    const b = e.target.closest('[data-a="link"]'); if (!b) return;
    const c = clicks.find((x) => x.id === b.closest('tr').dataset.id);
    openLeadModal(state, { click: c }, () => ctx.refresh());
  };
}
