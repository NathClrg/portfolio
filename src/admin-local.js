// Admin backend for `npm run dev` / `npm start`: talks to the Express API in server.js.
const TOKEN_KEY = 'portfolio-admin-token';

export function localBackend() {
  let token = localStorage.getItem(TOKEN_KEY);
  let onExpired = () => {};

  async function api(path, { method = 'GET', body, form } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, { method, headers, body: form || (body && JSON.stringify(body)) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token && path !== '/api/login') {
      setToken(null);
      onExpired();
      throw new Error('Session expired, please log in again');
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function setToken(t) {
    token = t;
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  // Existing images are referenced by URL, new ones by their position among the uploaded files.
  function workForm(fields, images) {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, Array.isArray(v) ? v.join(k === 'videos' ? '\n' : ', ') : v);
    let uploads = 0;
    const order = images.map((img) => {
      if (!img.file) return img.url;
      data.append('images', img.file);
      return uploads++;
    });
    data.set('order', JSON.stringify(order));
    return data;
  }

  return {
    kind: 'local',
    savedNote: '',
    set onExpired(fn) {
      onExpired = fn;
    },
    imageUrl: (url) => url,
    async status() {
      const { setup } = await api('/api/status');
      return { setup, needsToken: false };
    },
    async restore() {
      if (!token) return false;
      try {
        await api('/api/me');
        return true;
      } catch {
        return false;
      }
    },
    async login(username, password) {
      setToken((await api('/api/login', { method: 'POST', body: { username, password } })).token);
    },
    async setup(username, password) {
      setToken((await api('/api/setup', { method: 'POST', body: { username, password } })).token);
    },
    logout: () => setToken(null),
    getSite: () => api('/api/site'),
    saveSiteInfo: (info) => api('/api/site', { method: 'PUT', body: info }),
    addWork: (fields, images) => api('/api/works', { method: 'POST', form: workForm(fields, images) }),
    updateWork: (id, fields, images) => api(`/api/works/${id}`, { method: 'PUT', form: workForm(fields, images) }),
    deleteWork: (id) => api(`/api/works/${id}`, { method: 'DELETE' }),
    reorder: (ids) => api('/api/works/reorder', { method: 'POST', body: { ids } }),
    async changePassword(current, next) {
      setToken((await api('/api/password', { method: 'POST', body: { current, next } })).token);
    },
  };
}
