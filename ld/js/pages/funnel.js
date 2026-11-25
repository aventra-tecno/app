// Aventra Leads · Funnel & Target (v1.3.0)
// Rumus inti:  CPA = CPM ÷ (1000 × CTR × OCLP × Contact × Chat × Purchase)   (iklan ke website)
//              CPA = CPM ÷ (1000 × CTR × Chat × Purchase)                    (iklan CTWA)
import { api } from '../api.js';
import { esc, rp, num, range, metaDates, tzBeda, toast, icon, $ } from '../ui.js';

// ---------- nilai awal & penjelasan ----------
export const DEF = {
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
const fmt = (v, u) => (u === 'Rp' ? (Number(v) ? Number(v).toLocaleString('id-ID') : '') : String(v).replace('.', ','));

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
  const { since: dFrom, until: dTo } = metaDates(state.period, t.ad_tz);
  const isAdmin = state.role !== 'cs';

  const [insAll, clicks, leads] = await Promise.all([
    api.insights(t.id, dFrom, dTo), api.clicks(t.id, from, to),
    api.leads(t.id, from, new Date(Date.parse(to) + 3 * 864e5).toISOString()),
  ]);
  const lastSync = t.last_sync_at || insAll.reduce((m, r) => (r.synced_at > m ? r.synced_at : m), '');
  const syncInfo = String(t.last_sync_info || '');

  el.innerHTML = `
  <div class="fz">
    <div class="fz-main">
      <div class="hasil" id="hasil"></div>
  <div class="card">
    <div class="card-head flat">
      <h3>Funnel aktual</h3>
      ${tzBeda(t.ad_tz) ? `<small class="muted">tanggal Meta ${dFrom === dTo ? dFrom : dFrom + ' s/d ' + dTo} (zona akun iklan ${esc(t.ad_tz)})</small>` : ''}
    </div>
    <div class="filters" id="filters"></div>
    ${insAll.length ? '' : `<div class="note warn" style="margin-bottom:12px"><div>Belum ada data Meta Ads untuk periode ini. Isi <b>Pengaturan → Meta Ads</b>, lalu tekan <b>Sinkron</b> di pojok kanan atas.</div></div>`}
    <div id="funnel"></div>
    <div id="diag"></div>
  </div>

  <div class="card flush">
    <div class="card-head"><h3>Per iklan vs patokan</h3></div>
    <table class="tbl"><thead><tr><th>Iklan</th><th class="r">Spend</th><th class="r">CTR</th><th class="r">OCLP</th><th class="r">Contact</th>
      <th class="r">Chat</th><th class="r">Purchase</th><th class="r">CPA</th><th class="r">ROAS</th><th>Status</th></tr></thead>
    <tbody id="perAd"></tbody><tfoot id="perAdTot"></tfoot></table>
  </div>    </div>
    <aside class="fz-side">
    <form class="card" id="calc">
      <div class="card-head flat"><h3>Kalkulator patokan</h3>
        <div class="seg" id="mode"><button type="button" data-m="web">Iklan ke website</button><button type="button" data-m="ctwa">Iklan CTWA</button></div></div>
      <div class="calc-grid" id="bizF"></div>
      <h4 class="sub">Rasio tiap tahap funnel</h4>
      <div class="calc-grid" id="stepF"></div>
      ${isAdmin ? '<button class="btn primary" style="margin-top:12px">Simpan sebagai patokan</button>' : ''}
    </form>
      <div class="card" id="target"></div>
    </aside>
  </div>`;

  // ---------------------------------------------------------- kalkulator
  const field = ([k, lbl, u, hint], v) => `<label><span>${lbl}</span><div class="unit"><input name="${k}" ${u === 'Rp' ? 'data-rp inputmode="numeric"' : 'inputmode="decimal"'} value="${fmt(v, u)}"><b>${u}</b></div><small class="hint">${hint}</small></label>`;
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
    const { H, filtered, ctwaCamp, insSel, insIds, adClicks, adLeads, A, isCtwa, P, steps, bad } = aktual(insAll, clicks, leads, T, sel);
    const top = Math.max(1, ...steps.map((s) => s.n));
    // ---- hasil (paling atas): patokan dari kalkulator + CPA aktual
    const cpaA = div(A.S, P), okEst = H.cpaEst <= H.cpaT;
    $('#hasil', el).innerHTML = `
      ${tile('Laba kotor per order', rp(H.laba), 'sebelum biaya iklan', '', 'store')}
      ${tile('CPA impas', rp(H.laba), 'di atas ini rugi', 'bad', 'x')}
      ${tile('CPA target', rp(H.cpaT), `laba bersih ${rp(H.laba - H.cpaT)}/order`, 'ok', 'check')}
      ${tile('CPA perkiraan', rpx(H.cpaEst), `${H.perK.toFixed(2).replace('.', ',')} closing / 1.000 tayangan`, okEst ? 'ok' : 'bad', 'funnel')}
      ${tile('CPA aktual', rpx(cpaA), P ? `${num(P)} purchase · spend ${rp(A.S)}` : A.S ? `spend ${rp(A.S)}, belum purchase` : 'belum ada data', !Number.isFinite(cpaA) ? (A.S ? 'warn' : '') : cpaA <= H.cpaT ? 'ok' : cpaA <= H.laba ? 'warn' : 'bad', 'pulse', true)}`;
    $('#funnel', el).innerHTML = `
      <div class="fn-sum">
        ${sum('Jenis funnel', isCtwa ? 'CTWA' : 'Website')}${sum('Spend', A.S ? rp(A.S) : '-')}
        ${sum('Purchase', num(P))}${sum('CPA', rpx(div(A.S, P)))}${sum('ROAS', A.S && A.O ? (A.O / A.S).toFixed(2).replace('.', ',') + 'x' : '-')}
        ${sum('CPM', A.I ? rp(A.S / A.I * 1000) : '-')}${sum('Klik → purchase', p1(div(P, A.K)))}
      </div>
      <div class="fx" id="fx"></div>
      <div class="fn">${steps.map((s) => {
        const w = s.n ? Math.max(2, Math.sqrt(s.n / top) * 100) : 0;
        const rOk = Number.isFinite(s.r) && s.t != null ? s.r >= s.t : null;
        const cOk = Number.isFinite(s.cost) && s.max != null ? s.cost <= s.max : null;
        return `<div class="fn-row">
          <div class="fn-lbl"><b>${s.k}</b><small class="muted">${s.src}</small></div>
          <b class="fn-n">${num(s.n)}</b>
          <div class="fn-bar"><i style="width:${w}%"></i></div>
          <div class="fn-m">${s.l ? `<span class="badge ${rOk === null ? '' : rOk ? 'ok' : 'bad'}">${s.l} ${p1(s.r)} <small>/ ${p1(s.t)}</small></span>` : ''}${s.cl ? `<span class="badge ${cOk === null ? '' : cOk ? 'ok' : 'bad'}">${s.cl} ${rpx(s.cost)} <small>/ ${rp(s.max)}</small></span>` : ''}</div>
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
    const fx = $('#fx', el);
    if (fx) {
      const box = fx.parentElement;
      let vert = null;
      const draw = () => {
        const w = box.clientWidth, v = w < 560, key = v + ':' + Math.round(w / 60);
        if (key === vert && fx.innerHTML) return;
        vert = key; fx.innerHTML = (A.I || A.W) ? flowSvg(steps, bad, v, w) : '';
      };
      draw();
      new ResizeObserver(draw).observe(box);
    }
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
      if (r.tz) t.ad_tz = r.tz;
      toast(`Sinkron selesai: ${num(r.baris)} baris, spend ${rp(r.spend)}`);
      ctx.refresh();
    } catch (err) { toast(err.message, 'err'); sb.disabled = false; sb.lastChild.textContent = 'Sinkron data Meta'; }
  };
}

const tile = (l, v, s, c, ic, main) => `<div class="htile ${c} ${main ? 'main' : ''}"><span class="h-ic">${icon(ic)}</span><div><small>${l}</small><b>${v}</b><span>${s}</span></div></div>`;
const tgt = (l, v, s, c = '') => `<div class="tg ${c}"><small>${l}</small><b>${v}</b><span>${s}</span></div>`;
const sum = (l, v) => `<div><small>${l}</small><b>${v}</b></div>`;

// ---------- hitung funnel aktual (dipakai juga di Ringkasan) ----------
export function aktual(insAll, clicks, leads, T, sel = { c: '', a: '', d: '' }) {
  const adsMap = {};
  insAll.forEach((r) => { adsMap[r.ad_id] = { a: r.adset_id || r.adset_name || '-', c: r.campaign_id || r.campaign_name || '-' }; });
  const agg = {};
  insAll.forEach((r) => { const c = adsMap[r.ad_id].c; const a = (agg[c] ??= { ms: 0, lpv: 0 }); a.ms += r.msg_started || 0; a.lpv += r.lpv || 0; });
  const ctwaCamp = new Set(Object.entries(agg).filter(([, a]) => a.ms > 0 && a.lpv === 0).map(([c]) => c));
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
  // titik bocor = tahap dengan rasio paling jauh di bawah patokan
  const bad = steps.filter((s) => Number.isFinite(s.r) && s.t != null && s.r < s.t).sort((a, b) => a.r / a.t - b.r / b.t)[0];
  return { H, filtered, ctwaCamp, insSel, insIds, adClicks, adLeads, A, isCtwa, P, steps, bad, Hm, Tm };
}

// ---------- grafik alur funnel: garis berdenyut di titik bocor ----------
const SHORT = { 'Landing page view': 'Landing page', 'Contact (klik WA)': 'Klik WA', 'Chat dimulai': 'Chat dimulai' };
let fxSeq = 0;
// Grafik funnel premium: pita cair bergradasi, partikel mengalir, tetesan "bocor" di tahap terlemah
export function flowSvg(steps, bad, vertical, boxW = 1000) {
  const id = 'fx' + (++fxSeq);
  const n = steps.length, top = Math.max(1, ...steps.map((s) => s.n || 0));
  const st = (s, i) => (!i ? 'na' : !Number.isFinite(s.r) || s.t == null ? 'na' : s.r >= s.t ? 'ok' : 'bad');
  const short = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' jt' : v >= 1e5 ? Math.round(v / 1e3) + ' rb' : num(v));
  const rnd = (a) => Math.round(a * 10) / 10;
  const defs = `<defs>
    <linearGradient id="${id}b" ${vertical ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="0"'}>
      <stop offset="0" stop-color="#3BF08A"/><stop offset=".55" stop-color="#1FB57A"/><stop offset="1" stop-color="#0E8C7A"/></linearGradient>
    <linearGradient id="${id}h" ${vertical ? 'x1="0" y1="0" x2="1" y2="0"' : 'x1="0" y1="0" x2="0" y2="1"'}>
      <stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
    <linearGradient id="${id}r" ${vertical ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="0"'}>
      <stop offset="0" stop-color="#FF5A5A" stop-opacity=".15"/><stop offset=".5" stop-color="#FF3B3B" stop-opacity=".9"/><stop offset="1" stop-color="#FF5A5A" stop-opacity=".25"/></linearGradient>
    <filter id="${id}g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="${id}s" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
  </defs>`;
  const pill = (x, y, s, i, anchor = 'middle') => {
    if (!s.l) return '';
    const k = st(s, i), worst = s === bad;
    const t1 = `${s.l} ${p1(s.r)}`, t2 = `patokan ${p1(s.t)}`;
    const w = Math.max(t1.length * 7.4, t2.length * 5.6) + 22, x0 = anchor === 'middle' ? x - w / 2 : x;
    return `<g class="fxp ${k} ${worst ? 'worst' : ''}"><rect x="${rnd(x0)}" y="${y - 19}" width="${rnd(w)}" height="38" rx="11"/>
      <text x="${rnd(x0 + w / 2)}" y="${y - 2}" class="t1">${esc(t1)}</text><text x="${rnd(x0 + w / 2)}" y="${y + 12}" class="t2">${esc(t2)}</text></g>`;
  };
  // partikel mengalir di sepanjang garis tengah
  const particles = (path, k, dur) => (k === 'na' ? '' : [0, 1, 2].map((j) =>
    `<circle r="${k === 'bad' ? 2.6 : 2.3}" class="fxdot ${k}"><animateMotion dur="${dur}s" begin="-${rnd(j * dur / 3)}s" repeatCount="indefinite" path="${path}"/></circle>`).join(''));
  let out = '';

  if (!vertical) {
    const W = Math.round(Math.max(760, Math.min(1000, boxW * 1.15))), H = 300, cy = 158, x0 = 74, gap = (W - 2 * x0) / (n - 1);
    const X = (i) => x0 + i * gap, h = (i) => 7 + 50 * Math.sqrt((steps[i].n || 0) / top);
    const edge = (sign, from, to) => { // kurva halus antar node
      let d = '';
      for (let i = from + 1; i <= to; i++) { const m = X(i - 1) + gap / 2; d += ` C${rnd(m)},${rnd(cy + sign * h(i - 1))} ${rnd(m)},${rnd(cy + sign * h(i))} ${rnd(X(i))},${rnd(cy + sign * h(i))}`; }
      return d;
    };
    const back = (from, to) => { let d = ''; for (let i = to; i > from; i--) { const m = X(i - 1) + gap / 2; d += ` C${rnd(m)},${rnd(cy + h(i))} ${rnd(m)},${rnd(cy + h(i - 1))} ${rnd(X(i - 1))},${rnd(cy + h(i - 1))}`; } return d; };
    const seg = (a, b) => `M${rnd(X(a))},${rnd(cy - h(a))}${edge(-1, a, b)} L${rnd(X(b))},${rnd(cy + h(b))}${back(a, b)} Z`;
    // kolom pemandu
    steps.forEach((s, i) => { out += `<line class="fxguide" x1="${rnd(X(i))}" y1="78" x2="${rnd(X(i))}" y2="${cy + 62}"/>`; });
    out += `<path d="${seg(0, n - 1)}" fill="url(#${id}b)" filter="url(#${id}s)" opacity=".35" transform="translate(0,10)"/>`;
    out += `<path d="${seg(0, n - 1)}" fill="url(#${id}b)"/><path d="${seg(0, n - 1)}" fill="url(#${id}h)"/>`;
    steps.forEach((s, i) => {
      if (!i) return;
      const k = st(s, i), worst = s === bad;
      if (k === 'bad') out += `<path d="${seg(i - 1, i)}" fill="url(#${id}r)" class="fxleak ${worst ? 'worst' : ''}"/>`;
      out += particles(`M${rnd(X(i - 1))},${cy} L${rnd(X(i))},${cy}`, k, worst ? 1.1 : 1.8);
      if (worst) for (let j = 0; j < 4; j++) {
        const dx = rnd(X(i - 1) + gap * (0.25 + j * 0.17)), y0 = rnd(cy + (h(i - 1) + h(i)) / 2 - 4);
        out += `<circle class="fxdrop" cx="${dx}" cy="${y0}" r="2.6"><animate attributeName="cy" values="${y0};${y0 + 46}" dur="1.5s" begin="-${rnd(j * 0.37)}s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0" dur="1.5s" begin="-${rnd(j * 0.37)}s" repeatCount="indefinite"/></circle>`;
      }
    });
    steps.forEach((s, i) => {
      const worst = s === bad, x = rnd(X(i));
      if (worst) out += `<circle class="fxring" cx="${x}" cy="${cy}" r="14"/><circle class="fxring d2" cx="${x}" cy="${cy}" r="14"/>`;
      out += `<circle cx="${x}" cy="${cy}" r="9" class="fxhalo ${worst ? 'worst' : ''}"/><circle cx="${x}" cy="${cy}" r="4.5" class="fxcore ${worst ? 'worst' : ''}"/>`;
      out += `<text class="fxname" x="${x}" y="30">${esc((gap < 150 ? SHORT[s.k] || s.k : s.k).toUpperCase())}</text>`;
      out += `<text class="fxval ${worst ? 'worst' : ''}" x="${x}" y="62">${short(s.n || 0)}</text>`;
      if (worst) out += `<text class="fxtag" x="${x}" y="${cy - h(i) - 14}">BOCOR DI SINI</text>`;
      if (i) out += pill(rnd((X(i - 1) + X(i)) / 2), 268, s, i);
    });
    return `<div class="fxwrap"><svg viewBox="0 0 ${W} ${H}" class="fx-svg" role="img" aria-label="Grafik funnel">${defs}${out}</svg>${legend(bad)}</div>`;
  }

  // HP: vertikal
  const W = 360, gapY = 104, y0 = 46, cx = 62, H = y0 * 2 + gapY * (n - 1) + 6;
  const Y = (i) => y0 + i * gapY, h = (i) => 6 + 30 * Math.sqrt((steps[i].n || 0) / top);
  const seg = (a, b) => {
    let d = `M${rnd(cx - h(a))},${Y(a)}`;
    for (let i = a + 1; i <= b; i++) { const m = Y(i - 1) + gapY / 2; d += ` C${rnd(cx - h(i - 1))},${m} ${rnd(cx - h(i))},${m} ${rnd(cx - h(i))},${Y(i)}`; }
    d += ` L${rnd(cx + h(b))},${Y(b)}`;
    for (let i = b; i > a; i--) { const m = Y(i - 1) + gapY / 2; d += ` C${rnd(cx + h(i))},${m} ${rnd(cx + h(i - 1))},${m} ${rnd(cx + h(i - 1))},${Y(i - 1)}`; }
    return d + ' Z';
  };
  out += `<path d="${seg(0, n - 1)}" fill="url(#${id}b)"/><path d="${seg(0, n - 1)}" fill="url(#${id}h)"/>`;
  steps.forEach((s, i) => {
    if (!i) return;
    const k = st(s, i), worst = s === bad;
    if (k === 'bad') out += `<path d="${seg(i - 1, i)}" fill="url(#${id}r)" class="fxleak ${worst ? 'worst' : ''}"/>`;
    out += particles(`M${cx},${Y(i - 1)} L${cx},${Y(i)}`, k, worst ? 1.1 : 1.8);
    if (worst) for (let j = 0; j < 3; j++) {
      const yy = rnd(Y(i - 1) + gapY * (0.3 + j * 0.2)), xs = rnd(cx + (h(i - 1) + h(i)) / 2 - 3);
      out += `<circle class="fxdrop" cx="${xs}" cy="${yy}" r="2.4"><animate attributeName="cx" values="${xs};${xs + 34}" dur="1.4s" begin="-${rnd(j * 0.45)}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="1;0" dur="1.4s" begin="-${rnd(j * 0.45)}s" repeatCount="indefinite"/></circle>`;
    }
    out += pill(132, rnd((Y(i - 1) + Y(i)) / 2), s, i, 'start');
  });
  steps.forEach((s, i) => {
    const worst = s === bad;
    if (worst) out += `<circle class="fxring" cx="${cx}" cy="${Y(i)}" r="12"/><circle class="fxring d2" cx="${cx}" cy="${Y(i)}" r="12"/>`;
    out += `<circle cx="${cx}" cy="${Y(i)}" r="8" class="fxhalo ${worst ? 'worst' : ''}"/><circle cx="${cx}" cy="${Y(i)}" r="4" class="fxcore ${worst ? 'worst' : ''}"/>`;
    out += `<text class="fxname l" x="132" y="${Y(i) - 8}">${esc((SHORT[s.k] || s.k).toUpperCase())}${worst ? ' · BOCOR' : ''}</text>`;
    out += `<text class="fxval l ${worst ? 'worst' : ''}" x="132" y="${Y(i) + 14}">${short(s.n || 0)}</text>`;
  });
  return `<div class="fxwrap"><svg viewBox="0 0 ${W} ${H}" class="fx-svg v" role="img" aria-label="Grafik funnel">${defs}${out}</svg>${legend(bad)}</div>`;
}
const legend = (bad) => `<div class="fx-legend">
  <span><i class="ok"></i>sesuai patokan</span><span><i class="bad"></i>di bawah patokan</span><span><i class="na"></i>belum ada data</span>
  ${bad ? `<b class="fx-alert"><span class="dotlive"></span>Perbaiki dulu: ${esc(bad.l)} ${p1(bad.r)} (patokan ${p1(bad.t)})</b>` : '<b class="fx-good">Semua tahap aman</b>'}
</div>`;
