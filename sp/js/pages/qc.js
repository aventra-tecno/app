import { supa, rpc } from '../supa.js';
import { store, nameOf } from '../store.js';
import { esc, fmtDateTime, beep, icon, emptyState, toast, toastErr, photoField, bindPhoto, todayStr } from '../ui.js';
import { scanBox, bindScan } from '../scanner.js';
import { orderEvidence } from '../order-view.js';

// QC / pemeriksa: scan resi paket yang sudah dipacking, cocokkan isi, tandai lolos / gagal (+ foto).
export default {
  tour: [
    { sel: '#scan', title: 'Scan resi paket', body: 'Scan resi paket yang sudah dipacking. Isi pesanan dan foto packing langsung muncul.' },
    { sel: '#res', title: 'Lolos / gagal', body: 'Cocokkan isi paket. Gagal QC wajib diberi alasan; owner dan pegawai packing langsung mendapat notifikasi.' },
    { sel: '#hist', title: 'Riwayat hari ini', body: 'Paket yang sudah kamu periksa hari ini.' }
  ],
  async render(el) {
    el.innerHTML = `<div class="stack">
      <div class="alert blue small">Periksa paket sebelum diserahkan ke kurir: barang, jumlah, kondisi, dan label. Hasil QC tercatat dan dipakai di menu Kinerja pegawai serta bukti komplain.</div>
      <div class="card stack" id="scan">${scanBox('qs', 'Scan / ketik resi paket')}</div>
      <div id="res"></div>
      <section class="card flush" id="hist"><div class="card-h"><h2>QC hari ini</h2><b id="hc"></b></div><div id="hl"></div></section></div>`;
    const hist = async () => {
      const { data } = await supa.from('qc_checks').select('id, result, note, created_at, checked_by, order_id, orders(resi, order_no)').gte('created_at', todayStr() + 'T00:00:00+07:00').order('created_at', { ascending: false }).limit(200);
      const list = (data || []).filter((q) => store.role === 'owner' || q.checked_by === store.profile.id);
      el.querySelector('#hc').textContent = `${list.filter((q) => q.result === 'lolos').length} lolos · ${list.filter((q) => q.result === 'gagal').length} gagal`;
      el.querySelector('#hl').innerHTML = list.length ? `<div class="list">${list.map((q) => `<div class="list-item"><span style="color:${q.result === 'lolos' ? 'var(--green)' : 'var(--red)'}">${icon(q.result === 'lolos' ? 'check' : 'x', 18, 3)}</span>
        <div class="grow"><b class="mono">${esc(q.orders?.resi || q.orders?.order_no || '')}</b>${q.note ? `<div class="xs">${esc(q.note)}</div>` : ''}</div><span class="xs muted">${esc(fmtDateTime(q.created_at))}${store.role === 'owner' ? '<br>' + esc(nameOf(q.checked_by)) : ''}</span></div>`).join('')}</div>` : emptyState('Belum ada paket diperiksa hari ini.', 'check');
    };
    const box = el.querySelector('#res');
    bindScan(el, 'qs', async (code) => {
      let o;
      try { o = await rpc('order_lookup', { p_code: code }); } catch (e) { beep(false); box.innerHTML = `<div class="alert red">${esc(e.message || e)}</div>`; return { ok: false, title: 'Gagal' }; }
      if (!o) { beep(false); box.innerHTML = `<div class="alert red">Resi <b class="mono">${esc(code)}</b> tidak ditemukan.</div>`; return { ok: false, title: 'Resi tidak ditemukan', info: code }; }
      beep(true);
      const warn = !o.packed_at ? '<div class="alert yellow small">Paket ini belum tercatat dipacking di aplikasi.</div>' : (o.qc || []).length ? `<div class="alert yellow small">Paket ini sudah pernah di-QC (${esc(o.qc[0].result)}). QC ulang tetap boleh.</div>` : '';
      box.innerHTML = `<div class="card stack outline">${warn}${await orderEvidence(o)}
        <label class="field">Catatan (wajib kalau gagal)<input class="input" id="qn" placeholder="mis. kurang 1 pcs, label resi salah, dus penyok"></label>
        ${photoField('qp', 'Foto paket (opsional)')}
        <div class="grid g2"><button class="btn btn-lg" data-r="gagal" style="border-color:var(--red);color:var(--red-ink)">${icon('x', 20, 2.6)} Gagal QC</button><button class="btn btn-lg btn-primary" data-r="lolos">${icon('check', 20, 2.6)} Lolos</button></div></div>`;
      const get = bindPhoto(box, 'qp', 'qc');
      box.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', async () => {
        const note = box.querySelector('#qn').value.trim();
        if (b.dataset.r === 'gagal' && !note) { toast('Tulis alasan gagal QC', 'err'); box.querySelector('#qn').focus(); return; }
        box.querySelectorAll('[data-r]').forEach((x) => { x.disabled = true; });
        try {
          await rpc('qc_submit', { p_order: o.id, p_result: b.dataset.r, p_note: note || null, p_photo: get() });
          toast(b.dataset.r === 'lolos' ? 'Lolos QC ✓' : 'Gagal QC dicatat, owner & packing diberi tahu', b.dataset.r === 'lolos' ? 'ok' : 'err');
          box.innerHTML = ''; hist();
          el.querySelector('#qs input, input#qs')?.focus();
        } catch (e) { toastErr(e); box.querySelectorAll('[data-r]').forEach((x) => { x.disabled = false; }); }
      }));
      return { ok: true, title: 'Resi ' + (o.resi || o.order_no), info: (o.items || []).map((i) => i.name + ' ×' + i.qty).join(', ') };
    });
    hist();
  }
};
