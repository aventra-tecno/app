import { supa } from '../supa.js';
import { esc, toast, toastErr, fmtDate, fmtDateTime, emptyState, confirmBox, icon, todayStr } from '../ui.js';

// Owner menulis pengumuman: tampil di halaman login (sebelum masuk) dan/atau dikirim sebagai notifikasi ke pegawai.
const ROLES = ['admin', 'sopir', 'kepala_gudang', 'picker', 'packing'];

export default {
  tour: [
    { sel: '#form', title: 'Tulis pengumuman', body: 'Judul wajib, isi boleh panjang. Centang "Tampil di halaman login" supaya pegawai membacanya sebelum masuk.' },
    { sel: '#list', title: 'Daftar pengumuman', body: 'Nyalakan / matikan, sematkan sebagai Penting, atau hapus.' }
  ],
  async render(el) {
    el.innerHTML = `<div class="stack">
      <div class="alert yellow small">${icon('alert', 16)} Pengumuman yang <b>tampil di halaman login</b> bisa dibaca siapa saja yang membuka link aplikasi (belum login). Jangan tulis data rahasia seperti harga beli atau password.</div>
      <form class="card stack" id="form">
        <h2 class="sec-title">Tulis pengumuman</h2>
        <label class="field">Judul<input class="input" name="title" maxlength="80" required placeholder="Contoh: Libur Idul Adha 6–7 Juni"></label>
        <label class="field">Isi (boleh kosong)<textarea class="input" name="body" rows="3" maxlength="600" placeholder="Detail pengumuman…"></textarea></label>
        <label class="field">Tampil sampai tanggal (kosongkan = terus tampil)<input class="input" type="date" name="expires_at" min="${todayStr()}"></label>
        <label class="check"><input type="checkbox" name="show_login" checked> Tampil di halaman login</label>
        <label class="check"><input type="checkbox" name="pinned"> Tandai <b>Penting</b> (paling atas)</label>
        <div class="small muted">Pengumuman otomatis dikirim sebagai notifikasi ke semua pegawai (owner tidak menerima, karena owner yang menulis).</div>
        <button class="btn btn-primary btn-lg">Simpan pengumuman</button>
      </form>
      <section class="card flush" id="list"><div class="card-h"><h2>Daftar pengumuman</h2></div><div id="rows"></div></section>
    </div>`;

    const load = async () => {
      const { data, error } = await supa.from('announcements').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100);
      if (error) { el.querySelector('#rows').innerHTML = `<div class="alert red" style="margin:12px">${esc(error.message)}</div>`; return; }
      const today = todayStr();
      el.querySelector('#rows').innerHTML = data.length ? `<div class="list">${data.map((a) => {
        const expired = a.expires_at && a.expires_at < today;
        const st = !a.active ? '<span class="tag">Mati</span>' : expired ? '<span class="tag">Kedaluwarsa</span>' : '<span class="tag green">Tayang</span>';
        return `<div class="list-item ann-row" style="align-items:flex-start">
          <div class="grow" style="min-width:0">
            <div class="row wrap" style="gap:6px">${st}${a.pinned ? '<span class="tag yellow">Penting</span>' : ''}${a.show_login ? '<span class="tag blue">Login</span>' : ''}</div>
            <b style="display:block;margin-top:6px">${esc(a.title)}</b>
            ${a.body ? `<div class="small muted" style="white-space:pre-line;overflow-wrap:anywhere">${esc(a.body)}</div>` : ''}
            <div class="xs muted" style="margin-top:4px">${fmtDateTime(a.created_at)}${a.expires_at ? ' · sampai ' + fmtDate(a.expires_at) : ''}</div>
          </div>
          <div class="stack" style="gap:6px;flex:none">
            <button class="btn btn-sm" data-act="active" data-id="${a.id}" data-v="${a.active ? 0 : 1}">${a.active ? 'Matikan' : 'Nyalakan'}</button>
            <button class="btn btn-sm" data-act="pinned" data-id="${a.id}" data-v="${a.pinned ? 0 : 1}">${a.pinned ? 'Lepas' : 'Sematkan'}</button>
            <button class="btn btn-sm btn-ghost" data-act="del" data-id="${a.id}" style="color:var(--red)">Hapus</button>
          </div></div>`;
      }).join('')}</div>` : emptyState('Belum ada pengumuman.', 'bell');
    };

    el.querySelector('#form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const row = {
        title: fd.get('title').trim(), body: fd.get('body').trim() || null,
        show_login: fd.get('show_login') === 'on', pinned: fd.get('pinned') === 'on',
        expires_at: fd.get('expires_at') || null, active: true
      };
      if (!row.title) return toast('Judul wajib diisi', 'err');
      const btn = e.target.querySelector('button'); btn.disabled = true;
      try {
        const { error } = await supa.from('announcements').insert(row);
        if (error) throw error;
        {
          const { error: ne } = await supa.from('notifications').insert(ROLES.map((r) => ({ target_role: r, level: 'info', source_role: 'owner', title: '📢 ' + row.title, body: row.body, link: '#/notifikasi' })));
          if (ne) throw ne;
        }
        e.target.reset(); e.target.querySelector('[name=show_login]').checked = true;
        toast('Pengumuman tersimpan', 'ok');
        load();
      } catch (err) { toastErr(err); } finally { btn.disabled = false; }
    });

    el.querySelector('#rows').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const id = +b.dataset.id;
      try {
        if (b.dataset.act === 'del') {
          if (!(await confirmBox('Hapus pengumuman?', 'Pengumuman ini hilang dari halaman login.', 'Hapus', true))) return;
          const { error } = await supa.from('announcements').delete().eq('id', id); if (error) throw error;
        } else {
          const { error } = await supa.from('announcements').update({ [b.dataset.act]: b.dataset.v === '1' }).eq('id', id); if (error) throw error;
        }
        load();
      } catch (err) { toastErr(err); }
    });
    load();
  }
};
