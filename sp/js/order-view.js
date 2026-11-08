import { esc, rp, num, fmtDateTime, statusTag, photoUrl, icon, todayStr } from './ui.js';

// Ringkasan 1 pesanan sebagai bukti: isi paket, foto packing, siapa & kapan packing, hasil QC.
// Dipakai menu Komplain (bukti banding ke marketplace) dan Cek QC.
export async function orderEvidence(o, { garansi = false } = {}) {
  if (!o) return '<div class="alert yellow small">Resi / no. pesanan tidak ditemukan di aplikasi. Komplain tetap bisa dicatat.</div>';
  const photo = o.pack_photo ? await photoUrl(o.pack_photo) : null;
  const qcPhotos = await Promise.all((o.qc || []).map((q) => (q.photo ? photoUrl(q.photo) : null)));
  const age = o.order_date ? Math.floor((Date.parse(todayStr()) - Date.parse(String(o.order_date).slice(0, 10))) / 864e5) : null;
  const gHari = Number(o.garansi_hari || 0);
  return `<div class="ev">
    <div class="ev-h"><div class="grow"><b class="mono">${esc(o.resi || '–')}</b> ${statusTag(o.status)}<div class="xs muted">No. pesanan ${esc(o.order_no)}${o.store ? ' · ' + esc(o.store) : ''} · ${esc(fmtDateTime(o.order_date))}</div></div><b>${rp(o.total_jual)}</b></div>
    ${garansi && gHari ? `<div class="alert small ${age != null && age <= gHari ? 'green' : 'yellow'}">${age != null && age <= gHari ? `Masih dalam masa garansi (${age} dari ${gHari} hari)` : `Lewat masa garansi ${gHari} hari (pesanan ${age} hari lalu)`}</div>` : ''}
    <div class="ev-items">${(o.items || []).map((i) => `<div class="line-row"><span><b>${num(i.qty)}×</b> ${esc(i.name)} <span class="xs muted mono">${esc(i.sku || '')}</span></span><span class="num">${rp(i.price)}</span></div>`).join('') || '<div class="xs muted">Belum ada barang tercatat.</div>'}</div>
    <div class="ev-pack">${photo ? `<a href="${esc(photo)}" target="_blank" rel="noopener"><img src="${esc(photo)}" alt="Foto packing"></a>` : `<div class="ev-nophoto">${icon('camera', 22)}<span class="xs">Tidak ada foto packing</span></div>`}
      <div class="small">${o.packed_at ? `Dipacking <b>${esc(o.packed_by || '–')}</b><br>${esc(fmtDateTime(o.packed_at))}` : 'Belum dipacking lewat aplikasi'}${o.pack_override ? `<br><span class="tag yellow">Lewati scan: ${esc(o.pack_override)}</span>` : ''}${o.recorded_by ? `<br><span class="xs muted">Dicatat ${esc(o.recorded_by)}</span>` : ''}</div></div>
    ${(o.qc || []).length ? `<div class="ev-qc">${o.qc.map((q, i) => `<div class="line-row"><span><span class="tag ${q.result === 'lolos' ? 'green' : 'red'}">QC ${esc(q.result)}</span> ${esc(q.by || '')} · ${esc(fmtDateTime(q.at))}${q.note ? `<div class="xs">${esc(q.note)}</div>` : ''}</span>${qcPhotos[i] ? `<a href="${esc(qcPhotos[i])}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost">${icon('camera', 15)} Foto</a>` : ''}</div>`).join('')}</div>` : ''}
  </div>`;
}
