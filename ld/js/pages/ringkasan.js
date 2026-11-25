// Aventra Leads · Ringkasan
import { api } from '../api.js';
import { esc, rp, num, pct, range, metaDates, tzBeda, waktu, TAHAP } from '../ui.js';

export async function render(el, { state }) {
  const { from, to } = range(state.period);
  const tid = state.tenant.id;
  const md = metaDates(state.period, state.tenant.ad_tz);
  const [clicks, leads, ins] = await Promise.all([api.clicks(tid, from, to), api.leads(tid, from, to),
    api.insights(tid, md.since, md.until).catch(() => [])]);

  const paid = leads.filter((l) => l.paid_at);
  const omzet = paid.reduce((s, l) => s + (l.nilai || 0), 0);
  const fromLp = leads.filter((l) => l.click_id).length;
  const gagal = paid.filter((l) => !l.purchase_sent_at).length;
  const linked = new Set(leads.map((l) => l.click_id).filter(Boolean));
  const belum = clicks.filter((c) => !linked.has(c.id) && Date.now() - new Date(c.created_at) < 864e5).length;

  const spendKey = `ld_spend_${tid}_${state.period}`;
  const metaSpend = ins.reduce((a, r) => a + Number(r.spend || 0), 0);
  const auto = ins.length > 0; // ada data hasil sinkron Meta di periode ini
  const spend = auto ? metaSpend : Number(localStorage.getItem(spendKey) || 0);
  const t = state.tenant;

  // per iklan
  const clickById = Object.fromEntries(clicks.map((c) => [c.id, c]));
  const adName = (c) => c?.ad_name || c?.utm_content || '(tanpa nama iklan)';
  const per = {};
  const row = (k) => (per[k] ??= { klik: 0, lead: 0, closing: 0, omzet: 0 });
  clicks.forEach((c) => row(adName(c)).klik++);
  leads.forEach((l) => {
    const k = l.click_id ? adName(clickById[l.click_id]) : l.ad_name ? l.ad_name + ' (CTWA)' : '(chat tanpa kode / manual)';
    const r = row(k); r.lead++;
    if (l.paid_at) { r.closing++; r.omzet += l.nilai || 0; }
  });
  const adRows = Object.entries(per).sort((a, b) => b[1].omzet - a[1].omzet || b[1].klik - a[1].klik);

  // per kota
  const waLabel = Object.fromEntries(state.wa.map((w) => [w.id, w.label]));
  const kota = {};
  leads.forEach((l) => {
    const k = waLabel[l.wa_number_id] || '-';
    const r = (kota[k] ??= { lead: 0, closing: 0, omzet: 0 });
    r.lead++; if (l.paid_at) { r.closing++; r.omzet += l.nilai || 0; }
  });

  const tahap = Object.fromEntries(Object.keys(TAHAP).map((k) => [k, leads.filter((l) => l.stage === k).length]));
  const maxT = Math.max(1, ...Object.values(tahap));

  el.innerHTML = `
  <section class="hero">
    <div><small>Omzet dari iklan</small><b>${rp(omzet)}</b><span>${num(paid.length)} closing dari ${num(leads.length)} chat</span></div>
    <div class="hero-spend">
      ${auto
        ? `<div class="spend-auto"><small>Biaya iklan periode ini</small><b>${rp(spend)}</b><span>dari Meta${t.last_sync_at ? ' · sinkron ' + waktu(t.last_sync_at) : ''}${tzBeda(t.ad_tz) ? ` · tanggal Meta ${md.since === md.until ? md.since : md.since + ' s/d ' + md.until} (${esc(t.ad_tz)})` : ''}</span></div>`
        : `<label>Biaya iklan periode ini<input id="spend" data-rp inputmode="numeric" value="${spend ? num(spend) : ''}" placeholder="${t.ad_account_id ? 'belum ada data Meta, isi manual' : 'isi dari Ads Manager'}"></label>`}
      <div class="hero-mini"><span>Biaya per closing<b>${spend && paid.length ? rp(spend / paid.length) : '-'}</b></span>
      <span>ROAS<b>${spend ? (omzet / spend).toFixed(2).replace('.', ',') + 'x' : '-'}</b></span></div>
    </div>
  </section>

  <div class="kpis">
    ${kpi('Klik tombol WA', num(clicks.length), `${pct(fromLp, clicks.length)} jadi chat`)}
    ${kpi('Chat masuk', num(leads.length), `${num(fromLp)} dengan kode promo`)}
    ${kpi('Closing', num(paid.length), `closing rate ${pct(paid.length, leads.length)}`)}
    ${kpi('Rata-rata order', paid.length ? rp(omzet / paid.length) : '-', 'per closing')}
  </div>

  ${gagal || belum ? `<div class="alert-row">
    ${gagal ? `<a class="alert bad" href="#/log">${num(gagal)} Purchase gagal terkirim ke Meta. Cek Log Event.</a>` : ''}
    ${belum ? `<a class="alert warn" href="#/klik">${num(belum)} klik 24 jam terakhir belum terhubung ke chat.</a>` : ''}
  </div>` : ''}

  <div class="grid2">
    <div class="card">
      <h3>Per iklan</h3>
      <table class="tbl">
        <thead><tr><th>Iklan</th><th class="r">Klik</th><th class="r">Chat</th><th class="r">Closing</th><th class="r">Closing rate</th><th class="r">Omzet</th></tr></thead>
        <tbody>${adRows.map(([k, r]) => `<tr>
          <td data-l="Iklan"><b>${esc(k)}</b></td><td class="r" data-l="Klik">${num(r.klik)}</td><td class="r" data-l="Chat">${num(r.lead)}</td>
          <td class="r" data-l="Closing">${num(r.closing)}</td><td class="r" data-l="Closing rate">${pct(r.closing, r.lead)}</td>
          <td class="r" data-l="Omzet">${rp(r.omzet)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Belum ada data</td></tr>'}</tbody>
      </table>
    </div>
    <div class="stack">
      <div class="card">
        <h3>Tahap terakhir chat</h3>
        <div class="bars">${Object.entries(TAHAP).map(([k, v]) => `
          <div class="bar-row"><span class="tag t${k}">${k}</span><span class="bar-lbl">${v}</span>
          <span class="bar"><i style="width:${(tahap[k] / maxT) * 100}%"></i></span><b>${num(tahap[k])}</b></div>`).join('')}
        </div>
      </div>
      <div class="card">
        <h3>Per nomor / kota</h3>
        <table class="tbl compact"><thead><tr><th>Nomor</th><th class="r">Chat</th><th class="r">Closing</th><th class="r">Omzet</th></tr></thead>
        <tbody>${Object.entries(kota).map(([k, r]) => `<tr><td data-l="Nomor"><b>${esc(k)}</b></td><td class="r" data-l="Chat">${num(r.lead)}</td>
          <td class="r" data-l="Closing">${num(r.closing)} <small class="muted">${pct(r.closing, r.lead)}</small></td><td class="r" data-l="Omzet">${rp(r.omzet)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Belum ada data</td></tr>'}</tbody></table>
      </div>
    </div>
  </div>`;

  const sp = el.querySelector('#spend');
  if (sp) sp.onchange = () => {
    const v = Number(sp.value.replace(/\D/g, ''));
    localStorage.setItem(spendKey, String(v || ''));
    render(el, { state });
  };
}

const kpi = (label, val, sub) => `<div class="kpi"><small>${label}</small><b>${val}</b><span>${sub}</span></div>`;
