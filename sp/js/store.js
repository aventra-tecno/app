import { supa } from './supa.js';

// state bersama aplikasi
export const store = {
  session: null,
  profile: null,
  role: null,
  settings: null,
  notifs: [],
  reads: new Set(),
  profilesById: {}
};

const listeners = {};
export const onEvt = (name, fn) => { (listeners[name] ||= new Set()).add(fn); return () => listeners[name].delete(fn); };
export const emit = (name, data) => (listeners[name] || []).forEach((fn) => fn(data));

export async function loadNotifs(limit = 80) {
  const { data, error } = await supa.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  store.notifs = data || [];
  const ids = store.notifs.map((n) => n.id);
  store.reads = new Set();
  if (ids.length) {
    const { data: r } = await supa.from('notification_reads').select('notification_id').in('notification_id', ids).eq('user_id', store.profile.id);
    (r || []).forEach((x) => store.reads.add(x.notification_id));
  }
  emit('notifs');
  return store.notifs;
}

export const unreadCount = () => store.notifs.filter((n) => !store.reads.has(n.id)).length;

export async function markRead(ids) {
  ids = ids.filter((id) => !store.reads.has(id));
  if (!ids.length) return;
  ids.forEach((id) => store.reads.add(id));
  emit('notifs');
  await supa.from('notification_reads').upsert(ids.map((id) => ({ notification_id: id, user_id: store.profile.id })), { onConflict: 'notification_id,user_id', ignoreDuplicates: true });
}

export async function loadProfiles() {
  const { data } = await supa.from('profiles').select('id, full_name, role, active');
  store.profilesById = Object.fromEntries((data || []).map((p) => [p.id, p]));
  return data || [];
}
export const nameOf = (id) => (id && store.profilesById[id]?.full_name) || '–';

export async function notify({ role = null, user = null, level = 'info', title, body = '', link = '' }) {
  await supa.rpc('notify', { p_role: role, p_user: user, p_level: level, p_title: title, p_body: body, p_link: link });
}
