// Aventra Leads · Tim & Akses (v1.7.0)
import { api } from '../api.js';
import { esc, icon, modal, toast, $, $$ } from '../ui.js';
import { MENU_LIST } from '../app.js';

const PERAN = {
  owner: { label: 'Owner', desc: 'Semua akses' },
  admin: { label: 'Admin', desc: 'Bisa ubah pengaturan, token & tim' },
  cs: { label: 'CS', desc: 'Catat chat, tahap & closing' },
};
const JABATAN = ['CS', 'CS Surabaya', 'CS Malang', 'Admin Iklan', 'Marketing', 'Supervisor', 'Kepala Cabang'];
const APP_URL = 'https://app.aventra.id/app/ld/';

export async function render(el, ctx) {
  const { state } = ctx;
  const tid = state.tenant.id;
  const list = await api.members(tid);
  const menuLabel = Object.fromEntries(MENU_LIST.map((m) => [m.id, m.label]));
  const aktif = list.filter((m) => m.status === 'aktif'), undang = list.filter((m) => m.status !== 'aktif');

  const card = (m) => {
    const owner = m.role === 'owner';
    const menus = owner || !Array.isArray(m.menus)
      ? `<span class="mchip all">Semua menu${m.role === 'cs' ? ' (kecuali Pengaturan & Tim)' : ''}</span>`
      : m.menus.length ? m.menus.map((k) => `<span class="mchip">${esc(menuLabel[k] || k)}</span>`).join('') : '<span class="mchip none">Belum ada menu</span>';
    return `<div class="person ${m.status === 'aktif' ? '' : 'pending'}">
      <div class="person-top">
        <span class="avatar lg">${esc((m.nama || m.email || '?').trim()[0].toUpperCase())}</span>
        <div class="grow"><b>${esc(m.nama || m.email)}</b><small>${esc(m.jabatan || PERAN[m.role]?.label || m.role)}</small><small>${esc(m.email)}</small></div>
        <span class="badge ${owner ? 'ok' : m.role === 'admin' ? 'info' : ''}">${PERAN[m.role]?.label || m.role}</span>
      </div>
      ${m.status !== 'aktif' ? '<div class="note warn small"><div>Menunggu orang ini membuat akun dengan email di atas.</div></div>' : ''}
      <div class="mchips">${menus}</div>
      <div class="person-act">
        <button class="btn sm" data-edit="${esc(m.user_id || m.undangan_id)}">${icon('edit')}${owner ? 'Ubah nama' : 'Ubah akses'}</button>
        ${owner ? '' : `<button class="btn sm danger-ghost" data-del="${esc(m.user_id || m.undangan_id)}">${icon('trash')}${m.status === 'aktif' ? 'Keluarkan' : 'Batalkan'}</button>`}
      </div>
    </div>`;
  };

  el.innerHTML = `
  <div class="toolbar">
    <div class="grow"><b class="h-count">${aktif.length} orang aktif</b>${undang.length ? ` <span class="muted">· ${undang.length} undangan</span>` : ''}</div>
    <button class="btn primary" id="add">${icon('plus')}Tambah orang</button>
  </div>
  <div class="people">${list.map(card).join('') || '<div class="card empty">Belum ada anggota</div>'}</div>
  <div class="card help mt">
    <h3>Cara kerja</h3>
    <ol>
      <li>Tambah orang dengan email, jabatan, dan menu yang boleh ia buka.</li>
      <li>Kalau email itu belum punya akun, minta ia buka <b>${APP_URL}</b> → <b>Buat akun baru</b> memakai email yang sama. Aksesnya langsung aktif saat ia masuk.</li>
      <li><b>CS</b> tidak bisa membuka Pengaturan & Tim walau dicentang. Menu lain bisa dipilih bebas.</li>
    </ol>
  </div>`;

  // kalau yang diubah akun sendiri, perbarui nama di pojok kiri bawah
  const afterSelf = async (m) => {
    if (!m || m.email !== state.user?.email) return;
    const me = await api.myMember(tid);
    Object.assign(state, { nama: me.nama, jabatan: me.jabatan });
    document.querySelector('#meBtn b').textContent = me.nama || 'Tanpa nama';
  };
  const byId = (id) => list.find((m) => (m.user_id || m.undangan_id) === id);
  $('#add', el).onclick = () => form(null);
  $$('[data-edit]', el).forEach((b) => (b.onclick = () => form(byId(b.dataset.edit))));
  $$('[data-del]', el).forEach((b) => (b.onclick = async () => {
    const m = byId(b.dataset.del);
    if (!confirm(m.status === 'aktif' ? `Keluarkan ${m.email} dari bisnis ini?` : `Batalkan undangan ${m.email}?`)) return;
    try {
      if (m.status === 'aktif') await api.removeMember(tid, m.user_id); else await api.removeInvite(m.undangan_id);
      toast('Selesai'); render(el, ctx);
    } catch (e) { toast(e.message, 'err'); }
  }));

  function form(m) {
    const edit = !!m;
    const cur = m || { role: 'cs', jabatan: '', menus: ['leads', 'klik'] };
    const semua = !Array.isArray(cur.menus);
    const isOwner = cur.role === 'owner';
    const md = modal(isOwner ? 'Ubah nama owner' : edit ? 'Ubah akses' : 'Tambah orang', `
    <form class="form" id="tf">
      <label>Nama<input name="nama" required value="${esc(cur.nama || '')}" placeholder="mis. Rina"></label>
      <label>Email<input name="email" type="email" required value="${esc(cur.email || '')}" ${edit ? 'disabled' : ''} placeholder="cs.surabaya@gmail.com"></label>
      <label>Jabatan<input name="jabatan" list="jbList" value="${esc(cur.jabatan || '')}" placeholder="mis. CS Surabaya"></label>
      <datalist id="jbList">${JABATAN.map((j) => `<option value="${j}">`).join('')}</datalist>
      ${isOwner ? '<p class="muted small">Owner selalu punya semua akses.</p><button class="btn primary block">Simpan</button></form>' : `
      <div class="field-lbl">Peran</div>
      <div class="role-pick">
        ${['cs', 'admin'].map((r) => `<label class="role-opt"><input type="radio" name="role" value="${r}" ${cur.role === r ? 'checked' : ''}>
          <span><b>${PERAN[r].label}</b><small>${PERAN[r].desc}</small></span></label>`).join('')}
      </div>
      <div class="field-lbl">Menu yang bisa dilihat</div>
      <label class="check"><input type="checkbox" name="semua" ${semua ? 'checked' : ''}> Semua menu</label>
      <div class="menu-grid" id="mg">
        ${MENU_LIST.map((x) => `<label class="menu-opt" data-admin="${x.admin}"><input type="checkbox" value="${x.id}" ${semua || cur.menus.includes(x.id) ? 'checked' : ''}><span>${x.label}</span>${x.admin ? '<small>khusus admin</small>' : ''}</label>`).join('')}
      </div>
      <button class="btn primary block">${edit ? 'Simpan' : 'Tambah'}</button>
    </form>`}`);
    const f = md.el.querySelector('#tf');
    if (!isOwner) { f.onchange = () => sync(); setTimeout(() => sync()); }
    const sync = () => {
      const cs = f.role.value === 'cs', all = f.semua.checked;
      md.el.querySelectorAll('.menu-opt').forEach((o) => {
        const lock = all || (cs && o.dataset.admin === 'true');
        const c = o.querySelector('input');
        c.disabled = lock; o.classList.toggle('off', cs && o.dataset.admin === 'true');
        if (all) c.checked = !(cs && o.dataset.admin === 'true');
        if (cs && o.dataset.admin === 'true') c.checked = false;
      });
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const nama = f.nama.value.trim();
      if (isOwner) {
        try { await api.updateMember(tid, m.user_id, nama, 'admin', f.jabatan.value.trim(), null); md.close(); afterSelf(m); render(el, ctx); } catch (err) { toast(err.message, 'err'); }
        return;
      }
      const role = f.role.value, jabatan = f.jabatan.value.trim();
      const menus = f.semua.checked ? null : [...md.el.querySelectorAll('.menu-opt input:checked')].map((c) => c.value);
      if (menus && !menus.length) return toast('Pilih minimal satu menu', 'err');
      try {
        if (!edit) {
          const r = await api.addMember(tid, f.email.value.trim(), nama, role, jabatan, menus);
          toast(r === 'diundang' ? 'Undangan dibuat. Minta ia membuat akun dengan email itu.' : 'Ditambahkan');
        } else if (m.status === 'aktif') await api.updateMember(tid, m.user_id, nama, role, jabatan, menus);
        else await api.updateInvite(m.undangan_id, nama, role, jabatan, menus);
        md.close(); afterSelf(m); render(el, ctx);
      } catch (err) { toast(err.message, 'err'); }
    };
  }
}
