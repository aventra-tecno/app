// 2.42 tampilan & simpan "Daftar Perubahan Pricelist WIN" (PDF) di menu Upload file.
import { rpc } from './supa.js';
import { esc, rp, num, toast, toastErr, icon, copyBtn, confirmBox } from './ui.js';
import { allProducts, pickProduct } from './daftar-file.js';

const ST = {
  harga: {
    siap: ['Siap diperbarui', 'green', 'Barang ketemu dan harga di master sama dengan harga lama → diganti harga baru.'],
    beda: ['Harga master beda dari harga lama', 'yellow', 'Barang ketemu, tapi harga di master bukan harga lama di PDF. Tetap diganti harga baru — cek sekilas.'],
    sudah: ['Sudah harga baru', 'gray', 'Harga di master sudah sama dengan harga baru. Dilewati.'],
    manual: ['Dipilih manual', 'blue', 'Barang dipilih sendiri → diganti harga baru.'],
    tidak: ['Tidak ketemu di master', 'red', 'Tekan Cari untuk memilih barangnya. Kalau tidak dipilih, dilewati.']
  },
  baru: {
    ada_beda: ['Sudah ada di master, harga beda', 'yellow', 'Nama sama persis dengan barang di master → harganya diganti harga di PDF.'],
    manual: ['Dipilih manual', 'blue', 'Barang dipilih sendiri → harganya diganti harga di PDF.'],
    ada_sama: ['Sudah ada di master', 'gray', 'Nama & harga sudah sama. Dilewati.'],
    belum: ['Belum ada di master barang', 'red', 'PDF ini tidak memuat part number untuk produk baru, jadi tidak bisa ditambahkan otomatis. Upload Pricelist WIN lengkap (Excel) bulan ini, atau tambahkan di Master barang. Kalau barangnya sudah ada dengan nama lain, tekan Cari.']
  },
  nama: {
    ganti: ['Akan diganti', 'green', 'Nama dan/atau part number di master diganti sesuai PDF. Part number lama tetap dikenali saat scan.'],
    sudah: ['Sudah sesuai', 'gray', 'Nama & part number di master sudah sama. Dilewati.'],
    tidak: ['Part number tidak ada di master', 'red', 'Barang dengan part number lama / baru ini belum ada di master barang. Dilewati.']
  }
};

export async function changePanel(box, raw, file) {
  box.innerHTML = '<div class="card"><div class="skeleton" style="height:120px"></div></div>';
  const { matchChanges } = await import('./pl-perubahan.js');
  const d = matchChanges(raw, await allProducts());
  const groups = (list, sec) => Object.keys(ST[sec]).map((k) => [k, list.filter((x) => x.st === k)]).filter(([, l]) => l.length);
  const priceRows = () => {
    const m = new Map();
    d.harga.filter((x) => x.p && ['siap', 'beda', 'manual'].includes(x.st)).forEach((x) => m.set(x.p.id, { p: x.p, mac: x.baru }));
    d.baru.filter((x) => x.p && ['ada_beda', 'manual'].includes(x.st)).forEach((x) => m.set(x.p.id, { p: x.p, mac: x.harga }));
    return [...m.values()];
  };
  const renames = () => d.nama.filter((x) => x.st === 'ganti');
  const paint = () => {
    const nP = priceRows().length, nR = renames().length;
    const row = (x, i, sec) => {
      const pick = ['tidak', 'belum', 'manual', 'beda'].includes(x.st) || (sec === 'harga' && x.st === 'siap' && x.sim < 100);
      const info = sec === 'harga' ? `<div class="small"><span class="muted">${rp(x.lama)}</span> → <b class="${x.baru > x.lama ? 'neg' : ''}">${rp(x.baru)}</b> <span class="tag ${x.baru > x.lama ? 'red' : 'green'}">${x.baru > x.lama ? 'naik' : 'turun'}</span></div>`
        : `<div class="small"><b>${rp(x.harga)}</b>${x.qty ? ` <span class="xs muted">· isi ${num(x.qty)} ${esc(x.sat || '')}</span>` : ''}${x.ket ? ` <span class="xs muted">· ${esc(x.ket)}</span>` : ''}</div>`;
      return `<div class="list-item fk-row" style="padding:8px 0;align-items:flex-start;flex-wrap:wrap">
        <div class="grow" style="min-width:0"><b class="small">${esc(x.name)}</b>
          ${x.p ? `<div class="xs" style="margin-top:2px">→ <span class="mono">${esc(x.p.sku)}</span>${copyBtn(x.p.sku)}${x.p.name.toUpperCase() !== x.name.toUpperCase() ? ' ' + esc(x.p.name) : ''} <span class="muted">· master ${rp(x.p.macallan)}</span></div>`
            : (x.cands || []).filter(Boolean).length ? `<div class="chips" style="margin-top:4px">${x.cands.filter(Boolean).map((p) => `<button class="chip" data-pc-pick="${sec}:${i}:${p.id}" title="${esc(p.name)}"><span class="mono">${esc(p.sku)}</span> ${esc(String(p.name).slice(0, 34))}</button>`).join('')}</div>` : ''}</div>
        <div class="right" style="min-width:150px">${info}${pick || !x.p ? `<button class="btn btn-sm ${x.p ? 'btn-ghost' : 'btn-see'}" data-pc-find="${sec}:${i}" style="margin-top:4px">${x.p ? 'Ganti' : 'Cari'}</button>` : ''}</div></div>`;
    };
    const secBox = (title, sec, list, open) => `<details class="win-po" ${open ? 'open' : ''}><summary><span class="grow"><b>${title}</b>
        <div class="row wrap" style="gap:4px;margin-top:4px">${groups(list, sec).map(([k, l]) => `<span class="tag ${ST[sec][k][1]}">${l.length} ${ST[sec][k][0].toLowerCase()}</span>`).join('')}</div></span><b>${num(list.length)}</b></summary>
      <div class="stack s8" style="padding:8px 0 4px">${groups(list, sec).map(([k, l]) => `<details class="fk-grp" ${['tidak', 'belum', 'beda'].includes(k) ? 'open' : ''}><summary><span class="tag ${ST[sec][k][1]}">${ST[sec][k][0]}</span> <b>${l.length}</b></summary>
        <div class="xs muted" style="margin:6px 0">${ST[sec][k][2]}</div>
        <div class="list no-page">${l.map((x) => sec === 'nama'
          ? `<div class="list-item fk-row" style="padding:8px 0;align-items:flex-start;flex-wrap:wrap"><div class="grow" style="min-width:0">
              <div class="xs muted">${x.kind === 'pn' ? 'Ganti part number' : 'Ganti nama'}</div>
              <div class="small"><span class="${x.gName ? 'muted' : ''}" style="${x.gName ? 'text-decoration:line-through' : ''}">${esc(x.p?.name || x.oldName)}</span>${x.gName ? `<br><b>${esc(x.newName)}</b>` : ''}</div></div>
              <div class="right mono xs" style="min-width:150px"><span style="${x.gPn ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(x.p?.sku || x.oldPn)}</span>${x.gPn ? `<br><b>${esc(x.newPn)}</b>` : ''}</div></div>`
          : row(x, d[sec].indexOf(x), sec)).join('')}</div></details>`).join('')}</div></details>`;
    box.innerHTML = `<div class="card stack">
      <div><h2 class="sec-title" style="margin:0">Daftar perubahan pricelist WIN</h2><div class="xs muted">${esc(file.name)} · dicocokkan dengan master barang lewat nama (harga lama dipakai untuk memastikan)</div></div>
      <div class="grid gauto">
        <div class="stat ${d.harga.length ? 'green' : 'gray'}"><b>${num(d.harga.length)}</b><span>perubahan harga</span></div>
        <div class="stat gray"><b>${num(d.baru.length)}</b><span>produk baru</span></div>
        <div class="stat gray"><b>${num(d.nama.length)}</b><span>ganti nama / part number</span></div>
        ${d.qty.length ? `<div class="stat gray"><b>${num(d.qty.length)}</b><span>perubahan isi dus (info)</span></div>` : ''}</div>
      ${d.harga.length ? secBox('Perubahan harga', 'harga', d.harga, true) : ''}
      ${d.baru.length ? secBox('Produk baru', 'baru', d.baru, false) : ''}
      ${d.nama.length ? secBox('Ganti nama & part number', 'nama', d.nama, false) : ''}
      ${d.qty.length ? `<details class="win-po"><summary><span class="grow"><b>Perubahan isi dus (hanya info)</b></span><b>${num(d.qty.length)}</b></summary><div class="list no-page">${d.qty.map((q) => `<div class="list-item" style="padding:6px 0"><span class="grow small">${esc(q.name)}</span><span class="small">${num(q.lama)} → <b>${num(q.baru)}</b> ${esc(q.sat || '')}</span></div>`).join('')}</div></details>` : ''}
      <div class="stack s8" style="border-top:1px solid var(--line);padding-top:12px">
        <label class="row" style="gap:8px"><input type="checkbox" class="check" id="pcP" ${nP ? 'checked' : 'disabled'}> Perbarui harga <b>${num(nP)}</b> barang <span class="xs muted">(harga beli & harga Shopee dihitung ulang seperti upload pricelist)</span></label>
        <label class="row" style="gap:8px"><input type="checkbox" class="check" id="pcR" ${nR ? 'checked' : 'disabled'}> Ganti nama / part number <b>${num(nR)}</b> barang</label>
        <div class="row wrap"><button class="btn btn-primary" id="pcSave" ${nP + nR ? '' : 'disabled'}>${icon('check', 16)} Simpan perubahan</button></div>
        <div id="pcRes"></div></div></div>`;
  };
  const setP = (sec, i, p) => { d[sec][i] = { ...d[sec][i], p, st: 'manual' }; paint(); };
  box.onclick = async (e) => {
    const b = e.target.closest('[data-pc-pick],[data-pc-find],#pcSave'); if (!b) return;
    if (b.dataset.pcPick) { const [sec, i, pid] = b.dataset.pcPick.split(':'); const p = d[sec][+i].cands.find((c) => c && c.id === +pid); if (p) setP(sec, +i, p); return; }
    if (b.dataset.pcFind) { const [sec, i] = b.dataset.pcFind.split(':'); const p = await pickProduct('Barang di master untuk baris ini', d[sec][+i].name); if (p) setP(sec, +i, p); return; }
    if (b.id === 'pcSave') {
      const doP = box.querySelector('#pcP').checked, doR = box.querySelector('#pcR').checked;
      const P = doP ? priceRows() : [], R = doR ? renames() : [];
      if (!P.length && !R.length) return;
      if (!(await confirmBox('Simpan perubahan?', `${P.length} harga diperbarui, ${R.length} nama / part number diganti.`, 'Simpan'))) return;
      b.disabled = true; const res = box.querySelector('#pcRes'); res.innerHTML = '<div class="small muted">Menyimpan…</div>';
      try {
        let rr = null, pr = null;
        if (R.length) rr = await rpc('product_rename', { p: { file: file.name, items: R.map((x) => ({ product_id: x.p.id, name: x.gName ? x.newName : null, sku: x.gPn ? x.newPn : null })) } });
        const newSku = new Map(R.filter((x) => x.gPn).map((x) => [x.p.id, x.newPn]));
        if (P.length) pr = await rpc('import_pricelist', { p: { upload_id: null, filename: file.name, final: true, supplier: 'WIN', rows: P.map((x) => ({ sku: newSku.get(x.p.id) || x.p.sku, macallan: x.mac })) } });
        try { (await import('./products-cache.js')).clearProductsCache(); } catch (_) {}
        res.innerHTML = `<div class="alert green small">Tersimpan.${pr ? ` Harga: <b>${num(pr.diperbarui ?? P.length)}</b> barang diperbarui${pr.beda_harga_dikunci ? `, ${num(pr.beda_harga_dikunci)} menunggu persetujuan (harga dikunci)` : ''}${pr.tidak_dikenal ? `, ${num(pr.tidak_dikenal)} tidak dikenal` : ''}.` : ''}${rr ? ` Nama: <b>${num(rr.nama)}</b>, part number: <b>${num(rr.part_number)}</b>${rr.dilewati?.length ? ` · ${rr.dilewati.length} dilewati (part number baru sudah dipakai barang lain: ${rr.dilewati.map((x) => esc(x.baru)).join(', ')})` : ''}.` : ''}
          <div class="row wrap" style="margin-top:8px"><a class="btn btn-sm" href="#/harga">Lihat Atur harga</a><a class="btn btn-sm" href="#/barang">Lihat Master barang</a></div></div>`;
        toast('Perubahan pricelist tersimpan', 'ok');
      } catch (err) {
        res.innerHTML = /product_rename/.test(err.message || '') ? '<div class="alert yellow small">Butuh update database. Jalankan <b>supabase/update-2.42.sql</b>.</div>' : '';
        toastErr(err); b.disabled = false;
      }
    }
  };
  paint();
}
