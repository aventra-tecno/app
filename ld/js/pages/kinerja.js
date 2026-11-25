// Aventra Leads · Kinerja CS (v1.12.0)
import { api } from '../api.js';
import { esc, rp, num, range, TAHAP, ALASAN, $ } from '../ui.js';

let mode = localStorage.getItem('ld_kinerja_mode') || 'cs';

// saran latihan per tahap tempat chat paling sering berhenti
const SARAN = {
  A: 'Banyak pelanggan diam setelah disapa. Balas < 5 menit, sapaan pertama langsung tanya kebutuhan + kirim harga.',
  B: 'Banyak yang hilang setelah tanya harga. Latih jawaban harga: sebut manfaat & promo, lalu langsung tawarkan jadwal.',
  C: 'Macet di bahas jadwal. Tawarkan 2 pilihan jam yang pasti (mis. 19.00 atau 20.30), jangan pertanyaan terbuka.',
  D: 'Sudah sepakat tapi batal. Kirim konfirmasi + DP/ringkasan pesanan, dan follow up 1 jam sebelum jadwal.',
};
const pct = (a, b) => (b ? (a / b * 100).toFixed(1).replace('.', ',') + '%' : '-');
const jamStr = (ms) => {
  if (!Number.isFinite(ms)) return '-';
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} mnt` : m < 1440 ? `${(m / 60).toFixed(1).replace('.', ',')} jam` : `${(m / 1440).toFixed(1).replace('.', ',')} hari`;
};
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };

export async function render(el, { state }) {
  const tid = state.tenant.id;
  const { from, to } = range(state.period);
  const [leads, team] = await Promise.all([api.leads(tid, from, to), api.members(tid).catch(() => [])]);
  const who = Object.fromEntries(team.filter((m) => m.user_id).map((m) => [m.user_id, m]));
  const waLabel = Object.fromEntries(state.wa.map((w) => [w.id, w.label]));

  const key = (l) => (mode === 'cs' ? (l.cs_id || '-') : (l.wa_number_id || '-'));
  const label = (k) => {
    if (mode === 'cs') {
      if (k === '-') return { n: 'Tanpa CS', s: 'tercatat otomatis / sebelum v1.12' };
      const m = who[k]; return { n: m?.nama || m?.email || 'Anggota', s: m?.jabatan || m?.email || '' };
    }
    return { n: k === '-' ? 'Tanpa nomor' : (waLabel[k] || 'Nomor'), s: k === '-' ? '' : 'nomor WA' };
  };

  const g = {};
  leads.forEach((l) => {
    const x = (g[key(l)] ??= { k: key(l), chat: 0, st: { A: 0, B: 0, C: 0, D: 0, E: 0 }, omzet: 0, waktu: [], alasan: {} });
    x.chat++; x.st[l.stage] = (x.st[l.stage] || 0) + 1;
    if (l.paid_at) { x.omzet += l.nilai || 0; x.waktu.push(Date.parse(l.paid_at) - Date.parse(l.created_at)); }
    if (!l.paid_at && l.alasan) x.alasan[l.alasan] = (x.alasan[l.alasan] || 0) + 1;
  });
  const rows = Object.values(g).map((x) => {
    const close = x.st.E, gagal = x.chat - close;
    const stuck = ['A', 'B', 'C', 'D'].map((s) => [s, x.st[s]]).sort((a, b) => b[1] - a[1])[0];
    const topAl = Object.entries(x.alasan).sort((a, b) => b[1] - a[1]).slice(0, 2);
    return { ...x, close, gagal, rate: x.chat ? close / x.chat : 0, stuck, topAl, med: median(x.waktu) };
  }).sort((a, b) => b.close - a.close || b.chat - a.chat);

  // ringkasan tim
  const T = rows.reduce((a, x) => ({ chat: a.chat + x.chat, close: a.close + x.close, omzet: a.omzet + x.omzet }), { chat: 0, close: 0, omzet: 0 });
  const best = rows.filter((x) => x.chat >= 5 && x.k !== '-').sort((a, b) => b.rate - a.rate)[0];
  const alTim = {};
  rows.forEach((x) => Object.entries(x.alasan).forEach(([k, v]) => { alTim[k] = (alTim[k] || 0) + v; }));
  const alTop = Object.entries(alTim).sort((a, b) => b[1] - a[1]);
  const medTim = median(rows.flatMap((x) => x.waktu));
  const maxAl = Math.max(1, ...alTop.map(([, v]) => v));

  el.innerHTML = `
  <div class="toolbar">
    <div class="seg" id="kmode"><button data-m="cs" class="${mode === 'cs' ? 'on' : ''}">Per CS</button><button data-m="wa" class="${mode === 'wa' ? 'on' : ''}">Per nomor WA</button></div>
  </div>
  <div class="kpis">
    <div class="kpi"><small>Closing rate tim</small><b>${pct(T.close, T.chat)}</b><span>${num(T.close)} closing dari ${num(T.chat)} chat</span></div>
    <div class="kpi"><small>${mode === 'cs' ? 'CS' : 'Nomor'} terbaik</small><b class="kp-name">${best ? esc(label(best.k).n) : '-'}</b><span>${best ? `closing rate ${pct(best.close, best.chat)}` : 'minimal 5 chat'}</span></div>
    <div class="kpi"><small>Alasan gagal terbanyak</small><b class="kp-name">${alTop[0] ? esc(ALASAN[alTop[0][0]]) : '-'}</b><span>${alTop[0] ? `${num(alTop[0][1])} chat` : 'isi kolom alasan di Leads'}</span></div>
    <div class="kpi"><small>Waktu chat → closing</small><b>${jamStr(medTim)}</b><span>median tim</span></div>
  </div>

  <div class="card flush">
    <div class="card-head"><h3>${mode === 'cs' ? 'Kinerja per CS' : 'Kinerja per nomor WA'}</h3><small class="muted">Tahap = posisi terakhir chat</small></div>
    <table class="tbl kin"><thead><tr><th>${mode === 'cs' ? 'CS' : 'Nomor'}</th><th class="r">Chat</th><th>Sebaran tahap</th><th class="r">Closing</th><th class="r">Omzet</th>
      <th class="r">Ke closing</th><th>Alasan teratas</th></tr></thead>
    <tbody>${rows.map((x) => {
      const L = label(x.k);
      const bar = ['A', 'B', 'C', 'D', 'E'].map((s) => x.st[s] ? `<i class="s${s}" style="flex:${x.st[s]}" title="${s} · ${TAHAP[s]}: ${x.st[s]}"></i>` : '').join('');
      return `<tr>
        <td data-l="${mode === 'cs' ? 'CS' : 'Nomor'}"><div class="kin-who"><span class="avatar">${esc((L.n || '?')[0].toUpperCase())}</span><div><b>${esc(L.n)}</b><small>${esc(L.s)}</small></div></div></td>
        <td class="r" data-l="Chat"><b>${num(x.chat)}</b></td>
        <td data-l="Tahap"><div class="stbar">${bar}</div></td>
        <td class="r" data-l="Closing"><b>${num(x.close)}</b> <span class="badge ${x.rate >= 0.25 ? 'ok' : x.rate >= 0.15 ? 'warn' : 'bad'}">${pct(x.close, x.chat)}</span></td>
        <td class="r" data-l="Omzet">${rp(x.omzet)}</td>
        <td class="r" data-l="Ke closing">${jamStr(x.med)}</td>
        <td data-l="Alasan">${x.topAl.map(([k, v]) => `<span class="mchip">${esc(ALASAN[k])} · ${v}</span>`).join(' ') || '<span class="muted">–</span>'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">Belum ada chat di periode ini</td></tr>'}</tbody></table>
    <div class="stlegend">${['A', 'B', 'C', 'D', 'E'].map((s) => `<span><i class="s${s}"></i>${s} · ${TAHAP[s]}</span>`).join('')}</div>
  </div>

  <div class="grid2 mt">
    <div class="card">
      <h3>Saran latihan</h3>
      <div class="saran">${rows.filter((x) => x.chat >= 3 && x.gagal).map((x) => {
        const [s, n] = x.stuck;
        return `<div class="saran-row"><span class="tag t${s}">${s}</span><div><b>${esc(label(x.k).n)}</b>: ${pct(n, x.chat)} chat berhenti di tahap <b>${TAHAP[s]}</b>.<br><span class="muted">${SARAN[s]}</span></div></div>`;
      }).join('') || '<p class="muted">Belum cukup data (minimal 3 chat per orang).</p>'}</div>
    </div>
    <div class="card">
      <h3>Alasan belum closing (tim)</h3>
      <div class="bars">${alTop.map(([k, v]) => `<div class="bar-row al"><span></span><span>${esc(ALASAN[k])}</span><div class="bar"><i style="width:${v / maxAl * 100}%"></i></div><b>${v}</b></div>`).join('') || '<p class="muted">CS belum mengisi alasan di menu Leads & Closing.</p>'}</div>
    </div>
  </div>`;

  $('#kmode', el).onclick = (e) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    mode = b.dataset.m; localStorage.setItem('ld_kinerja_mode', mode); render(el, { state });
  };
}
