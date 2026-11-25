// Aventra Leads · Klik tombol WA
import { api } from '../api.js';
import { esc, num, pct, waktu, range, ymdLocal, $, $$ } from '../ui.js';
import { openLeadModal } from './leads.js';

let only = 'semua';
let sel = { c: '', a: '', d: '' };

export async function render(el, ctx) {
  const { state } = ctx;
  const { from, to } = range(state.period);
  const tid = state.tenant.id;
  const [allClicks, leads, ins] = await Promise.all([
    api.clicks(tid, from, to), api.leads(tid, from, new Date(Date.parse(to) + 864e5).toISOString()),
    api.insights(tid, ymdLocal(new Date(Date.parse(from) - 60 * 864e5)), ymdLocal(new Date(Date.parse(to) - 1))).catch(() => []),
  ]);
  const linked = new Set(leads.map((l) => l.click_id).filter(Boolean));
  const waLabel = Object.fromEntries(state.wa.map((w) => [w.id, w.label]));

  // nama campaign / ad set / iklan dari data Meta (ad_id → induknya)
  const meta = {};
  ins.forEach((r) => { meta[r.ad_id] = { c: r.campaign_id || r.campaign_name, cn: r.campaign_name, a: r.adset_id || r.adset_name, an: r.adset_name, dn: r.ad_name }; });
  const info = (c) => {
    const m = meta[c.ad_id];
    if (m) return { c: m.c, cn: m.cn, a: m.a, an: m.an, d: c.ad_id, dn: m.dn || c.ad_name };
    const cn = c.campaign_name || c.utm_campaign || '';
    const dn = c.ad_name || c.utm_content || '';
    return { c: cn ? 'n:' + cn : '-', cn: cn || '(tanpa campaign)', a: '-', an: '(ad set tidak diketahui)', d: c.ad_id || (dn ? 'n:' + dn : '-'), dn: dn || '(tanpa iklan)' };
  };
  allClicks.forEach((c) => { c._m = info(c); });
  const camps = {}, sets = {}, ads = {};
  allClicks.forEach(({ _m: m }) => { camps[m.c] = m.cn; sets[m.a] = { name: m.an, c: m.c }; ads[m.d] = { name: m.dn, a: m.a, c: m.c }; });
  if (sel.c && !camps[sel.c]) sel = { c: '', a: '', d: '' };
  const pass = (m) => (!sel.c || m.c === sel.c) && (!sel.a || m.a === sel.a) && (!sel.d || m.d === sel.d);
  const clicks = allClicks.filter((c) => pass(c._m));
  const belum = clicks.filter((c) => !linked.has(c.id));
  const withFbc = clicks.filter((c) => c.fbc).length;
  const opt = (obj, cur, all, keep = () => true) => `<option value="">${all}</option>` +
    Object.entries(obj).filter(([k, v]) => keep(k, v)).sort((x, y) => String(x[1].name ?? x[1]).localeCompare(String(y[1].name ?? y[1])))
      .map(([k, v]) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(v.name ?? v)}</option>`).join('');

  el.innerHTML = `
  <div class="filters" id="filters">
    <select data-f="c">${opt(camps, sel.c, 'Semua campaign')}</select>
    <select data-f="a">${opt(sets, sel.a, 'Semua ad set', (k, v) => !sel.c || v.c === sel.c)}</select>
    <select data-f="d">${opt(ads, sel.d, 'Semua iklan', (k, v) => (!sel.c || v.c === sel.c) && (!sel.a || v.a === sel.a))}</select>
  </div>
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
        <td data-l="Iklan" class="ad">${esc(c._m.dn)}<small class="muted block">${esc(c._m.cn)}${c._m.a !== '-' ? ' › ' + esc(c._m.an) : ''}</small></td>
        <td data-l="Jejak iklan">${c.fbc ? '<span class="badge ok">fbc</span>' : (c.ad_id || c.ad_name || c.utm_source) ? '<span class="badge warn" title="Dari iklan, tapi tanpa fbclid. Contact tetap terkirim, pencocokan Meta lebih lemah.">iklan, tanpa fbclid</span>' : '<span class="badge">organik</span>'}</td>
        <td data-l="Contact">${c.contact_sent ? '<span class="badge ok">Terkirim</span>' : '<span class="badge bad">Belum</span>'}</td>
        <td data-l="Status">${ok ? '<span class="badge ok">Sudah chat</span>' : '<span class="badge warn">Belum</span>'}</td>
        <td class="act">${ok ? '' : '<button class="btn sm" data-a="link">Hubungkan</button>'}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Belum ada klik di periode ini</td></tr>';
  };
  draw();

  $('#filters', el).onchange = (e) => {
    const s = e.target.closest('select'); if (!s) return;
    sel[s.dataset.f] = s.value;
    if (s.dataset.f === 'c') { sel.a = ''; sel.d = ''; }
    if (s.dataset.f === 'a') sel.d = '';
    render(el, ctx);
  };
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
