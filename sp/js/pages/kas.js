import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, rp, num, todayStr, addDays, monthStart, fmtDate, chips, on, modal, toast, toastErr, pageHead, emptyState, skeleton, icon, parseNum, confirmBox, downloadXlsx } from '../ui.js';

// Keuangan & kas: saldo per rekening, uang masuk / keluar, pindah saldo, hutang supplier.
const CAT = {
  masuk: ['Dana cair marketplace', 'Penjualan offline / grosir', 'Setoran modal', 'Pendapatan lain'],
  keluar: ['Belanja barang', 'Gaji pegawai', 'Operasional', 'Ongkir', 'Iklan / promosi', 'Bahan packing', 'Sewa / listrik / internet', 'Ambil owner (prive)', 'Lainnya']
};
const KIND = { kas: 'Kas tunai', bank: 'Bank', ewallet: 'E-wallet', marketplace: 'Saldo marketplace', lainnya: 'Lainnya' };

export default {
  tour: [
    { sel: '#acc', title: 'Saldo rekening', body: 'Saldo setiap kas / bank / saldo Shopee = saldo awal + semua uang masuk − keluar.' },
    { sel: '#act', title: 'Catat uang', body: 'Uang masuk, uang keluar, atau pindah saldo antar rekening (mis. tarik saldo Shopee ke bank).' },
    { sel: '#tabs', title: 'Hutang supplier', body: 'Catat hutang ke WIN / STRONG, cicil dari rekening mana, dan lihat yang lewat jatuh tempo.' }
  ],
  async render(el) {
    let period = 'month', tab = 'tx', acc = '', sum = null, txs = [], debts = [];
    const range = () => { const t = todayStr(); return period === 'last' ? [monthStart(addDays(monthStart(t), -1)), addDays(monthStart(t), -1)] : period === '30' ? [addDays(t, -29), t] : period === 'year' ? [t.slice(0, 4) + '-01-01', t] : [monthStart(t), t]; };
    el.innerHTML = `${pageHead('Keuangan & kas', 'Uang masuk & keluar, saldo setiap rekening, dan hutang ke supplier.', `<div class="row wrap" id="act"><button class="btn btn-primary" data-new="masuk">${icon('plus', 18)} Uang masuk</button><button class="btn" data-new="keluar">${icon('plus', 18)} Uang keluar</button><button class="btn btn-ghost" data-new="pindah">${icon('refresh', 16)} Pindah saldo</button></div>`)}
      <div class="stack">${chips('p', [['month', 'Bulan ini'], ['last', 'Bulan lalu'], ['30', '30 hari'], ['year', 'Tahun ini']], period)}
        <div id="kpi">${skeleton(1)}</div>
        <section class="card flush" id="acc"><div class="card-h"><h2>Rekening</h2><button class="btn btn-sm btn-ghost" data-acc-new>${icon('plus', 16)} Rekening</button></div><div id="acclist"></div></section>
        <div id="tabs">${chips('t', [['tx', 'Transaksi'], ['cat', 'Per kategori'], ['debt', 'Hutang supplier']], tab)}</div>
        <section class="card flush" id="body">${skeleton()}</section></div>`;

    const load = async () => {
      const [a, b] = range();
      try {
        [sum, { data: txs }, { data: debts }] = await Promise.all([
          rpc('kas_summary', { p_from: a, p_to: b }),
          supa.from('cash_tx').select('*').gte('tx_date', a).lte('tx_date', b).order('tx_date', { ascending: false }).order('id', { ascending: false }).limit(1000),
          supa.from('supplier_debts').select('*').order('due_date', { ascending: true, nullsFirst: false }).order('id')
        ]);
      } catch (e) { return toastErr(e); }
      txs = txs || []; debts = debts || [];
      const h = sum.hutang || {};
      el.querySelector('#kpi').innerHTML = `<div class="grid gauto">
        <div class="card kpi dark"><div class="label">Total saldo</div><div class="value">${rp(sum.accounts.filter((x) => x.active).reduce((s, x) => s + Number(x.saldo), 0))}</div><div class="sub">${sum.accounts.filter((x) => x.active).length} rekening</div></div>
        <div class="card kpi"><div class="label">Uang masuk</div><div class="value pos">${rp(sum.masuk)}</div></div>
        <div class="card kpi"><div class="label">Uang keluar</div><div class="value neg">${rp(sum.keluar)}</div><div class="sub">Selisih ${rp(sum.masuk - sum.keluar)}</div></div>
        <div class="card kpi ${h.n_telat ? 'warn' : ''}"><div class="label">Hutang supplier</div><div class="value">${rp(h.total)}</div><div class="sub">${h.n || 0} belum lunas${h.n_telat ? ` · <b style="color:var(--red)">${rp(h.telat)} lewat tempo</b>` : ''}</div></div></div>`;
      el.querySelector('#acclist').innerHTML = `<div class="list no-page">${sum.accounts.map((x) => `<button class="list-item" data-acc="${x.id}" ${x.active ? '' : 'style="opacity:.55"'}>
        <div class="grow"><b>${esc(x.name)}</b> <span class="tag">${esc(KIND[x.kind] || x.kind)}</span>${x.active ? '' : ' <span class="tag red">nonaktif</span>'}<div class="xs muted">Periode ini: +${num(x.masuk)} / −${num(x.keluar)}</div></div>
        <b class="num ${Number(x.saldo) < 0 ? 'neg' : ''}">${rp(x.saldo)}</b></button>`).join('')}</div>`;
      paint();
    };
    const accName = (id) => sum?.accounts.find((x) => String(x.id) === String(id))?.name || '–';
    const paint = () => {
      const box = el.querySelector('#body');
      if (tab === 'tx') {
        const list = acc ? txs.filter((t) => String(t.account_id) === acc) : txs;
        box.innerHTML = `<div class="card-h"><h2>Transaksi</h2><div class="row"><select class="input" id="fa" style="min-height:36px;width:auto"><option value="">Semua rekening</option>${sum.accounts.map((x) => `<option value="${x.id}" ${String(x.id) === acc ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button class="btn btn-sm" id="xl">${icon('download', 16)} Excel</button></div></div>
          ${list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Tanggal</th><th>Rekening</th><th>Kategori</th><th>Catatan</th><th class="right">Masuk</th><th class="right">Keluar</th><th></th></tr></thead><tbody>
          ${list.map((t) => `<tr><td>${fmtDate(t.tx_date, { day: 'numeric', month: 'short' })}</td><td>${esc(accName(t.account_id))}</td><td>${esc(t.category)}</td><td class="small">${esc(t.note || '')}</td>
            <td class="num pos">${t.kind === 'masuk' ? num(t.amount) : ''}</td><td class="num neg">${t.kind === 'keluar' ? num(t.amount) : ''}</td>
            <td><button class="btn btn-sm btn-ghost" data-del="${t.id}" aria-label="Hapus">${icon('x', 16)}</button></td></tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="4">Total</td><td class="num">${num(list.filter((t) => t.kind === 'masuk').reduce((s, t) => s + Number(t.amount), 0))}</td><td class="num">${num(list.filter((t) => t.kind === 'keluar').reduce((s, t) => s + Number(t.amount), 0))}</td><td></td></tr></tfoot></table></div>`
            : emptyState('Belum ada transaksi di periode ini.', 'wallet')}`;
        box.querySelector('#fa').onchange = (e) => { acc = e.target.value; paint(); };
        box.querySelector('#xl').onclick = () => downloadXlsx(`kas-${range().join('_')}.xlsx`, list.map((t) => ({ Tanggal: t.tx_date, Rekening: accName(t.account_id), Jenis: t.kind, Kategori: t.category, Catatan: t.note || '', Masuk: t.kind === 'masuk' ? Number(t.amount) : 0, Keluar: t.kind === 'keluar' ? Number(t.amount) : 0 })), 'Kas');
      } else if (tab === 'cat') {
        const rows = sum.by_cat.filter((c) => c.category !== 'Pindah saldo');
        const max = Math.max(1, ...rows.map((c) => Number(c.total)));
        box.innerHTML = `<div class="card-h"><h2>Per kategori</h2></div>${rows.length ? `<div class="list no-page">${rows.map((c) => `<div class="list-item"><div class="grow"><b>${esc(c.category)}</b> <span class="tag ${c.kind === 'masuk' ? 'green' : 'red'}">${c.kind}</span>
          <div class="hbar"><i style="width:${(Number(c.total) / max) * 100}%;background:${c.kind === 'masuk' ? 'var(--green)' : 'var(--red)'}"></i></div></div><b class="num">${rp(c.total)}</b></div>`).join('')}</div>` : emptyState('Belum ada data.', 'chart')}`;
      } else {
        const open = debts.filter((d) => Number(d.paid) < Number(d.amount)), done = debts.filter((d) => Number(d.paid) >= Number(d.amount));
        const row = (d) => { const sisa = Number(d.amount) - Number(d.paid), late = sisa > 0 && d.due_date && d.due_date < todayStr();
          return `<div class="list-item"><div class="grow"><b>${esc(d.supplier)}</b>${d.ref ? ` <span class="xs muted">${esc(d.ref)}</span>` : ''} ${late ? '<span class="tag red">lewat tempo</span>' : ''}
            <div class="xs muted">${fmtDate(d.debt_date)}${d.due_date ? ' · jatuh tempo ' + fmtDate(d.due_date) : ''}${d.note ? ' · ' + esc(d.note) : ''}</div>
            <div class="xs">Total ${rp(d.amount)} · dibayar ${rp(d.paid)}</div></div>
            <div style="text-align:right"><b class="num ${sisa > 0 ? 'neg' : 'pos'}">${sisa > 0 ? rp(sisa) : 'Lunas'}</b><div class="row" style="justify-content:flex-end;margin-top:4px">
            ${sisa > 0 ? `<button class="btn btn-sm btn-primary" data-pay="${d.id}">Bayar</button>` : ''}<button class="btn btn-sm btn-ghost" data-debt="${d.id}">Ubah</button></div></div></div>`; };
        box.innerHTML = `<div class="card-h"><h2>Hutang supplier</h2><button class="btn btn-sm btn-primary" data-debt-new>${icon('plus', 16)} Catat hutang</button></div>
          ${open.length ? `<div class="list no-page">${open.map(row).join('')}</div>` : emptyState('Tidak ada hutang yang belum lunas.', 'check')}
          ${done.length ? `<details style="padding:12px 16px"><summary class="small" style="cursor:pointer">Sudah lunas (${done.length})</summary><div class="list">${done.map(row).join('')}</div></details>` : ''}`;
      }
    };

    const accOpts = (sel, skip) => sum.accounts.filter((x) => x.active && String(x.id) !== String(skip)).map((x) => `<option value="${x.id}" ${String(x.id) === String(sel) ? 'selected' : ''}>${esc(x.name)} · ${rp(x.saldo)}</option>`).join('');
    on(el, 'click', '[data-new]', async (e, b) => {
      const kind = b.dataset.new;
      const r = await modal({ title: kind === 'masuk' ? 'Uang masuk' : kind === 'keluar' ? 'Uang keluar' : 'Pindah saldo', body: `<div class="grid g2">
        <label class="field">${kind === 'pindah' ? 'Dari rekening' : 'Rekening'}<select class="input" id="k-a">${accOpts(acc)}</select></label>
        ${kind === 'pindah' ? `<label class="field">Ke rekening<select class="input" id="k-b">${accOpts('', '')}</select></label>` : `<label class="field">Kategori<select class="input" id="k-c">${CAT[kind].map((c) => `<option>${c}</option>`).join('')}</select></label>`}
        <label class="field">Nominal<input class="input num" id="k-n" inputmode="numeric" data-money placeholder="0"></label>
        <label class="field">Tanggal<input class="input" id="k-d" type="date" value="${todayStr()}"></label>
        <label class="field" style="grid-column:1/-1">Catatan<input class="input" id="k-t" placeholder="${kind === 'pindah' ? 'mis. tarik saldo Shopee' : 'mis. bayar listrik Oktober'}"></label></div>`,
        actions: [{ label: 'Batal', value: null }, { label: 'Simpan', cls: 'btn-primary', onClick: async (ov) => {
          const v = (id) => ov.querySelector('#' + id)?.value;
          await rpc('kas_add', { p: { account_id: v('k-a'), to_account_id: v('k-b'), kind, category: v('k-c'), amount: parseNum(v('k-n')), tx_date: v('k-d'), note: v('k-t') } });
          return true;
        } }] });
      if (r) { toast('Tersimpan', 'ok'); load(); }
    });
    on(el, 'click', '[data-del]', async (e, b) => {
      const t = txs.find((x) => String(x.id) === b.dataset.del);
      if (!await confirmBox('Hapus transaksi?', `${esc(t.category)} ${rp(t.amount)}${t.transfer_id ? ' (kedua sisi pindah saldo ikut terhapus)' : ''}${t.ref_type === 'hutang' ? ' — sisa hutangnya akan bertambah lagi' : ''}.`, 'Hapus', true)) return;
      try { await rpc('kas_delete', { p_id: t.id }); toast('Dihapus', 'ok'); load(); } catch (err) { toastErr(err); }
    });
    const accForm = async (x = {}) => {
      const r = await modal({ title: x.id ? 'Ubah rekening' : 'Rekening baru', body: `<div class="grid g2">
        <label class="field" style="grid-column:1/-1">Nama<input class="input" id="a-n" value="${esc(x.name || '')}" placeholder="mis. BCA, Saldo TikTok"></label>
        <label class="field">Jenis<select class="input" id="a-k">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${x.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">Saldo awal<input class="input num" id="a-o" inputmode="numeric" data-money="neg" value="${num(x.opening || 0)}"></label>
        ${x.id ? `<label class="check" style="grid-column:1/-1"><input type="checkbox" id="a-a" ${x.active ? 'checked' : ''}> Aktif</label>` : ''}</div>`,
        actions: [{ label: 'Batal', value: null }, { label: 'Simpan', cls: 'btn-primary', onClick: async (ov) => {
          const v = (id) => ov.querySelector('#' + id);
          await rpc('kas_account_save', { p: { id: x.id, name: v('a-n').value, kind: v('a-k').value, opening: parseNum(v('a-o').value), active: v('a-a') ? v('a-a').checked : true } });
          return true;
        } }] });
      if (r) { toast('Tersimpan', 'ok'); load(); }
    };
    on(el, 'click', '[data-acc-new]', () => accForm());
    on(el, 'click', '[data-acc]', (e, b) => accForm(sum.accounts.find((x) => String(x.id) === b.dataset.acc)));
    const debtForm = async (d = {}) => {
      const r = await modal({ title: d.id ? 'Ubah hutang' : 'Catat hutang supplier', body: `<div class="grid g2">
        <label class="field">Supplier<input class="input" id="d-s" list="sup-l" value="${esc(d.supplier || '')}"><datalist id="sup-l"><option>WIN</option><option>STRONG</option></datalist></label>
        <label class="field">No. nota / referensi<input class="input" id="d-r" value="${esc(d.ref || '')}"></label>
        <label class="field">Nominal<input class="input num" id="d-n" inputmode="numeric" data-money value="${d.amount ? num(d.amount) : ''}"></label>
        <label class="field">Tanggal<input class="input" id="d-d" type="date" value="${d.debt_date || todayStr()}"></label>
        <label class="field">Jatuh tempo<input class="input" id="d-t" type="date" value="${d.due_date || addDays(todayStr(), 30)}"></label>
        <label class="field">Catatan<input class="input" id="d-c" value="${esc(d.note || '')}"></label></div>`,
        actions: [...(d.id && !Number(d.paid) ? [{ label: 'Hapus', cls: 'btn-ghost', value: 'del' }] : []), { label: 'Batal', value: null }, { label: 'Simpan', cls: 'btn-primary', onClick: async (ov) => {
          const v = (id) => ov.querySelector('#' + id).value;
          await rpc('debt_save', { p: { id: d.id, supplier: v('d-s'), ref: v('d-r'), amount: parseNum(v('d-n')), debt_date: v('d-d'), due_date: v('d-t'), note: v('d-c') } });
          return true;
        } }] });
      if (r === 'del') { if (await confirmBox('Hapus hutang ini?', esc(d.supplier) + ' ' + rp(d.amount), 'Hapus', true)) { try { await rpc('debt_delete', { p_id: d.id }); load(); } catch (e) { toastErr(e); } } return; }
      if (r) { toast('Tersimpan', 'ok'); load(); }
    };
    on(el, 'click', '[data-debt-new]', () => debtForm());
    on(el, 'click', '[data-debt]', (e, b) => debtForm(debts.find((d) => String(d.id) === b.dataset.debt)));
    on(el, 'click', '[data-pay]', async (e, b) => {
      const d = debts.find((x) => String(x.id) === b.dataset.pay); const sisa = Number(d.amount) - Number(d.paid);
      const r = await modal({ title: 'Bayar hutang ' + d.supplier, body: `<div class="grid g2">
        <label class="field">Nominal (sisa ${rp(sisa)})<input class="input num" id="p-n" inputmode="numeric" data-money value="${num(sisa)}"></label>
        <label class="field">Dari rekening<select class="input" id="p-a">${accOpts()}</select></label>
        <label class="field">Tanggal<input class="input" id="p-d" type="date" value="${todayStr()}"></label>
        <label class="field">Catatan<input class="input" id="p-c"></label></div>`,
        actions: [{ label: 'Batal', value: null }, { label: 'Bayar', cls: 'btn-primary', onClick: async (ov) => {
          const v = (id) => ov.querySelector('#' + id).value;
          await rpc('debt_pay', { p_debt: d.id, p_amount: parseNum(v('p-n')), p_account: +v('p-a'), p_note: v('p-c') || null, p_date: v('p-d') });
          return true;
        } }] });
      if (r) { toast('Pembayaran dicatat', 'ok'); load(); }
    });
    on(el, 'click', '[data-chips] .chip', (e, b) => {
      const g = b.closest('[data-chips]').dataset.chips;
      b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      if (g === 'p') { period = b.dataset.v; load(); } else { tab = b.dataset.v; paint(); }
    });
    if (store.role !== 'owner' && store.role !== 'keuangan') el.querySelector('#act').remove();
    load();
  }
};
