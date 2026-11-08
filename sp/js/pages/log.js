import { supa, rpc } from '../supa.js';
import { esc, todayStr, addDays, fmtDate, fmtTime, chips, on, debounce, icon, emptyState, skeleton, toastErr, downloadXlsx, ROLE_LABEL, ROLE_COLOR } from '../ui.js';

// Log aktivitas: semua yang dilakukan setiap jabatan (owner saja).
const ROLES = [['all', 'Semua jabatan'], ['owner', 'Owner'], ['admin', 'Admin'], ['sopir', 'Sopir'], ['kepala_gudang', 'Kepala Gudang'], ['picker', 'Picker'], ['packing', 'Packing'], ['sistem', 'Sistem'], ['superadmin', 'Super admin']];
const KINDS = [['', 'Semua jenis'], ['stok', 'Stok keluar-masuk'], ['pesanan', 'Pesanan'], ['harga', 'Harga'], ['barang', 'Master barang'], ['rak', 'Rak'], ['opname', 'Stok opname'], ['retur', 'Retur & cancel'], ['beli', 'Beli WIN'], ['upload', 'Upload file'], ['pegawai', 'Pegawai'], ['gaji', 'Gaji & biaya'], ['absen', 'Absen'], ['masalah', 'Masalah'], ['pengaturan', 'Pengaturan'], ['pengumuman', 'Pengumuman'], ['login', 'Masuk / keluar'], ['cek', 'Cek barcode'], ['halaman', 'Buka halaman']];
const KIND_LABEL = Object.fromEntries(KINDS);
const LIMIT = 1000;

export default {
  tour: [
    { sel: '#lf', title: 'Pilih tanggal & cari', body: 'Atur rentang tanggal, ketik nama pegawai / barang / resi untuk mencari.' },
    { sel: '[data-chips="role"]', title: 'Filter jabatan', body: 'Lihat aktivitas satu jabatan saja, misalnya hanya Picker.' },
    { sel: '#rows', title: 'Riwayat lengkap', body: 'Siapa, kapan, melakukan apa. Data yang diproses sekaligus (mis. upload file) digabung jadi satu baris "+N lainnya".' }
  ],
  async render(el, { params }) {
    const t = todayStr();
    const st = { from: params.from || t, to: params.to || t, role: params.role || 'all', kind: params.kind || '', q: '', pages: false };
    el.innerHTML = `<div class="stack">
      <form class="card stack" id="lf" autocomplete="off">
        <div class="grid g-log">
          <label class="field">Dari<input class="input" type="date" id="f" value="${st.from}" max="${t}"></label>
          <label class="field">Sampai<input class="input" type="date" id="to" value="${st.to}" max="${t}"></label>
          <label class="field">Jenis<select class="input" id="k">${KINDS.map(([v, l]) => `<option value="${v}" ${v === st.kind ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field">Cari<input class="input" id="q" type="search" placeholder="Nama, barang, resi, kode…"></label>
        </div>
        <div class="row wrap between">
          <div class="chips" id="quick"><button type="button" class="chip" data-q="0">Hari ini</button><button type="button" class="chip" data-q="1">Kemarin</button><button type="button" class="chip" data-q="7">7 hari</button><button type="button" class="chip" data-q="30">30 hari</button></div>
          <label class="check small"><input type="checkbox" id="pg"> Tampilkan "buka halaman"</label>
        </div>
        ${chips('role', ROLES, st.role)}
      </form>
      <div class="grid gkpi" id="sum"></div>
      <section class="card flush"><div class="card-h"><h2 id="ttl">Aktivitas</h2><button class="btn btn-sm" id="xl" type="button">${icon('download', 16)} Excel</button></div><div id="rows">${skeleton(5)}</div></section>
    </div>`;
    let data = [];
    const load = async () => {
      const box = el.querySelector('#rows');
      box.innerHTML = skeleton(5);
      let qy = supa.from('activity_log').select('*')
        .gte('at', st.from + 'T00:00:00+07:00').lt('at', addDays(st.to, 1) + 'T00:00:00+07:00')
        .order('at', { ascending: false }).order('id', { ascending: false }).limit(LIMIT);
      if (st.role === 'superadmin') qy = qy.eq('real_role', 'superadmin');
      else if (st.role === 'sistem') qy = qy.is('user_id', null);
      else if (st.role !== 'all') qy = qy.eq('role', st.role).or('real_role.is.null,real_role.neq.superadmin');
      if (st.kind) qy = qy.eq('kind', st.kind);
      else if (!st.pages) qy = qy.neq('kind', 'halaman');
      if (st.q) qy = qy.or(`summary.ilike.%${st.q}%,user_name.ilike.%${st.q}%,ref.ilike.%${st.q}%`);
      const { data: rows, error } = await qy;
      if (error) { box.innerHTML = `<div class="alert red" style="margin:12px">${esc(/activity_log/.test(error.message) ? 'Tabel log belum ada. Jalankan supabase/update-1.6.sql di Supabase › SQL Editor.' : error.message)}</div>`; return; }
      data = rows || [];
      el.querySelector('#ttl').textContent = `Aktivitas ${st.from === st.to ? fmtDate(st.from) : fmtDate(st.from) + ' – ' + fmtDate(st.to)}`;
      const by = {}; data.forEach((r) => { const k = r.real_role === 'superadmin' ? 'superadmin' : (r.user_id ? r.role : 'sistem'); by[k] = (by[k] || 0) + 1; });
      el.querySelector('#sum').innerHTML = [['Total catatan', data.length + (data.length >= LIMIT ? '+' : '')], ...Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => [ROLE_LABEL[k] || k, v])]
        .map(([l, v]) => `<div class="card kpi"><div class="label">${esc(l)}</div><div class="value">${esc(v)}</div></div>`).join('');
      let lastDay = '';
      box.innerHTML = data.length ? `${data.length >= LIMIT ? `<div class="alert yellow small" style="margin:12px">Menampilkan ${LIMIT} catatan terbaru. Persempit tanggal atau pakai pencarian untuk melihat yang lebih lama.</div>` : ''}<div class="list log-list">${data.map((r) => {
        const day = fmtDate(r.at, { weekday: 'long', day: 'numeric', month: 'long' });
        const sep = day !== lastDay && st.from !== st.to ? `<div class="log-day">${esc(day)}</div>` : ''; lastDay = day;
        const sa = r.real_role === 'superadmin';
        const roleKey = sa ? 'superadmin' : (r.user_id ? r.role : 'sistem');
        return `${sep}<div class="list-item log-row">
          <span class="log-time mono">${fmtTime(r.at)}</span>
          <span class="log-av" style="background:${ROLE_COLOR[roleKey] || '#6B6F6A'}">${esc((r.user_name || 'S').slice(0, 1).toUpperCase())}</span>
          <div class="grow" style="min-width:0">
            <div class="log-who"><b>${esc(r.user_name || 'Sistem')}</b> <span class="tag" style="background:${ROLE_COLOR[roleKey] || '#6B6F6A'}1A;color:${ROLE_COLOR[roleKey] || '#1A1D1B'}">${esc(sa ? 'Super admin · sebagai ' + (ROLE_LABEL[r.role] || r.role) : (ROLE_LABEL[roleKey] || roleKey))}</span> <span class="tag">${esc(KIND_LABEL[r.kind] || r.kind)}</span></div>
            <div class="log-sum">${esc(r.summary)}${r.cnt > 1 ? ` <b class="log-more">+${r.cnt - 1} lainnya</b>` : ''}</div>
          </div></div>`;
      }).join('')}</div>` : emptyState('Tidak ada aktivitas di filter ini.', 'clock');
    };
    const setRange = (from, to) => { st.from = from; st.to = to; el.querySelector('#f').value = from; el.querySelector('#to').value = to; load(); };
    el.querySelector('#f').addEventListener('change', (e) => { st.from = e.target.value || t; if (st.to < st.from) { st.to = st.from; el.querySelector('#to').value = st.to; } load(); });
    el.querySelector('#to').addEventListener('change', (e) => { st.to = e.target.value || t; if (st.to < st.from) { st.from = st.to; el.querySelector('#f').value = st.from; } load(); });
    el.querySelector('#k').addEventListener('change', (e) => { st.kind = e.target.value; load(); });
    el.querySelector('#pg').addEventListener('change', (e) => { st.pages = e.target.checked; load(); });
    el.querySelector('#q').addEventListener('input', debounce((e) => { st.q = e.target.value.trim().replace(/[,%()]/g, ''); load(); }, 350));
    el.querySelector('#lf').addEventListener('submit', (e) => e.preventDefault());
    on(el, 'click', '#quick [data-q]', (e, b) => { const n = +b.dataset.q; if (n === 0) setRange(t, t); else if (n === 1) setRange(addDays(t, -1), addDays(t, -1)); else setRange(addDays(t, -(n - 1)), t); });
    on(el, 'click', '[data-chips="role"] .chip', (e, b) => { st.role = b.dataset.v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); load(); });
    el.querySelector('#xl').addEventListener('click', () => downloadXlsx(`log-aktivitas-${st.from}_${st.to}.xlsx`, data.map((r) => ({
      Waktu: new Date(r.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }), Nama: r.user_name, Jabatan: r.real_role === 'superadmin' ? 'Super admin (sebagai ' + r.role + ')' : (ROLE_LABEL[r.role] || r.role),
      Jenis: KIND_LABEL[r.kind] || r.kind, Aktivitas: r.summary + (r.cnt > 1 ? ` (+${r.cnt - 1} lainnya)` : ''), Referensi: r.ref || ''
    })), 'Log'));
    rpc('activity_cleanup').catch(() => {});
    load();
  }
};
