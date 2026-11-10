import { supa, rpc, fetchAll } from '../supa.js';
import { store, nameOf } from '../store.js';
import { esc, rp, num, fmtDateTime, chips, on, modal, toast, toastErr, pageHead, emptyState, skeleton, debounce, icon, loadScript, beep, skuMatch, normSku, codeOr, copyBtn } from '../ui.js';
import { pickRack } from '../rak-pilih.js';
import { scanBox, bindScan } from '../scanner.js';

const MOV = { initial: 'Stok awal', in_win: 'Masuk dari WIN', pick: 'Diambil picker', to_packing: 'Langsung ke packing', pack_no_pick: 'Dipacking tanpa pick', return_good: 'Retur baik kembali', return_damaged: 'Retur rusak → karantina', opname: 'Stok opname', adjust: 'Penyesuaian manual', move_rack: 'Pindah rak', cancel_back: 'Cancel, kembali ke rak', to_meja: 'Barang WIN masuk stok gudang', meja_back: 'Ditaruh di rak' };

export default {
  tour: [
    { sel: '[data-chips="tab"]', title: 'Barang, stok opname, rak', body: 'Cari barang & lokasinya, hitung stok fisik per rak (stok opname), dan kelola label rak.' },
    { sel: '#q', title: 'Cari atau scan', body: 'Ketik nama / kode, atau scan barcode barang untuk langsung melihat lokasi rak dan riwayatnya.' }
  ],
  async render(el, { params }) {
    let tab = params.tab || 'barang';
    el.innerHTML = `${pageHead('Stok & rak', 'Stok berubah hanya lewat scan: masuk WIN, ambil, retur, stok opname.')}
      <div class="stack">${chips('tab', [['barang', 'Barang & lokasi'], ['opname', 'Stok opname'], ['rak', 'Rak & label'], ['karantina', 'Karantina']], tab)}<div id="body"></div></div>`;
    const show = () => {
      // isi tab digambar di elemen baru -> klik dari tab sebelumnya tidak ikut terbawa (tidak ada pop-up dobel)
      const old = el.querySelector('#body'), box = old.cloneNode(false);
      old.replaceWith(box);
      return ({ barang: tabBarang, opname: tabOpname, rak: tabRak, karantina: tabKarantina }[tab])(box, params);
    };
    on(el, 'click', '[data-chips="tab"] .chip', (e, b) => { tab = b.dataset.v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); show(); });
    show();
  }
};

async function tabBarang(box) {
  const seeValue = ['owner', 'admin'].includes(store.role);
  // tampilan awal: barang yang ada di rak (stok > 0), bukan semua barang pricelist
  let filter = 'rak', search = '';
  box.innerHTML = `<div class="stack"><div class="grid gauto" id="kpi"></div>
    <div class="row wrap"><input class="input grow" id="q" placeholder="Cari nama / kode / rak, atau scan barcode" aria-label="Cari barang" style="min-width:220px">${chips('f', [['rak', 'Ada di rak'], ['win', 'Barang WIN (belum di rak)'], ['low', 'Stok menipis'], ['zero', 'Habis'], ['all', 'Semua barang ›']], filter)}</div>
    <div class="card flush" id="list">${skeleton()}</div></div>`;
  const kpi = async () => {
    const data = await fetchAll(() => supa.from('products').select('stock, meja_qty, harga_beli, min_stock').eq('active', true).order('id')).catch(() => []);
    const low = (data || []).filter((p) => p.min_stock > 0 && p.stock <= p.min_stock).length;
    const val = (data || []).reduce((a, p) => a + (Math.max(0, p.stock) + (p.meja_qty || 0)) * p.harga_beli, 0);
    const win = (data || []).reduce((a, p) => a + (p.meja_qty || 0), 0);
    const inRack = (data || []).filter((p) => p.stock > 0);
    box.querySelector('#kpi').innerHTML = `<div class="card kpi"><div class="label">Barang ada di rak</div><div class="value">${num(inRack.length)}</div><div class="sub">${num(inRack.reduce((a, p) => a + p.stock, 0))} pcs · dari ${num(data?.length || 0)} jenis</div></div>
      <div class="card kpi" data-fwin style="cursor:pointer"><div class="label">Barang WIN belum di rak</div><div class="value">${num(win)}</div><div class="sub">pcs · siap dipakai admin</div></div>
      ${seeValue ? `<div class="card kpi"><div class="label">Nilai stok (modal)</div><div class="value">${rp(val)}</div></div>` : ''}
      <div class="card kpi" style="${low ? 'border:1.5px solid var(--accent)' : ''}"><div class="label">Stok menipis</div><div class="value">${low}</div></div>`;
  };
  const load = async () => {
    let data;
    try {
      data = await fetchAll(() => {
        let qy = supa.from('products').select('id, sku, name, rack_code, stock, meja_qty, stock_karantina, min_stock, harga_beli').eq('active', true).order('rack_code', { nullsFirst: false }).order('name').order('id');
        { const f = codeOr(search, ['rack_code']); if (f) qy = qy.or(f); } // kode dengan / tanpa strip sama
        if (filter === 'rak') qy = qy.gt('stock', 0);
        if (filter === 'win') qy = qy.gt('meja_qty', 0);
        if (filter === 'zero') qy = qy.lte('stock', 0);
        return qy;
      });
    } catch (error) { return toastErr(error); }
    const list = filter === 'low' ? data.filter((p) => p.min_stock > 0 && p.stock <= p.min_stock) : data;
    box.querySelector('#list').innerHTML = list.length ? `<div class="list">${list.map((p) => `<button class="list-item" data-p="${p.id}">
      <span class="mono" style="width:64px;flex:none;font-weight:600">${esc(p.rack_code || '—')}</span>
      <div class="grow"><b>${esc(p.name)}</b><div class="xs muted mono">${esc(p.sku)}${copyBtn(p.sku)}</div></div>
      <div class="right"><b style="font-size:18px" class="${p.stock <= 0 ? 'neg' : ''}">${p.stock}</b>${p.meja_qty > 0 ? `<div><span class="tag blue">+${p.meja_qty} WIN belum di rak</span></div>` : ''}${p.min_stock > 0 && p.stock <= p.min_stock ? '<div><span class="tag yellow">menipis</span></div>' : ''}</div></button>`).join('')}</div>`
      : filter === 'rak' ? `${emptyState(search ? 'Barang ini tidak ada di rak (stok 0).' : 'Belum ada barang di rak.', 'box')}<div class="row" style="justify-content:center;padding:0 16px 16px"><button class="btn btn-sm" data-allp>Cari di Master barang</button></div>`
      : emptyState('Tidak ada barang.', 'box');
  };
  box.querySelector('#q').addEventListener('input', debounce((e) => { search = e.target.value.trim().replace(/[,%()]/g, ''); load(); }, 300));
  box.querySelector('#q').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const id = await rpc('find_product', { p_code: e.target.value.trim() }).catch(() => null);
    if (id) { e.target.value = ''; openProduct(id, load); }
  });
  const toMaster = () => { location.hash = '#/barang' + (search ? '?q=' + encodeURIComponent(search) : ''); };
  on(box, 'click', '[data-chips="f"] .chip', (e, b) => { if (b.dataset.v === 'all') return toMaster(); filter = b.dataset.v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); load(); });
  on(box, 'click', '[data-fwin]', () => { filter = 'win'; box.querySelectorAll('[data-chips="f"] .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === 'win')); load(); });
  on(box, 'click', '[data-allp]', toMaster);
  on(box, 'click', '[data-p]', (e, b) => openProduct(+b.dataset.p, () => { load(); kpi(); }));
  kpi(); load();
}

export async function openProduct(id, after) {
  const [{ data: p }, { data: mv }] = await Promise.all([
    supa.from('products').select('*').eq('id', id).single(),
    supa.from('stock_movements').select('*').eq('product_id', id).order('created_at', { ascending: false }).limit(30)
  ]);
  const canAdj = ['owner', 'kepala_gudang', 'supervisor'].includes(store.role);
  const r = await modal({
    title: p.name, wide: true,
    body: `<div class="stack">
      <div class="grid gauto"><div class="stat gray"><b>${p.stock}</b><span>stok di rak</span></div>${p.meja_qty > 0 ? `<div class="stat blue"><b>${p.meja_qty}</b><span>barang WIN belum di rak</span></div>` : ''}<div class="stat gray"><b class="mono">${esc(p.rack_code || '—')}</b><span>lokasi rak</span></div>
        ${p.stock_karantina ? `<div class="stat red"><b>${p.stock_karantina}</b><span>karantina (rusak)</span></div>` : ''}${['owner', 'admin'].includes(store.role) ? `<div class="stat gray"><b>${rp(p.harga_beli)}</b><span>harga beli</span></div>` : ''}</div>
      <div class="mono small muted">${esc(p.sku)}${copyBtn(p.sku)}</div>
      <h3 style="font-size:15px">Riwayat keluar-masuk</h3>
      ${mv.length ? `<div class="table-wrap"><table class="tbl small"><tbody>${mv.map((m) => `<tr><td class="nowrap">${fmtDateTime(m.created_at)}</td><td>${esc(MOV[m.type] || m.type)}${m.note ? `<div class="xs muted">${esc(m.note)}</div>` : ''}</td><td>${esc(nameOf(m.user_id))}</td>
        <td class="num ${m.qty < 0 ? 'neg' : m.qty > 0 ? 'pos' : ''}"><b>${m.qty > 0 ? '+' : ''}${m.qty || (m.qty_karantina ? 'K+' + m.qty_karantina : '0')}</b></td></tr>`).join('')}</tbody></table></div>` : '<div class="muted small">Belum ada pergerakan.</div>'}
    </div>`,
    actions: [
      { label: 'Cetak label', value: 'label' },
      ...(p.meja_qty > 0 && canAdj ? [{ label: 'Tambah ke rak', cls: 'btn-primary', value: 'torack' }] : [{ label: 'Pindah rak', value: 'rack' }]),
      ...(canAdj ? [{ label: p.stock === 0 && !mv.length ? 'Isi stok awal' : 'Sesuaikan stok', value: 'adj' }] : []),
      { label: 'Tutup', cls: p.meja_qty > 0 && canAdj ? '' : 'btn-primary', value: null }
    ]
  });
  if (r === 'label') printLabels([p]);
  if (r === 'rack') {
    const k = await pickRack({ title: 'Pindah rak', product: p, okLabel: 'Pindahkan' });
    if (k) { try { await rpc('move_rack', { p_product: id, p_rack: k.rack }); toast('Dipindah ke rak ' + k.rack, 'ok'); } catch (e) { toastErr(e); } }
  }
  if (r === 'torack') {
    const k = await pickRack({ title: 'Tambah ke rak', product: p, qtyMax: p.meja_qty, okLabel: 'Tambah ke rak', note: p.rack_code ? `Pilih rak lain kalau barang ini mau dipindah. Lokasi barang ikut berubah.` : '' });
    if (k) { try { const x = await rpc('meja_to_rack', { p_product: id, p_qty: k.qty, p_rack: k.rack }); toast(`${x.qty} pcs ditaruh di rak ${x.rack}`, 'ok'); } catch (e) { toastErr(e); } }
  }
  if (r === 'adj') {
    const initial = p.stock === 0 && !mv.length;
    const res = await modal({ title: initial ? 'Isi stok awal' : 'Sesuaikan stok', body: `<div class="stack"><label class="field">${initial ? 'Jumlah stok sekarang' : 'Tambah / kurangi (pakai minus untuk mengurangi)'}<input class="input num" id="aq" inputmode="numeric" placeholder="${initial ? 'mis. 12' : 'mis. -2'}"></label>
      <label class="field">Alasan (wajib)<input class="input" id="ar" value="${initial ? 'Stok awal' : ''}" placeholder="mis. salah hitung"></label>
      ${initial ? '' : '<div class="alert yellow small">Untuk menghitung ulang seluruh rak, lebih baik pakai Stok opname. Perubahan manual di luar jam kerja dilaporkan ke owner.</div>'}</div>`,
      actions: [{ label: 'Batal', value: null }, { label: 'Simpan', cls: 'btn-primary', onClick: async (ov) => {
        const qv = parseInt(ov.querySelector('#aq').value, 10), reason = ov.querySelector('#ar').value.trim();
        if (!qv || !reason) { toast('Isi jumlah dan alasan', 'err'); return false; }
        await rpc('adjust_stock', { p_product: id, p_qty: qv, p_reason: reason, p_initial: initial }); return true;
      } }] });
    if (res) toast('Stok disesuaikan', 'ok');
  }
  after && after();
}

async function tabOpname(box) {
  if (!['owner', 'kepala_gudang', 'supervisor'].includes(store.role)) { box.innerHTML = `<div class="card">${emptyState('Stok opname dilakukan oleh kepala gudang.', 'clip')}</div>`; return; }
  const { data: racks } = await supa.from('racks').select('code').order('code');
  box.innerHTML = `<div class="stack"><div class="card stack">
      <div class="alert blue small">Hitung barang fisik di satu rak, isi jumlahnya, lalu simpan. Stok sistem sengaja tidak ditampilkan supaya hitungan jujur. Selisih kurang langsung dilaporkan ke owner beserta siapa yang terakhir memegang barang itu.</div>
      <label class="field">Pilih rak<select class="input" id="rk"><option value="">— pilih rak —</option>${(racks || []).map((r) => `<option>${esc(r.code)}</option>`).join('')}</select></label></div>
    <div id="op"></div></div>`;
  box.querySelector('#rk').addEventListener('change', async (e) => {
    const rack = e.target.value; const op = box.querySelector('#op');
    if (!rack) { op.innerHTML = ''; return; }
    const { data } = await supa.from('products').select('id, sku, name').eq('rack_code', rack).eq('active', true).order('name');
    if (!data.length) { op.innerHTML = `<div class="card">${emptyState('Belum ada barang di rak ini.', 'box')}</div>`; return; }
    op.innerHTML = `<div class="card stack">${scanBox('osb', 'Scan barang untuk menambah hitungan +1')}
      <div class="list">${data.map((p) => `<div class="list-item" style="padding:10px 0"><div class="grow"><b>${esc(p.name)}</b><div class="xs muted mono">${esc(p.sku)}</div></div>
        <input class="input num" style="width:90px" inputmode="numeric" data-count="${p.id}" data-sku="${esc(p.sku)}" placeholder="0" aria-label="Jumlah fisik ${esc(p.name)}"></div>`).join('')}</div>
      <button class="btn btn-primary btn-lg" id="save">Simpan stok opname rak ${esc(rack)}</button></div>`;
    bindScan(op, 'osb', (code) => {
      const inp = [...op.querySelectorAll('[data-sku]')].find((i) => skuMatch(code, i.dataset.sku));
      if (!inp) { beep(false); return { ok: false, title: 'Bukan barang rak ' + rack, info: 'Barang ini tidak terdaftar di rak ini' }; }
      inp.value = (parseInt(inp.value, 10) || 0) + 1; beep(true); return { ok: true, title: inp.closest('.list-item')?.querySelector('b')?.textContent || 'Barang', info: 'Hitungan sekarang: ' + inp.value };
    });
    op.querySelector('#save').onclick = async (ev) => {
      const items = [...op.querySelectorAll('[data-count]')].filter((i) => i.value !== '').map((i) => ({ product_id: +i.dataset.count, counted: parseInt(i.value, 10) || 0 }));
      if (!items.length) return toast('Isi minimal satu jumlah', 'err');
      ev.target.disabled = true;
      try {
        const r = await rpc('opname_submit', { p: { rack_code: rack, items } });
        toast(`Tersimpan. ${r.kurang} barang kurang${r.kurang ? ' (' + rp(r.nilai_hilang) + ')' : ''}, ${r.lebih} lebih.`, r.kurang ? 'err' : 'ok');
        box.querySelector('#rk').value = ''; op.innerHTML = '';
      } catch (e) { toastErr(e); ev.target.disabled = false; }
    };
  });
}

async function tabRak(box) {
  const [{ data: racks }, { data: prods }] = await Promise.all([supa.from('racks').select('*').order('code'), fetchAll(() => supa.from('products').select('rack_code, stock').eq('active', true).order('id')).then((data) => ({ data })).catch(() => ({ data: [] }))]);
  const cnt = {}; (prods || []).forEach((p) => { if (p.rack_code) { cnt[p.rack_code] ||= [0, 0]; cnt[p.rack_code][0]++; cnt[p.rack_code][1] += p.stock; } });
  const canEdit = ['owner', 'admin', 'kepala_gudang', 'supervisor'].includes(store.role);
  box.innerHTML = `<div class="stack">
    ${canEdit ? `<form class="card stack s8" id="addf" autocomplete="off"><label class="small" for="nr" style="font-weight:600">Tambah rak baru</label><div class="row" style="flex-wrap:nowrap"><input class="input grow mono" id="nr" placeholder="Kode rak, mis. A-01" autocapitalize="characters" enterkeyhint="done" style="text-transform:uppercase"><button class="btn btn-primary" id="add" type="submit" style="flex:none">${icon('plus', 18)}<span>Tambah</span></button></div><button class="btn" id="prt" type="button">${icon('print', 18)} Cetak label semua rak</button></form>` : ''}
    <div class="card flush">${racks?.length ? `<div class="list">${racks.map((r) => `<div class="list-item" data-rack="${esc(r.code)}"><b class="mono" style="min-width:58px">${esc(r.code)}</b><div class="grow"><div class="small">${cnt[r.code]?.[0] || 0} jenis · ${cnt[r.code]?.[1] || 0} pcs</div>${r.note ? `<div class="xs muted">${esc(r.note)}</div>` : ''}</div><button class="btn btn-sm" data-rq="${esc(r.code)}" aria-label="Cetak label barang di rak ${esc(r.code)}">${icon('print', 16)}<span>Label</span></button></div>`).join('')}</div>` : emptyState('Belum ada rak. Tambahkan kode rak dulu.', 'box')}</div></div>`;
  box.querySelector('#addf')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = box.querySelector('#nr'), btn = box.querySelector('#add');
    const code = inp.value.trim().toUpperCase().replace(/\s+/g, '-');
    if (!code) { toast('Ketik kode rak dulu, mis. A-01', 'err'); inp.focus(); return; }
    if ((racks || []).some((r) => r.code.toUpperCase() === code)) { toast('Rak ' + code + ' sudah ada', 'err'); return; }
    btn.disabled = true; btn.innerHTML = 'Menyimpan…';
    try {
      const { error } = await supa.from('racks').insert({ code });
      if (error) throw error;
      toast('Rak ' + code + ' ditambahkan', 'ok');
      await tabRak(box);
      box.querySelector(`[data-rack="${CSS.escape(code)}"]`)?.classList.add('hl-new');
    } catch (err) { toastErr(err); btn.disabled = false; btn.innerHTML = `${icon('plus', 18)}<span>Tambah</span>`; }
  });
  box.querySelector('#prt')?.addEventListener('click', () => printLabels((racks || []).map((r) => ({ sku: r.code, name: 'RAK ' + r.code, note: r.note })), 'rak'));
  on(box, 'click', '[data-rq]', async (e, b) => {
    e.preventDefault();
    if (b.disabled) return; b.disabled = true; setTimeout(() => { b.disabled = false; }, 1200);
    const { data } = await supa.from('products').select('sku, name, rack_code, stock').eq('rack_code', b.dataset.rq).eq('active', true).order('name');
    printLabels(data || []);
  });
}

async function tabKarantina(box) {
  const { data } = await supa.from('products').select('id, sku, name, stock_karantina, harga_beli').gt('stock_karantina', 0).order('name');
  box.innerHTML = `<div class="card flush">${data?.length ? `<div class="card-h"><h2>Barang rusak (karantina)</h2><span class="small muted">tidak dihitung sebagai stok jual</span></div><div class="list">${data.map((p) => `<div class="list-item"><div class="grow"><b>${esc(p.name)}</b><div class="xs muted mono">${esc(p.sku)}</div></div><b>${p.stock_karantina}</b>${['owner', 'admin'].includes(store.role) ? `<span class="small muted">${rp(p.stock_karantina * p.harga_beli)}</span>` : ''}</div>`).join('')}</div>` : emptyState('Tidak ada barang di karantina.', 'box')}</div>`;
}

export async function printLabels(items, kind = 'barang') {
  const { openLabelDialog } = await import('../labels.js');
  return openLabelDialog(items, kind);
}
