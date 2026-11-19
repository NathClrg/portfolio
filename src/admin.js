import './admin.css';
import { MAX_IMAGE_SIZE, MAX_IMAGES, IMAGE_TYPES, workFields } from './admin-common.js';
import { githubBackend } from './admin-github.js';
import { localBackend } from './admin-local.js';
import { youtubeId, youtubeThumb } from './youtube.js';

// On GitHub Pages there is no server: saves become commits. Locally, the Express API does the work.
/* global __ADMIN_REPO__ */
const backend = import.meta.env.MODE === 'pages' ? githubBackend(__ADMIN_REPO__) : localBackend();
backend.onExpired = () => showAuth();

const $ = (id) => document.getElementById(id);
let works = [];

function toast(message, isError = false) {
  const el = $('toast');
  // A modal dialog sits in the top layer: put the toast inside it so it stays visible.
  const host = $('work-dialog').open ? $('work-dialog') : document.body;
  if (el.parentElement !== host) host.append(el);
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('visible'), isError ? 6000 : 3200);
}

/** Runs a save, with a busy state on `button` and a toast at the end. */
async function busy(button, label, task, done) {
  const before = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = label;
  }
  document.body.classList.add('saving');
  try {
    const out = await task();
    if (done) toast(done + backend.savedNote);
    return out;
  } catch (err) {
    toast(err.message, true);
    throw err;
  } finally {
    document.body.classList.remove('saving');
    if (button) {
      button.disabled = false;
      button.textContent = before;
    }
  }
}

// ---------- auth ----------
let setupMode = false;

async function showAuth() {
  $('dash-view').hidden = true;
  $('auth-view').hidden = false;
  $('auth-error').textContent = '';
  let status;
  try {
    status = await backend.status();
  } catch (err) {
    $('auth-error').textContent = err.message;
    return;
  }
  setupMode = !status.setup;
  const form = $('auth-form');
  $('auth-title').textContent = setupMode ? 'Create your admin account' : 'Admin login';
  $('auth-intro').hidden = !setupMode;
  $('auth-intro').textContent =
    backend.kind === 'github'
      ? 'First time here: choose your username and password, and paste a GitHub token so the admin can publish your changes. The token is stored encrypted with your password.'
      : 'First time here: choose the username and password you will use to manage your portfolio.';
  $('confirm-field').hidden = !setupMode;
  $('token-field').hidden = !(setupMode && status.needsToken);
  form.token.required = setupMode && status.needsToken;
  $('auth-submit').textContent = setupMode ? 'Create account' : 'Log in';
  form.password.autocomplete = setupMode ? 'new-password' : 'current-password';
  if (setupMode && !form.username.value) form.username.value = 'admin';
  form.username.focus();
}

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('auth-error').textContent = '';
  if (setupMode && f.password.value !== f.confirm.value) {
    $('auth-error').textContent = 'Passwords do not match';
    return;
  }
  const submit = $('auth-submit');
  const label = submit.textContent;
  submit.disabled = true;
  submit.textContent = setupMode ? 'Setting up…' : 'Logging in…';
  try {
    const username = f.username.value.trim();
    if (setupMode) await backend.setup(username, f.password.value, f.token.value);
    else await backend.login(username, f.password.value);
    f.reset();
    await showDashboard();
  } catch (err) {
    $('auth-error').textContent = err.message;
  } finally {
    submit.disabled = false;
    submit.textContent = label;
  }
});

$('logout').addEventListener('click', () => {
  backend.logout();
  showAuth();
});

// ---------- dashboard ----------
async function showDashboard() {
  $('auth-view').hidden = true;
  $('dash-view').hidden = false;
  $('pages-note').hidden = backend.kind !== 'github';
  const site = await backend.getSite();
  $('site-form').elements.title.value = site.title;
  $('site-form').elements.subtitle.value = site.subtitle;
  $('site-form').elements.description.value = site.description || '';
  works = site.works;
  renderWorks();
}

function btn(label, title, onClick, disabled = false, extra = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `ghost small ${extra}`.trim();
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function coverOf(work) {
  if (work.images.length) return backend.imageUrl(work.images[0]);
  const id = work.videos?.length && youtubeId(work.videos[0]);
  return id ? youtubeThumb(id) : null;
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
    const cover = coverOf(work);
    if (cover) thumb.append(Object.assign(document.createElement('img'), { src: cover, alt: '' }));
    const counts = [work.images.length > 1 && `${work.images.length}`, work.videos?.length && `▶ ${work.videos.length}`].filter(Boolean);
    if (counts.length) {
      const count = document.createElement('span');
      count.textContent = counts.join(' · ');
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

    const actions = document.createElement('div');
    actions.className = 'work-actions';
    actions.append(
      btn('↑', 'Move up', () => move(i, -1), i === 0, 'icon'),
      btn('↓', 'Move down', () => move(i, 1), i === works.length - 1, 'icon'),
      btn('Edit', 'Edit', () => openEditor(work)),
      btn('Delete', 'Delete', () => remove(work), false, 'danger'),
    );

    li.append(thumb, info, actions);
    list.append(li);
  });
}

async function move(index, delta) {
  const before = works;
  const next = [...works];
  const [item] = next.splice(index, 1);
  next.splice(index + delta, 0, item);
  works = next;
  renderWorks();
  try {
    works = await busy(null, '', () => backend.reorder(works.map((w) => w.id)), 'Order saved');
    renderWorks();
  } catch {
    works = before;
    renderWorks();
  }
}

async function remove(work) {
  if (!confirm(`Delete “${work.title}”? This cannot be undone.`)) return;
  try {
    await busy(null, '', () => backend.deleteWork(work.id), 'Work deleted');
    works = works.filter((w) => w.id !== work.id);
    renderWorks();
  } catch {}
}

$('site-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { title, subtitle, description } = e.target.elements;
  await busy(e.submitter, 'Saving…', () =>
    backend.saveSiteInfo({ title: title.value, subtitle: subtitle.value, description: description.value }),
  'Site saved').catch(() => {});
});

$('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await busy(e.submitter, 'Saving…', () => backend.changePassword(f.current.value, f.next.value), 'Password changed');
    f.reset();
  } catch {}
});

// ---------- work editor ----------
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
    li.append(Object.assign(document.createElement('img'), { src: img.file ? img.url : backend.imageUrl(img.url), alt: '' }));
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
  const valid = files.filter((f) => f.type in IMAGE_TYPES && f.size <= MAX_IMAGE_SIZE);
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

/** Shows which of the pasted links are recognised as YouTube videos. */
function renderVideoPreview() {
  const lines = form.elements.videos.value.split(/\s+/).filter(Boolean);
  const preview = $('video-preview');
  preview.replaceChildren(
    ...lines.map((line) => {
      const id = youtubeId(line);
      const li = document.createElement('li');
      li.className = id ? '' : 'bad';
      if (id) li.append(Object.assign(document.createElement('img'), { src: youtubeThumb(id), alt: '' }));
      li.append(Object.assign(document.createElement('span'), { textContent: id ? 'YouTube ✓' : 'Not a YouTube link' }));
      return li;
    }),
  );
}
form.elements.videos.addEventListener('input', renderVideoPreview);

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
    form.elements.videos.value = (work.videos || []).join('\n');
    form.elements.description.value = work.description;
  }
  renderVideoPreview();
  clearImages();
  images = (work?.images || []).map((url) => ({ url }));
  renderGallery();
  dialog.showModal();
  if (!matchMedia('(pointer: coarse)').matches) form.elements.title.focus();
}

$('add-work').addEventListener('click', () => openEditor());
$('cancel-work').addEventListener('click', () => dialog.close());
$('close-work').addEventListener('click', () => dialog.close());
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
  const el = form.elements;
  const fields = workFields({
    title: el.title.value,
    year: el.year.value,
    tags: el.tags.value,
    software: el.software.value,
    link: el.link.value,
    videos: el.videos.value,
    description: el.description.value,
  });
  const bad = el.videos.value.split(/\s+/).filter((l) => l && !youtubeId(l));
  if (bad.length) {
    $('work-error').textContent = `Not a YouTube link: ${bad[0]}`;
    return;
  }
  $('work-error').textContent = '';
  const wasEditing = editing;
  try {
    const saved = await busy($('save-work'), 'Saving…', () =>
      wasEditing ? backend.updateWork(wasEditing.id, fields, images) : backend.addWork(fields, images),
    wasEditing ? 'Work updated' : 'Work added');
    works = wasEditing ? works.map((w) => (w.id === saved.id ? saved : w)) : [...works, saved];
    renderWorks();
    dialog.close();
  } catch (err) {
    $('work-error').textContent = err.message;
  }
});

// Warn before leaving mid-save (an interrupted save on GitHub is simply not committed, but the edit is lost).
addEventListener('beforeunload', (e) => {
  if (document.body.classList.contains('saving')) e.preventDefault();
});

// ---------- boot ----------
backend
  .restore()
  .then((ok) => (ok ? showDashboard() : showAuth()))
  .catch(showAuth);
