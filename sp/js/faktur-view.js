// 2.41 Faktur WIN di menu Terima barang WIN.
// Faktur didapat besoknya -> diupload -> dibandingkan dengan hasil scan Terima di tanggal faktur.
// Per tanggal: perbandingan qty (kurang / lebih / sesuai / harga naik) + pencocokan nama + daftar faktur.
import { supa, rpc } from './supa.js';
import { store } from './store.js';
import { esc, rp, num, fmtDate, toast, toastErr, skeleton, icon, copyBtn, confirmBox, addDays } from './ui.js';
import { allProducts, pickProduct } from './daftar-file.js';

const NAMA = {
  persis: ['Nama persis', 'green', 'Nama sama persis dengan master barang.'],
  mirip: ['Nama mirip, harga sama', 'blue', 'Penulisan nama sedikit beda (mis. “VARIO 150 15” vs “VARIO 150”), dipastikan dari harga yang sama.'],
  harga: ['Harga beda', 'yellow', 'Barang ketemu, tapi harga di faktur beda dengan harga pricelist di master barang.'],
  manual: ['Dipilih manual', 'blue', 'Barang dipilih sendiri.'],
  tidak: ['Tidak ada di master barang', 'red', 'Tekan Cari untuk memilih barangnya, atau tambahkan dulu di Master barang.']
};
const BANDING = {
  kurang: ['Ditagih tapi kurang / tidak di-scan', 'red', 'Jumlah di faktur lebih banyak dari yang di-scan masuk. Barang hilang, belum datang, atau lupa di-scan.'],
  lebih: ['Di-scan lebih / tidak ada di faktur', 'yellow', 'Jumlah yang di-scan masuk lebih banyak dari faktur. Cek faktur atau salah scan.'],
  naik: ['Harga naik dari pricelist', 'yellow', 'Harga di faktur lebih tinggi dari harga pricelist di master barang.'],
  sesuai: ['Sesuai', 'green', 'Jumlah di faktur sama dengan yang di-scan masuk.']
};
const canEdit = () => ['owner', 'kepala_gudang', 'supervisor'].includes(store.role);
const longDate = (d) => (d ? fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Tanpa tanggal');

// hasil scan Terima (kiriman WIN selesai) per tanggal Jakarta
async function scansFor(a, b) {
  const { data, error } = await supa.from('purchase_orders').select('id, code, finished_at, po_items(product_id, received_qty, unit_cost, products(id, sku, name, macallan, harga_beli))')
    .eq('status', 'selesai').gte('finished_at', a + 'T00:00:00+07:00').lt('finished_at', addDays(b, 1) + 'T00:00:00+07:00');
  if (error) throw error;
  const jkt = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(ts));
  const by = {};
  (data || []).forEach((po) => { const d = jkt(po.finished_at); (by[d] ||= []).push(...po.po_items.map((i) => ({ ...i, code: po.code }))); });
  return by;
}

// bandingkan 1 tanggal
export function compareDay(lines, scans) {
  const m = new Map();
  const get = (p) => { if (!m.has(p.id)) m.set(p.id, { p, fq: 0, fnet: 0, harga: 0, sq: 0, invs: new Set(), names: new Set() }); return m.get(p.id); };
  lines.filter((l) => l.p).forEach((l) => { const r = get(l.p); r.fq += l.qty; r.fnet += l.net; r.harga = Math.max(r.harga, l.harga); r.invs.add(l.ref || l.inv); r.names.add(l.name); });
  (scans || []).filter((s) => s.products).forEach((s) => { get(s.products).sq += s.received_qty; });
  const rows = [...m.values()].map((r) => {
    const mac = Number(r.p.macallan) || 0;
    return { ...r, unit: r.fq ? Math.round(r.fnet / r.fq) : 0, st: r.fq === r.sq ? 'sesuai' : r.fq > r.sq ? 'kurang' : 'lebih', naik: r.fq > 0 && mac > 0 && r.harga > mac, mac };
  }).sort((a, b) => String(a.p.name).localeCompare(String(b.p.name)));
  return { rows, unmatched: lines.filter((l) => !l.p) };
}

export function fakturSection(sec, { onSaved } = {}) {
  let range = [null, null], preview = null;   // preview = { file, customer, lines } belum disimpan
  sec.innerHTML = `<div class="row between wrap"><div><h2 class="sec-title" style="margin:0">Faktur WIN</h2>
      <div class="xs muted">Upload file faktur dari WIN (.xls “Penjualan Harian per Faktur”) saat sudah didapat — boleh besoknya. Dibandingkan dengan hasil scan Terima di tanggal faktur.</div></div>
      ${canEdit() ? `<label class="btn btn-primary btn-sm">${icon('upload', 16)} Upload faktur<input type="file" accept=".xls,.xlsx" hidden id="fkfile"></label>` : ''}</div>
    <div id="fkbody">${skeleton(1)}</div>`;
  const body = sec.querySelector('#fkbody');

  const fromDb = (rows) => rows.flatMap((f) => f.faktur_win_items.map((i) => ({
    id: i.id, date: f.tgl, inv: f.inv_no, ref: f.ref, no: i.line_no, name: i.name, qty: i.qty, harga: Number(i.harga), disc: i.disc, net: Number(i.net),
    unit: i.qty ? Math.round(Number(i.net) / i.qty) : 0, p: i.products || null, st: i.match_st || (i.products ? 'persis' : 'tidak'), sim: i.sim, demo: f.demo })));

  const paint = (lines, scansBy, { saved }) => {
    const dates = [...new Set(lines.map((l) => l.date || ''))].sort().reverse();
    if (!dates.length) { body.innerHTML = `<div class="small muted">Belum ada faktur WIN di tanggal ini.${canEdit() ? ' Tekan <b>Upload faktur</b>.' : ''}</div>`; return; }
    const sum = (ls, f) => ls.reduce((a, l) => a + Number(l[f] || 0), 0);
    body.innerHTML = `${saved ? '' : `<div class="alert blue small stack s8"><div><b>Belum disimpan.</b> ${esc(preview.file)} · ${num(lines.length)} baris · ${dates.length} tanggal. Periksa, pilih barang yang belum cocok, lalu simpan. Setelah disimpan, modal barang hari itu dikoreksi pakai harga net faktur dan selisihnya masuk ke Kecurangan &amp; masalah.</div>
        <div class="row wrap"><button class="btn btn-primary" data-fk-save>${icon('check', 16)} Simpan faktur</button><button class="btn btn-ghost" data-fk-cancel>Batal</button></div></div>`}
      ${dates.map((d, di) => {
        const L = lines.filter((l) => (l.date || '') === d), S = scansBy[d] || [];
        const cmp = compareDay(L, S), invs = [...new Set(L.map((l) => l.inv))];
        const c = { kurang: cmp.rows.filter((r) => r.st === 'kurang'), lebih: cmp.rows.filter((r) => r.st === 'lebih'), naik: cmp.rows.filter((r) => r.naik), sesuai: cmp.rows.filter((r) => r.st === 'sesuai') };
        const nm = (k) => L.filter((l) => l.st === k);
        const sq = S.reduce((a, s) => a + s.received_qty, 0);
        return `<details class="win-po fk-day" ${di === 0 || !saved ? 'open' : ''}><summary><span class="grow" style="min-width:0">
            <b>${esc(longDate(d))}</b> ${saved ? (L[0].demo ? '<span class="tag">contoh</span>' : '<span class="tag green">tersimpan</span>') : '<span class="tag yellow">belum disimpan</span>'}
            <div class="xs muted">${invs.length} faktur · ${num(sum(L, 'qty'))} pcs ditagih · ${num(sq)} pcs di-scan masuk</div>
            <div class="row wrap" style="gap:4px;margin-top:4px">${['kurang', 'lebih', 'naik', 'sesuai'].filter((k) => c[k].length).map((k) => `<span class="tag ${BANDING[k][1]}">${c[k].length} ${k === 'naik' ? 'harga naik' : k}</span>`).join('')}${cmp.unmatched.length ? `<span class="tag red">${cmp.unmatched.length} belum cocok</span>` : ''}</div></span>
            <b style="white-space:nowrap">${rp(sum(L, 'net'))}</b></summary>
          <div class="stack s8" style="padding:8px 0 4px">
            <div class="fk-h">Dibanding hasil scan Terima</div>
            ${S.length ? '' : `<div class="alert yellow small">Belum ada barang WIN yang selesai di-scan di tanggal ini, jadi semua barang terlihat “kurang”.</div>`}
            ${['kurang', 'lebih', 'naik', 'sesuai'].filter((k) => c[k].length).map((k) => `<details class="fk-grp" ${k === 'sesuai' ? '' : 'open'}><summary><span class="tag ${BANDING[k][1]}">${BANDING[k][0]}</span> <b>${c[k].length} barang</b></summary>
              <div class="xs muted" style="margin:6px 0">${BANDING[k][2]}</div>
              <div class="list no-page">${c[k].map((r) => `<div class="list-item fk-row" style="padding:8px 0;align-items:flex-start;flex-wrap:wrap">
                <div class="grow" style="min-width:0"><b class="small">${esc(r.p.name)}</b><div class="xs muted"><span class="mono">${esc(r.p.sku)}</span>${copyBtn(r.p.sku)}${r.invs.size ? ' · ' + esc([...r.invs].join(', ')) : ''}</div></div>
                <div class="right" style="min-width:150px"><div class="small">faktur <b>${num(r.fq)}</b> · scan <b class="${r.st === 'kurang' ? 'neg' : ''}">${num(r.sq)}</b></div>
                  ${r.fq ? `<div class="xs muted">net ${rp(r.unit)}/pcs${r.mac ? ` · pricelist ${rp(r.mac)}` : ''}</div>` : ''}
                  ${k === 'naik' ? `<div class="xs neg">faktur ${rp(r.harga)} (+${num(r.harga - r.mac)})</div>` : ''}</div></div>`).join('')}</div></details>`).join('')}
            <div class="fk-h">Pencocokan nama barang</div>
            ${Object.keys(NAMA).filter((k) => nm(k).length).map((k) => `<details class="fk-grp" ${k === 'tidak' ? 'open' : ''}><summary><span class="tag ${NAMA[k][1]}">${NAMA[k][0]}</span> <b>${nm(k).length} baris</b> <span class="xs muted">· ${num(sum(nm(k), 'qty'))} pcs · ${rp(sum(nm(k), 'net'))}</span></summary>
              <div class="xs muted" style="margin:6px 0">${NAMA[k][2]}</div>
              <div class="list no-page">${nm(k).map((l) => { const i = lines.indexOf(l); return `<div class="list-item fk-row" style="padding:8px 0;align-items:flex-start;flex-wrap:wrap">
                <div class="grow" style="min-width:0"><div class="small"><b>${esc(l.name)}</b></div>
                  ${l.p ? `<div class="xs" style="margin-top:2px">→ <span class="mono">${esc(l.p.sku)}</span>${copyBtn(l.p.sku)} ${l.st !== 'persis' ? esc(l.p.name) : ''}${l.sim && l.sim < 100 ? ` <span class="muted">(${l.sim}% mirip)</span>` : ''}</div>`
                    : (l.cands || []).length && canEdit() ? `<div class="chips" style="margin-top:4px">${l.cands.map((p) => `<button class="chip" data-fk-pick="${i}:${p.id}" title="${esc(p.name)}"><span class="mono">${esc(p.sku)}</span> ${esc(String(p.name).slice(0, 34))}</button>`).join('')}</div>` : ''}
                  <div class="xs muted" style="margin-top:2px">${esc(l.inv)}${l.ref ? ' · ' + esc(l.ref) : ''}</div></div>
                <div class="right" style="min-width:120px"><b>×${num(l.qty)}</b><div class="xs">${rp(l.harga)}${l.disc ? ` <span class="muted">−${esc(String(l.disc).replace('.00', ''))}</span>` : ''}</div><div class="xs muted">net ${rp(l.unit)}/pcs</div>
                  ${canEdit() ? `<button class="btn btn-sm ${l.p ? 'btn-ghost' : 'btn-see'}" data-fk-find="${i}" style="${l.p ? 'padding:0 6px' : 'margin-top:4px'}">${l.p ? 'Ganti' : 'Cari'}</button>` : ''}</div></div>`; }).join('')}</div></details>`).join('')}
            <details class="fk-grp"><summary><b>Daftar faktur (${invs.length})</b></summary><div class="list no-page">${invs.map((v) => { const I = L.filter((l) => l.inv === v); return `<div class="list-item" style="padding:6px 0"><span class="grow small"><b class="mono">${esc(v)}</b>${copyBtn(v)}<div class="xs muted">${esc(I[0].ref || '')} · ${I.length} baris · ${num(sum(I, 'qty'))} pcs</div></span><b class="small">${rp(sum(I, 'net'))}</b></div>`; }).join('')}</div></details>
            ${saved && canEdit() ? `<div class="row" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" data-fk-del="${esc(d)}" style="color:var(--red)">Hapus faktur tanggal ini</button></div>` : ''}
          </div></details>`;
      }).join('')}`;
    body._lines = lines;
  };

  const load = async (a, b) => {
    if (a) range = [a, b];
    if (preview) return showPreview();
    body.innerHTML = skeleton(1);
    try {
      const [{ data, error }, scans] = await Promise.all([
        supa.from('faktur_win').select('id, inv_no, tgl, ref, net, demo, faktur_win_items(id, line_no, name, qty, harga, disc, net, match_st, sim, products(id, sku, name, macallan, harga_beli))')
          .gte('tgl', range[0]).lte('tgl', range[1]).order('tgl', { ascending: false }),
        scansFor(range[0], range[1])]);
      if (error) throw error;
      const lines = fromDb(data || []);
      const un = lines.filter((l) => !l.p);
      if (un.length && canEdit()) {   // calon barang untuk baris yang belum cocok
        const { matchFaktur } = await import('./faktur-win.js');
        const m = matchFaktur(un, await allProducts());
        un.forEach((l, i) => { l.cands = m[i].cands || (m[i].p ? [m[i].p] : []); });
      }
      paint(lines, scans, { saved: true });
    } catch (e) { body.innerHTML = `<div class="alert yellow small">Faktur WIN butuh update database. Jalankan <b>supabase/update-2.41.sql</b>. (${esc(e.message || e)})</div>`; }
  };
  const showPreview = async () => {
    const ds = [...new Set(preview.lines.map((l) => l.date).filter(Boolean))].sort();
    const scans = ds.length ? await scansFor(ds[0], ds[ds.length - 1]).catch(() => ({})) : {};
    paint(preview.lines, scans, { saved: false });
  };

  sec.querySelector('#fkfile')?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    body.innerHTML = skeleton(2);
    try {
      const { readFakturRows, parseFaktur, matchFaktur } = await import('./faktur-win.js');
      const rows = await readFakturRows(f);
      if (!rows) throw new Error('Ini bukan file faktur WIN (“Penjualan Harian per Faktur”).');
      const fx = parseFaktur(rows);
      if (!fx.lines.length) throw new Error('File faktur terbaca, tapi tidak ada baris barang.');
      if (fx.lines.some((l) => !l.date)) throw new Error('Tanggal faktur tidak terbaca dari file.');
      preview = { file: f.name, customer: fx.customer, lines: matchFaktur(fx.lines, await allProducts()) };
      await showPreview();
    } catch (err) { body.innerHTML = `<div class="alert red small">${esc(err.message || err)}</div>`; preview = null; }
  });

  sec.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fk-pick],[data-fk-find],[data-fk-save],[data-fk-cancel],[data-fk-del]'); if (!b) return;
    const lines = body._lines || [];
    const setP = async (i, p) => {
      if (preview) { const nm = lines[i].name; preview.lines = preview.lines.map((l) => (l.name === nm ? { ...l, p, st: 'manual', sim: 100 } : l)); return showPreview(); }
      try { const n = await rpc('faktur_item_set', { p_item: lines[i].id, p_product: p.id }); toast(`Tersimpan untuk ${n} baris faktur`, 'ok'); load(); } catch (err) { toastErr(err); }
    };
    if (b.dataset.fkPick) { const [i, pid] = b.dataset.fkPick.split(':').map(Number); const p = lines[i].cands.find((c) => c.id === pid); if (p) setP(i, p); return; }
    if (b.dataset.fkFind !== undefined) { const i = +b.dataset.fkFind; const p = await pickProduct('Barang untuk baris faktur ini', lines[i].name); if (p) setP(i, p); return; }
    if (b.dataset.fkCancel !== undefined) { preview = null; load(); return; }
    if (b.dataset.fkDel !== undefined) {
      if (!(await confirmBox('Hapus faktur tanggal ini?', 'Faktur bisa diupload lagi. Modal yang sudah dikoreksi tidak dikembalikan.', 'Hapus', true))) return;
      try { await rpc('faktur_win_delete', { p_tgl: b.dataset.fkDel }); toast('Faktur dihapus', 'ok'); load(); } catch (err) { toastErr(err); }
      return;
    }
    if (b.dataset.fkSave !== undefined) {
      const un = preview.lines.filter((l) => !l.p).length;
      if (un && !(await confirmBox('Ada baris yang belum cocok', `${un} baris belum dipilih barangnya. Tetap simpan? Baris itu bisa dipilih nanti.`, 'Simpan'))) return;
      b.disabled = true;
      const invs = [...new Set(preview.lines.map((l) => l.inv))];
      const payload = { file: preview.file, fakturs: invs.map((v) => { const I = preview.lines.filter((l) => l.inv === v); return {
        inv: v, tgl: I[0].date, customer: preview.customer, ref: I[0].ref, bruto: I.reduce((a, l) => a + l.qty * l.harga, 0), net: I.reduce((a, l) => a + l.net, 0),
        items: I.map((l) => ({ no: l.no, name: l.name, qty: l.qty, harga: l.harga, disc: l.disc, net: l.net, product_id: l.p?.id || null, st: l.st, sim: l.sim })) }; }) };
      try {
        const r = await rpc('faktur_win_save', { p: payload });
        const t = (r.tanggal || []).reduce((a, x) => ({ k: a.k + x.kurang, l: a.l + x.lebih, n: a.n + x.harga_naik, c: a.c + x.modal_dikoreksi }), { k: 0, l: 0, n: 0, c: 0 });
        toast(`${r.faktur} faktur tersimpan · modal ${t.c} barang dikoreksi${t.k + t.l + t.n ? ` · ${t.k + t.l + t.n} selisih dicatat ke Kecurangan & masalah` : ''}`, 'ok');
        const ds = [...new Set(preview.lines.map((l) => l.date))].sort();
        preview = null;
        onSaved ? onSaved(ds[0], ds[ds.length - 1]) : load();
      } catch (err) { toastErr(err); b.disabled = false; }
    }
  });
  return { load };
}
