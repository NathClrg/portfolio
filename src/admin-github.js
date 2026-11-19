// Admin backend for the static site on GitHub Pages: there is no server, so every save is a commit
// to the repository (data/site.json + uploads/), made with a GitHub token. The push redeploys the site.
//
// The token is never published in clear: data/admin-pages.json holds it encrypted with AES-GCM, under a
// key derived from the admin password (PBKDF2-SHA256). Logging in = decrypting it. The decrypted token
// only lives in this tab (sessionStorage).
import { IMAGE_TYPES, MAX_IMAGES, normalizeSite } from './admin-common.js';

const API = 'https://api.github.com';
const AUTH_PATH = 'data/admin-pages.json';
const SITE_PATH = 'data/site.json';
const SESSION_KEY = 'portfolio-gh-token';
const ITERATIONS = 600_000;

// ---------- encoding helpers ----------
const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function sealToken(token, username, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  // The username is bound as additional data: changing it in the file breaks decryption.
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(username) }, key, enc.encode(token));
  return { v: 1, username, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(data)) };
}

async function openToken(auth, username, password) {
  if (username !== auth.username) throw new Error('Wrong username or password');
  try {
    const key = await deriveKey(password, fromB64(auth.salt), auth.iterations);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(auth.iv), additionalData: enc.encode(auth.username) },
      key,
      fromB64(auth.data),
    );
    return dec.decode(plain);
  } catch {
    throw new Error('Wrong username or password');
  }
}

const fileToB64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error(`Could not read ${file.name}`));
    r.readAsDataURL(file);
  });

// ---------- backend ----------
export function githubBackend({ repo, branch }) {
  let token = sessionStorage.getItem(SESSION_KEY);
  let lastCommit = branch; // raw image URLs point at the commit last read, so fresh uploads show at once
  let onExpired = () => {};

  async function gh(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: body && JSON.stringify(body), cache: 'no-store' });
    } catch {
      throw new Error('Could not reach GitHub. Check your connection.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    const err = new Error(data.message || `GitHub request failed (${res.status})`);
    err.status = res.status;
    if (res.status === 401 && auth && token) {
      setToken(null);
      onExpired();
      err.message = 'Your GitHub token was rejected (expired or revoked). Log in again, or reset the admin with a new token.';
    }
    throw err;
  }

  function setToken(t) {
    token = t;
    if (t) sessionStorage.setItem(SESSION_KEY, t);
    else sessionStorage.removeItem(SESSION_KEY);
  }

  async function readJsonFile(path, ref, auth = true) {
    try {
      const f = await gh(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, { auth });
      return JSON.parse(dec.decode(fromB64(f.content)));
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  async function checkToken(t) {
    const prev = token;
    token = t;
    try {
      const info = await gh(`/repos/${repo}`);
      if (!info.permissions?.push) throw new Error(`This token can read ${repo} but not write to it. Give it “Contents: Read and write”.`);
    } catch (err) {
      if (err.status === 401) err.message = 'GitHub rejected this token. Check that you copied all of it.';
      if (err.status === 404) err.message = `This token has no access to ${repo}.`;
      throw err;
    } finally {
      token = prev;
    }
  }

  async function head() {
    const ref = await gh(`/repos/${repo}/git/ref/heads/${branch}`);
    const commit = await gh(`/repos/${repo}/git/commits/${ref.object.sha}`);
    return { commit: ref.object.sha, tree: commit.tree.sha };
  }

  /**
   * One commit on top of the branch: `change(site)` returns the new site plus files to add/remove.
   * Re-reads the branch first and retries if someone pushed meanwhile, so nothing gets overwritten.
   */
  async function commit(message, change) {
    for (let attempt = 0; ; attempt++) {
      const h = await head();
      const site = normalizeSite((await readJsonFile(SITE_PATH, h.commit)) || {});
      const { site: next, binary = [], text = [], remove = [], result } = await change(site);

      const tree = [];
      if (next) tree.push({ path: SITE_PATH, mode: '100644', type: 'blob', content: JSON.stringify(next, null, 2) });
      for (const f of text) tree.push({ path: f.path, mode: '100644', type: 'blob', content: f.content });
      for (const f of binary) {
        const blob = await gh(`/repos/${repo}/git/blobs`, { method: 'POST', body: { content: f.base64, encoding: 'base64' } });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      for (const path of remove) tree.push({ path, mode: '100644', type: 'blob', sha: null });

      const newTree = await gh(`/repos/${repo}/git/trees`, { method: 'POST', body: { base_tree: h.tree, tree } });
      const newCommit = await gh(`/repos/${repo}/git/commits`, {
        method: 'POST',
        body: { message, tree: newTree.sha, parents: [h.commit] },
      });
      try {
        await gh(`/repos/${repo}/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: newCommit.sha, force: false } });
      } catch (err) {
        if (err.status === 422 && attempt < 2) continue; // the branch moved: redo on top of it
        throw err;
      }
      lastCommit = newCommit.sha;
      return result ?? next;
    }
  }

  /** Turns the editor's image list into paths, uploading new files, and lists the old ones no longer used. */
  async function resolveImages(images, current = []) {
    const binary = [];
    const out = [];
    for (const img of images.slice(0, MAX_IMAGES)) {
      if (img.file) {
        const path = `uploads/${crypto.randomUUID()}${IMAGE_TYPES[img.file.type] || ''}`;
        binary.push({ path, base64: await fileToB64(img.file) });
        out.push(`/${path}`);
      } else if (current.includes(img.url)) {
        out.push(img.url);
      }
    }
    const remove = current.filter((url) => !out.includes(url) && url.startsWith('/uploads/')).map((url) => url.slice(1));
    return { images: out, binary, remove };
  }

  return {
    kind: 'github',
    savedNote: ' — live on the site in about a minute',
    set onExpired(fn) {
      onExpired = fn;
    },
    imageUrl: (url) => (url.startsWith('/uploads/') ? `https://raw.githubusercontent.com/${repo}/${lastCommit}${url}` : url),

    async status() {
      const auth = await readJsonFile(AUTH_PATH, branch, false);
      return { setup: !!auth, needsToken: true };
    },
    async restore() {
      if (!token) return false;
      try {
        await gh(`/repos/${repo}`);
        return true;
      } catch {
        setToken(null);
        return false;
      }
    },
    async login(username, password) {
      const auth = await readJsonFile(AUTH_PATH, branch, false);
      if (!auth) throw new Error('No admin account yet. Reload the page to create it.');
      const t = await openToken(auth, username, password);
      await checkToken(t);
      setToken(t);
    },
    async setup(username, password, newToken) {
      newToken = String(newToken || '').trim();
      if (!newToken) throw new Error('Paste your GitHub token');
      await checkToken(newToken);
      setToken(newToken);
      const sealed = await sealToken(newToken, username, password);
      await commit('Admin: set up the online admin', async () => ({
        text: [{ path: AUTH_PATH, content: JSON.stringify(sealed, null, 2) }],
        result: true,
      }));
    },
    logout: () => setToken(null),

    async getSite() {
      const h = await head();
      lastCommit = h.commit;
      return normalizeSite((await readJsonFile(SITE_PATH, h.commit)) || {});
    },
    saveSiteInfo: (info) =>
      commit('Admin: update site details', async (site) => {
        site.title = String(info.title ?? site.title).slice(0, 120);
        site.subtitle = String(info.subtitle ?? site.subtitle).slice(0, 400);
        site.description = String(info.description ?? site.description).trim().slice(0, 300);
        return { site };
      }),
    addWork: (fields, images) =>
      commit(`Admin: add “${fields.title}”`, async (site) => {
        const { images: paths, binary } = await resolveImages(images);
        const work = { id: crypto.randomUUID(), ...fields, images: paths, createdAt: new Date().toISOString() };
        site.works.push(work);
        return { site, binary, result: work };
      }),
    updateWork: (id, fields, images) =>
      commit(`Admin: update “${fields.title}”`, async (site) => {
        const work = site.works.find((w) => w.id === id);
        if (!work) throw new Error('This work no longer exists (deleted from another device?). Reload the page.');
        const { images: paths, binary, remove } = await resolveImages(images, work.images);
        Object.assign(work, fields, { images: paths });
        return { site, binary, remove, result: work };
      }),
    deleteWork: (id) =>
      commit('Admin: delete a work', async (site) => {
        const work = site.works.find((w) => w.id === id);
        if (!work) return { site, result: true };
        site.works = site.works.filter((w) => w.id !== id);
        const remove = work.images.filter((u) => u.startsWith('/uploads/')).map((u) => u.slice(1));
        return { site, remove, result: true };
      }),
    reorder: (ids) =>
      commit('Admin: reorder works', async (site) => {
        const order = new Map(ids.map((id, i) => [id, i]));
        site.works.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
        return { site, result: site.works };
      }),
    async changePassword(current, next) {
      const auth = await readJsonFile(AUTH_PATH, branch);
      await openToken(auth, auth.username, current).catch(() => {
        throw new Error('Current password is wrong');
      });
      if (!next || next.length < 8) throw new Error('New password needs 8+ characters');
      const sealed = await sealToken(token, auth.username, next);
      await commit('Admin: change password', async () => ({
        text: [{ path: AUTH_PATH, content: JSON.stringify(sealed, null, 2) }],
        result: true,
      }));
    },
  };
}
