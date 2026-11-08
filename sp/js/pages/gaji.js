import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { modOn, lockBox } from '../modules.js';
import { esc, rp, num, todayStr, monthStart, fmtDate, chips, on, modal, toast, toastErr, pageHead, emptyState, skeleton, icon, ROLE_LABEL, parseNum, confirmBox } from '../ui.js';

export default {
  tour: [
    { sel: '#gen', title: 'Hitung gaji', body: 'Gaji pokok dari data pegawai, uang makan = uang makan harian × hari hadir (dari absen).' },
    { sel: '#ptbl', title: 'Bonus & potongan', body: 'Isi bonus (mis. packing tanpa salah kirim) dan potongan (kasbon). Tandai sudah dibayar setelah transfer.' }
  ],
  async render(el) {
    let tab = modOn('gaji') ? 'gaji' : 'ops', period = monthStart();
    el.innerHTML = `${pageHead('Gaji & operasional', 'Gaji dan biaya operasional otomatis mengurangi laba bersih di dashboard.')}
      <div class="stack">${chips('t', [['gaji', (modOn('gaji') ? '' : '🔒 ') + 'Penggajian'], ['ops', 'Biaya operasional'], ['absen', (modOn('rekap_absen') ? '' : '🔒 ') + 'Rekap absen']], tab)}<div id="body"></div></div>`;
    const show = () => {
      if (tab === 'gaji' && !modOn('gaji')) { el.querySelector('#body').innerHTML = lockBox('gaji', 'Selama terkunci, gaji pegawai tidak dihitung dan tidak mengurangi laba bersih di dashboard.'); return; }
      if (tab === 'absen') { if (!modOn('rekap_absen')) { el.querySelector('#body').innerHTML = lockBox('rekap_absen'); return; } location.hash = '#/rekap-absen'; return; }
      ({ gaji, ops }[tab])();
    };
    on(el, 'click', '[data-chips="t"] .chip', (e, b) => { tab = b.dataset.v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); show(); });

    async function gaji() {
      const box = el.querySelector('#body');
      box.innerHTML = `<div class="stack"><div class="row wrap"><input type="month" class="input" id="per" value="${period.slice(0, 7)}" style="max-width:200px"><button class="btn btn-dark" id="gen">${icon('refresh', 18)} Hitung gaji bulan ini</button></div><div id="pbody">${skeleton()}</div></div>`;
      const load = async () => {
        const { data, error } = await supa.from('payroll').select('*, profiles(full_name, role)').eq('period', period).order('id');
        if (error) return toastErr(error);
        const pb = box.querySelector('#pbody');
        if (!data.length) { pb.innerHTML = `<div class="card">${emptyState('Belum dihitung. Tekan “Hitung gaji bulan ini”.', 'wallet')}</div>`; return; }
        const tot = data.reduce((a, r) => a + Number(r.total), 0);
        pb.innerHTML = `<div class="hero" style="margin-bottom:12px"><div class="label">Total gaji ${fmtDate(period, { month: 'long', year: 'numeric' })}</div><div class="big">${rp(tot)}</div><div class="small" style="color:#C9CCC8">≈ ${rp(tot / (store.settings.hari_kerja || 26))}/hari, otomatis dipotong dari laba harian</div></div>
          <div class="card flush" id="ptbl"><div class="table-wrap"><table class="tbl" style="min-width:820px"><thead><tr><th>Pegawai</th><th class="right">Gaji pokok</th><th class="right">Hadir</th><th class="right">Uang makan</th><th class="right">Bonus</th><th class="right">Potongan</th><th class="right">Diterima</th><th></th></tr></thead><tbody>
          ${data.map((r) => `<tr><td><b>${esc(r.profiles.full_name)}</b><div class="xs muted">${ROLE_LABEL[r.profiles.role]}</div></td><td class="num">${num(r.base)}</td><td class="num">${r.days} hr</td><td class="num">${num(r.meal)}</td>
            <td class="right"><input class="input sm num" style="width:96px" data-b="${r.id}" data-money inputmode="numeric" value="${num(r.bonus)}" ${r.paid ? 'disabled' : ''} aria-label="Bonus"></td>
            <td class="right"><input class="input sm num" style="width:96px" data-d="${r.id}" data-money inputmode="numeric" value="${num(r.deduction)}" ${r.paid ? 'disabled' : ''} aria-label="Potongan"></td>
            <td class="num"><b>${num(r.total)}</b></td>
            <td class="nowrap">${r.paid ? `<span class="tag green">Dibayar ${fmtDate(r.paid_at, { day: 'numeric', month: 'short' })}</span>` : `<button class="btn btn-sm btn-primary" data-pay="${r.id}">Tandai dibayar</button>`} <button class="btn btn-sm" data-slip="${r.id}">Slip</button></td></tr>`).join('')}
          </tbody></table></div></div>`;
        el._payroll = data;
      };
      box.querySelector('#per').addEventListener('change', (e) => { period = e.target.value + '-01'; load(); });
      box.querySelector('#gen').onclick = async () => {
        try { const n = await rpc('generate_payroll', { p_period: period }); toast(`Gaji ${n} pegawai dihitung dari absen`, 'ok'); load(); } catch (e) { toastErr(e); }
      };
      on(box, 'change', '[data-b],[data-d]', async (e, i) => {
        const id = +(i.dataset.b || i.dataset.d), col = i.dataset.b ? 'bonus' : 'deduction';
        const { error } = await supa.from('payroll').update({ [col]: parseNum(i.value) }).eq('id', id);
        if (error) return toastErr(error); load();
      });
      on(box, 'click', '[data-pay]', async (e, b) => {
        if (!(await confirmBox('Tandai sudah dibayar?', 'Setelah ditandai, angka gaji tidak bisa diubah lagi.'))) return;
        const { error } = await supa.from('payroll').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', b.dataset.pay);
        if (error) return toastErr(error); toast('Ditandai dibayar', 'ok'); load();
      });
      on(box, 'click', '[data-slip]', (e, b) => {
        const r = el._payroll.find((x) => x.id === +b.dataset.slip);
        const w = window.open('', '_blank'); if (!w) return toast('Izinkan pop-up untuk mencetak slip', 'err');
        w.document.write(`<!doctype html><html><head><title>Slip gaji ${esc(r.profiles.full_name)}</title><style>body{font-family:sans-serif;max-width:420px;margin:24px auto;color:#1A1D1B}h1{font-size:20px}td{padding:6px 0}td:last-child{text-align:right}table{width:100%;border-collapse:collapse}.t td{border-top:2px solid #1A1D1B;font-weight:700}</style></head><body>
          <h1>${esc(store.settings.nama_toko || 'Stok Gudang')} — Slip gaji</h1><p>${esc(r.profiles.full_name)} · ${ROLE_LABEL[r.profiles.role]}<br>Periode ${fmtDate(r.period, { month: 'long', year: 'numeric' })}</p>
          <table><tr><td>Gaji pokok</td><td>${rp(r.base)}</td></tr><tr><td>Uang makan (${r.days} hari)</td><td>${rp(r.meal)}</td></tr><tr><td>Bonus</td><td>${rp(r.bonus)}</td></tr><tr><td>Potongan</td><td>−${rp(r.deduction)}</td></tr><tr class="t"><td>Diterima</td><td>${rp(r.total)}</td></tr></table>
          <p style="margin-top:24px;font-size:13px">${r.paid ? 'Dibayar ' + fmtDate(r.paid_at) : 'Belum dibayar'}</p></body></html>`);
        w.document.close(); setTimeout(() => w.print(), 300);
      });
      load();
    }

    async function ops() {
      const box = el.querySelector('#body');
      box.innerHTML = `<div class="stack"><div class="card grid gauto">
          <label class="field">Tanggal<input type="date" class="input" id="ed" value="${todayStr()}"></label>
          <label class="field">Kategori<select class="input" id="ec"><option>Bensin & tol</option><option>Bahan packing</option><option>Listrik & internet</option><option>Sewa</option><option>Iklan</option><option>Operasional</option></select></label>
          <label class="field">Jumlah<input class="input num" id="ea" inputmode="numeric" data-money placeholder="0"></label>
          <label class="field">Catatan<input class="input" id="en"></label>
          <button class="btn btn-primary" id="eadd" style="align-self:end">${icon('plus', 18)} Tambah biaya</button></div>
        <div class="card flush" id="elist">${skeleton(2)}</div></div>`;
      const load = async () => {
        const { data } = await supa.from('expenses').select('*').gte('exp_date', monthStart()).order('exp_date', { ascending: false });
        const tot = (data || []).reduce((a, r) => a + Number(r.amount), 0);
        box.querySelector('#elist').innerHTML = `<div class="card-h"><h2>Biaya bulan ini</h2><b>${rp(tot)}</b></div>${data?.length ? `<div class="list">${data.map((r) => `<div class="list-item"><div class="grow"><b>${esc(r.category)}</b><div class="xs muted">${fmtDate(r.exp_date)}${r.note ? ' · ' + esc(r.note) : ''}</div></div><b>${rp(r.amount)}</b><button class="btn btn-sm btn-ghost" data-del="${r.id}" aria-label="Hapus">${icon('x', 16)}</button></div>`).join('')}</div>` : emptyState('Belum ada biaya bulan ini.', 'wallet')}`;
      };
      box.querySelector('#eadd').onclick = async () => {
        const amount = parseNum(box.querySelector('#ea').value);
        if (!amount) return toast('Isi jumlah', 'err');
        const { error } = await supa.from('expenses').insert({ exp_date: box.querySelector('#ed').value, category: box.querySelector('#ec').value, amount, note: box.querySelector('#en').value.trim() || null });
        if (error) return toastErr(error);
        box.querySelector('#ea').value = ''; box.querySelector('#en').value = ''; toast('Biaya ditambahkan', 'ok'); load();
      };
      on(box, 'click', '[data-del]', async (e, b) => { if (!(await confirmBox('Hapus biaya ini?', 'Laba bersih akan dihitung ulang.', 'Hapus', true))) return; await supa.from('expenses').delete().eq('id', b.dataset.del); load(); });
      load();
    }

    show();
  }
};
