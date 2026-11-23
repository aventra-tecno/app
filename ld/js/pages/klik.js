// Aventra Leads · Klik tombol WA
import { api } from '../api.js';
import { esc, num, pct, waktu, range, $, $$ } from '../ui.js';
import { openLeadModal } from './leads.js';

let only = 'semua';

export async function render(el, ctx) {
  const { state } = ctx;
  const { from, to } = range(state.period);
  const tid = state.tenant.id;
  const [clicks, leads] = await Promise.all([api.clicks(tid, from, to), api.leads(tid, from, new Date(Date.parse(to) + 864e5).toISOString())]);
  const linked = new Set(leads.map((l) => l.click_id).filter(Boolean));
  const waLabel = Object.fromEntries(state.wa.map((w) => [w.id, w.label]));
  const belum = clicks.filter((c) => !linked.has(c.id));
  const withFbc = clicks.filter((c) => c.fbc).length;

  el.innerHTML = `
  <div class="kpis three">
    <div class="kpi"><small>Klik tombol WA</small><b>${num(clicks.length)}</b><span>${num(withFbc)} membawa jejak iklan (fbc)</span></div>
    <div class="kpi"><small>Sudah jadi chat</small><b>${num(clicks.length - belum.length)}</b><span>${pct(clicks.length - belum.length, clicks.length)} dari klik</span></div>
    <div class="kpi"><small>Belum terhubung</small><b>${num(belum.length)}</b><span>bisa jadi kode dihapus pelanggan</span></div>
  </div>
  <div class="toolbar">
    <div class="chips">
      <button class="chip ${only === 'semua' ? 'on' : ''}" data-c="semua">Semua<b>${num(clicks.length)}</b></button>
      <button class="chip ${only === 'belum' ? 'on' : ''}" data-c="belum">Belum jadi chat<b>${num(belum.length)}</b></button>
    </div>
    <p class="muted small grow">Chat masuk tanpa kode? Cocokkan dengan klik yang waktunya paling dekat, lalu tekan <b>Hubungkan</b>.</p>
  </div>
  <div class="card flush">
    <table class="tbl">
      <thead><tr><th>Waktu klik</th><th>Kode</th><th>Nomor</th><th>Iklan</th><th>Jejak iklan</th><th>Contact ke Meta</th><th>Status</th><th></th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>`;

  const draw = () => {
    const list = only === 'belum' ? belum : clicks;
    $('#rows', el).innerHTML = list.map((c) => {
      const ok = linked.has(c.id);
      return `<tr data-id="${c.id}">
        <td data-l="Waktu" class="nw">${waktu(c.created_at)}</td>
        <td data-l="Kode"><code>${esc(c.kode)}</code></td>
        <td data-l="Nomor">${esc(waLabel[c.wa_number_id] || '-')}</td>
        <td data-l="Iklan" class="ad">${esc(c.ad_name || c.utm_content || '-')}</td>
        <td data-l="Jejak iklan">${c.fbc ? '<span class="badge ok">fbc</span>' : '<span class="badge">organik</span>'}</td>
        <td data-l="Contact">${c.contact_sent ? '<span class="badge ok">Terkirim</span>' : '<span class="badge bad">Belum</span>'}</td>
        <td data-l="Status">${ok ? '<span class="badge ok">Sudah chat</span>' : '<span class="badge warn">Belum</span>'}</td>
        <td class="act">${ok ? '' : '<button class="btn sm" data-a="link">Hubungkan</button>'}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Belum ada klik di periode ini</td></tr>';
  };
  draw();

  $('.chips', el).onclick = (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    only = b.dataset.c; $$('.chips .chip', el).forEach((x) => x.classList.toggle('on', x === b)); draw();
  };
  $('#rows', el).onclick = (e) => {
    const b = e.target.closest('[data-a="link"]'); if (!b) return;
    const c = clicks.find((x) => x.id === b.closest('tr').dataset.id);
    openLeadModal(state, { click: c }, () => ctx.refresh());
  };
}
