// Aventra Leads · Funnel & Target (v1.3.0)
// Rumus inti:  CPA = CPM ÷ (1000 × CTR × OCLP × Contact × Chat × Purchase)   (iklan ke website)
//              CPA = CPM ÷ (1000 × CTR × Chat × Purchase)                    (iklan CTWA)
import { api } from '../api.js';
import { esc, rp, num, range, toast, icon, $ } from '../ui.js';

// ---------- nilai awal & penjelasan ----------
const DEF = {
  mode: 'web', harga: 135000, margin: 45, porsi: 60, budget: 100000, cpm: 25000,
  ctr: 1.2, oclp: 70, contact: 25, chat: 80, purchase: 25,
  wctr: 1.5, wchat: 60, wpurchase: 15,
};
const BIZ = [
  ['harga', 'Harga rata-rata order', 'Rp', 'Pakai rata-rata nilai closing, bukan harga termurah.'],
  ['margin', 'Margin kotor sebelum iklan', '%', 'Sisa setelah bagi hasil terapis/teknisi, bahan, transport.'],
  ['porsi', 'Porsi laba untuk iklan', '%', '50–70%: sisanya laba bersih. 100% = impas.'],
  ['budget', 'Budget iklan per hari', 'Rp', 'Untuk perkiraan closing & laba per hari.'],
  ['cpm', 'Perkiraan CPM', 'Rp', 'Biaya per 1.000 tayangan. Jasa lokal Indonesia umumnya Rp15–35 rb.'],
];
const STEPS = {
  web: [
    ['ctr', 'CTR link', 'klik link ÷ impresi', '1–2%. Di bawah 0,8% = kreatif/hook tidak menarik.'],
    ['oclp', 'OCLP', 'landing page view ÷ klik link', '60–80%. Di bawah 50% = halaman lambat atau klik nyasar (Audience Network).'],
    ['contact', 'Contact', 'klik tombol WA ÷ landing page view', '15–30%. Halaman 1 tujuan dengan harga jelas bisa 25%+.'],
    ['chat', 'Chat masuk', 'chat tercatat ÷ klik WA', '70–90%. Sisanya batal kirim di WhatsApp.'],
    ['purchase', 'Purchase', 'closing ÷ chat', 'Pijat 20–35%, mesin cuci 15–25%. Tergantung CS.'],
  ],
  ctwa: [
    ['wctr', 'CTR link', 'klik ÷ impresi', '1–2,5%. CTWA biasanya sedikit lebih tinggi dari iklan web.'],
    ['wchat', 'Chat dimulai', 'percakapan dimulai ÷ klik', '50–80%. Sisanya membuka WA tapi tidak mengirim pesan.'],
    ['wpurchase', 'Purchase', 'closing ÷ chat', '10–25%. Lebih rendah dari web karena chat CTWA lebih "iseng".'],
  ],
};

export function hitung(T) {
  const st = STEPS[T.mode];
  const rates = st.map(([k]) => (Number(T[k]) || 0) / 100);
  const laba = T.harga * T.margin / 100;
  const cpaT = laba * T.porsi / 100;
  const perK = 1000 * rates.reduce((a, b) => a * b, 1); // closing per 1.000 tayangan
  const cpaEst = perK ? T.cpm / perK : Infinity;
  // batas biaya per tahap, dihitung mundur dari CPA target
  const max = []; let c = cpaT;
  for (let i = st.length - 1; i >= 0; i--) { c *= rates[i]; max.unshift(c); } // max[i] = biaya maks per "masuk tahap i"
  const need = rates.map((r) => (Number.isFinite(cpaEst) ? r * cpaEst / cpaT : Infinity)); // nilai yang dibutuhkan bila tahap lain tetap
  return { st, rates, laba, cpaT, perK, cpaEst, max, need, cpmMax: max[0] * 1000, closingHari: Number.isFinite(cpaEst) ? T.budget / cpaEst : 0 };
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const p1 = (v) => (Number.isFinite(v) ? (v * 100).toFixed(v < 0.1 ? 2 : 1).replace('.', ',') + '%' : '-');
const div = (a, b) => (b ? a / b : NaN);
const rpx = (v) => (Number.isFinite(v) ? rp(v) : '-');
const fmt = (v, u) => (u === 'Rp' ? String(v) : String(v).replace('.', ','));

let sel = { c: '', a: '', d: '' };

export async function render(el, ctx) {
  const { state } = ctx;
  const t = state.tenant;
  const old = t.target || {};
  const T = { ...DEF, ...old };
  // kompatibel dengan patokan v1.2
  if (old.lpv != null && old.oclp == null) T.oclp = old.lpv;
  if (old.wa != null && old.contact == null) T.contact = old.wa;
  if (old.closing != null && old.purchase == null) T.purchase = old.closing;
  const { from, to } = range(state.period);
  const dFrom = ymd(new Date(from)), dTo = ymd(new Date(Date.parse(to) - 1));
  const isAdmin = state.role !== 'cs';

  const [insAll, clicks, leads] = await Promise.all([
    api.insights(t.id, dFrom, dTo), api.clicks(t.id, from, to),
    api.leads(t.id, from, new Date(Date.parse(to) + 3 * 864e5).toISOString()),
  ]);
  const lastSync = t.last_sync_at || insAll.reduce((m, r) => (r.synced_at > m ? r.synced_at : m), '');
  const syncInfo = String(t.last_sync_info || '');

  el.innerHTML = `
  <div class="grid2 g-top">
    <form class="card" id="calc">
      <div class="card-head flat"><h3>Kalkulator patokan</h3>
        <div class="seg" id="mode"><button type="button" data-m="web">Iklan ke website</button><button type="button" data-m="ctwa">Iklan CTWA</button></div></div>
      <div class="calc-grid" id="bizF"></div>
      <h4 class="sub">Rasio tiap tahap funnel</h4>
      <div class="calc-grid" id="stepF"></div>
      ${isAdmin ? '<button class="btn primary" style="margin-top:12px">Simpan sebagai patokan</button>' : ''}
    </form>
    <div class="card" id="target"></div>
  </div>

  <div class="card" style="margin-top:16px">
    <div class="card-head flat">
      <h3>Funnel aktual</h3>
      <div class="btn-row">${lastSync ? `<small class="${syncInfo.startsWith('GAGAL') ? 'err-text' : 'muted'}" title="${esc(syncInfo)}">sinkron Meta${t.auto_sync !== false ? ' otomatis' : ''}: ${new Date(lastSync).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}${syncInfo.startsWith('GAGAL') ? ' · gagal' : ''}</small>` : ''}
      ${isAdmin ? `<button class="btn sm" id="sync">${icon('pulse')}Sinkron data Meta</button>` : ''}</div>
    </div>
    <div class="filters" id="filters"></div>
    ${insAll.length ? '' : `<div class="note warn" style="margin-bottom:12px"><div>Belum ada data Meta Ads untuk periode ini. Isi <b>Pengaturan → Meta Ads</b>, lalu tekan <b>Sinkron data Meta</b>.</div></div>`}
    <div id="funnel"></div>
    <div id="diag"></div>
  </div>

  <div class="card flush" style="margin-top:16px">
    <div class="card-head"><h3>Per iklan vs patokan</h3></div>
    <table class="tbl"><thead><tr><th>Iklan</th><th class="r">Spend</th><th class="r">CTR</th><th class="r">OCLP</th><th class="r">Contact</th>
      <th class="r">Chat</th><th class="r">Purchase</th><th class="r">CPA</th><th class="r">ROAS</th><th>Status</th></tr></thead>
    <tbody id="perAd"></tbody><tfoot id="perAdTot"></tfoot></table>
  </div>`;

  // ---------------------------------------------------------- kalkulator
  const field = ([k, lbl, u, hint], v) => `<label><span>${lbl}</span><div class="unit"><input name="${k}" inputmode="decimal" value="${fmt(v, u)}"><b>${u}</b></div><small class="hint">${hint}</small></label>`;
  const drawFields = () => {
    $('#bizF', el).innerHTML = BIZ.map((f) => field(f, T[f[0]])).join('');
    $('#stepF', el).innerHTML = STEPS[T.mode].map(([k, lbl, rumus, hint]) => field([k, `${lbl} = ${rumus}`, '%', hint], T[k])).join('');
    el.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === T.mode));
  };
  const read = () => {
    const f = $('#calc', el);
    [...BIZ, ...STEPS[T.mode]].forEach(([k, , u]) => {
      const raw = String(f[k]?.value ?? '');
      T[k] = u === 'Rp' ? Number(raw.replace(/\D/g, '')) || 0 : Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
    });
  };

  const drawTarget = () => {
    const H = hitung(T);
    const st = H.st;
    const ok = H.cpaEst <= H.cpaT;
    const maxLbl = T.mode === 'web'
      ? ['Maks CPC (link)', 'Maks biaya per LPV', 'Maks biaya per klik WA', 'Maks biaya per chat', 'CPA target']
      : ['Maks CPC (link)', 'Maks biaya per chat', 'CPA target'];
    $('#target', el).innerHTML = `
      <div class="card-head flat"><h3>Hasil & patokan Ads Manager</h3></div>
      <div class="targets">
        ${tgt('Laba kotor per order', rp(H.laba), 'sebelum biaya iklan')}
        ${tgt('CPA impas', rp(H.laba), 'di atas ini rugi', 'bad')}
        ${tgt('CPA target', rp(H.cpaT), `laba bersih ${rp(H.laba - H.cpaT)}/order`, 'ok')}
        ${tgt('CPA perkiraan', rpx(H.cpaEst), `${(H.perK).toFixed(2).replace('.', ',')} closing per 1.000 tayangan`, ok ? 'ok' : 'bad')}
      </div>
      <div class="formula">CPA = CPM ÷ (1.000 × ${st.map(([, l]) => l).join(' × ')})<br>
        = ${rp(T.cpm)} ÷ (1.000 × ${H.rates.map((r) => p1(r)).join(' × ')}) = <b>${rpx(H.cpaEst)}</b></div>
      <h4 class="sub">Batas biaya per tahap (dari CPA target)</h4>
      <table class="tbl compact"><tbody>
        <tr><td>Maks CPM</td><td class="r"><b>${rp(H.cpmMax)}</b></td></tr>
        ${[...H.max.slice(1), H.cpaT].map((v, i) => `<tr><td>${maxLbl[i]}</td><td class="r"><b>${rp(v)}</b></td></tr>`).join('')}
      </tbody></table>
      <h4 class="sub">${ok ? 'Sudah di bawah target. Batas aman tiap rasio:' : 'Supaya CPA = target, naikkan SALAH SATU rasio ini menjadi:'}</h4>
      <table class="tbl compact"><tbody>${st.map(([k, l], i) => `<tr><td>${l}</td><td class="r">${p1(H.rates[i])} → <b class="${H.need[i] > 1 ? 'err-text' : ''}">${H.need[i] > 1 ? 'tidak mungkin (>100%)' : p1(H.need[i])}</b></td></tr>`).join('')}</tbody></table>
      <div class="note ${ok ? 'ok' : 'warn'}" style="margin-top:12px"><div>Budget <b>${rp(T.budget)}/hari</b> ≈ <b>${H.closingHari.toFixed(1).replace('.', ',')} closing/hari</b>,
        omzet ${rp(H.closingHari * T.harga)}, laba bersih setelah iklan ${rp(H.closingHari * (H.laba - (Number.isFinite(H.cpaEst) ? H.cpaEst : 0)))}.</div></div>`;
  };

  drawFields(); drawTarget();
  $('#calc', el).oninput = () => { read(); drawTarget(); drawActual(); };
  $('#mode', el).onclick = (e) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    read(); T.mode = b.dataset.m; drawFields(); drawTarget(); drawActual();
  };
  $('#calc', el).onsubmit = async (e) => {
    e.preventDefault(); read();
    try { await api.updateTenant(t.id, { target: { ...T } }); t.target = { ...T }; toast('Patokan tersimpan'); } catch (err) { toast(err.message, 'err'); }
  };

  // ---------------------------------------------------------- filter campaign / ad set / iklan
  const camps = {}, sets = {}, adsMap = {};
  insAll.forEach((r) => {
    const cid = r.campaign_id || r.campaign_name || '-', aid = r.adset_id || r.adset_name || '-';
    camps[cid] = r.campaign_name || cid;
    sets[aid] = { name: r.adset_name || aid, c: cid };
    adsMap[r.ad_id] = { name: r.ad_name || r.ad_id, a: aid, c: cid };
  });
  const opt = (obj, cur, all, keep = () => true) => `<option value="">${all}</option>` +
    Object.entries(obj).filter(([k, v]) => keep(k, v)).sort((x, y) => String(x[1].name ?? x[1]).localeCompare(String(y[1].name ?? y[1])))
      .map(([k, v]) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(v.name ?? v)}</option>`).join('');
  // campaign CTWA: ada chat dimulai, tanpa landing page view
  const agg = {};
  insAll.forEach((r) => { const c = adsMap[r.ad_id].c; const a = (agg[c] ??= { ms: 0, lpv: 0 }); a.ms += r.msg_started || 0; a.lpv += r.lpv || 0; });
  const ctwaCamp = new Set(Object.entries(agg).filter(([, a]) => a.ms > 0 && a.lpv === 0).map(([c]) => c));
  Object.keys(camps).forEach((c) => { if (ctwaCamp.has(c)) camps[c] = camps[c] + ' (CTWA)'; });
  const drawFilters = () => {
    if (sel.c && !camps[sel.c]) sel = { c: '', a: '', d: '' };
    $('#filters', el).innerHTML = `
      <select data-f="c">${opt(camps, sel.c, 'Semua campaign')}</select>
      <select data-f="a">${opt(sets, sel.a, 'Semua ad set', (k, v) => !sel.c || v.c === sel.c)}</select>
      <select data-f="d">${opt(adsMap, sel.d, 'Semua iklan', (k, v) => (!sel.c || v.c === sel.c) && (!sel.a || v.a === sel.a))}</select>`;
  };
  $('#filters', el).onchange = (e) => {
    const s = e.target.closest('select'); if (!s) return;
    sel[s.dataset.f] = s.value;
    if (s.dataset.f === 'c') { sel.a = ''; sel.d = ''; }
    if (s.dataset.f === 'a') sel.d = '';
    drawFilters(); drawActual();
  };
  drawFilters();

  // ---------------------------------------------------------- funnel aktual
  function drawActual() {
    const H = hitung(T);
    const filtered = !!(sel.c || sel.a || sel.d);
    const insSel = insAll.filter((r) => {
      const m = adsMap[r.ad_id];
      return (!sel.c || m.c === sel.c) && (!sel.a || m.a === sel.a) && (!sel.d || r.ad_id === sel.d);
    });
    // Tanpa filter: funnel website saja (campaign CTWA punya alur berbeda, lihat dengan memilih campaign-nya)
    const ins = filtered ? insSel : insSel.filter((r) => !ctwaCamp.has(adsMap[r.ad_id].c));
    const adIds = new Set(ins.map((r) => r.ad_id));
    const adClicks = clicks.filter((c) => (filtered ? c.ad_id && adIds.has(c.ad_id) : c.ad_id || c.fbc));
    const ids = new Set(adClicks.map((c) => c.id));
    const adLeads = leads.filter((l) => ids.has(l.click_id));
    const paid = adLeads.filter((l) => l.paid_at);
    // chat dari iklan CTWA yang dicatat CS di Aventra
    const insIds = new Set(insSel.map((r) => r.ad_id));
    const ctwaLeads = leads.filter((l) => l.sumber === 'ctwa' && l.ad_id && adIds.has(l.ad_id));
    const ctwaPaid = ctwaLeads.filter((l) => l.paid_at);
    const S = (k) => ins.reduce((s, r) => s + Number(r[k] || 0), 0);
    const A = { S: S('spend'), I: S('impressions'), K: S('link_clicks'), L: S('lpv'), V: S('view_content'), MC: S('contact'),
      MS: S('msg_started'), MP: S('purchase'), W: adClicks.length, C: adLeads.length, P: paid.length, O: paid.reduce((s, l) => s + (l.nilai || 0), 0),
      CC: ctwaLeads.length, CP: ctwaPaid.length, CO: ctwaPaid.reduce((s, l) => s + (l.nilai || 0), 0) };
    const isCtwa = A.MS > 0 && A.L === 0 && A.W === 0;
    if (isCtwa) { A.O = A.CO; }
    const PC = Math.max(A.CP, A.MP); // purchase CTWA: dari Aventra, atau label WA bila lebih banyak
    const Tm = { ...T, mode: isCtwa ? 'ctwa' : 'web' };
    const Hm = hitung(Tm);
    const P = isCtwa ? PC : A.P;
    const steps = isCtwa ? [
      { k: 'Impresi', n: A.I, src: 'Meta' },
      { k: 'Klik link', n: A.K, src: 'Meta', l: 'CTR', r: div(A.K, A.I), t: Tm.wctr / 100, cost: div(A.S, A.K), max: Hm.max[1], cl: 'CPC' },
      { k: 'Chat dimulai', n: A.MS, src: 'Meta', l: 'Chat', r: div(A.MS, A.K), t: Tm.wchat / 100, cost: div(A.S, A.MS), max: Hm.max[2], cl: 'per chat' },
      { k: 'Purchase', n: PC, src: `Aventra ${num(A.CP)} · label WA ${num(A.MP)}`, l: 'Purchase', r: div(PC, A.MS), t: Tm.wpurchase / 100, cost: div(A.S, PC), max: Hm.cpaT, cl: 'CPA' },
    ] : [
      { k: 'Impresi', n: A.I, src: 'Meta' },
      { k: 'Klik link', n: A.K, src: 'Meta', l: 'CTR', r: div(A.K, A.I), t: Tm.ctr / 100, cost: div(A.S, A.K), max: Hm.max[1], cl: 'CPC' },
      { k: 'Landing page view', n: A.L, src: 'Meta', l: 'OCLP', r: div(A.L, A.K), t: Tm.oclp / 100, cost: div(A.S, A.L), max: Hm.max[2], cl: 'per LPV' },
      { k: 'Contact (klik WA)', n: A.W, src: `Aventra${A.MC ? ` · Meta ${num(A.MC)}` : ''}`, l: 'Contact', r: div(A.W, A.L), t: Tm.contact / 100, cost: div(A.S, A.W), max: Hm.max[3], cl: 'per klik WA' },
      { k: 'Chat masuk', n: A.C, src: 'Aventra', l: 'Chat', r: div(A.C, A.W), t: Tm.chat / 100, cost: div(A.S, A.C), max: Hm.max[4], cl: 'per chat' },
      { k: 'Purchase', n: A.P, src: 'Aventra', l: 'Purchase', r: div(A.P, A.C), t: Tm.purchase / 100, cost: div(A.S, A.P), max: Hm.cpaT, cl: 'CPA' },
    ];
    const top = Math.max(1, ...steps.map((s) => s.n));
    $('#funnel', el).innerHTML = `
      <div class="fn-sum">
        ${sum('Jenis funnel', isCtwa ? 'CTWA' : 'Website')}${sum('Spend', A.S ? rp(A.S) : '-')}
        ${sum('Purchase', num(P))}${sum('CPA', rpx(div(A.S, P)))}${sum('ROAS', A.S && A.O ? (A.O / A.S).toFixed(2).replace('.', ',') + 'x' : '-')}
        ${sum('CPM', A.I ? rp(A.S / A.I * 1000) : '-')}${sum('Klik → purchase', p1(div(P, A.K)))}
      </div>
      <div class="fn">${steps.map((s) => {
        const w = s.n ? Math.max(2, Math.sqrt(s.n / top) * 100) : 0;
        const rOk = Number.isFinite(s.r) && s.t != null ? s.r >= s.t : null;
        const cOk = Number.isFinite(s.cost) && s.max != null ? s.cost <= s.max : null;
        return `<div class="fn-row">
          <div class="fn-lbl"><b>${s.k}</b><small class="muted">${s.src}</small></div>
          <b class="fn-n">${num(s.n)}</b>
          <div class="fn-bar"><i style="width:${w}%"></i></div>
          <div class="fn-m">${s.l ? `<span class="badge ${rOk === null ? '' : rOk ? 'ok' : 'bad'}">${s.l} ${p1(s.r)} <small>/ ${p1(s.t)}</small></span>` : ''}</div>
          <div class="fn-m">${s.cl ? `<span class="badge ${cOk === null ? '' : cOk ? 'ok' : 'bad'}">${s.cl} ${rpx(s.cost)} <small>/ ${rp(s.max)}</small></span>` : ''}</div>
        </div>`;
      }).join('')}</div>
      ${!filtered && ctwaCamp.size ? `<div class="note warn" style="margin-bottom:8px"><div>${ctwaCamp.size} campaign CTWA tidak dimasukkan ke funnel website ini. Pilih campaign CTWA di filter untuk melihat funnelnya sendiri.</div></div>` : ''}
      <p class="muted small">${isCtwa ? `Funnel CTWA: chat dimulai dari Meta. Purchase = closing yang dicatat CS sebagai "Iklan CTWA" di Aventra (${num(A.CC)} chat tercatat), atau dari label WA Business bila angkanya lebih besar.` : 'Contact, chat & purchase dihitung dari klik iklan yang tercatat di Aventra.'} Angka setelah "/" = patokan.</p>`;

    const tips = {
      CTR: 'CTR rendah → kreatif/hook kurang menarik. Uji 2–3 kreatif baru dengan 3 detik pertama berbeda.',
      OCLP: 'OCLP rendah → halaman lambat di HP atau klik nyasar. Kompres gambar, cek placement Audience Network.',
      Contact: 'Contact rendah → isi halaman/penawaran kurang meyakinkan. Perjelas harga, testimoni, tombol WA di atas.',
      Chat: isCtwa ? 'Chat dimulai rendah → pesan sambutan/ice breaker kurang menarik.' : 'Chat rendah → pelanggan batal kirim di WA, atau CS belum mencatat semua chat di Aventra.',
      Purchase: 'Purchase rendah → CS: kecepatan balas, script, follow up, dan ketersediaan jadwal.',
    };
    const bad = steps.find((s) => Number.isFinite(s.r) && s.t != null && s.r < s.t);
    $('#diag', el).innerHTML = !A.I && !A.W ? '' : bad
      ? `<div class="note bad"><div><b>Titik bocor terbesar: ${esc(bad.l)} (${p1(bad.r)} dari patokan ${p1(bad.t)})</b><br>${tips[bad.l] || ''}</div></div>`
      : '<div class="note ok"><div><b>Semua tahap memenuhi patokan.</b> Kalau CPA juga di bawah target, siap di-scale 20–30% per 2–3 hari.</div></div>';

    // per iklan
    const g = {};
    const row = (id) => (g[id] ??= { name: '', S: 0, I: 0, K: 0, L: 0, MS: 0, MP: 0, W: 0, C: 0, P: 0, O: 0 });
    insSel.forEach((r) => { const x = row(r.ad_id); x.name = x.name || r.ad_name; x.S += Number(r.spend); x.I += r.impressions; x.K += r.link_clicks; x.L += r.lpv; x.MS += r.msg_started || 0; x.MP += r.purchase || 0; });
    const lb = Object.fromEntries(adLeads.map((l) => [l.click_id, l]));
    leads.filter((l) => l.sumber === 'ctwa' && l.ad_id && insIds.has(l.ad_id)).forEach((l) => {
      const x = row(l.ad_id); x.CC = (x.CC || 0) + 1; if (l.paid_at) { x.CP = (x.CP || 0) + 1; x.O += l.nilai || 0; }
    });
    adClicks.forEach((c) => {
      const x = row(c.ad_id || 'tanpa-id'); x.name = x.name || c.ad_name || c.utm_content || '(tanpa ID iklan)'; x.W++;
      const l = lb[c.id]; if (l) { x.C++; if (l.paid_at) { x.P++; x.O += l.nilai || 0; } }
    });
    $('#perAd', el).innerHTML = Object.values(g).sort((a, b) => b.S - a.S || b.W - a.W).map((x) => {
      const ctwa = x.MS > 0 && !x.L && !x.W;
      const pur = ctwa ? Math.max(x.CP || 0, x.MP) : x.P, cpa = div(x.S, pur);
      const st = !x.S ? '<span class="badge">tanpa data Meta</span>'
        : !pur ? (x.S > H.cpaT * 2 ? '<span class="badge bad">Matikan? 2× CPA tanpa purchase</span>' : '<span class="badge warn">Belum purchase</span>')
        : cpa <= H.cpaT ? '<span class="badge ok">Winning</span>' : cpa <= H.laba ? '<span class="badge warn">Di atas target</span>' : '<span class="badge bad">Rugi</span>';
      return `<tr><td data-l="Iklan" class="ad"><b>${esc(x.name)}</b>${ctwa ? ' <span class="tag">CTWA</span>' : ''}</td>
        <td class="r" data-l="Spend">${x.S ? rp(x.S) : '-'}</td><td class="r" data-l="CTR">${p1(div(x.K, x.I))}</td>
        <td class="r" data-l="OCLP">${ctwa ? '-' : p1(div(x.L, x.K))}</td><td class="r" data-l="Contact">${ctwa ? '-' : p1(div(x.W, x.L))}</td>
        <td class="r" data-l="Chat">${ctwa ? p1(div(x.MS, x.K)) : p1(div(x.C, x.W))}</td>
        <td class="r" data-l="Purchase">${num(pur)} <small class="muted">${ctwa ? p1(div(pur, x.MS)) : p1(div(x.P, x.C))}</small></td>
        <td class="r" data-l="CPA">${rpx(cpa)}</td><td class="r" data-l="ROAS">${x.S && x.O ? (x.O / x.S).toFixed(2).replace('.', ',') + 'x' : '-'}</td>
        <td data-l="Status">${st}</td></tr>`;
    }).join('') || '<tr><td colspan="10" class="empty">Belum ada data</td></tr>';

    // baris total (seperti "Results from N ads" di Ads Manager)
    const rows = Object.values(g);
    const T2 = rows.reduce((a, x) => {
      const ctwa = x.MS > 0 && !x.L && !x.W;
      a.S += x.S; a.I += x.I; a.K += x.K; a.O += x.O; a.n++;
      if (ctwa) { a.Kc += x.K; a.ch += x.MS; a.p += Math.max(x.CP || 0, x.MP); } else { a.Kw += x.K; a.L += x.L; a.W += x.W; a.ch += x.C; a.p += x.P; }
      return a;
    }, { S: 0, I: 0, K: 0, O: 0, n: 0, Kc: 0, Kw: 0, L: 0, W: 0, ch: 0, p: 0 });
    const cpaT = div(T2.S, T2.p);
    const stT = !T2.S ? '' : !T2.p ? '<span class="badge warn">Belum purchase</span>'
      : cpaT <= H.cpaT ? '<span class="badge ok">Di bawah target</span>' : cpaT <= H.laba ? '<span class="badge warn">Di atas target</span>' : '<span class="badge bad">Rugi</span>';
    $('#perAdTot', el).innerHTML = rows.length ? `<tr>
      <td data-l="Total"><b>Total ${num(T2.n)} iklan</b></td>
      <td class="r" data-l="Spend"><b>${rp(T2.S)}</b></td>
      <td class="r" data-l="CTR"><b>${p1(div(T2.K, T2.I))}</b></td>
      <td class="r" data-l="OCLP"><b>${p1(div(T2.L, T2.Kw))}</b></td>
      <td class="r" data-l="Contact"><b>${p1(div(T2.W, T2.L))}</b></td>
      <td class="r" data-l="Chat"><b>${num(T2.ch)}</b> <small class="muted">${p1(div(T2.ch, T2.W + T2.Kc))}</small></td>
      <td class="r" data-l="Purchase"><b>${num(T2.p)}</b> <small class="muted">${p1(div(T2.p, T2.ch))}</small></td>
      <td class="r" data-l="CPA"><b>${rpx(cpaT)}</b></td>
      <td class="r" data-l="ROAS"><b>${T2.S && T2.O ? (T2.O / T2.S).toFixed(2).replace('.', ',') + 'x' : '-'}</b></td>
      <td data-l="Status">${stT}</td></tr>` : '';
  }
  drawActual();

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
