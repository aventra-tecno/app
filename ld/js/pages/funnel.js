// Aventra Leads · Funnel & Target (v1.2.0)
import { api } from '../api.js';
import { esc, rp, num, range, toast, icon, $, $$ } from '../ui.js';

const DEF = { harga: 135000, margin: 45, porsi: 60, ctr: 1.2, lpv: 70, wa: 25, chat: 80, closing: 20, budget: 100000 };
const FIELDS = [
  ['harga', 'Harga rata-rata order', 'Rp'], ['margin', 'Margin kotor sebelum iklan', '%'], ['porsi', 'Porsi laba yang boleh untuk iklan', '%'],
  ['ctr', 'CTR link (klik ÷ impresi)', '%'], ['lpv', 'Landing page view ÷ klik', '%'], ['wa', 'Klik WA ÷ landing page view', '%'],
  ['chat', 'Chat masuk ÷ klik WA', '%'], ['closing', 'Closing ÷ chat', '%'], ['budget', 'Budget iklan per hari', 'Rp'],
];

export function hitung(t) {
  const laba = t.harga * t.margin / 100;
  const cpa = laba * t.porsi / 100;
  const chat = cpa * t.closing / 100;
  const wa = chat * t.chat / 100;
  const lpv = wa * t.wa / 100;
  const cpc = lpv * t.lpv / 100;
  const cpm = cpc * t.ctr / 100 * 1000;
  const closingHari = cpa ? t.budget / cpa : 0;
  return { laba, impas: laba, cpa, chat, wa, lpv, cpc, cpm, closingHari, omzetHari: closingHari * t.harga, labaHari: closingHari * (laba - cpa) };
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const p1 = (v) => (Number.isFinite(v) ? v.toFixed(1).replace('.', ',') + '%' : '-');
const div = (a, b) => (b ? a / b : NaN);
const rpx = (v) => (Number.isFinite(v) ? rp(v) : '-');

export async function render(el, ctx) {
  const { state } = ctx;
  const t = state.tenant;
  const T = { ...DEF, ...(t.target || {}) };
  const { from, to } = range(state.period);
  const dFrom = ymd(new Date(from)), dTo = ymd(new Date(Date.parse(to) - 1));
  const isAdmin = state.role !== 'cs';

  const [ins, clicks, leads] = await Promise.all([
    api.insights(t.id, dFrom, dTo), api.clicks(t.id, from, to),
    api.leads(t.id, from, new Date(Date.parse(to) + 3 * 864e5).toISOString()),
  ]);

  // ---------- angka aktual ----------
  const adClicks = clicks.filter((c) => c.ad_id || c.fbc);
  const ids = new Set(adClicks.map((c) => c.id));
  const adLeads = leads.filter((l) => ids.has(l.click_id));
  const paid = adLeads.filter((l) => l.paid_at);
  const A = {
    S: ins.reduce((s, r) => s + Number(r.spend), 0), I: ins.reduce((s, r) => s + r.impressions, 0),
    K: ins.reduce((s, r) => s + r.link_clicks, 0), L: ins.reduce((s, r) => s + r.lpv, 0), V: ins.reduce((s, r) => s + r.view_content, 0),
    W: adClicks.length, C: adLeads.length, P: paid.length, O: paid.reduce((s, l) => s + (l.nilai || 0), 0),
  };
  const lastSync = ins.reduce((m, r) => (r.synced_at > m ? r.synced_at : m), '');

  el.innerHTML = `
  <div class="grid2 g-top">
    <form class="card" id="calc">
      <div class="card-head flat"><h3>Kalkulator patokan</h3><small class="muted">disimpan per bisnis</small></div>
      <div class="calc-grid">${FIELDS.map(([k, lbl, u]) => `
        <label><span>${lbl}</span><div class="unit"><input name="${k}" inputmode="decimal" value="${String(T[k]).replace('.', ',')}"><b>${u}</b></div></label>`).join('')}
      </div>
      ${isAdmin ? '<button class="btn primary" style="margin-top:12px">Simpan sebagai patokan</button>' : ''}
    </form>
    <div class="card" id="target"></div>
  </div>

  <div class="card" style="margin-top:16px">
    <div class="card-head flat">
      <h3>Funnel aktual · dari klik iklan</h3>
      <div class="btn-row">${lastSync ? `<small class="muted">sinkron Meta: ${new Date(lastSync).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>` : ''}
      ${isAdmin ? `<button class="btn sm" id="sync">${icon('pulse')}Sinkron data Meta</button>` : ''}</div>
    </div>
    ${ins.length ? '' : `<div class="note warn" style="margin-bottom:12px"><div>Belum ada data Meta Ads untuk periode ini. Isi <b>Pengaturan → Meta Ads</b>, lalu tekan <b>Sinkron data Meta</b>. Bagian Meta (impresi sampai landing page view) masih kosong.</div></div>`}
    <div id="funnel"></div>
    <div id="diag"></div>
  </div>

  <div class="card flush" style="margin-top:16px">
    <div class="card-head"><h3>Per iklan vs patokan</h3></div>
    <table class="tbl"><thead><tr><th>Iklan</th><th class="r">Spend</th><th class="r">CTR</th><th class="r">CPC</th><th class="r">Biaya/LPV</th>
      <th class="r">Klik WA</th><th class="r">Chat</th><th class="r">Closing</th><th class="r">CPA</th><th class="r">ROAS</th><th>Status</th></tr></thead>
    <tbody id="perAd"></tbody></table>
  </div>`;

  const read = () => {
    const f = $('#calc', el); const o = {};
    FIELDS.forEach(([k]) => { o[k] = Number(String(f[k].value).replace(/\./g, '').replace(',', '.')) || 0; });
    // harga & budget diketik dengan titik ribuan; persen boleh koma
    o.harga = Number(String(f.harga.value).replace(/\D/g, '')) || 0;
    o.budget = Number(String(f.budget.value).replace(/\D/g, '')) || 0;
    return o;
  };

  const draw = () => {
    const tg = read();
    const H = hitung(tg);
    $('#target', el).innerHTML = `
      <div class="card-head flat"><h3>Patokan untuk Ads Manager</h3></div>
      <div class="targets">
        ${tgt('Laba kotor per order', rp(H.laba), 'sebelum biaya iklan')}
        ${tgt('CPA impas', rp(H.impas), 'di atas ini rugi', 'bad')}
        ${tgt('CPA target', rp(H.cpa), `laba bersih ${rp(H.laba - H.cpa)}/order`, 'ok')}
        ${tgt('Maks biaya per chat', rp(H.chat), `closing ${p1(tg.closing)}`)}
        ${tgt('Maks biaya per klik WA', rp(H.wa), 'kolom Cost per contact')}
        ${tgt('Maks biaya per LPV', rp(H.lpv), 'Cost per landing page view')}
        ${tgt('Maks CPC (link)', rp(H.cpc), 'Cost per link click')}
        ${tgt('Maks CPM', rp(H.cpm), `dengan CTR ${p1(tg.ctr)}`)}
      </div>
      <div class="note ok" style="margin-top:12px"><div>Budget <b>${rp(tg.budget)}/hari</b> pada patokan ini ≈ <b>${H.closingHari.toFixed(1).replace('.', ',')} closing/hari</b>,
        omzet ${rp(H.omzetHari)}, laba bersih setelah iklan ${rp(H.labaHari)}.</div></div>`;
    drawFunnel(tg, H);
    drawPerAd(H);
  };

  const drawFunnel = (tg, H) => {
    const steps = [
      { k: 'Impresi', n: A.I, src: 'Meta' },
      { k: 'Klik link', n: A.K, src: 'Meta', rate: div(A.K, A.I) * 100, tr: tg.ctr, rl: 'CTR', cost: div(A.S, A.K), max: H.cpc, cl: 'CPC' },
      { k: 'Landing page view', n: A.L, src: 'Meta', rate: div(A.L, A.K) * 100, tr: tg.lpv, rl: 'dari klik', cost: div(A.S, A.L), max: H.lpv, cl: 'per LPV' },
      { k: 'ViewContent', n: A.V, src: 'Meta' },
      { k: 'Klik tombol WA', n: A.W, src: 'Aventra', rate: div(A.W, A.L) * 100, tr: tg.wa, rl: 'dari LPV', cost: div(A.S, A.W), max: H.wa, cl: 'per klik WA' },
      { k: 'Chat masuk', n: A.C, src: 'Aventra', rate: div(A.C, A.W) * 100, tr: tg.chat, rl: 'dari klik WA', cost: div(A.S, A.C), max: H.chat, cl: 'per chat' },
      { k: 'Closing', n: A.P, src: 'Aventra', rate: div(A.P, A.C) * 100, tr: tg.closing, rl: 'dari chat', cost: div(A.S, A.P), max: H.cpa, cl: 'CPA' },
    ];
    const top = Math.max(1, ...steps.map((s) => s.n));
    $('#funnel', el).innerHTML = `
      <div class="fn-sum">
        ${sum('Spend', A.S ? rp(A.S) : '-')}${sum('Omzet', rp(A.O))}${sum('ROAS', A.S ? (A.O / A.S).toFixed(2).replace('.', ',') + 'x' : '-')}
        ${sum('CPM', A.I ? rp(A.S / A.I * 1000) : '-')}
      </div>
      <div class="fn">${steps.map((s) => {
        const w = s.n ? Math.max(2, Math.sqrt(s.n / top) * 100) : 0;
        const rOk = Number.isFinite(s.rate) && s.tr != null ? s.rate >= s.tr : null;
        const cOk = Number.isFinite(s.cost) && s.max != null ? s.cost <= s.max : null;
        return `<div class="fn-row">
          <div class="fn-lbl"><b>${s.k}</b><small class="muted">${s.src}</small></div>
          <b class="fn-n">${num(s.n)}</b>
          <div class="fn-bar"><i style="width:${w}%"></i></div>
          <div class="fn-m">${s.rl ? `<span class="badge ${rOk === null ? '' : rOk ? 'ok' : 'bad'}">${s.rl} ${p1(s.rate)} <small>/ ${p1(s.tr)}</small></span>` : ''}</div>
          <div class="fn-m">${s.cl ? `<span class="badge ${cOk === null ? '' : cOk ? 'ok' : 'bad'}">${s.cl} ${rpx(s.cost)} <small>/ ${rp(s.max)}</small></span>` : ''}</div>
        </div>`;
      }).join('')}</div>
      <p class="muted small">Lebar bar memakai skala akar supaya tahap kecil tetap terlihat. Angka di belakang "/" adalah patokan.</p>`;

    // diagnosis: tahap pertama yang di bawah patokan
    const tips = {
      'Klik link': 'CTR di bawah patokan → kreatif/hook kurang menarik. Uji 2–3 kreatif baru dengan hook 3 detik pertama berbeda.',
      'Landing page view': 'Banyak klik tapi halaman tidak terbuka → landing page lambat di HP. Kompres gambar dan kurangi font/script.',
      'Klik tombol WA': 'Halaman terbuka tapi jarang klik WA → penawaran/isi halaman kurang meyakinkan. Perjelas harga, testimoni, tombol WA di atas.',
      'Chat masuk': 'Klik WA tapi tidak jadi chat → pesan otomatis terlalu panjang atau pelanggan ragu. Pendekkan template, tonjolkan kode promo.',
      'Closing': 'Chat banyak tapi closing rendah → CS: kecepatan balas, script, follow up, dan jadwal terapis/teknisi.',
    };
    const bad = steps.find((s) => Number.isFinite(s.rate) && s.tr != null && s.rate < s.tr);
    $('#diag', el).innerHTML = A.W + A.I === 0 ? '' : bad
      ? `<div class="note bad"><div><b>Titik bocor terbesar: ${esc(bad.k)}</b><br>${tips[bad.k] || ''}</div></div>`
      : '<div class="note ok"><div><b>Semua tahap memenuhi patokan.</b> Kalau CPA juga di bawah target, iklan siap di-scale 20–30% per 2–3 hari.</div></div>';
  };

  const drawPerAd = (H) => {
    const g = {};
    const row = (id) => (g[id] ??= { name: '', S: 0, I: 0, K: 0, L: 0, W: 0, C: 0, P: 0, O: 0 });
    ins.forEach((r) => { const x = row(r.ad_id); x.name = x.name || r.ad_name; x.S += Number(r.spend); x.I += r.impressions; x.K += r.link_clicks; x.L += r.lpv; });
    const leadByClick = Object.fromEntries(adLeads.map((l) => [l.click_id, l]));
    adClicks.forEach((c) => {
      const x = row(c.ad_id || 'tanpa-id'); x.name = x.name || c.ad_name || c.utm_content || '(tanpa ID iklan)'; x.W++;
      const l = leadByClick[c.id]; if (l) { x.C++; if (l.paid_at) { x.P++; x.O += l.nilai || 0; } }
    });
    const list = Object.values(g).sort((a, b) => b.S - a.S || b.W - a.W);
    $('#perAd', el).innerHTML = list.map((x) => {
      const cpa = div(x.S, x.P);
      const st = !x.S ? '<span class="badge">tanpa data Meta</span>'
        : !x.P ? (x.S > H.cpa * 2 ? '<span class="badge bad">Matikan? 2× CPA tanpa closing</span>' : '<span class="badge warn">Belum closing</span>')
        : cpa <= H.cpa ? '<span class="badge ok">Winning</span>' : cpa <= H.impas ? '<span class="badge warn">Di atas target</span>' : '<span class="badge bad">Rugi</span>';
      return `<tr><td data-l="Iklan" class="ad"><b>${esc(x.name)}</b></td>
        <td class="r" data-l="Spend">${x.S ? rp(x.S) : '-'}</td><td class="r" data-l="CTR">${p1(div(x.K, x.I) * 100)}</td>
        <td class="r" data-l="CPC">${rpx(div(x.S, x.K))}</td><td class="r" data-l="Biaya/LPV">${rpx(div(x.S, x.L))}</td>
        <td class="r" data-l="Klik WA">${num(x.W)}</td><td class="r" data-l="Chat">${num(x.C)}</td><td class="r" data-l="Closing">${num(x.P)}</td>
        <td class="r" data-l="CPA">${rpx(cpa)}</td><td class="r" data-l="ROAS">${x.S ? (x.O / x.S).toFixed(2).replace('.', ',') + 'x' : '-'}</td>
        <td data-l="Status">${st}</td></tr>`;
    }).join('') || '<tr><td colspan="11" class="empty">Belum ada data</td></tr>';
  };

  draw();
  $('#calc', el).oninput = draw;
  $('#calc', el).onsubmit = async (e) => {
    e.preventDefault();
    const v = read();
    try { await api.updateTenant(t.id, { target: v }); t.target = v; toast('Patokan tersimpan'); } catch (err) { toast(err.message, 'err'); }
  };
  const sb = $('#sync', el);
  if (sb) sb.onclick = async () => {
    sb.disabled = true; sb.lastChild.textContent = 'Menyinkron…';
    try {
      const r = await api.syncMeta(t.id, dFrom, dTo);
      toast(`Sinkron selesai: ${num(r.baris)} baris, spend ${rp(r.spend)}`);
      ctx.refresh();
    } catch (err) { toast(err.message, 'err'); sb.disabled = false; sb.lastChild.textContent = 'Sinkron data Meta'; }
  };
}

const tgt = (l, v, s, c = '') => `<div class="tg ${c}"><small>${l}</small><b>${v}</b><span>${s}</span></div>`;
const sum = (l, v) => `<div><small>${l}</small><b>${v}</b></div>`;
