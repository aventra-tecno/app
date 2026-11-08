import { saGuard, alatUI } from './superadmin.js';

// Super admin › Alat & data (tes notifikasi HP, hapus semua data)
export default {
  async render(el) { if (saGuard(el)) alatUI(el); }
};
