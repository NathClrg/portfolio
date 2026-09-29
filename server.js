import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { normalizeSite, renderIndex, robotsTxt, sitemapXml } from './render.js';

const ROOT = import.meta.dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const PROD = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 5180;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- tiny JSON store ----------
const file = (name) => path.join(DATA_DIR, name);

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  const tmp = file(name + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file(name));
}

const getSite = () => normalizeSite(readJson('site.json', {}));
const saveSite = (site) => writeJson('site.json', site);

// ---------- auth ----------
function getSecret() {
  let secret = readJson('secret.json', null)?.secret;
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    writeJson('secret.json', { secret });
  }
  return secret;
}
const SECRET = getSecret();

const getAdmin = () => readJson('admin.json', null);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function checkPassword(password, admin) {
  const { hash } = hashPassword(String(password), admin.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(admin.hash, 'hex'));
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
  const admin = getAdmin();
  // Tokens die when they expire or when the password changes.
  if (!admin || !(payload.exp > Date.now()) || payload.v !== admin.salt) return null;
  return payload;
}

const issueToken = (admin) => sign({ u: admin.username, v: admin.salt, exp: Date.now() + TOKEN_TTL_MS });

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!verify(token)) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// Naive brute-force protection: 10 failed logins per IP per 15 minutes.
const failures = new Map();
function tooManyFailures(ip) {
  const entry = failures.get(ip);
  if (!entry || entry.reset < Date.now()) return false;
  return entry.count >= 10;
}
function recordFailure(ip) {
  const entry = failures.get(ip);
  if (!entry || entry.reset < Date.now()) failures.set(ip, { count: 1, reset: Date.now() + 15 * 60 * 1000 });
  else entry.count++;
}

// ---------- uploads ----------
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const MAX_IMAGES = 20;

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, f, cb) => cb(null, crypto.randomUUID() + IMAGE_TYPES[f.mimetype]),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_IMAGES },
  fileFilter: (req, f, cb) => {
    if (f.mimetype in IMAGE_TYPES) return cb(null, true);
    // Reject rather than skip: the client refers to new files by their position.
    cb(Object.assign(new Error('Images must be JPG, PNG, WebP or GIF'), { status: 400 }));
  },
});

function removeUpload(url) {
  if (!url?.startsWith('/uploads/')) return;
  fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {});
}

/**
 * Builds a work's image list from the client's `order` field: a JSON array whose entries are
 * either URLs of images the work already has, or indexes into the files uploaded with this request.
 * Returns the new list plus every image (old or just uploaded) that ended up unused.
 */
function resolveImages(orderField, files = [], current = []) {
  const uploaded = files.map((f) => `/uploads/${f.filename}`);
  let order;
  try {
    order = JSON.parse(orderField);
  } catch {}
  if (!Array.isArray(order)) order = [...current, ...uploaded.map((_, i) => i)];

  const images = [];
  for (const entry of order) {
    const url = typeof entry === 'number' ? uploaded[entry] : current.includes(entry) ? entry : null;
    if (url && !images.includes(url) && images.length < MAX_IMAGES) images.push(url);
  }
  const unused = [...current, ...uploaded].filter((url) => !images.includes(url));
  return { images, unused };
}

function workFields(body) {
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  const list = (v) =>
    str(v, 300)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  return {
    title: str(body.title, 120) || 'Untitled',
    description: str(body.description, 4000),
    year: str(body.year, 20),
    tags: list(body.tags),
    software: list(body.software),
    link: str(body.link, 500),
  };
}

// ---------- app ----------
const app = express();
app.use(express.json());

app.get('/api/status', (req, res) => res.json({ setup: !!getAdmin() }));

app.post('/api/setup', (req, res) => {
  if (getAdmin()) return res.status(409).json({ error: 'Admin already exists' });
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: 'Username and a password of at least 8 characters are required' });
  }
  const admin = { username: String(username).trim(), ...hashPassword(String(password)) };
  writeJson('admin.json', admin);
  res.json({ token: issueToken(admin) });
});

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  if (tooManyFailures(ip)) return res.status(429).json({ error: 'Too many attempts, try again later' });
  const admin = getAdmin();
  const { username, password } = req.body || {};
  if (!admin || username !== admin.username || !password || !checkPassword(password, admin)) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  res.json({ token: issueToken(admin) });
});

app.get('/api/me', requireAuth, (req, res) => res.json({ ok: true }));

app.post('/api/password', requireAuth, (req, res) => {
  const { current, next: newPassword } = req.body || {};
  const admin = getAdmin();
  if (!current || !checkPassword(current, admin)) return res.status(401).json({ error: 'Current password is wrong' });
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'New password needs 8+ characters' });
  const updated = { username: admin.username, ...hashPassword(newPassword) };
  writeJson('admin.json', updated);
  res.json({ token: issueToken(updated) });
});

app.get('/api/site', (req, res) => res.json(getSite()));

app.put('/api/site', requireAuth, (req, res) => {
  const site = getSite();
  site.title = String(req.body.title ?? site.title).slice(0, 120);
  site.subtitle = String(req.body.subtitle ?? site.subtitle).slice(0, 400);
  site.description = String(req.body.description ?? site.description).trim().slice(0, 300);
  saveSite(site);
  res.json(site);
});

app.post('/api/works', requireAuth, upload.array('images', MAX_IMAGES), (req, res) => {
  const site = getSite();
  const { images, unused } = resolveImages(req.body.order, req.files);
  unused.forEach(removeUpload);
  const work = {
    id: crypto.randomUUID(),
    ...workFields(req.body),
    images,
    createdAt: new Date().toISOString(),
  };
  site.works.push(work);
  saveSite(site);
  res.json(work);
});

app.put('/api/works/:id', requireAuth, upload.array('images', MAX_IMAGES), (req, res) => {
  const site = getSite();
  const work = site.works.find((w) => w.id === req.params.id);
  if (!work) {
    resolveImages('[]', req.files).unused.forEach(removeUpload);
    return res.status(404).json({ error: 'Work not found' });
  }
  const { images, unused } = resolveImages(req.body.order, req.files, work.images);
  unused.forEach(removeUpload);
  Object.assign(work, workFields(req.body), { images });
  saveSite(site);
  res.json(work);
});

app.delete('/api/works/:id', requireAuth, (req, res) => {
  const site = getSite();
  const work = site.works.find((w) => w.id === req.params.id);
  if (!work) return res.status(404).json({ error: 'Work not found' });
  work.images.forEach(removeUpload);
  site.works = site.works.filter((w) => w.id !== work.id);
  saveSite(site);
  res.json({ ok: true });
});

app.post('/api/works/reorder', requireAuth, (req, res) => {
  const site = getSite();
  const order = new Map((req.body.ids || []).map((id, i) => [id, i]));
  site.works.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  saveSite(site);
  res.json(site.works);
});

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.get('/admin', (req, res) => res.redirect('/admin.html'));

app.use('/api', (err, req, res, next) => {
  console.error(err);
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  res.status(status).json({ error: err.message || 'Server error' });
});

if (PROD) {
  // The built page keeps its placeholders; fill them per request so admin edits show up right away.
  const template = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
  app.get(['/', '/index.html'], (req, res) => res.type('html').send(renderIndex(template, getSite(), { admin: true })));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send(robotsTxt()));
  app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(sitemapXml(getSite())));
  app.use(express.static(path.join(ROOT, 'dist')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'mpa' });
  app.use(vite.middlewares);
}

app.listen(PORT, () => {
  console.log(`Portfolio running at http://localhost:${PORT}  (admin: http://localhost:${PORT}/admin)`);
});
