import { rpc, supa } from '../supa.js';
import { SUPABASE_URL } from '../config.js';
import { billRow } from '../billing.js';
import { store } from '../store.js';
import { esc, num, rp, toast, toastErr, icon, modal, on, parseNum, todayStr, addDays, confirmBox, promptBox, fmtDate } from '../ui.js';
import { pushPermission, subscribePush, sendTestPush, pushSupported } from '../push.js';
import { CURRENT, deviceLabel, fetchLatest } from '../version.js';
import { loadModules, modStatus, modOn } from '../modules.js';

// Super admin (pembuat aplikasi): menu sendiri, terpisah dari menu toko.
// Halaman ini = Ringkasan. Menu lain: sa-jabatan, sa-modul, sa-tagihan, sa-telegram, sa-alat (+ Log aktivitas).
export const saGuard = (el) => { if (!store.superadmin) { el.innerHTML = '<div class="alert red">Hanya untuk super admin.</div>'; return false; } return true; };

export default {
  async render(el) {
    if (!saGuard(el)) return;
    el.innerHTML = `<div class="stack" style="max-width:980px">
      <div class="alert yellow small">${icon('shield', 16)} Menu khusus <b>super admin</b>. Tidak terlihat oleh owner &amp; pegawai. Semua tindakan tercatat di Log aktivitas.</div>
      <div id="kpi"><div class="skeleton" style="height:96px"></div></div>
      <div class="sa-tiles">${[['sa-jabatan', 'users', 'Masuk sebagai jabatan', 'Lihat & pakai aplikasi persis seperti owner / pegawai'],
        ['sa-modul', 'lock', 'Menu & harga', 'Harga menu tambahan, buka semua menu gratis sampai tanggal tertentu'],
        ['sa-tagihan', 'receipt', 'Tagihan & Mayar', 'Tagihan bulanan, tagihan khusus, koneksi Mayar'],
        ['sa-telegram', 'send', 'Bot Telegram', 'Bot notifikasi untuk owner'],
        ['log', 'clock', 'Log aktivitas', 'Semua kegiatan di aplikasi'],
        ['sa-alat', 'gear', 'Alat & data', 'Tes notifikasi HP, hapus semua data']].map(([k, ic, t, d]) => `<a class="card sa-tile" href="#/${k}"><span class="sa-ic">${icon(ic, 20)}</span><div><b>${t}</b><div class="xs muted">${d}</div></div></a>`).join('')}</div>
      <section class="card stack" id="info"><div class="skeleton" style="height:90px"></div></section>
    </div>`;
    const [s, l, bs, mods] = await Promise.all([rpc('sa_status').catch(() => null), fetchLatest(), rpc('billing_status').catch(() => null), loadModules().catch(() => ({}))]);
    const all = Object.values(mods), on_ = all.filter((m) => modOn(m.code));
    const free = all.find((m) => m.free_until && m.free_until >= todayStr());
    el.querySelector('#kpi').innerHTML = `<div class="grid gauto">
      <div class="card kpi dark"><div class="label">Tagihan belum dibayar</div><div class="value">${bs ? rp(bs.unpaid_total) : '–'}</div><div class="sub" style="color:var(--accent)">${bs ? bs.unpaid + ' tagihan' + (bs.next_due ? ' · jatuh tempo ' + fmtDate(bs.next_due) : '') : ''}</div></div>
      <div class="card kpi"><div class="label">Menu tambahan aktif</div><div class="value">${on_.length} / ${all.length}</div><div class="sub">${free ? 'Gratis s/d ' + fmtDate(free.free_until) : 'tidak ada masa gratis'}</div></div>
      <div class="card kpi"><div class="label">Mayar</div><div class="value" style="font-size:18px">${bs?.mayar_ready ? 'Terhubung' : 'Belum'}</div><div class="sub">${esc(bs?.mayar_mode || '')}</div></div>
      <div class="card kpi"><div class="label">Pegawai</div><div class="value">${s ? num(s.pegawai) : '–'}</div><div class="sub">${s ? num(s.hp_notifikasi) + ' HP terdaftar notifikasi' : ''}</div></div></div>`;
    el.querySelector('#info').innerHTML = s ? `<h2 class="sec-title">Ringkasan data</h2>
      <div class="grid gkpi">${[['Barang', s.barang], ['Rak', s.rak], ['Pesanan', s.pesanan], ['Pergerakan stok', s.pergerakan_stok], ['Notifikasi', s.notifikasi], ['Log aktivitas', s.log]].map(([k, v]) => `<div class="stat gray"><b>${num(v)}</b><span>${k}</span></div>`).join('')}</div>
      <div class="xs muted">Aplikasi v${esc(CURRENT.version)} (server v${esc(l?.version || '-')}) · ${esc(deviceLabel())}</div>` : '<div class="alert yellow">Jalankan <b>supabase/update-2.1.sql</b> dulu.</div>';
  }
};

// ---------- alat: tes notifikasi & hapus semua data ----------
export function alatUI(el) {
  el.innerHTML = `<div class="stack" style="max-width:820px">
      <section class="card stack"><h2 class="sec-title">${icon('bell', 18)} Tes notifikasi HP</h2>
        <div class="small muted">Mengirim notifikasi tes ke perangkat ini. Tutup / kecilkan aplikasi setelah menekan tombol; notifikasi harus muncul dalam beberapa detik.</div>
        <div class="row wrap"><button class="btn btn-primary" id="ptest">Kirim notifikasi tes</button><button class="btn" id="preg">Daftarkan ulang perangkat ini</button></div>
        <div class="small" id="pst"></div></section>
      <section class="card stack danger-zone"><h2 class="sec-title" style="color:var(--red)">${icon('alert', 18)} Hapus semua data</h2>
        <div class="small">Menghapus <b>semua</b> barang, harga, rak, stok, pesanan, upload, beli WIN, retur, opname, notifikasi, kecurangan, log, absen, gaji, biaya, dan pengumuman.<br>
          <b>Tetap ada:</b> akun pegawai &amp; jabatan, pengaturan toko, daftar toko, dan pendaftaran notifikasi HP. <b>Tidak bisa dibatalkan.</b></div>
        <div class="xs muted" id="cnt"></div>
        <div id="keybox"></div></section></div>`;
    const loadInfo = async () => {
      try { const s = await rpc('sa_status'); paintKey(s.kunci_ada); el.querySelector('#cnt').textContent = `${num(s.barang)} barang · ${num(s.pesanan)} pesanan · ${num(s.pergerakan_stok)} pergerakan stok`; }
      catch (e) { el.querySelector('#keybox').innerHTML = `<div class="alert yellow small">${esc(e.message)}</div>`; }
    };
    const paintKey = (has) => {
      const box = el.querySelector('#keybox');
      box.innerHTML = has ? `<div class="grid g2">
          <label class="field">Kunci hapus<input class="input" id="k" type="password" autocomplete="off"></label>
          <label class="field">Ketik <b>HAPUS SEMUA DATA</b><input class="input" id="c" autocomplete="off" placeholder="HAPUS SEMUA DATA"></label></div>
        <div class="row wrap between"><button class="btn btn-ghost btn-sm" id="chg">Ganti kunci</button><button class="btn btn-dark" id="del" style="background:var(--red);border-color:var(--red)">Hapus semua data</button></div>`
        : `<div class="alert blue small">Buat <b>kunci hapus</b> dulu (minimal 8 karakter). Kunci ini disimpan teracak di server dan diminta setiap kali menghapus data. Simpan baik-baik: kalau lupa, hapus data tidak bisa dilakukan dari aplikasi.</div>
        <div class="grid g2"><label class="field">Kunci baru<input class="input" id="n1" type="password" autocomplete="new-password"></label><label class="field">Ulangi kunci<input class="input" id="n2" type="password" autocomplete="new-password"></label></div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" id="mk">Simpan kunci</button></div>`;
      box.querySelector('#mk')?.addEventListener('click', async () => {
        const a = box.querySelector('#n1').value, b = box.querySelector('#n2').value;
        if (a.length < 8) return toast('Kunci minimal 8 karakter', 'err');
        if (a !== b) return toast('Kunci tidak sama', 'err');
        try { await rpc('sa_set_reset_key', { p_new: a }); toast('Kunci tersimpan', 'ok'); paintKey(true); } catch (e) { toastErr(e); }
      });
      box.querySelector('#chg')?.addEventListener('click', async () => {
        const r = await modal({ title: 'Ganti kunci hapus', body: `<div class="stack"><label class="field">Kunci lama<input class="input" id="o" type="password"></label><label class="field">Kunci baru (min. 8)<input class="input" id="n" type="password"></label></div>`,
          actions: [{ label: 'Batal', value: null }, { label: 'Simpan', cls: 'btn-primary', onClick: async (ov) => { await rpc('sa_set_reset_key', { p_new: ov.querySelector('#n').value, p_old: ov.querySelector('#o').value }); return true; } }] });
        if (r) toast('Kunci diganti', 'ok');
      });
      box.querySelector('#del')?.addEventListener('click', async (e) => {
        const key = box.querySelector('#k').value, conf = box.querySelector('#c').value;
        if (!key) return toast('Isi kunci hapus', 'err');
        if (conf.trim().toUpperCase() !== 'HAPUS SEMUA DATA') return toast('Ketik HAPUS SEMUA DATA', 'err');
        const ok = await modal({ title: 'Yakin hapus semua data?', body: '<p style="margin:0">Semua barang, stok, pesanan, dan laporan akan hilang permanen. Akun pegawai tetap ada.</p>',
          actions: [{ label: 'Batal', value: false }, { label: 'Ya, hapus permanen', cls: 'btn-dark', value: true }] });
        if (!ok) return;
        e.target.disabled = true;
        try { const r = await rpc('sa_reset_all', { p_key: key, p_confirm: conf }); toast(`Terhapus: ${r.barang} barang, ${r.pesanan} pesanan.`, 'ok'); loadInfo(); }
        catch (err) { toastErr(err); } finally { e.target.disabled = false; }
      });
    };

    el.querySelector('#ptest').onclick = async (e) => {
      if (!pushSupported()) return toast('Perangkat ini tidak mendukung notifikasi', 'err');
      if (pushPermission() !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') return toast('Izin notifikasi belum diberikan', 'err'); }
      e.target.disabled = true;
      try { await subscribePush(); await sendTestPush(); toast('Tes dikirim. Kecilkan aplikasi, tunggu beberapa detik.', 'ok'); el.querySelector('#pst').textContent = 'Terkirim ' + new Date().toLocaleTimeString('id-ID'); }
      catch (err) { toastErr(err); } finally { setTimeout(() => { e.target.disabled = false; }, 4000); }
    };
    el.querySelector('#preg').onclick = async () => { try { await subscribePush(); toast('Perangkat terdaftar', 'ok'); loadInfo(); } catch (err) { toastErr(err); } };
    loadInfo();
}

// ---------- tagihan: diatur super admin, dibayar owner ----------
export function billingUI(root) {
  const box = root.querySelector('#billing'), list = root.querySelector('#bills');
  const load = async () => {
    let st, cfg;
    try {
      st = await rpc('billing_status');
      ({ data: cfg } = await supa.from('billing_config').select('*').eq('id', 1).single());
    } catch (e) { box.innerHTML = `<h2 class="sec-title">${icon('receipt', 18)} Tagihan &amp; pembayaran</h2><div class="alert yellow small">Jalankan <b>supabase/update-2.5.sql</b> dulu. (${esc(e.message)})</div>`; return; }
    const hook = `${SUPABASE_URL}/functions/v1/tagihan?hook=${st.hook_token || ''}`;
    box.innerHTML = `<h2 class="sec-title">${icon('receipt', 18)} Tagihan &amp; pembayaran (Mayar)</h2>
      <div class="small muted">Owner melihat & membayar tagihan di menu <b>Tagihan</b>. Tagihan bulanan dibuat otomatis setiap tanggal 1${st.cron ? '' : ' (penjadwal pg_cron belum aktif: tagihan dibuat saat aplikasi dibuka)'}, ditambah pengingat H-3, saat jatuh tempo, dan 3 hari setelah terlambat.</div>
      <h3 class="sub-title">Tagihan bulanan</h3>
      <div class="list-item" style="padding:0;border:0"><div class="grow"><b>Tagih setiap bulan</b><div class="small muted">Matikan kalau pelanggan belum mulai berlangganan.</div></div>
        <label class="switch"><input type="checkbox" id="b-on" ${cfg.active ? 'checked' : ''} aria-label="Tagihan bulanan aktif"><span></span></label></div>
      <div class="grid gauto fields-end">
        <label class="field">Nominal per bulan (Rp)<input class="input num" id="b-amt" data-money inputmode="numeric" value="${num(cfg.monthly_amount)}"></label>
        <label class="field">Jatuh tempo tanggal (1–28)<input class="input num" id="b-due" inputmode="numeric" value="${cfg.due_day}"></label>
        <label class="field">Mulai ditagih bulan<input class="input" type="month" id="b-start" value="${cfg.start_month ? cfg.start_month.slice(0, 7) : ''}"></label>
      </div>
      <label class="field">Judul tagihan (nama bulan ditambahkan otomatis)<input class="input" id="b-title" value="${esc(cfg.monthly_title)}"></label>
      <label class="field">Keterangan (tampil di tagihan owner)<textarea class="input" id="b-desc" rows="2" placeholder="mis. Server, backup harian, perawatan & dukungan">${esc(cfg.monthly_desc || '')}</textarea></label>
      <h3 class="sub-title">Data pembayar di invoice Mayar</h3>
      <div class="grid gauto fields-end">
        <label class="field">Nama (kosong = nama toko)<input class="input" id="b-pn" value="${esc(cfg.pay_name || '')}"></label>
        <label class="field">Email (kosong = email owner)<input class="input" id="b-pe" type="email" value="${esc(cfg.pay_email || '')}"></label>
        <label class="field">No. HP / WA (wajib di Mayar)<input class="input" id="b-pm" inputmode="tel" value="${esc(cfg.pay_mobile || '')}" placeholder="08xxxxxxxxxx"></label>
      </div>
      <h3 class="sub-title">Koneksi Mayar</h3>
      <div class="grid gauto fields-end">
        <label class="field">Mode<select class="input" id="b-mode"><option value="sandbox" ${cfg.mayar_mode !== 'production' ? 'selected' : ''}>Sandbox (uji coba, uang tidak sungguhan)</option><option value="production" ${cfg.mayar_mode === 'production' ? 'selected' : ''}>Production (pembayaran asli)</option></select></label>
        <label class="field">Kunci API Mayar ${st.mayar_ready ? '<span class="tag green">tersimpan</span>' : '<span class="tag red">belum ada</span>'}<input class="input mono" id="b-key" type="password" autocomplete="off" placeholder="${st.mayar_ready ? 'kosongkan = tetap pakai kunci lama' : 'tempel kunci API dari web.mayar.id/api-keys'}"></label>
      </div>
      <label class="field">Alamat webhook (tempel di Mayar › Integrasi › Webhook)<div class="row" style="flex-wrap:nowrap"><input class="input mono xs grow" id="b-hook" readonly value="${esc(hook)}"><button type="button" class="btn btn-sm" id="b-copy">Salin</button><button type="button" class="btn btn-sm btn-ghost" id="b-reset" title="Buat alamat baru (alamat lama tidak berlaku)">Ganti</button></div></label>
      <div class="row wrap" style="justify-content:flex-end"><button class="btn" id="b-now">Buat tagihan bulan ini sekarang</button><button class="btn btn-primary" id="b-save">Simpan pengaturan tagihan</button></div>
      <h3 class="sub-title">Tagihan khusus</h3>
      <div class="small muted">Tagihan sekali bayar, mis. pemasangan, aplikasi Android, tambahan fitur.</div>
      <div class="grid gauto fields-end">
        <label class="field">Judul<input class="input" id="k-title" placeholder="mis. Pembuatan aplikasi Android"></label>
        <label class="field">Nominal (Rp)<input class="input num" id="k-amt" data-money inputmode="numeric"></label>
        <label class="field">Jatuh tempo<input class="input" type="date" id="k-due" value="${addDays(todayStr(), 7)}"></label>
      </div>
      <label class="field">Keterangan<textarea class="input" id="k-desc" rows="2"></textarea></label>
      <div class="row" style="justify-content:flex-end"><button class="btn btn-dark" id="k-add">${icon('plus', 16)} Buat tagihan khusus</button></div>`;

    box.querySelector('#b-copy').onclick = async () => { try { await navigator.clipboard.writeText(hook); toast('Alamat webhook disalin', 'ok'); } catch (_) { box.querySelector('#b-hook').select(); } };
    box.querySelector('#b-reset').onclick = async () => {
      if (!(await confirmBox('Ganti alamat webhook?', 'Alamat lama tidak berlaku lagi. Tempel alamat baru di dashboard Mayar.'))) return;
      try { await rpc('sa_mayar_hook_reset'); load(); toast('Alamat webhook baru dibuat', 'ok'); } catch (e) { toastErr(e); }
    };
    box.querySelector('#b-save').onclick = async (e) => {
      const due = Math.round(+box.querySelector('#b-due').value);
      if (!(due >= 1 && due <= 28)) return toast('Tanggal jatuh tempo 1–28', 'err');
      e.target.disabled = true;
      try {
        await rpc('sa_billing_save', { p: {
          active: box.querySelector('#b-on').checked, monthly_amount: parseNum(box.querySelector('#b-amt').value), due_day: due,
          start_month: box.querySelector('#b-start').value ? box.querySelector('#b-start').value + '-01' : '',
          monthly_title: box.querySelector('#b-title').value, monthly_desc: box.querySelector('#b-desc').value,
          pay_name: box.querySelector('#b-pn').value, pay_email: box.querySelector('#b-pe').value, pay_mobile: box.querySelector('#b-pm').value,
          mayar_mode: box.querySelector('#b-mode').value } });
        const key = box.querySelector('#b-key').value.trim();
        if (key) await rpc('sa_mayar_key', { p_key: key });
        toast('Pengaturan tagihan tersimpan', 'ok'); load();
      } catch (err) { toastErr(err); } finally { e.target.disabled = false; }
    };
    box.querySelector('#b-now').onclick = async () => {
      try { const n = await rpc('billing_ensure'); toast(n ? 'Tagihan bulan ini dibuat & owner diberi notifikasi' : 'Tagihan bulan ini sudah ada (atau tagihan bulanan belum aktif / belum disimpan)', n ? 'ok' : ''); loadList(); } catch (e) { toastErr(e); }
    };
    box.querySelector('#k-add').onclick = async () => {
      const p = { title: box.querySelector('#k-title').value.trim(), amount: parseNum(box.querySelector('#k-amt').value), due_date: box.querySelector('#k-due').value, description: box.querySelector('#k-desc').value };
      if (!p.title) return toast('Isi judul tagihan', 'err');
      if (!(p.amount > 0)) return toast('Isi nominal', 'err');
      try { await rpc('sa_bill_create', { p }); toast('Tagihan khusus dibuat, owner diberi notifikasi', 'ok'); ['#k-title', '#k-amt', '#k-desc'].forEach((s) => { box.querySelector(s).value = ''; }); loadList(); } catch (e) { toastErr(e); }
    };
    loadList();
  };
  const loadList = async () => {
    const { data, error } = await supa.from('bills').select('*').order('created_at', { ascending: false }).limit(60);
    if (error) { list.innerHTML = ''; return; }
    list.innerHTML = `<div class="card-h"><h2>Semua tagihan</h2><span class="xs muted">${data.filter((b) => ['belum', 'menunggu'].includes(b.status)).length} belum lunas</span></div>` + (data.length ? `<div class="list">${data.map((b) => billRow(b,
      `<div class="row" style="gap:4px;justify-content:flex-end;flex-wrap:wrap">${['belum', 'menunggu'].includes(b.status) ? `<button class="btn btn-sm" data-ba="lunas" data-id="${b.id}">Tandai lunas</button><button class="btn btn-sm btn-ghost" data-ba="batal" data-id="${b.id}">Batalkan</button>` : `<button class="btn btn-sm btn-ghost" data-ba="buka" data-id="${b.id}">Buka lagi</button>`}${b.status !== 'lunas' ? `<button class="btn btn-sm btn-ghost" data-ba="hapus" data-id="${b.id}" style="color:var(--red)">Hapus</button>` : ''}</div>`)).join('')}</div>` : '<div class="muted small" style="padding:16px">Belum ada tagihan.</div>');
  };
  on(list, 'click', '[data-ba]', async (e, b) => {
    const act = b.dataset.ba; let note = null;
    if (act === 'lunas') { note = await promptBox('Tandai lunas', 'Dibayar lewat (mis. transfer BCA, tunai)', { required: false, value: 'Transfer manual' }); if (note === null) return; }
    else if (!(await confirmBox({ batal: 'Batalkan tagihan?', buka: 'Buka lagi tagihan ini?', hapus: 'Hapus tagihan?' }[act], act === 'buka' ? 'Status kembali menjadi belum dibayar.' : 'Owner tidak perlu membayar tagihan ini.', 'Ya', act === 'hapus'))) return;
    try { await rpc('sa_bill_action', { p_id: +b.dataset.id, p_action: act, p_note: note }); toast('Tersimpan', 'ok'); loadList(); } catch (err) { toastErr(err); }
  });
  return load;
}


// ---------- bot Telegram (milik pembuat aplikasi) ----------
export async function tgBotUI(box) {
  let st;
  try { st = await rpc('tg_status'); } catch (e) { box.innerHTML = `<h2 class="sec-title">${icon('send', 18)} Bot Telegram</h2><div class="alert yellow small">Jalankan <b>supabase/update-2.6.sql</b> dulu.</div>`; return; }
  st = st || {};
  box.innerHTML = `<h2 class="sec-title">${icon('send', 18)} Bot Telegram</h2>
    <div class="small muted">Bot ini dipakai untuk mengirim notifikasi ke Telegram owner. Owner cukup menekan <b>Hubungkan</b> di menu Pengaturan. Bot yang sama boleh dipakai untuk banyak pelanggan.</div>
    <details ${st.token_set ? '' : 'open'}><summary style="cursor:pointer;font-weight:600">Cara membuat bot (sekali saja)</summary>
      <ol class="small" style="line-height:1.8;margin:8px 0 0;padding-left:20px">
        <li>Buka Telegram, cari <b>@BotFather</b> (centang biru), tekan Start.</li>
        <li>Kirim <span class="mono">/newbot</span>. Isi nama bot (mis. <i>Notif Stok Gudang</i>), lalu username yang berakhiran <b>bot</b> (mis. <i>NotifStokGudangBot</i>).</li>
        <li>BotFather membalas dengan <b>token</b> (mis. <span class="mono">123456789:AAH…</span>). Salin token itu & username bot ke kolom di bawah.</li>
        <li>Supaya bot bisa dimasukkan ke grup pelanggan: kirim <span class="mono">/setjoingroups</span> ke BotFather, pilih bot, pilih <b>Enable</b>.</li>
        <li>Jangan pasang webhook pada bot ini (aplikasi membaca pesan Start lewat getUpdates).</li></ol></details>
    <div class="grid gauto fields-end">
      <label class="field">Token bot ${st.token_set ? '<span class="tag green">tersimpan</span>' : '<span class="tag red">belum ada</span>'}<input class="input mono" id="sb-token" type="password" autocomplete="off" placeholder="${st.token_set ? 'kosongkan = tetap pakai token lama' : '123456789:AAH…'}"></label>
      <label class="field">Username bot<input class="input mono" id="sb-user" value="${esc(st.bot || '')}" placeholder="NotifStokGudangBot"></label>
    </div>
    <div class="small muted">Owner saat ini: ${st.chat_id ? `<b>terhubung</b> (${esc(st.chat_name || st.chat_id)})` : 'belum terhubung'}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" id="sb-save">Simpan bot</button></div>`;
  box.querySelector('#sb-save').onclick = async () => {
    const u = box.querySelector('#sb-user').value.trim();
    if (!u) return toast('Isi username bot', 'err');
    try { await rpc('sa_tg_bot', { p_token: box.querySelector('#sb-token').value.trim() || null, p_username: u }); toast('Bot tersimpan', 'ok'); tgBotUI(box); } catch (e) { toastErr(e); }
  };
}

// ---------- menu & jabatan tambahan: harga, masa aktif, buka / kunci manual ----------
export async function modsUI(box) {
  const mods = Object.values(await loadModules());
  if (!mods.length) { box.innerHTML = `<div class="card-h"><h2>${icon('lock', 18)} Menu tambahan</h2></div><div class="alert yellow small" style="margin:0 16px 16px">Jalankan <b>supabase/update-2.13.sql</b> dulu.</div>`; return; }
  box.innerHTML = `<div class="card-h"><h2>${icon('lock', 18)} Menu &amp; jabatan tambahan</h2></div>
    <div class="small muted" style="padding:0 16px 8px">Atur harga & cara bayar setiap menu. Owner melihat menu bergembok dan bisa membukanya sendiri lewat Mayar. Harga 0 = tidak dijual (hanya bisa dibuka manual di sini).</div>
    <div class="table-wrap"><table class="tbl" style="min-width:760px"><thead><tr><th>Menu / jabatan</th><th>Status</th><th class="right">Harga</th><th>Bayar</th><th></th></tr></thead><tbody>
    ${mods.map((m) => { const [st, cls] = modStatus(m); return `<tr data-m="${esc(m.code)}"><td><b>${esc(m.name)}</b><div class="xs muted">${m.kind === 'jabatan' ? 'Jabatan' : 'Menu'} · ${esc(m.code)}</div></td>
      <td><span class="tag ${cls}">${esc(st)}</span></td>
      <td><input class="input num" data-price inputmode="numeric" data-money value="${num(m.price)}" style="width:120px;min-height:36px"></td>
      <td><select class="input" data-period style="min-height:36px;width:auto"><option value="bulanan" ${m.period === 'bulanan' ? 'selected' : ''}>Bulanan</option><option value="sekali" ${m.period === 'sekali' ? 'selected' : ''}>Sekali bayar</option></select></td>
      <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn btn-sm btn-primary" data-save>Simpan</button><button class="btn btn-sm" data-acc>Akses…</button></div></td></tr>`; }).join('')}</tbody></table></div>`;
  box.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', async () => {
    const tr = b.closest('tr');
    try { await rpc('sa_module_save', { p: { code: tr.dataset.m, price: parseNum(tr.querySelector('[data-price]').value), period: tr.querySelector('[data-period]').value } }); toast('Tersimpan', 'ok'); } catch (e) { toastErr(e); }
  }));
  box.querySelectorAll('[data-acc]').forEach((b) => b.addEventListener('click', async () => {
    const code = b.closest('tr').dataset.m, m = mods.find((x) => x.code === code);
    const r = await modal({ title: 'Akses: ' + m.name, body: `<div class="stack"><div class="small">Status sekarang: <b>${esc(modStatus(m)[0])}</b></div>
        <label class="field">Gratis sampai tanggal<input class="input" type="date" id="mu" value="${m.free_until && m.free_until > todayStr() ? m.free_until : addDays(todayStr(), 30)}"></label>
        <div class="xs muted">Gratis = terbuka tanpa bayar sampai tanggal itu (masa coba, pembayaran di luar Mayar, kompensasi). Kunci = cabut semua akses (gratis &amp; langganan). Semua perubahan tercatat di log.</div></div>`,
      actions: [{ label: 'Kunci', cls: 'btn-ghost', value: 'kunci' }, { label: 'Buka selamanya', value: 'selamanya' }, { label: 'Gratis sampai tanggal', cls: 'btn-primary', onClick: (ov) => 'gratis:' + ov.querySelector('#mu').value }] });
    if (!r) return;
    const [act, until] = r.split(':');
    if (act === 'kunci' && !await confirmBox('Kunci ' + m.name + '?', 'Menu ini langsung terkunci untuk owner & pegawai. Data tidak dihapus.', 'Kunci', true)) return;
    try { await rpc('sa_module_access', { p_code: code, p_action: act, p_until: until || null }); toast('Akses diperbarui', 'ok'); modsUI(box); } catch (e) { toastErr(e); }
  }));
}
