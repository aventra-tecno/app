import { supa, rpc, fetchAll } from '../supa.js';
import { store, nameOf } from '../store.js';
import { esc, rp, num, fmtDate, chips, on, modal, toast, toastErr, pageHead, emptyState, skeleton, debounce, icon, parseNum, confirmBox, todayStr, normSku, codeHit } from '../ui.js';
import { downloadHargaExcel } from '../excel-harga.js';

// Harga per supplier (WIN, STRONG, …). Setiap supplier punya rumus sendiri:
// harga 5%, harga beli (diskon dari Macallan, bagian khusus beda diskon), dan harga Shopee (ikut file / rumus / manual).
const KEY = 'harga-supplier';
const ROUNDS = [[1, 'Tidak dibulatkan'], [100, 'Kelipatan Rp100'], [500, 'Kelipatan Rp500'], [1000, 'Kelipatan Rp1.000']];
const pf = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0;

// rumus (sama dengan di server)
export const calcFor = (r, mac, p = {}) => {
  const d = p.diskon_pct ?? (p.price_group === 'set' ? Number(r.diskon_set_pct) : p.price_group === 'tanpa' ? 0 : Number(r.diskon_beli_pct));
  return { harga_5: Math.round(mac * (1 - Number(r.potongan_5_pct) / 100)), harga_beli: Math.round(mac * (1 - d / 100)) };
};
export const shopeeFor = (r, mac) => {
  if (!(mac > 0)) return 0;
  const v = mac * (1 + Number(r.shopee_plus_pct || 0) / 100) + Number(r.shopee_plus_rp || 0), k = Number(r.shopee_round || 1);
  return k > 1 ? Math.ceil(v / k) * k : Math.round(v);
};

export default {
  tour: [
    { sel: '#sup', title: 'Pilih supplier', body: 'Harga WIN dan STRONG punya rumus sendiri. Pilih supplier untuk melihat barang & rumusnya.' },
    { sel: '#rules', title: 'Rumus otomatis', body: 'Atur diskon harga beli dan harga Shopee (mis. Macallan + 20%). Tekan “Simpan rumus & hitung ulang” supaya semua barang supplier ini dihitung ulang.' },
    { sel: '#tbl', title: 'Ubah harga per barang', body: 'Ketik langsung di tabel. Barang yang diubah manual otomatis dikunci supaya tidak tertimpa upload file berikutnya.' },
    { sel: '#savebar', title: 'Simpan dengan alasan', body: 'Setiap perubahan dicatat di riwayat: siapa, kapan, dan alasannya.' }
  ],
  async render(el) {
    const { data: sups, error: se } = await supa.from('suppliers').select('*').eq('active', true).order('sort').order('code');
    if (se || !sups?.length) { el.innerHTML = `<div class="alert yellow">Menu ini butuh update database. Jalankan <b>supabase/update-2.6.sql</b> di Supabase › SQL Editor. ${se ? '(' + esc(se.message) + ')' : ''}</div>`; return; }
    let sup = (() => { try { return sessionStorage.getItem(KEY); } catch (_) { return null; } })();
    if (!sups.some((x) => x.code === sup)) sup = sups[0].code;
    let filter = 'all', search = '', all = [], changed = new Map(), sel = new Set();
    const s = { ...store.settings };
    const R = () => sups.find((x) => x.code === sup);
    const rulesOf = (p) => sups.find((x) => x.code === p.supplier) || sups[0];

    el.innerHTML = `${pageHead('Atur harga', 'Harga terisi otomatis dari upload pricelist (WIN / STRONG) & file Shopee, dan tetap bisa diubah manual di sini.',
      `<button class="btn" id="xl">${icon('download', 18)} Unduh Excel</button><a class="btn" href="#/upload?type=pricelist">${icon('upload', 18)} Upload Excel harga</a>`)}
      <div class="stack">
      <div class="sup-tabs" id="sup"></div>
      <section class="card stack" id="rules"></section>
      <div class="row wrap between"><div id="filters"></div><input class="input h-search" id="q" placeholder="Cari nama / kode" aria-label="Cari"></div>
      <div class="row wrap hidden" id="bulk"><span class="small"><b id="bn">0</b> dipilih:</span><button class="btn btn-sm" data-bulk="disk">Set diskon beli %</button><button class="btn btn-sm" data-bulk="lock">Kunci</button><button class="btn btn-sm" data-bulk="unlock">Buka kunci</button><button class="btn btn-sm" data-bulk="move">Pindah supplier</button></div>
      <div class="card flush" id="tbl">${skeleton()}</div>
      <div class="card dark stack hidden" id="savebar"><b><span id="cn">0</span> barang diubah</b><div class="small" style="color:#E4E2DB">Harga baru berlaku untuk pesanan mulai sekarang. Laporan hari sebelumnya tidak ikut berubah.</div>
        <label class="field" style="color:#C9CCC8">Alasan (masuk ke riwayat)<input class="input" id="reason" placeholder="mis. harga naik dari supplier"></label>
        <div class="row"><button class="btn grow" id="undo">Batalkan perubahan</button><button class="btn btn-primary grow" id="save">Simpan &amp; kunci harga</button></div></div>
      <section class="card flush" id="hist"></section></div>`;

    const products = () => all.filter((p) => (p.supplier || 'WIN') === sup);
    const paintTabs = () => {
      el.querySelector('#sup').innerHTML = sups.map((x) => `<button class="sup-tab ${x.code === sup ? 'on' : ''}" data-sup="${esc(x.code)}"><b>${esc(x.name)}</b><span>${num(all.filter((p) => (p.supplier || 'WIN') === x.code).length)} barang · Shopee ${x.shopee_mode === 'rumus' ? '+' + [x.shopee_plus_pct ? num(x.shopee_plus_pct) + '%' : '', x.shopee_plus_rp ? rp(x.shopee_plus_rp) : ''].filter(Boolean).join(' + ') || 'rumus' : x.shopee_mode === 'file' ? 'ikut file' : 'manual'}</span></button>`).join('');
    };

    // ---------- rumus supplier yang dipilih ----------
    const paintRules = () => {
      const r = R();
      el.querySelector('#rules').innerHTML = `<div class="row between wrap"><h2 class="sec-title">Rumus ${esc(r.name)} (untuk barang yang tidak dikunci)</h2><span class="xs muted">Terakhir diubah ${fmtDate(r.updated_at)}</span></div>
        <div class="grid gauto fields-end">
          <label class="field">Harga beli barang biasa: Macallan dikurangi (%)<input class="input num" id="rb" value="${num0(r.diskon_beli_pct)}" inputmode="decimal"></label>
          <label class="field">Bagian khusus (mulai bagian ini ke bawah): Macallan dikurangi (%)<input class="input num" id="rs" value="${num0(r.diskon_set_pct)}" inputmode="decimal"></label>
          <label class="field">Kata kunci judul bagian khusus<input class="input" id="rk" value="${esc(r.set_keyword || '')}" placeholder="mis. COMPLETE SET · kosong = tidak ada"></label>
          <label class="field">Bagian TANPA potongan (kata kunci, pisahkan koma)<input class="input" id="rt" value="${esc(r.tanpa_keywords || '')}" placeholder="mis. ACCESORIES, BOHLAM"></label>
        </div>
        <h3 class="sub-title">Harga Shopee ${esc(r.name)}</h3>
        <div class="grid gauto fields-end">
          <label class="field">Harga Shopee diambil dari<select class="input" id="rm">
            <option value="rumus" ${r.shopee_mode === 'rumus' ? 'selected' : ''}>Rumus dari Macallan</option>
            <option value="file" ${r.shopee_mode === 'file' ? 'selected' : ''}>Ikut data Excel / file Shopee</option>
            <option value="manual" ${r.shopee_mode === 'manual' ? 'selected' : ''}>Isi manual (file hanya memberi tanda)</option></select></label>
          <label class="field rumus-f">Macallan ditambah (%)<input class="input num" id="rpc" value="${num0(r.shopee_plus_pct)}" inputmode="decimal"></label>
          <label class="field rumus-f">Ditambah lagi nominal (Rp)<input class="input num" id="rp" data-money="neg" inputmode="text" value="${num(r.shopee_plus_rp || 0)}"></label>
          <label class="field rumus-f">Bulatkan ke atas<select class="input" id="rr">${ROUNDS.map(([v, l]) => `<option value="${v}" ${Number(r.shopee_round || 1) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <div class="alert green small rumus-f" id="rprev"></div>
        <div class="grid gauto fields-end"><label class="field" style="max-width:420px">Est. potongan Shopee sebelum cair (%) · berlaku semua supplier<input class="input num" id="rf" value="${s.shopee_fee_pct}" inputmode="decimal"></label></div>
        ${r.set_keyword || r.tanpa_keywords ? `<div class="alert yellow small">Pricelist ${esc(r.name)} dibaca per bagian (judul <b>***...***</b>) sesuai urutan di file: bagian biasa −${num0(r.diskon_beli_pct)}%${r.tanpa_keywords ? `, bagian <b>${esc(r.tanpa_keywords)}</b> tanpa potongan` : ''}${r.set_keyword ? `, mulai bagian <b>${esc(r.set_keyword)}</b> ke bawah −${num0(r.diskon_set_pct)}%` : ''}. Setelah mengubah aturan ini, upload ulang pricelist supaya semua barang terbaca ulang.</div>` : ''}
        <div class="alert blue small">Harga yang diubah manual diberi <b>kunci</b>. Upload pricelist / file Shopee berikutnya <b>tidak menimpa</b> harga yang dikunci, hanya memberi tanda “Beda dengan file baru”.</div>
        <div class="row wrap" style="justify-content:flex-end"><button class="btn btn-dark" id="saveRules">Simpan rumus ${esc(r.name)} & hitung ulang</button></div>`;
      paintRumus();
    };
    const num0 = (v) => String(Number(v || 0)).replace('.', ',');
    // teks persentase untuk judul kolom, mis. "−25% / −30%" dan "Macallan +20%"
    const beliTxt = (r) => (!Number(r.diskon_beli_pct) && !r.set_keyword ? '= Macallan' : '−' + num0(r.diskon_beli_pct) + '%' + (r.set_keyword ? ' / −' + num0(r.diskon_set_pct) + '%' : '') + (r.tanpa_keywords ? ' / 0%' : ''));
    const shopeeTxt = (r) => r.shopee_mode === 'rumus' ? 'Macallan ' + [Number(r.shopee_plus_pct) ? '+' + num0(r.shopee_plus_pct) + '%' : '', Number(r.shopee_plus_rp) ? (r.shopee_plus_rp < 0 ? '−' : '+') + rp(Math.abs(r.shopee_plus_rp)) : ''].filter(Boolean).join(' ') : r.shopee_mode === 'file' ? 'ikut file' : 'manual';
    const rulesIn = () => ({
      diskon_beli_pct: pf(el.querySelector('#rb').value), diskon_set_pct: pf(el.querySelector('#rs').value),
      set_keyword: el.querySelector('#rk').value.trim() || null, tanpa_keywords: el.querySelector('#rt').value.trim() || null, shopee_mode: el.querySelector('#rm').value,
      shopee_plus_pct: pf(el.querySelector('#rpc').value), shopee_plus_rp: parseNum(el.querySelector('#rp').value), shopee_round: +el.querySelector('#rr').value || 1
    });
    const paintRumus = () => {
      const box = el.querySelector('#rprev'); if (!box) return;
      const on = el.querySelector('#rm').value === 'rumus';
      el.querySelectorAll('.rumus-f').forEach((x) => x.classList.toggle('hidden', !on));
      const r = rulesIn(), ex = products().find((p) => Number(p.macallan) > 0);
      const mac = ex ? Number(ex.macallan) : 100000;
      const c = calcFor(r, mac);
      box.innerHTML = `Rumus: Harga Shopee = Macallan${r.shopee_plus_pct ? ` + ${num0(r.shopee_plus_pct)}%` : ''}${r.shopee_plus_rp ? ` ${r.shopee_plus_rp < 0 ? '−' : '+'} ${rp(Math.abs(r.shopee_plus_rp))}` : ''}${r.shopee_round > 1 ? `, dibulatkan ke atas kelipatan ${rp(r.shopee_round)}` : ''}.<br>Contoh${ex ? ' ' + esc(ex.name) : ''}: Macallan ${rp(mac)} → harga beli ${rp(c.harga_beli)} · <b>Harga Shopee ${rp(shopeeFor(r, mac))}</b>.`;
    };
    on(el, 'input', '#rules', paintRumus);
    on(el, 'change', '#rules select', paintRumus);
    on(el, 'click', '#saveRules', async () => {
      const r = R(), upd = { ...rulesIn(), updated_at: new Date().toISOString() };
      if (!(await confirmBox(`Simpan rumus ${r.name}?`, `Harga beli${upd.shopee_mode === 'rumus' ? ' dan harga Shopee' : ''} semua barang <b>${esc(r.name)}</b> yang <b>tidak dikunci</b> akan dihitung ulang.`))) return;
      try {
        const { error } = await supa.from('suppliers').update(upd).eq('code', r.code); if (error) throw error;
        Object.assign(r, upd);
        const fee = pf(el.querySelector('#rf').value);
        if (fee !== Number(s.shopee_fee_pct)) { const { error: e2 } = await supa.from('settings').update({ shopee_fee_pct: fee, updated_at: upd.updated_at }).eq('id', 1); if (e2) throw e2; s.shopee_fee_pct = fee; store.settings.shopee_fee_pct = fee; }
        const n = await rpc('recalc_prices', { p_supplier: r.code }); toast(`Rumus ${r.name} tersimpan. ${n} barang dihitung ulang.`, 'ok'); load(); hist();
      } catch (err) { toastErr(err); }
    });

    // ---------- tabel barang supplier yang dipilih ----------
    const thin = (p) => Number(p.harga_shopee) > 0 && (p.harga_shopee * (1 - s.shopee_fee_pct / 100) - p.harga_beli) / p.harga_shopee < 0.1;
    const paintFilters = () => {
      const list = products();
      const c = { all: list.length, locked: list.filter((p) => p.price_locked).length, pending: list.filter((p) => p.pending_price).length, zero: list.filter((p) => !Number(p.harga_beli)).length, thin: list.filter(thin).length };
      // 2.32: kelompok persen — potongan harga beli dari Macallan & tambahan harga Shopee dari Macallan
      const dG = new Map(), sG = new Map();
      list.forEach((p) => { const d = beliPct(p), sp = shpPct(p); if (d != null) dG.set(d, (dG.get(d) || 0) + 1); if (sp != null) sG.set(sp, (sG.get(sp) || 0) + 1); });
      const dChips = [...dG].sort((a, b) => a[0] - b[0]).map(([d, n]) => ['d:' + d, `${d === 0 ? 'Tanpa potongan' : 'Beli ' + (d > 0 ? '−' : '+') + Math.abs(d) + '%'} (${n})`]);
      const sChips = [...sG].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([v, n]) => ['s:' + v, `Shopee ${v >= 0 ? '+' : '−'}${Math.abs(v)}% (${n})`]);
      el.querySelector('#filters').innerHTML = chips('f', [['all', `Semua (${c.all})`], ...dChips, ...sChips, ['locked', `Dikunci (${c.locked})`], ['pending', `Beda dengan file baru (${c.pending})`], ['zero', `Modal kosong (${c.zero})`], ['thin', `Margin < 10% (${c.thin})`]], filter);
    };
    const visible = () => products().filter((p) => {
      if (search && !codeHit(search, p)) return false;
      if (filter === 'locked') return p.price_locked;
      if (filter === 'pending') return !!p.pending_price;
      if (filter === 'zero') return !Number(p.harga_beli);
      if (filter === 'thin') return thin(p);
      if (filter.startsWith('d:')) return beliPct(p) === +filter.slice(2);
      if (filter.startsWith('s:')) return shpPct(p) === +filter.slice(2);
      return true;
    });
    const val = (p, f) => (changed.get(p.id)?.[f] ?? p[f]);
    // persen nyata dari Macallan (dibulatkan): potongan harga beli & tambahan harga Shopee
    const beliPct = (p) => { const m = +p.macallan, b = +p.harga_beli; return m > 0 && b > 0 ? Math.round((1 - b / m) * 100) : null; };
    const shpPct = (p) => { const m = +p.macallan, sp = +p.harga_shopee; return m > 0 && sp > 0 ? Math.round((sp / m - 1) * 100) : null; };
    const pctBadges = (p) => {
      const d = beliPct({ ...p, harga_beli: val(p, 'harga_beli'), macallan: val(p, 'macallan') }), sp = shpPct({ ...p, harga_shopee: val(p, 'harga_shopee'), macallan: val(p, 'macallan') });
      return `<span class="pct-badges">${d == null ? '' : d === 0 ? '<span class="pb pb-free">Tanpa potongan</span>' : `<span class="pb ${d >= 30 ? 'pb-set' : 'pb-cut'}">Beli ${d > 0 ? '−' : '+'}${Math.abs(d)}%</span>`}${sp == null ? '' : `<span class="pb ${sp >= 0 ? 'pb-up' : 'pb-down'}">Shopee ${sp >= 0 ? '+' : '−'}${Math.abs(sp)}%</span>`}${p.diskon_pct != null ? '<span class="pb pb-man">diskon manual</span>' : ''}</span>`;
    };
    const margin = (p) => { const sp = +val(p, 'harga_shopee'), b = +val(p, 'harga_beli'); return sp ? Math.round(sp * (1 - s.shopee_fee_pct / 100) - b) : null; };
    const paint = () => {
      const r = R(), list = visible().slice(0, 1000);
      const fields = [['macallan', 'Macallan'], ['harga_beli', `Harga beli (${beliTxt(r)})`], ['harga_shopee', `Harga Shopee (${shopeeTxt(r)})`]];
      el.querySelector('#tbl').innerHTML = list.length ? `<div class="table-wrap"><table class="tbl" style="min-width:1080px"><thead><tr><th><input type="checkbox" class="check" id="all" aria-label="Pilih semua"></th><th>Kode · Barang</th>${fields.map(([, l]) => `<th class="right">${esc(l)}</th>`).join('')}<th class="right">Est. margin</th><th>Sumber</th></tr></thead><tbody>
        ${list.map((p) => {
          const ch = changed.has(p.id), m = margin(p), pend = p.pending_price;
          return `<tr class="${ch || sel.has(p.id) ? 'hl' : ''}" data-row="${p.id}"><td><input type="checkbox" class="check" data-sel="${p.id}" ${sel.has(p.id) ? 'checked' : ''} aria-label="Pilih"></td>
            <td><b>${esc(p.name)}</b><div class="xs muted mono">${esc(p.sku)}</div>${pctBadges(p)}</td>
            ${fields.map(([f]) => `<td class="right"><input class="input sm num ${p.price_locked || ch ? 'locked' : f === 'harga_beli' || (f === 'harga_shopee' && r.shopee_mode === 'rumus') ? 'calc' : ''}" style="width:104px" data-f="${f}" data-id="${p.id}" data-money value="${num(val(p, f))}" inputmode="numeric" aria-label="${f}"></td>`).join('')}
            <td class="num"><b class="${m == null ? '' : m < 0 ? 'neg' : 'pos'}">${m == null ? '–' : rp(m)}</b></td>
            <td>${pend ? `<button class="tag yellow" style="border:0;cursor:pointer" data-pend="${p.id}">Beda: ${esc(pend.sumber)} ${pend.macallan ? 'Macallan ' + num(pend.macallan) : ''}${pend.harga_shopee ? ' Shopee ' + num(pend.harga_shopee) : ''}</button>`
              : p.price_locked ? '<span class="tag dark">Dikunci owner</span>' : !Number(p.harga_beli) ? '<span class="tag red">Modal kosong</span>' : '<span class="tag">Otomatis</span>'}</td></tr>`;
        }).join('')}</tbody></table></div>${visible().length > 1000 ? `<div class="xs muted" style="padding:8px 16px">Menampilkan 1.000 dari ${visible().length} barang. Gunakan pencarian / filter untuk barang lainnya.</div>` : ''}`
        : emptyState(products().length ? 'Tidak ada barang di filter ini.' : `Belum ada barang ${r.name}. Upload pricelist ${r.name} di menu Upload file.`, 'tag');
      el.querySelector('#savebar').classList.toggle('hidden', !changed.size);
      el.querySelector('#cn').textContent = changed.size;
      el.querySelector('#bulk').classList.toggle('hidden', !sel.size);
      el.querySelector('#bn').textContent = sel.size;
    };
    const load = async () => {
      let data;
      try { data = await fetchAll(() => supa.from('products').select('id, sku, name, category, supplier, macallan, harga_5, harga_beli, harga_shopee, diskon_pct, price_group, price_locked, pending_price').eq('active', true).order('name').order('id')); }
      catch (error) { return toastErr(error); }
      all = data; changed.clear(); sel.clear(); paintTabs(); paintFilters(); paint(); paintRumus();
    };
    const hist = async () => {
      const { data } = await supa.from('price_history').select('*, products(name, supplier)').neq('field', 'harga_5').order('created_at', { ascending: false }).limit(25);
      const L = { macallan: 'Macallan', harga_5: 'Harga 5% (lama)', harga_beli: 'Harga beli', harga_shopee: 'Harga Shopee' };
      el.querySelector('#hist').innerHTML = `<div class="card-h"><h2>Riwayat perubahan harga</h2></div>${data?.length ? `<div class="list">${data.map((h) => `<div class="list-item"><div class="grow small">${h.products?.supplier ? `<span class="tag">${esc(h.products.supplier)}</span> ` : ''}${esc(h.products?.name || '')} · ${L[h.field]} ${num(h.old_value)} → <b>${num(h.new_value)}</b>${h.reason ? ` <span class="muted">(${esc(h.reason)})</span>` : ''}</div>
        <span class="xs muted nowrap">${h.source === 'owner' ? esc(nameOf(h.user_id)) : h.source === 'pricelist' ? 'Pricelist' : h.source === 'shopee' ? 'File Shopee' : 'Rumus'} · ${fmtDate(h.created_at, { day: 'numeric', month: 'short' })}</span></div>`).join('')}</div>` : emptyState('Belum ada perubahan.', 'tag')}`;
    };

    on(el, 'click', '[data-sup]', async (e, b) => {
      if (b.dataset.sup === sup) return;
      if (changed.size && !(await confirmBox('Buang perubahan?', 'Ada perubahan harga yang belum disimpan. Pindah supplier dan buang perubahan?', 'Buang & pindah', true))) return;
      sup = b.dataset.sup; try { sessionStorage.setItem(KEY, sup); } catch (_) {}
      changed.clear(); sel.clear(); filter = 'all'; paintTabs(); paintRules(); paintFilters(); paint();
    });
    on(el, 'click', '[data-chips="f"] .chip', (e, b) => { filter = b.dataset.v; paintFilters(); paint(); });
    el.querySelector('#q').addEventListener('input', debounce((e) => { search = e.target.value.trim().toLowerCase(); paint(); }, 250));
    on(el, 'change', '[data-f]', (e, inp) => {
      const id = +inp.dataset.id, f = inp.dataset.f, p = all.find((x) => x.id === id), r = rulesOf(p);
      const c = changed.get(id) || {};
      c[f] = parseNum(inp.value);
      if (f === 'macallan' && !p.price_locked) {
        Object.assign(c, calcFor(r, c.macallan, p));
        if (r.shopee_mode === 'rumus' && c.harga_shopee === undefined) c.harga_shopee = shopeeFor(r, c.macallan);
      }
      changed.set(id, c); paint();
    });
    on(el, 'change', '[data-sel]', (e, c) => { c.checked ? sel.add(+c.dataset.sel) : sel.delete(+c.dataset.sel); paint(); });
    on(el, 'change', '#all', (e, c) => { visible().forEach((p) => (c.checked ? sel.add(p.id) : sel.delete(p.id))); paint(); });
    on(el, 'click', '[data-bulk]', async (e, b) => {
      const ids = [...sel]; const k = b.dataset.bulk;
      try {
        if (k === 'disk') {
          const v = await modal({ title: 'Diskon harga beli', body: `<label class="field">Diskon dari Macallan (%) untuk ${ids.length} barang<input class="input num" id="dv" value="${num0(R().diskon_beli_pct)}" inputmode="decimal"></label>`, actions: [{ label: 'Batal', value: null }, { label: 'Terapkan', cls: 'btn-primary', onClick: (ov) => pf(ov.querySelector('#dv').value) }] });
          if (v == null) return;
          await rpc('update_prices', { p: { reason: `Diskon beli ${v}%`, rows: ids.map((id) => { const p = all.find((x) => x.id === id); return { id, diskon_pct: v, harga_beli: Math.round(p.macallan * (1 - v / 100)) }; }) } });
        } else if (k === 'move') {
          const others = sups.filter((x) => x.code !== sup);
          const to = await modal({ title: 'Pindah supplier', body: `<label class="field">Pindahkan ${ids.length} barang ke<select class="input" id="mv">${others.map((x) => `<option value="${esc(x.code)}">${esc(x.name)}</option>`).join('')}</select></label><div class="small muted">Harga barang yang tidak dikunci dihitung ulang dengan rumus supplier tujuan.</div>`,
            actions: [{ label: 'Batal', value: null }, { label: 'Pindahkan', cls: 'btn-primary', onClick: (ov) => ov.querySelector('#mv').value }] });
          if (!to) return;
          await rpc('update_prices', { p: { reason: `Pindah ke supplier ${to}`, rows: ids.map((id) => ({ id, supplier: to })) } });
          await rpc('recalc_prices', { p_supplier: to });
        } else {
          await rpc('update_prices', { p: { reason: k === 'lock' ? 'Kunci harga' : 'Buka kunci', rows: ids.map((id) => ({ id, lock: k === 'lock' })) } });
        }
        toast('Tersimpan', 'ok'); load(); hist();
      } catch (err) { toastErr(err); }
    });
    on(el, 'click', '[data-pend]', async (e, b) => {
      const p = all.find((x) => x.id === +b.dataset.pend), pend = p.pending_price, r = rulesOf(p);
      const res = await modal({ title: 'Harga berbeda dari file baru', body: `<p style="margin-top:0"><b>${esc(p.name)}</b> dikunci owner. ${esc(pend.sumber)} (${esc(pend.tanggal || '')}) membawa harga berbeda:</p>
        ${pend.macallan ? `<div class="line-row"><span>Macallan</span><span>${num(p.macallan)} → <b>${num(pend.macallan)}</b></span></div>` : ''}${pend.harga_shopee ? `<div class="line-row"><span>Harga Shopee</span><span>${num(p.harga_shopee)} → <b>${num(pend.harga_shopee)}</b></span></div>` : ''}`,
        actions: [{ label: 'Abaikan (tetap harga sekarang)', value: 'no' }, { label: 'Pakai harga baru', cls: 'btn-primary', value: 'yes' }] });
      if (!res) return;
      const row = { id: p.id, clear_pending: true };
      if (res === 'yes') {
        if (pend.macallan) Object.assign(row, { macallan: pend.macallan, ...calcFor(r, pend.macallan, p) });
        if (pend.macallan && r.shopee_mode === 'rumus') row.harga_shopee = shopeeFor(r, pend.macallan);
        if (pend.harga_shopee) row.harga_shopee = pend.harga_shopee;
      }
      try { await rpc('update_prices', { p: { reason: res === 'yes' ? 'Terima harga dari ' + pend.sumber : 'Abaikan harga ' + pend.sumber, rows: [row] } }); toast('Tersimpan', 'ok'); load(); hist(); } catch (err) { toastErr(err); }
    });
    el.querySelector('#undo').onclick = () => { changed.clear(); paint(); };
    el.querySelector('#save').onclick = async (e) => {
      e.target.disabled = true;
      try {
        await rpc('update_prices', { p: { reason: el.querySelector('#reason').value.trim() || 'Diubah owner', rows: [...changed].map(([id, c]) => ({ id, ...c, lock: true })) } });
        toast(changed.size + ' harga tersimpan & dikunci', 'ok'); load(); hist();
      } catch (err) { toastErr(err); } finally { e.target.disabled = false; }
    };
    el.querySelector('#xl').onclick = async () => {
      const opts = [...sups.map((x) => [x.code, `${x.name} saja`, `${num(all.filter((p) => (p.supplier || 'WIN') === x.code).length)} barang · harga beli ${beliTxt(x)} · Shopee ${shopeeTxt(x)}`]),
        ['__all', `${sups.map((x) => x.name).join(' + ')} (jadi satu)`, `${num(all.length)} barang dalam satu tab PRICELIST`]];
      const d = await modal({ title: 'Unduh Excel pricelist & toko', body: `<div class="stack">
        <div class="field"><span>Supplier</span><div class="stack" style="gap:6px">${opts.map(([v, l, d2]) => `<label class="check" style="align-items:flex-start"><input type="radio" name="xs" value="${esc(v)}" ${v === sup ? 'checked' : ''}><span><b>${esc(l)}</b><div class="xs muted">${esc(d2)}</div></span></label>`).join('')}</div></div>
        <label class="field">Tanggal resi (untuk tab per toko)<input type="date" class="input" id="xd" value="${todayStr()}" max="${todayStr()}"></label>
        <div class="small muted">Tab pertama <b>PRICELIST</b> (harga terbaru + ringkasan). Tab berikutnya satu per toko untuk tanggal di atas, dengan total modal, harga Shopee, pendapatan & margin. Baris kosong bisa diisi manual: ketik resi & kode, harga terisi otomatis. Nama file: <span class="mono">pricelist-WIN-tanggal.xlsx</span>.</div></div>`,
        actions: [{ label: 'Batal', value: null }, { label: 'Unduh Excel', cls: 'btn-primary', onClick: (ov) => ({ date: ov.querySelector('#xd').value || todayStr(), sup: ov.querySelector('[name=xs]:checked')?.value || sup }) }] });
      if (!d) return;
      const codes = d.sup === '__all' ? sups.map((x) => x.code) : [d.sup];
      const b = el.querySelector('#xl'); b.disabled = true; toast('Menyiapkan Excel…');
      try { const r = await downloadHargaExcel({ date: d.date, products: all, suppliers: sups, codes }); toast(`Excel siap: ${num(r.products)} barang ${codes.join(' + ')}, ${r.stores} toko, ${r.resi} resi`, 'ok'); }
      catch (err) { toastErr(err); } finally { b.disabled = false; }
    };
    paintTabs(); paintRules(); load(); hist();
  }
};
