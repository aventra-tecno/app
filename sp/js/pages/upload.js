import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, num, rp, fmtDateTime, on, toast, toastErr, pageHead, icon, emptyState } from '../ui.js';
import { TYPES, readSheet, detect, findHeaderRow, autoMap, saveMap, build, groupRows, keyList } from '../shopee.js';

const RPC = { pesanan: 'import_orders', pembatalan: 'import_cancels', pengembalian: 'import_returns', penghasilan: 'import_income', pricelist: 'import_pricelist', rak: 'import_racks', stok_awal: 'import_stock_awal' };
const CHUNK = 150;

export default {
  tour: [
    { sel: '#types', title: '1. Pilih jenis file', body: 'Pesanan setiap pagi. Pembatalan & pengembalian saat ada. Penghasilan saat dana cair. Pricelist WIN saat harga pabrik berubah.' },
    { sel: '#drop', title: '2. Upload file', body: 'Ekspor dari Shopee Seller Center (.xlsx / .csv), lalu tarik ke sini. Jenis file dikenali otomatis.' },
    { sel: '#hist', title: 'Riwayat upload', body: 'Siapa upload apa dan kapan. Owner juga mendapat notifikasi setiap upload.' }
  ],
  async render(el, { params = {} } = {}) {
    const pesananOff = store.settings.upload_pesanan === false;
    const ALLOWED = ({ owner: Object.keys(TYPES), admin: ['pesanan', 'pembatalan', 'pengembalian', 'penghasilan', 'pricelist', 'rak'], kepala_gudang: ['rak', 'stok_awal'], supervisor: ['rak', 'stok_awal'] }[store.role] || []).filter((t) => !(pesananOff && t === 'pesanan'));
    let type = ALLOWED.includes(params.type) ? params.type : ALLOWED[0], parsed = null, sups = null, supplier = null;
    const card = (t) => `<button class="type-card ${t === type ? 'on' : ''}" data-type="${t}"><b>${esc(TYPES[t].label)}</b><span class="xs muted">${esc(TYPES[t].desc)}</span><span class="tag" data-last="${t}">…</span></button>`;
    el.innerHTML = `${pageHead('Upload file Shopee', 'Ekspor dari Shopee Seller Center, lalu upload di sini. Data dicek dulu sebelum disimpan.')}
      <div class="stack" style="gap:16px">
        ${pesananOff ? `<div class="alert blue small">Upload file <b>Pesanan</b> sedang dimatikan owner (marketplace tidak memakai SKU). Pesanan dicatat kepala gudang di menu <a href="#/catat">Catat pesanan</a> dengan scan resi + scan barang.${store.role === 'owner' ? ' Bisa dinyalakan lagi di Pengaturan.' : ''}</div>` : ''}
        <section><h2 class="sec-title" style="margin-bottom:8px">1. Pilih jenis file</h2><div class="grid gauto" id="types">${ALLOWED.map(card).join('')}</div></section>
        <section class="card"><h2 class="sec-title" style="margin-bottom:10px">2. Upload file</h2>
          <label class="dropzone" id="drop">${icon('upload', 34, 1.8)}<b>Tarik file .xlsx / .csv / .pdf ke sini</b><span class="small muted">atau ketuk untuk memilih file</span>
          <input type="file" id="file" accept=".xlsx,.xls,.csv,.pdf,application/pdf" class="sr"></label></section>
        <section id="check"></section>
        <section class="card flush" id="hist"></section>
      </div>`;

    const lastInfo = async () => {
      const { data } = await supa.from('uploads').select('*').order('created_at', { ascending: false }).limit(40);
      const seen = {};
      (data || []).forEach((u) => { if (!seen[u.type]) seen[u.type] = u; });
      el.querySelectorAll('[data-last]').forEach((t) => {
        const u = seen[t.dataset.last];
        if (!u) { t.textContent = 'Belum pernah'; t.className = 'tag red'; return; }
        const d = Math.floor((Date.now() - new Date(u.created_at)) / 864e5);
        t.textContent = d === 0 ? 'Hari ini ' + new Date(u.created_at).toTimeString().slice(0, 5) : d + ' hari lalu';
        t.className = 'tag ' + (d === 0 ? 'green' : d > 3 ? 'red' : 'yellow');
      });
      const h = el.querySelector('#hist');
      h.innerHTML = `<div class="card-h"><h2>Riwayat upload</h2></div>` + (data?.length ? `<div class="table-wrap"><table class="tbl" style="min-width:640px"><thead><tr><th>Waktu</th><th>Jenis</th><th>File</th><th>Hasil</th><th>Oleh</th></tr></thead><tbody>
        ${data.slice(0, 15).map((u) => `<tr><td class="nowrap small">${fmtDateTime(u.created_at)}</td><td>${esc(TYPES[u.type]?.label || u.type)}</td><td class="mono xs">${esc(u.filename || '')}</td>
          <td class="small">${num(u.rows_new)} baru · ${num(u.rows_skip)} ${u.type === 'pricelist' ? 'diperbarui' : 'dilewati'}${u.summary?.barang_win ? ` · ${u.summary.barang_win} beli WIN` : ''}</td><td class="small">${esc(store.profilesById[u.user_id]?.full_name || '')}</td></tr>`).join('')}
        </tbody></table></div>` : emptyState('Belum ada upload.', 'upload'));
    };

    on(el, 'click', '[data-type]', (e, b) => {
      type = b.dataset.type;
      el.querySelectorAll('[data-type]').forEach((c) => c.classList.toggle('on', c === b));
      if (parsed) analyse(parsed.rows, parsed.file, true);
    });

    const drop = el.querySelector('#drop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && handle(e.dataTransfer.files[0]));
    el.querySelector('#file').addEventListener('change', (e) => { e.target.files[0] && handle(e.target.files[0]); e.target.value = ''; });

    async function handle(file) {
      const box = el.querySelector('#check');
      box.innerHTML = '<div class="card"><div class="skeleton" style="height:120px"></div></div>';
      try {
        // 2.38: file khusus Shopee (Laporan Penghasilan; Pesanan Saya di alur kepala gudang)
        if (['owner', 'admin'].includes(store.role) && /\.(xlsx|xls)$/i.test(file.name)) {
          const { readBook, kindOf, shopeeUpload } = await import('../shopee-upload.js');
          const book = await readBook(file);
          const k = kindOf(book.sheets);
          if (k === 'income' || (k && k.startsWith('orders:') && store.settings.alur_kg !== false)) { parsed = null; return shopeeUpload(file, box, book, k); }
        }
        const rows = await readSheet(file);
        if (!rows.length) throw new Error('File kosong');
        const d = detect(rows);
        if (d.type && d.type !== type && d.score >= 1 && !ALLOWED.includes(d.type)) {
          toast('File ini terdeteksi sebagai ' + TYPES[d.type].label + ', tapi jabatanmu tidak bisa meng-upload jenis ini.', 'err');
        }
        if (d.type && d.type !== type && d.score >= 1 && ALLOWED.includes(d.type)) {
          type = d.type;
          el.querySelectorAll('[data-type]').forEach((c) => c.classList.toggle('on', c.dataset.type === type));
          toast('Terdeteksi sebagai file ' + TYPES[type].label);
        }
        parsed = { rows, file }; supplier = null;
        analyse(rows, file);
      } catch (e) { toastErr(e); box.innerHTML = ''; }
    }

    async function analyse(rows, file, keepHeader) {
      const box = el.querySelector('#check');
      const hr = findHeaderRow(rows, type);
      const headers = rows[hr].map((h) => String(h).trim());
      const T = TYPES[type];
      const map = autoMap(headers, type, rows, hr);
      const render = async () => {
        const missing = T.required.filter((f) => map[f] < 0);
        const missingAny = (T.requireAny || []).filter((g) => g.every((f) => map[f] < 0));
        const missLabel = [...missing.map((f) => T.labels[f]), ...missingAny.map((g) => g.map((f) => T.labels[f]).join(' atau '))];
        const data = build(rows, hr, type, map);
        let stats = '', extra = '', count = 0, pre = '';
        if (type === 'pesanan') {
          count = data.orders.length;
          const nos = data.orders.map((o) => o.order_no);
          const skus = [...new Set(data.orders.flatMap((o) => o.items.map((i) => i.sku)).filter(Boolean))];
          const existing = new Set(), known = new Set();
          for (let i = 0; i < nos.length; i += 300) {
            const { data: ex } = await supa.from('orders').select('order_no').in('order_no', nos.slice(i, i + 300));
            (ex || []).forEach((x) => existing.add(x.order_no));
          }
          for (let i = 0; i < skus.length; i += 300) {
            const { data: kn } = await supa.from('products').select('sku').in('sku', skus.slice(i, i + 300));
            (kn || []).forEach((x) => known.add(x.sku));
          }
          const unknown = skus.filter((s) => !known.has(s));
          const items = data.orders.reduce((a, o) => a + o.items.reduce((b, i) => b + i.qty, 0), 0);
          stats = `<div class="stat green"><b>${num(count - existing.size)}</b><span>resi baru, siap disimpan</span></div>
            <div class="stat gray"><b>${num(existing.size)}</b><span>sudah ada, dilewati (tidak dobel)</span></div>
            <div class="stat ${unknown.length ? 'yellow' : 'gray'}"><b>${num(unknown.length)}</b><span>kode belum ada di master WIN</span></div>
            <div class="stat ${data.cancels.length ? 'red' : 'gray'}"><b>${num(data.cancels.length)}</b><span>berstatus batal (diproses sebagai pembatalan)</span></div>`;
          extra = `<div class="small" style="line-height:1.7"><b>Yang terjadi setelah disimpan</b><br>
            • ${num(items)} barang dicek stoknya: yang ada di gudang masuk daftar picker, yang kurang masuk daftar beli WIN<br>
            • Picker, admin, dan owner mendapat notifikasi otomatis<br>
            ${unknown.length ? `• Kode baru: <span class="mono xs">${unknown.slice(0, 12).map(esc).join(', ')}${unknown.length > 12 ? ' …' : ''}</span> — tambahkan di Master barang / upload Pricelist WIN supaya modalnya tercatat` : ''}</div>`;
        } else {
          count = data.rows.length;
          stats = `<div class="stat green"><b>${num(count)}</b><span>baris terbaca</span></div>`;
          if (type === 'stok_awal') {
            const skus = [...new Set(data.rows.map((r) => r.sku))];
            const found = await Promise.all(skus.slice(0, 400).map((c) => rpc('find_product', { p_code: c }).catch(() => null)));
            const unknown = skus.slice(0, 400).filter((c, i) => !found[i]);
            stats += `<div class="stat gray"><b>${num(data.rows.reduce((a, r) => a + r.qty, 0))}</b><span>total pcs</span></div><div class="stat gray"><b>${num(new Set(data.rows.map((r) => r.rack)).size)}</b><span>rak</span></div><div class="stat ${unknown.length ? 'yellow' : 'gray'}"><b>${num(unknown.length)}</b><span>kode belum ada di master (dilewati)</span></div>`;
            extra = `<div class="small" style="line-height:1.7"><b>Yang terjadi setelah disimpan</b><br>• Rak dibuat otomatis kalau belum ada, dan setiap barang dipindah ke raknya<br>• Stok sistem disamakan dengan jumlah fisik di file (tercatat sebagai “Stok awal”)<br>${unknown.length ? `• Upload Pricelist WIN dulu untuk kode: <span class="mono xs">${unknown.slice(0, 10).map(esc).join(', ')}</span>` : ''}</div>`;
          }
          if (type === 'pricelist') {
            // pricelist milik supplier mana (WIN / STRONG) -> rumus diskon & harga Shopee mengikuti supplier itu
            if (!sups) sups = (await supa.from('suppliers').select('*').eq('active', true).order('sort')).data || [{ code: 'WIN', name: 'WIN', potongan_5_pct: 5, diskon_beli_pct: 25, diskon_set_pct: 30, set_keyword: 'COMPLETE SET', shopee_mode: 'rumus' }];
            if (!supplier || !sups.some((x) => x.code === supplier)) supplier = (sups.find((x) => file.name.toUpperCase().includes(x.code.toUpperCase())) || sups[0]).code;
            const R = sups.find((x) => x.code === supplier);
            const kw = String(R.set_keyword || '').toUpperCase(), tanpaKw = keyList(R.tanpa_keywords);
            groupRows(data.rows, R);   // golongan potongan per bagian (urutan bagian di file)
            const withMac = data.rows.filter((r) => r.macallan > 0), shpOnly = data.rows.filter((r) => !(r.macallan > 0) && r.harga_shopee > 0);
            const withShp = data.rows.filter((r) => r.harga_shopee > 0).length;
            const setN = withMac.filter((r) => r.group === 'set').length, tanpaN = withMac.filter((r) => r.group === 'tanpa').length;
            const isiN = withMac.filter((r) => r.isi).length;
            const secG = new Map(); withMac.forEach((r) => { if (r.section && !secG.has(r.section)) secG.set(r.section, r.group); });
            const secs = [...secG.keys()];
            const gTag = (g) => g === 'tanpa' ? '<span class="tag green">tanpa potongan</span>' : g === 'set' ? `<span class="tag yellow">−${num(R.diskon_set_pct)}%</span>` : `<span class="tag">−${num(R.diskon_beli_pct)}%</span>`;
            const shopeeTxt = R.shopee_mode === 'rumus' ? `Macallan${Number(R.shopee_plus_pct) ? ' + ' + num(R.shopee_plus_pct) + '%' : ''}${Number(R.shopee_plus_rp) ? ' + ' + rp(R.shopee_plus_rp) : ''}` : R.shopee_mode === 'file' ? 'ikut file' : 'diisi manual';
            pre = `<div class="field"><span>Pricelist ini milik supplier</span><div class="chips">${sups.map((x) => `<button type="button" class="chip ${x.code === supplier ? 'on' : ''}" data-supplier="${esc(x.code)}">${esc(x.name)}</button>`).join('')}</div>
              <span class="xs muted">${esc(R.name)}: harga beli Macallan −${num(R.diskon_beli_pct)}%${tanpaKw.length ? ` · bagian ${esc(tanpaKw.join(', '))} tanpa potongan` : ''}${kw ? ` · mulai bagian ${esc(kw)} ke bawah −${num(R.diskon_set_pct)}%` : ''} · harga Shopee ${esc(shopeeTxt)}</span></div>`;
            stats += withMac.length ? `<div class="stat gray"><b>${num(withMac.length - setN - tanpaN)}</b><span>barang biasa · potongan ${num(R.diskon_beli_pct)}%</span></div>`
              + (tanpaKw.length ? `<div class="stat ${tanpaN ? 'green' : 'gray'}"><b>${num(tanpaN)}</b><span>bagian tanpa potongan (harga beli = Macallan)</span></div>` : '')
              + (kw ? `<div class="stat ${setN ? 'yellow' : 'gray'}"><b>${num(setN)}</b><span>mulai ${esc(kw)} ke bawah · potongan ${num(R.diskon_set_pct)}%</span></div>` : '')
              + (isiN ? `<div class="stat gray"><b>${num(isiN)}</b><span>complete set beserta isinya</span></div>` : '') : '';
            stats += `<div class="stat ${withShp ? 'green' : 'gray'}"><b>${num(withShp)}</b><span>harga Shopee dari file</span></div>`;
            if (data.noPrice) stats += `<div class="stat gray"><b>${num(data.noPrice)}</b><span>baris berkode tanpa harga dilewati</span></div>`;
            extra = `<div class="small" style="line-height:1.7"><b>Yang terjadi setelah disimpan</b><br>
              • Kolom harga yang <b>kosong tidak mengubah</b> harga lama.<br>
              ${withMac.length ? `• ${num(withMac.length)} barang masuk supplier <b>${esc(R.name)}</b>: Macallan & harga beli diperbarui${R.shopee_mode === 'rumus' ? `, harga Shopee = ${esc(shopeeTxt)}` : ''} (barang baru ditambahkan ke master). Barang yang sebelumnya di supplier lain ikut pindah ke ${esc(R.name)}.<br>` : '• File ini tidak punya harga Macallan → harga modal tidak diubah.<br>'}
              ${withShp ? `• ${num(withShp)} barang: Harga Shopee dari file${shpOnly.some((r) => !r.sku) ? ' (dicocokkan lewat kode / nama barang)' : ''}${R.shopee_mode !== 'file' ? ` <span class="tag yellow">${esc(R.name)} memakai ${R.shopee_mode === 'rumus' ? 'rumus' : 'isi manual'}: harga di file hanya diberi tanda “Beda dengan file baru”</span>` : ''}.<br>` : ''}
              ${shpOnly.length ? `• Kode yang belum ada di master tidak dibuat (modalnya belum diketahui), nanti dilaporkan.<br>` : ''}
              ${isiN ? `• Isi complete set (baris di bawah barang set) disimpan di barang set-nya, kode & harganya mengikuti barang set.<br>` : ''}
              ${secs.length ? `<b>Bagian yang terbaca (${secs.length}) & potongannya</b><br>${secs.slice(0, 40).map((x) => `• ${esc(x)} ${gTag(secG.get(x))}`).join('<br>')}${secs.length > 40 ? '<br>…' : ''}<br>` : ''}
              Rumus tiap supplier diatur owner di <b>Atur harga</b>. Harga yang dikunci owner tidak berubah.</div>`;
          }
          if (type === 'penghasilan') stats += `<div class="stat gray"><b>${rp(data.rows.reduce((a, r) => a + r.amount, 0))}</b><span>total dana cair</span></div>`;
        }
        const sample = type === 'pesanan' ? data.orders.slice(0, 5).map((o) => [o.order_no, o.resi, o.shopee_status, o.items.map((i) => `${i.name} ×${i.qty}`).join('; ')]) : data.rows.slice(0, 5).map((r) => Object.values(r).map((v) => v ?? ''));
        box.innerHTML = `<div class="card stack">
          <div class="row between wrap"><h2 class="sec-title">3. Cek sebelum disimpan</h2><span class="mono xs muted">${esc(file.name)} · ${esc(T.label)}</span></div>
          <details ${missLabel.length ? 'open' : ''}><summary style="cursor:pointer;font-weight:600">Pencocokan kolom ${missLabel.length ? '<span class="tag red">ada kolom wajib yang belum cocok</span>' : '<span class="tag green">otomatis</span>'}</summary>
            <div class="grid gauto" style="margin-top:10px">${Object.keys(T.fields).map((f) => `<label class="field">${esc(T.labels[f])}${T.required.includes(f) ? ' *' : (T.requireAny || []).some((g) => g.includes(f)) ? ' (*salah satu)' : ''}
              <select class="input sm" data-map="${f}"><option value="-1">— tidak ada —</option>${headers.map((h, i) => `<option value="${i}" ${map[f] === i ? 'selected' : ''}>${esc(h || '(kolom ' + (i + 1) + ')')}</option>`).join('')}</select></label>`).join('')}</div></details>
          ${pre}
          ${missLabel.length ? `<div class="alert red">Kolom wajib belum cocok: ${missLabel.map(esc).join(', ')}. Pilih kolomnya di atas.</div>` : `<div class="grid gauto">${stats}</div>${extra}`}
          ${sample.length ? `<div class="table-wrap"><table class="tbl small"><tbody>${sample.map((r) => `<tr>${r.map((c) => `<td class="small">${esc(String(c).slice(0, 80))}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="xs muted" style="padding:6px 0">Contoh 5 baris pertama</div></div>` : ''}
          <div id="prog"></div>
          <div class="row wrap" style="justify-content:flex-end"><button class="btn" data-cancel>Batal</button>
            <button class="btn btn-primary btn-lg" data-save ${missLabel.length || !count ? 'disabled' : ''}>Simpan ${num(count)} ${type === 'pesanan' ? 'resi' : 'baris'}</button></div>
        </div>`;
        box.querySelectorAll('[data-map]').forEach((s) => s.addEventListener('change', () => { map[s.dataset.map] = +s.value; saveMap(headers, type, map); render(); }));
        box.querySelectorAll('[data-supplier]').forEach((b) => b.addEventListener('click', () => { supplier = b.dataset.supplier; render(); }));
        box.querySelector('[data-cancel]').onclick = () => { box.innerHTML = ''; parsed = null; };
        box.querySelector('[data-save]').onclick = (ev) => save(data, file.name, ev.target);
      };
      render();
    }

    async function save(data, filename, btn) {
      btn.disabled = true;
      const prog = el.querySelector('#prog');
      const results = [];
      try {
        const jobs = [];
        if (type === 'pesanan') {
          jobs.push(['import_orders', 'orders', data.orders]);
          if (data.cancels.length) jobs.push(['import_cancels', 'rows', data.cancels]);
        } else jobs.push([RPC[type], 'rows', data.rows]);
        for (const [fn, key, list] of jobs) {
          let uploadId = null; const total = list.length;
          const agg = {};
          for (let i = 0; i < total; i += CHUNK) {
            prog.innerHTML = `<div class="small muted">Menyimpan ${Math.min(i + CHUNK, total)} / ${total}…</div><div class="progress"><div style="width:${Math.round((i / total) * 100)}%"></div></div>`;
            const r = await rpc(fn, { p: { upload_id: uploadId, filename, final: i + CHUNK >= total, [key]: list.slice(i, i + CHUNK), ...(type === 'pricelist' ? { supplier } : {}) } });
            uploadId = r.upload_id;
            for (const [k, v] of Object.entries(r)) {
              if (typeof v === 'number' && k !== 'upload_id') agg[k] = (agg[k] || 0) + v;
              if (Array.isArray(v)) (agg.__list ||= {})[k] = [...(agg.__list[k] || []), ...v];
            }
          }
          results.push([fn, agg]);
        }
        const L = { total: 'Total', baru: 'Baru', dilewati: 'Dilewati', barang_gudang: 'Barang dari gudang', barang_win: 'Barang beli WIN', tidak_dikenal: 'Kode tidak dikenal', dikirim_tanpa_packing: 'Dikirim tanpa scan packing', perlu_dikembalikan: 'Perlu dikembalikan ke rak', dana_cair: 'Dana cair', diperbarui: 'Barang diperbarui', harga_shopee: 'Harga Shopee terisi', pindah_supplier: 'Pindah supplier', beda_harga_dikunci: 'Beda harga, perlu dicek', tercatat: 'Barang tercatat di rak', pcs: 'Total pcs' };
        el.querySelector('#check').innerHTML = `<div class="card stack" style="border:2px solid var(--green)"><div class="row">${icon('check', 24)}<h2 class="sec-title">Upload berhasil disimpan</h2></div>
          ${results.map(([fn, a]) => `<div class="grid gauto">${Object.entries(a).filter(([k]) => k !== '__list').map(([k, v]) => `<div class="stat ${(k === 'dikirim_tanpa_packing' || k === 'tidak_dikenal') && v ? 'red' : 'gray'}"><b>${k === 'dana_cair' ? rp(v) : num(v)}</b><span>${esc(L[k] || k)}</span></div>`).join('')}</div>
            ${a.__list?.kode_tidak_dikenal?.length ? `<div class="alert yellow small">Kode tidak ada di master barang (harga Shopee tidak diisi): <span class="mono xs">${a.__list.kode_tidak_dikenal.slice(0, 30).map(esc).join(', ')}</span>. Upload pricelist supplier dulu untuk kode ini.</div>` : ''}`).join('')}
          <div class="row wrap">${type === 'pesanan' ? '<a class="btn btn-primary" href="#/beli">Buka daftar beli WIN</a><a class="btn" href="#/pesanan">Lihat pesanan</a>' : ''}${type === 'pricelist' ? '<a class="btn btn-primary" href="#/barang">Lihat master barang</a>' : ''}${type === 'stok_awal' || type === 'rak' ? '<a class="btn btn-primary" href="#/stok">Lihat stok & rak</a>' : ''}</div></div>`;
        parsed = null;
        toast('Upload tersimpan', 'ok');
        lastInfo();
      } catch (e) { toastErr(e); btn.disabled = false; prog.innerHTML = ''; }
    }

    lastInfo();
  }
};
