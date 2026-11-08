import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { renderShortcuts, greet, amtToggle, heroFit } from '../shortcuts.js';
import staffDash from './dash-staff.js';
import { modOn } from '../modules.js';
import { esc, rp, num, pct, todayStr, addDays, monthStart, longToday, icon, chips, on, toast, toastErr, ago, fmtDate, modal, downloadXlsx, parseNum } from '../ui.js';

const PERIODS = [['today', 'Hari ini'], ['yesterday', 'Kemarin'], ['7', '7 hari'], ['month', 'Bulan ini'], ['30', '30 hari'], ['custom', 'Pilih tanggal…']];
let custom = (() => { try { return JSON.parse(sessionStorage.getItem('dash-range') || 'null'); } catch (_) { return null; } })();
function range(p) {
  const t = todayStr();
  if (p === 'custom' && custom) return [custom[0], custom[1]];
  if (p === 'yesterday') return [addDays(t, -1), addDays(t, -1)];
  if (p === '7') return [addDays(t, -6), t];
  if (p === '30') return [addDays(t, -29), t];
  if (p === 'month') return [monthStart(t), t];
  return [t, t];
}
// periode pembanding: panjang sama, tepat sebelum periode yang dipilih.
// "Bulan ini" dibandingkan dengan tanggal yang sama di bulan lalu (1 s/d tanggal yang sama).
const days = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5) + 1;
function prevRange(p, from, to) {
  if (p === 'month') {
    const d = new Date(from + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1);
    const pf = d.toISOString().slice(0, 10);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const dd = Math.min(Number(to.slice(8, 10)), last);
    return [pf, pf.slice(0, 8) + String(dd).padStart(2, '0')];
  }
  const n = days(from, to);
  return [addDays(from, -n), addDays(from, -1)];
}
function prevLabel(p, pf, pt) {
  if (p === 'today') return 'kemarin';
  if (p === 'yesterday') return 'hari sebelumnya';
  if (p === 'month') return 'bulan lalu (' + fmtDate(pf, { day: 'numeric', month: 'short' }) + ' – ' + fmtDate(pt, { day: 'numeric', month: 'short' }) + ')';
  return days(pf, pt) + ' hari sebelumnya (' + fmtDate(pf, { day: 'numeric', month: 'short' }) + ' – ' + fmtDate(pt, { day: 'numeric', month: 'short' }) + ')';
}
// selisih: naik / turun berapa persen. goodUp=false untuk angka yang lebih baik kalau turun (rugi, biaya)
function delta(cur, prev, goodUp = true, money = true) {
  cur = Number(cur) || 0; prev = Number(prev) || 0;
  const d = cur - prev;
  if (!d) return `<div class="dl same">= sama</div>`;
  const pctv = prev ? Math.round((d / Math.abs(prev)) * 100) : null;
  const good = goodUp ? d > 0 : d < 0;
  const amt = money ? (d > 0 ? '+' : '−') + rp(Math.abs(d)).replace('−', '') : (d > 0 ? '+' : '−') + num(Math.abs(d));
  return `<div class="dl ${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${pctv === null ? 'baru' : Math.abs(pctv) + '%'} <span>${amt}</span></div>`;
}
const LV = { tinggi: ['Tinggi', 'solid-red'], sedang: ['Sedang', 'solid-yellow'], info: ['Info', ''] };

// judul bagian dengan kotak ikon berwarna
const secH = (ic, title, tone = 'navy', sub = null, bare = false) => `<div class="sec-h2 ${bare ? 'bare' : ''}"><i class="si si-${tone}">${icon(ic, 18, 2.2)}</i><div><h2 class="sec-title">${title}</h2>${sub ? `<div class="xs muted">${esc(sub)}</div>` : ''}</div></div>`;

export default {
  tour: [
    { sel: '[data-chips="period"]', title: 'Pilih periode', body: 'Lihat angka hari ini, kemarin, 7 hari, atau bulan ini.' },
    { sel: '#kpi', title: 'Omzet sampai laba bersih', body: 'Omzet penjualan, omzet sudah terbayar (lunas), profit kotor, rugi hilang/rusak, dan laba bersih setelah gaji & operasional.' },
    { sel: '#fraud', title: 'Indikasi kecurangan', body: 'Kejadian yang tidak sesuai alur scan, lengkap dengan bukti, pegawai terkait, dan nilainya.' },
    { sel: '#moving', title: 'Fast & slow moving', body: 'Barang paling laku dan barang yang lambat / tidak laku, berdasarkan jumlah transaksi atau omzet. Kriterianya bisa diatur lewat tombol Atur kriteria.' },
    { sel: '#flow', title: 'Kepatuhan alur scan', body: 'Persentase langkah yang dijalankan dengan benar. Angka rendah = ada langkah yang sering dilewati.' }
  ],
  async render(el, ctx) {
    if (store.role !== 'owner') return staffDash.render(el, ctx);
    let period = sessionStorage.getItem('dash-period') || 'today';
    let compare = sessionStorage.getItem('dash-compare') === '1';
    el.innerHTML = `<div class="stack" style="gap:16px">
      <section class="dash-hero" id="hero">
      <div class="dh-top">${greet()}<button class="dh-eye" data-eye></button></div>
      <div class="row between wrap"><div class="muted small" id="rlabel">${esc(longToday())}</div>
        ${chips('period', PERIODS, period).replace(/<\/div>$/, `<label class="cmp-toggle" title="Bandingkan dengan periode sebelumnya"><span class="switch" style="display:inline-block"><input type="checkbox" id="cmp" ${compare ? 'checked' : ''}><span></span></span><b>Bandingkan</b></label></div>`)}</div>
      <form class="card row wrap ${period === 'custom' ? '' : 'hidden'}" id="custom"><label class="field" style="flex:1 1 140px">Dari tanggal<input type="date" class="input" id="cf" value="${custom ? custom[0] : addDays(todayStr(), -6)}" max="${todayStr()}"></label>
        <label class="field" style="flex:1 1 140px">Sampai tanggal<input type="date" class="input" id="ct" value="${custom ? custom[1] : todayStr()}" max="${todayStr()}"></label>
        <button class="btn btn-primary" style="align-self:flex-end">Terapkan</button></form>
      <div id="kpi"></div>
      </section>
      <section class="card flush danger" id="fraud"></section>
      <section class="card sc-card" id="shortcuts"></section>
      <section class="card flush" id="moving"></section>
      <div class="grid gauto-lg">
        <section class="card" id="breakdown"></section>
        <section class="card" id="chart"></section>
      </div>
      <div class="grid gauto-lg">
        <section class="card" id="flow"></section>
        <section class="card" id="files"></section>
      </div>
    </div>`;
    on(el, 'click', '[data-chips="period"] .chip', (e, b) => {
      period = b.dataset.v; sessionStorage.setItem('dash-period', period);
      el.querySelectorAll('[data-chips="period"] .chip').forEach((c) => c.classList.toggle('on', c === b));
      el.querySelector('#custom').classList.toggle('hidden', period !== 'custom');
      if (period === 'custom' && !custom) return;
      load(); loadChart();
    });
    el.querySelector('#custom').addEventListener('submit', (e) => {
      e.preventDefault();
      let a = el.querySelector('#cf').value, b = el.querySelector('#ct').value;
      if (!a || !b) return;
      if (a > b) [a, b] = [b, a];
      custom = [a, b]; try { sessionStorage.setItem('dash-range', JSON.stringify(custom)); } catch (_) {}
      load(); loadChart();
    });
    el.querySelector('#cmp').addEventListener('change', (e) => { compare = e.target.checked; sessionStorage.setItem('dash-compare', compare ? '1' : '0'); load(); loadChart(); });
    rpc('run_checks').catch(() => {});

    const load = async () => {
      const [from, to] = range(period);
      el.querySelector('#rlabel').textContent = from === to ? fmtDate(from, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : `${fmtDate(from)} – ${fmtDate(to)}`;
      el.querySelector('#kpi').innerHTML = '<div class="skeleton" style="height:110px"></div>';
      try {
        const [pf, pt] = prevRange(period, from, to);
        const [s, ps] = await Promise.all([rpc('get_summary', { p_from: from, p_to: to }), compare ? rpc('get_summary', { p_from: pf, p_to: pt }) : null]);
        const D = (k, goodUp = true) => (ps ? delta(s[k], ps[k], goodUp) + `<div class="dl-prev">sebelumnya ${rp(ps[k])}</div>` : '');
        if (ps) el.querySelector('#rlabel').innerHTML = esc(el.querySelector('#rlabel').textContent) + ` <span class="cmp-lbl">dibandingkan ${esc(prevLabel(period, pf, pt))}</span>`;
        el.querySelector('#kpi').innerHTML = `<div class="grid gkpi">
          <div class="card kpi"><div class="label">Omzet penjualan</div><div class="value">${rp(s.omzet)}</div>${D('omzet')}<div class="sub">${s.resi} resi${ps ? ' (sebelumnya ' + ps.resi + ')' : ''} · ${s.proses} masih diproses</div></div>
          <div class="card kpi"><div class="label">Omzet terbayar (lunas)</div><div class="value pos">${rp(s.omzet_lunas)}</div>${D('omzet_lunas')}<div class="sub">belum cair ${rp(s.belum_cair)}</div></div>
          <div class="card kpi"><div class="label">Profit kotor</div><div class="value">${rp(s.profit_kotor)}</div>${D('profit_kotor')}<div class="sub">dana Shopee − modal WIN</div></div>
          <div class="card kpi" style="border:1.5px solid var(--red)"><div class="label">Rugi hilang &amp; rusak</div><div class="value neg">${rp(s.rugi)}</div>${D('rugi', false)}<div class="sub">opname, retur rusak, ongkir retur</div></div>
          <div class="card kpi dark wide-m"><div class="label">Laba bersih</div><div class="value">${rp(s.laba_bersih)}</div>${D('laba_bersih')}<div class="sub" style="color:#9FD6B8">setelah gaji &amp; operasional</div></div>
        </div>`;
        const ln = (label, cur, prev, cls = '', goodUp = true) => `<div class="line-row ${cls}"><span>${label}</span><span class="lr-v">${ps ? `<span class="prev">${rp(prev)}</span>` : ''}<span>${rp(cur)}</span>${ps ? delta(cur, prev, goodUp) : ''}</span></div>`;
        const f = (o) => o && { omzet: o.omzet, pot: -(o.omzet - o.dana_shopee), modal: -o.modal, pk: o.profit_kotor, pack: -o.packing, rugi: -o.rugi, gaji: -o.gaji, op: -o.operasional, lb: o.laba_bersih };
        const a = f(s), b = f(ps) || {};
        el.querySelector('#breakdown').innerHTML = `<div class="row between">${secH('wallet', 'Dari omzet ke laba bersih', 'navy')}${ps ? '<span class="xs muted">sebelumnya · sekarang</span>' : ''}</div>
          ${ln('Omzet penjualan', a.omzet, b.omzet)}
          ${ln('Potongan Shopee (selisih ke dana cair / estimasi)', a.pot, b.pot)}
          ${ln('Modal barang (WIN)', a.modal, b.modal)}
          ${ln('Profit kotor', a.pk, b.pk, 'total')}
          ${ln('Bahan packing', a.pack, b.pack)}
          ${ln('Rugi hilang, rusak &amp; retur', a.rugi, b.rugi, 'neg-l')}
          ${ln(modOn('gaji') ? 'Gaji pegawai (porsi periode ini)' : 'Gaji pegawai <span class="tag">menu Penggajian terkunci</span>', a.gaji, b.gaji)}
          ${ln('Operasional', a.op, b.op)}
          ${ln('Laba bersih', a.lb, b.lb, 'total lb')}`;
        const k = s.kepatuhan || {};
        const bar = (label, v) => `<div style="margin-bottom:12px"><div class="line-row"><span>${label}</span><b>${pct(v)}</b></div>
          <div class="progress"><div style="width:${v ?? 0}%;background:${v == null ? 'var(--line)' : v >= 95 ? 'var(--green)' : v >= 80 ? 'var(--accent)' : 'var(--red)'}"></div></div></div>`;
        el.querySelector('#flow').innerHTML = `${secH('check', 'Kepatuhan alur scan', 'green')}
          ${bar('Packing scan resi + barang', k.packing_scan)}${bar('Barang WIN diterima lengkap', k.terima_lengkap)}
          ${bar('Retur di-scan kembali', k.retur_scan)}${bar('Foto paket diambil', k.foto_paket)}
`;
      } catch (e) { toastErr(e); el.querySelector('#kpi').innerHTML = '<div class="alert red">Gagal memuat ringkasan.</div>'; }
    };

    const loadFraud = async () => {
      const box = el.querySelector('#fraud');
      const { data, error } = await supa.from('anomalies').select('*').eq('resolved', false).order('created_at', { ascending: false }).limit(8);
      if (error) return toastErr(error);
      const total = (data || []).reduce((a, b) => a + Number(b.value || 0), 0);
      const cnt = (l) => data.filter((d) => d.level === l).length;
      box.innerHTML = `<div class="card-h" style="background:#F9E8E4;flex-wrap:wrap">
          <div class="row">${icon('shield', 24)}<div><h2 class="sec-title" style="color:#6E2418">Indikasi kecurangan &amp; masalah</h2><div class="small" style="color:#6E2418">Belum ditangani · nilai berisiko <b>${rp(total)}</b></div></div></div>
          <div class="row"><span class="tag solid-red">${cnt('tinggi')} tinggi</span><span class="tag solid-yellow">${cnt('sedang')} sedang</span><span class="tag">${cnt('info')} info</span></div></div>
        ${data.length ? `<div class="table-wrap"><table class="tbl" style="min-width:760px"><thead><tr><th>Tingkat</th><th>Kejadian</th><th>Bukti dari sistem</th><th>Terkait</th><th class="right">Nilai</th><th></th></tr></thead><tbody>
          ${data.map((a) => `<tr><td><span class="tag ${LV[a.level][1]}">${LV[a.level][0]}</span></td><td><b>${esc(a.title)}</b><div class="xs muted">${ago(a.created_at)}</div></td>
            <td class="small muted">${esc(a.evidence || '')}</td><td class="nowrap small">${esc(store.profilesById[a.related_user]?.full_name || '–')}</td>
            <td class="num"><b>${rp(a.value)}</b></td><td class="right"><a href="#/masalah?id=${a.id}" class="btn btn-sm btn-see nowrap">Lihat ${icon('chev', 14, 2.6)}</a></td></tr>`).join('')}
          </tbody></table></div><a href="#/masalah" class="btn btn-ghost btn-block" style="border-top:1px solid var(--line);border-radius:0">Lihat semua</a>`
          : '<div class="empty">Tidak ada masalah yang belum ditangani. 👍</div>'}`;
    };

    const loadChart = async () => {
      const box = el.querySelector('#chart');
      try {
        let [from, to] = range(period);
        if (from === to) from = addDays(to, -13);
        if ((new Date(to) - new Date(from)) / 864e5 > 61) from = addDays(to, -61);
        const n = days(from, to);
        const [rows, prev] = await Promise.all([rpc('range_series', { p_from: from, p_to: to }),
          compare ? rpc('range_series', { p_from: addDays(from, -n), p_to: addDays(from, -1) }) : null]);
        const all = [...rows, ...(prev || [])].map((r) => Math.abs(Number(r.laba_bersih)));
        const max = Math.max(1, ...all);
        const sum = (l) => l.reduce((a, r) => a + Number(r.laba_bersih || 0), 0);
        box.innerHTML = `${secH('chart', 'Laba bersih per hari', 'blue', fmtDate(from, { day: 'numeric', month: 'short' }) + ' – ' + fmtDate(to, { day: 'numeric', month: 'short' }))}
          <div class="muted xs" style="margin-bottom:10px">${prev ? `<span class="lg-prev"></span> abu muda = ${n} hari sebelumnya (${fmtDate(addDays(from, -n), { day: 'numeric', month: 'short' })} – ${fmtDate(addDays(from, -1), { day: 'numeric', month: 'short' })}) · total ${rp(sum(rows))} vs ${rp(sum(prev))}` : ''}</div>
          <div class="bars ${prev ? 'cmp' : ''}">${rows.map((r, i) => {
            const pv = prev && prev[i];
            return `<div class="b" title="${fmtDate(r.d)}: ${rp(r.laba_bersih)}${pv ? ' · sebelumnya ' + fmtDate(pv.d) + ': ' + rp(pv.laba_bersih) : ''}"><div class="bb">${pv ? `<i class="pv ${Number(pv.laba_bersih) < 0 ? 'neg' : ''}" style="height:${Math.max(2, Math.abs(Number(pv.laba_bersih)) / max * 100)}%"></i>` : ''}<i class="${i === rows.length - 1 ? 'today' : ''} ${Number(r.laba_bersih) < 0 ? 'neg' : ''}" style="height:${Math.max(2, Math.abs(Number(r.laba_bersih)) / max * 100)}%"></i></div><span>${String(r.d).slice(8)}</span></div>`;
          }).join('')}</div>`;
      } catch (e) { console.error(e); box.innerHTML = '<div class="muted">Grafik gagal dimuat.</div>'; }
    };

    const loadFiles = async () => {
      const box = el.querySelector('#files');
      const { data } = await supa.from('uploads').select('type, created_at, user_id').order('created_at', { ascending: false }).limit(60);
      const last = {};
      (data || []).forEach((u) => { if (!last[u.type]) last[u.type] = u; });
      const row = (t, l, warnDays) => {
        const u = last[t];
        if (!u) return `<div class="line-row"><span>${l}</span><span class="neg">belum pernah</span></div>`;
        const days = Math.floor((Date.now() - new Date(u.created_at)) / 864e5);
        const cls = days >= warnDays ? 'neg' : days >= 1 ? 'warn-t' : 'pos';
        return `<div class="line-row"><span>${l}</span><span class="${cls}">${days === 0 ? 'hari ini' : days + ' hari lalu'} · ${esc(store.profilesById[u.user_id]?.full_name || '')}</span></div>`;
      };
      box.innerHTML = `${secH('file', 'Status file Shopee', 'yellow')}
        ${row('pesanan', 'Pesanan', 2)}${row('pembatalan', 'Pembatalan', 3)}${row('pengembalian', 'Pengembalian / retur', 4)}${row('penghasilan', 'Penghasilan (dana cair)', 5)}${row('pricelist', 'Pricelist WIN', 30)}
        <a href="#/upload" class="btn btn-primary" style="margin-top:14px">Buka upload file Shopee</a>`;
    };

    // ---------- fast & slow moving ----------
    let basis = (() => { try { return localStorage.getItem('mv-basis') || 'trx'; } catch (_) { return 'trx'; } })();
    let mv = null;
    const metric = (r) => basis === 'trx' ? `<b>${num(r.trx)}</b> trx` : `<b>${rp(r.omzet)}</b>`;
    const sub = (r) => basis === 'trx' ? rp(r.omzet) : `${num(r.trx)} trx`;
    const lastSold = (r) => r.last_sold ? 'terakhir laku ' + ago(r.last_sold) : 'belum pernah laku';
    const crit = (k) => {
      const c = mv.cfg[k];
      const op = k === 'fast' ? '≥' : '≤';
      return basis === 'trx' ? `${op} ${num(c.trx)} transaksi dalam ${c.days} hari terakhir` : `omzet ${op} ${rp(c.omzet)} dalam ${c.days} hari terakhir`;
    };
    // baris barang: peringkat (emas/perak/perunggu), nama, info, angka + bar perbandingan
    const val = (r) => Number(basis === 'trx' ? r.trx : r.omzet) || 0;
    const fastRow = (r, i, max) => `<div class="mv-row"><span class="mv-rank r${Math.min(i + 1, 4)}">${i + 1}</span>
      <div class="grow" style="min-width:0"><div class="mv-line"><b class="mv-name">${esc(r.name)}</b><span class="mv-val">${metric(r)}</span></div>
        <div class="mv-bar"><i style="width:${Math.max(4, val(r) / (max || 1) * 100)}%"></i></div>
        <div class="mv-meta"><span>${num(r.qty)} pcs terjual</span><span class="mv-chip">stok ${num(r.stock)}</span>${r.rack_code ? `<span class="mv-chip">rak ${esc(r.rack_code)}</span>` : ''}</div></div></div>`;
    const slowRow = (r) => `<div class="mv-row"><span class="mv-rank slow">${icon(r.last_sold ? 'clock' : 'alert', 14, 2.4)}</span>
      <div class="grow" style="min-width:0"><div class="mv-line"><b class="mv-name">${esc(r.name)}</b><span class="mv-val neg">${rp(r.nilai_stok)}</span></div>
        <div class="mv-meta"><span class="${r.last_sold ? '' : 'mv-never'}">${esc(lastSold(r))}</span><span class="mv-chip">stok ${num(r.stock)}</span>${r.rack_code ? `<span class="mv-chip">rak ${esc(r.rack_code)}</span>` : ''}</div></div></div>`;
    const loadMoving = async () => {
      const box = el.querySelector('#moving');
      if (!mv) box.innerHTML = '<div class="skeleton" style="height:180px;margin:16px"></div>';
      try { mv = await rpc('moving_report', { p_basis: basis }); }
      catch (e) { box.innerHTML = `<div class="alert yellow" style="margin:16px">Laporan fast &amp; slow moving belum aktif. Jalankan <b>supabase/update-1.11.sql</b> di Supabase › SQL Editor.</div>`; return; }
      const k = mv.count || {}, fmax = mv.fast.length ? val(mv.fast[0]) : 1;
      box.innerHTML = `<div class="card-h mv-head">${secH('chart', 'Fast &amp; slow moving', 'navy', null, true)}
          <div class="row wrap mv-tools"><div class="seg" data-chips="basis">${[['trx', 'Transaksi'], ['omzet', 'Omzet']].map(([v, l]) => `<button class="chip ${v === basis ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
            <button class="btn btn-sm" id="mv-set">${icon('gear', 16)} Kriteria</button></div></div>
        <div class="mv-grid">
          <div class="mv-col fast"><div class="mv-title">${icon('chart', 20, 2.2)}<div class="grow"><b>Fast moving</b><div class="xs">${esc(crit('fast'))}</div></div><span class="mv-count">${num(k.fast)}</span></div>
            ${mv.fast.length ? `<div class="mv-list">${mv.fast.slice(0, 10).map((r, i) => fastRow(r, i, fmax)).join('')}</div>` : `<div class="empty small">Belum ada barang fast moving.</div>`}
            ${mv.fast.length > 10 ? `<button class="btn btn-ghost btn-block mv-more" data-all="fast">Lihat semua ${num(mv.fast.length)} barang ${icon('chev', 15)}</button>` : ''}</div>
          <div class="mv-col slow"><div class="mv-title">${icon('clock', 20, 2.2)}<div class="grow"><b>Slow moving</b><div class="xs">${esc(crit('slow'))}</div></div><span class="mv-count">${num(k.slow)}</span></div>
            ${k.slow ? `<div class="mv-kpi"><div><span>Stok tertahan</span><b>${rp(k.slow_nilai)}</b></div><div><span>Tidak laku sama sekali</span><b>${num(k.slow_tidak_laku)} barang</b></div></div>` : ''}
            ${mv.slow.length ? `<div class="mv-list">${mv.slow.slice(0, 10).map(slowRow).join('')}</div>` : `<div class="empty small">Tidak ada barang slow moving. 👍</div>`}
            ${mv.slow.length > 10 ? `<button class="btn btn-ghost btn-block mv-more" data-all="slow">Lihat semua ${num(mv.slow.length)} barang ${icon('chev', 15)}</button>` : ''}</div>
        </div>`;
    };
    on(el, 'click', '[data-chips="basis"] .chip', (e, b) => { basis = b.dataset.v; try { localStorage.setItem('mv-basis', basis); } catch (_) {} loadMoving(); });
    on(el, 'click', '#mv-set', async () => {
      const c = mv?.cfg || { fast: { days: 30, trx: 10, omzet: 1000000 }, slow: { days: 60, trx: 2, omzet: 100000 } };
      const r = await modal({
        title: 'Atur kriteria fast & slow moving',
        body: `<div class="stack">
          <div class="card outline stack s8"><b style="color:var(--green)">Fast moving (barang laris)</b>
            <label class="field">Dihitung dalam berapa hari terakhir<input class="input num" id="fd" inputmode="numeric" value="${c.fast.days}"></label>
            <div class="grid g2"><label class="field">Minimal jumlah transaksi<input class="input num" id="ft" inputmode="numeric" value="${num(c.fast.trx)}"></label>
            <label class="field">Minimal omzet (Rp)<input class="input num" id="fo" inputmode="numeric" data-money value="${num(c.fast.omzet)}"></label></div></div>
          <div class="card outline stack s8"><b style="color:var(--red)">Slow moving (barang lambat / tidak laku)</b>
            <label class="field">Dihitung dalam berapa hari terakhir<input class="input num" id="sd" inputmode="numeric" value="${c.slow.days}"></label>
            <div class="grid g2"><label class="field">Maksimal jumlah transaksi<input class="input num" id="st" inputmode="numeric" value="${num(c.slow.trx)}"></label>
            <label class="field">Maksimal omzet (Rp)<input class="input num" id="so" inputmode="numeric" data-money value="${num(c.slow.omzet)}"></label></div></div>
          <div class="small muted">1 transaksi = 1 resi / pesanan yang berisi barang itu (pesanan cancel &amp; retur tidak dihitung). Pilihan "Berdasarkan transaksi" memakai batas transaksi, "Berdasarkan omzet" memakai batas omzet.</div></div>`,
        actions: [{ label: 'Batal', value: null }, { label: 'Simpan kriteria', cls: 'btn-primary', onClick: (ov) => {
          const v = (id) => Math.max(0, Math.round(parseNum(ov.querySelector('#' + id).value) || 0));
          const m = { fast: { days: Math.max(1, v('fd')), trx: v('ft'), omzet: v('fo') }, slow: { days: Math.max(1, v('sd')), trx: v('st'), omzet: v('so') } };
          if (m.fast.days > 365 || m.slow.days > 365) { toast('Maksimal 365 hari', 'err'); return false; }
          return m;
        } }]
      });
      if (!r) return;
      const { error } = await supa.from('settings').update({ moving: r, updated_at: new Date().toISOString() }).eq('id', 1);
      if (error) return toastErr(error);
      store.settings.moving = r; toast('Kriteria tersimpan', 'ok'); loadMoving();
    });
    on(el, 'click', '[data-all]', (e, b) => {
      const k = b.dataset.all, list = mv[k];
      const title = (k === 'fast' ? 'Fast moving' : 'Slow moving') + ' · ' + (basis === 'trx' ? 'berdasarkan transaksi' : 'berdasarkan omzet');
      modal({ title, wide: true, body: `<div class="small muted" style="margin-bottom:8px">${esc(crit(k))}</div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Barang</th><th>Rak</th><th class="right">Transaksi</th><th class="right">Qty</th><th class="right">Omzet</th><th class="right">Stok</th>${k === 'slow' ? '<th class="right">Nilai stok</th>' : ''}<th>Terakhir laku</th></tr></thead><tbody>
        ${list.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.name)}</b><div class="xs muted mono">${esc(r.sku)}</div></td><td class="mono">${esc(r.rack_code || '–')}</td><td class="num">${num(r.trx)}</td><td class="num">${num(r.qty)}</td><td class="num">${rp(r.omzet)}</td><td class="num">${num(r.stock)}</td>${k === 'slow' ? `<td class="num">${rp(r.nilai_stok)}</td>` : ''}<td class="small">${r.last_sold ? fmtDate(r.last_sold) : 'belum pernah'}</td></tr>`).join('')}
        </tbody></table></div>`,
        actions: [{ label: 'Unduh Excel', value: 'xl' }, { label: 'Tutup', cls: 'btn-primary', value: null }] })
        .then((v) => { if (v === 'xl') downloadXlsx(`${k === 'fast' ? 'fast' : 'slow'}-moving-${basis}-${todayStr()}.xlsx`, list.map((r, i) => ({ No: i + 1, Kode: r.sku, Barang: r.name, Rak: r.rack_code || '', Transaksi: r.trx, Qty: r.qty, Omzet: Number(r.omzet), Stok: r.stock, ...(k === 'slow' ? { 'Nilai stok': Number(r.nilai_stok) } : {}), 'Terakhir laku': r.last_sold ? fmtDate(r.last_sold) : 'belum pernah' })), title.slice(0, 30)); });
    });

    amtToggle(el.querySelector('#hero')); heroFit(el.querySelector('#hero'), '#kpi', 64); renderShortcuts(el.querySelector('#shortcuts'));
    load(); loadFraud(); loadChart(); loadFiles(); loadMoving();
  }
};
