import './admin.css';

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'portfolio-admin-token';

let token = localStorage.getItem(TOKEN_KEY);
let works = [];

async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { method, headers, body: form || (body && JSON.stringify(body)) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && path !== '/api/login') {
    logout();
    throw new Error('Session expired, please log in again');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('visible'), 2600);
}

// ---------- auth ----------
let setupMode = false;

async function showAuth() {
  $('dash-view').hidden = true;
  $('auth-view').hidden = false;
  const { setup } = await api('/api/status');
  setupMode = !setup;
  $('auth-title').textContent = setupMode ? 'Create your admin account' : 'Admin login';
  $('auth-intro').textContent = setupMode
    ? 'First time here: choose the username and password you will use to manage your portfolio.'
    : '';
  $('auth-intro').hidden = !setupMode;
  $('confirm-field').hidden = !setupMode;
  $('auth-submit').textContent = setupMode ? 'Create account' : 'Log in';
  $('auth-form').password.autocomplete = setupMode ? 'new-password' : 'current-password';
  $('auth-form').username.focus();
}

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('auth-error').textContent = '';
  if (setupMode && f.password.value !== f.confirm.value) {
    $('auth-error').textContent = 'Passwords do not match';
    return;
  }
  try {
    const data = await api(setupMode ? '/api/setup' : '/api/login', {
      method: 'POST',
      body: { username: f.username.value.trim(), password: f.password.value },
    });
    setToken(data.token);
    f.reset();
    showDashboard();
  } catch (err) {
    $('auth-error').textContent = err.message;
  }
});

function setToken(t) {
  token = t;
  localStorage.setItem(TOKEN_KEY, t);
}

function logout() {
  token = null;
  localStorage.removeItem(TOKEN_KEY);
  showAuth();
}
$('logout').addEventListener('click', logout);

// ---------- dashboard ----------
async function showDashboard() {
  $('auth-view').hidden = true;
  $('dash-view').hidden = false;
  const site = await api('/api/site');
  $('site-form').elements.title.value = site.title;
  $('site-form').elements.subtitle.value = site.subtitle;
  $('site-form').elements.description.value = site.description || '';
  works = site.works;
  renderWorks();
}

function btn(label, title, onClick, disabled = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ghost small';
  b.textContent = label;
  b.title = title;
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function renderWorks() {
  const list = $('works');
  list.replaceChildren();
  $('works-empty').hidden = works.length > 0;

  works.forEach((work, i) => {
    const li = document.createElement('li');
    li.className = 'work';

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (work.images.length) {
      const img = document.createElement('img');
      img.src = work.images[0];
      img.alt = '';
      thumb.append(img);
    }
    if (work.images.length > 1) {
      const count = document.createElement('span');
      count.textContent = work.images.length;
      count.title = `${work.images.length} images`;
      thumb.append(count);
    }

    const info = document.createElement('div');
    info.className = 'info';
    const title = document.createElement('strong');
    title.textContent = work.title;
    const meta = document.createElement('span');
    meta.className = 'muted small';
    meta.textContent = [work.year, ...(work.tags || [])].filter(Boolean).join(' · ') || '—';
    info.append(title, meta);
    if (work.software?.length) {
      const software = document.createElement('span');
      software.className = 'muted small';
      software.textContent = `Made with ${work.software.join(', ')}`;
      info.append(software);
    }

    const actions = document.createElement('div');
    actions.className = 'work-actions';
    actions.append(
      btn('↑', 'Move up', () => move(i, -1), i === 0),
      btn('↓', 'Move down', () => move(i, 1), i === works.length - 1),
      btn('Edit', 'Edit', () => openEditor(work)),
      btn('Delete', 'Delete', () => remove(work)),
    );

    li.append(thumb, info, actions);
    list.append(li);
  });
}

async function move(index, delta) {
  const next = [...works];
  const [item] = next.splice(index, 1);
  next.splice(index + delta, 0, item);
  works = next;
  renderWorks();
  try {
    works = await api('/api/works/reorder', { method: 'POST', body: { ids: works.map((w) => w.id) } });
  } catch (err) {
    toast(err.message, true);
  }
}

async function remove(work) {
  if (!confirm(`Delete “${work.title}”? This cannot be undone.`)) return;
  try {
    await api(`/api/works/${work.id}`, { method: 'DELETE' });
    works = works.filter((w) => w.id !== work.id);
    renderWorks();
    toast('Work deleted');
  } catch (err) {
    toast(err.message, true);
  }
}

$('site-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { title, subtitle, description } = e.target.elements;
    await api('/api/site', { method: 'PUT', body: { title: title.value, subtitle: subtitle.value, description: description.value } });
    toast('Site saved');
  } catch (err) {
    toast(err.message, true);
  }
});

$('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/password', {
      method: 'POST',
      body: { current: e.target.current.value, next: e.target.next.value },
    });
    setToken(data.token);
    e.target.reset();
    toast('Password changed');
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- work editor ----------
const MAX_IMAGES = 20;
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const dialog = $('work-dialog');
const form = $('work-form');
const imageInput = $('image-input');
let editing = null;
let images = []; // { url, file? }: `file` is set for images added in this session (url is then a blob: preview)

function clearImages() {
  images.forEach((img) => img.file && URL.revokeObjectURL(img.url));
  images = [];
}

function renderGallery() {
  const gallery = $('gallery');
  gallery.replaceChildren();
  images.forEach((img, i) => {
    const li = document.createElement('li');
    const pic = document.createElement('img');
    pic.src = img.url;
    pic.alt = '';
    li.append(pic);
    if (i === 0) {
      const cover = document.createElement('span');
      cover.className = 'cover';
      cover.textContent = 'Cover';
      li.append(cover);
    }
    const tools = document.createElement('div');
    tools.className = 'tools';
    tools.append(
      btn('←', 'Move earlier', () => moveImage(i, -1), i === 0),
      btn('→', 'Move later', () => moveImage(i, 1), i === images.length - 1),
      btn('✕', 'Remove', () => removeImageAt(i)),
    );
    li.append(tools);
    gallery.append(li);
  });
  $('image-count').textContent = images.length ? `${images.length} / ${MAX_IMAGES}` : '';
  $('drop').hidden = images.length >= MAX_IMAGES;
}

function moveImage(index, delta) {
  const [img] = images.splice(index, 1);
  images.splice(index + delta, 0, img);
  renderGallery();
}

function removeImageAt(index) {
  const [img] = images.splice(index, 1);
  if (img.file) URL.revokeObjectURL(img.url);
  renderGallery();
}

function addFiles(files) {
  files = [...files];
  const valid = files.filter((f) => IMAGE_TYPES.includes(f.type) && f.size <= MAX_IMAGE_SIZE);
  const room = MAX_IMAGES - images.length;
  for (const file of valid.slice(0, room)) images.push({ url: URL.createObjectURL(file), file });
  $('work-error').textContent =
    valid.length < files.length
      ? 'Skipped files that are not JPG, PNG, WebP or GIF under 15 MB.'
      : valid.length > room
        ? `A work can have up to ${MAX_IMAGES} images.`
        : '';
  renderGallery();
}

function openEditor(work = null) {
  editing = work;
  form.reset();
  $('work-error').textContent = '';
  $('work-dialog-title').textContent = work ? 'Edit work' : 'Add work';
  if (work) {
    form.elements.title.value = work.title;
    form.elements.year.value = work.year;
    form.elements.tags.value = (work.tags || []).join(', ');
    form.elements.software.value = (work.software || []).join(', ');
    form.elements.link.value = work.link;
    form.elements.description.value = work.description;
  }
  clearImages();
  images = (work?.images || []).map((url) => ({ url }));
  renderGallery();
  dialog.showModal();
  form.elements.title.focus();
}

$('add-work').addEventListener('click', () => openEditor());
$('cancel-work').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', clearImages);

imageInput.addEventListener('change', () => {
  addFiles(imageInput.files);
  imageInput.value = ''; // so picking the same file again still fires `change`
});

const drop = $('drop');
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  addFiles(e.dataTransfer.files);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(form);
  // Existing images are referenced by URL, new ones by their position among the uploaded files.
  let uploads = 0;
  const order = images.map((img) => {
    if (!img.file) return img.url;
    data.append('images', img.file);
    return uploads++;
  });
  data.set('order', JSON.stringify(order));
  const save = $('save-work');
  save.disabled = true;
  save.textContent = 'Saving…';
  try {
    if (editing) {
      const updated = await api(`/api/works/${editing.id}`, { method: 'PUT', form: data });
      works = works.map((w) => (w.id === updated.id ? updated : w));
    } else {
      works = [...works, await api('/api/works', { method: 'POST', form: data })];
    }
    renderWorks();
    dialog.close();
    toast(editing ? 'Work updated' : 'Work added');
  } catch (err) {
    $('work-error').textContent = err.message;
  } finally {
    save.disabled = false;
    save.textContent = 'Save';
  }
});

// ---------- boot ----------
if (token) {
  api('/api/me')
    .then(showDashboard)
    .catch(showAuth);
} else {
  showAuth();
}
