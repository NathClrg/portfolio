// Renders the parts of index.html that search engines and link previews read: the <head> tags,
// the page heading and the list of works (the 3D temple itself is invisible to crawlers).
// Used by the Vite plugin (dev server + GitHub Pages build) and by server.js in production.
import fs from 'node:fs';

/** The public address of the site, from "homepage" in package.json. */
export const SITE_URL = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).homepage;

const LANG = 'fr';
const OG_LOCALE = 'fr_FR';

const DEFAULT_SITE = {
  title: 'Mon portfolio',
  subtitle: 'Parcourez le temple et appuyez sur E près d’une œuvre pour la regarder de plus près.',
  description: '',
  works: [],
};

// Works saved before multi-image support have a single `image` field.
function normalizeWork({ image, ...work }) {
  return { ...work, images: work.images ?? (image ? [image] : []), software: work.software ?? [] };
}

export function normalizeSite(raw) {
  const site = { ...DEFAULT_SITE, ...raw };
  return { ...site, works: site.works.map(normalizeWork) };
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// JSON inside <script>: keep "</script>" or "<!--" in the data from ending the element.
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const isHttp = (url) => /^https?:\/\//i.test(url || '');
const unique = (list) => [...new Set(list.map((s) => s.trim()).filter(Boolean))];

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,.:;·—-]+$/, '') + '…';
}

/** The meta description: the one written in the admin panel, or one built from the works. */
export function describe(site) {
  if (site.description?.trim()) return site.description.trim();
  const topics = unique(site.works.flatMap((w) => w.tags));
  const tools = unique(site.works.flatMap((w) => w.software));
  const of = /^[aeiouyàâéèêëîïôûœ]/i.test(site.title) ? 'd’' : 'de ';
  const parts = [`Portfolio ${of}${site.title}${topics.length ? ` : ${topics.join(', ')}` : ''}`];
  if (tools.length) parts.push(`Logiciels : ${tools.join(', ')}`);
  if (site.works.length) parts.push(`Projets : ${site.works.map((w) => w.title).join(', ')}`);
  return truncate(`${parts.join('. ')}.`, 160);
}

/** Stable, readable ids for each work's section, e.g. #oeuvre-save-the-date. */
function anchors(works) {
  const seen = new Map();
  return works.map((w) => {
    const slug =
      w.title
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'sans-titre';
    const n = (seen.get(slug) || 0) + 1;
    seen.set(slug, n);
    return `oeuvre-${slug}${n > 1 ? `-${n}` : ''}`;
  });
}

function head(site, { siteUrl, asset, absolute }) {
  const title = `${site.title} — Portfolio`;
  const description = describe(site);
  const cover = site.works.find((w) => w.images.length);
  const ids = anchors(site.works);
  const authorId = `${siteUrl}#auteur`;

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${siteUrl}#site`, url: siteUrl, name: site.title, description, inLanguage: LANG, author: { '@id': authorId } },
      { '@type': 'Person', '@id': authorId, name: site.title, url: siteUrl },
      {
        '@type': 'CollectionPage',
        '@id': `${siteUrl}#page`,
        url: siteUrl,
        name: title,
        description,
        inLanguage: LANG,
        isPartOf: { '@id': `${siteUrl}#site` },
        ...(cover && { primaryImageOfPage: absolute(cover.images[0]) }),
        hasPart: site.works.map((w, i) => {
          const keywords = unique([...w.tags, ...w.software]);
          return {
            '@type': 'CreativeWork',
            '@id': `${siteUrl}#${ids[i]}`,
            name: w.title,
            ...(w.description && { description: w.description }),
            ...(/^\d{4}$/.test(w.year) && { dateCreated: w.year }),
            ...(w.images.length && { image: w.images.map(absolute) }),
            ...(keywords.length && { keywords: keywords.join(', ') }),
            ...(isHttp(w.link) && { url: w.link }),
            inLanguage: LANG,
            creator: { '@id': authorId },
          };
        }),
      },
    ],
  };
  // What main.js runs on, with image paths pointing at where this build serves them.
  const clientSite = { ...site, works: site.works.map((w) => ({ ...w, images: w.images.map(asset) })) };

  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(siteUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="${OG_LOCALE}" />`,
    `<meta property="og:site_name" content="${escapeHtml(site.title)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(siteUrl)}" />`,
    cover && `<meta property="og:image" content="${escapeHtml(absolute(cover.images[0]))}" />`,
    cover && `<meta property="og:image:alt" content="${escapeHtml(cover.title)}" />`,
    `<meta name="twitter:card" content="${cover ? 'summary_large_image' : 'summary'}" />`,
    `<script type="application/ld+json">${scriptJson(structuredData)}</script>`,
    `<script type="application/json" id="site-data">${scriptJson(clientSite)}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ');
}

function hud(site) {
  return [
    `<h1 id="site-title">${escapeHtml(site.title)}</h1>`,
    site.subtitle && `<p>${escapeHtml(site.subtitle)}</p>`,
    !site.works.length && `<p id="empty">Aucune œuvre exposée pour le moment.</p>`,
  ]
    .filter(Boolean)
    .join('\n      ');
}

function workList(site, { asset }) {
  if (!site.works.length) return '<p>Aucune œuvre exposée pour le moment.</p>';
  const ids = anchors(site.works);
  const items = site.works.map((w, i) => {
    const meta = [w.year, ...w.tags].filter(Boolean).join(' · ');
    const count = w.images.length;
    const images = w.images
      .map((src, n) => {
        const alt = count > 1 ? `${w.title} — image ${n + 1} sur ${count}` : w.title;
        return `<img src="${escapeHtml(asset(src))}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`;
      })
      .join('');
    const link = isHttp(w.link)
      ? `<a href="${escapeHtml(w.link)}" target="_blank" rel="noopener noreferrer">Voir le projet<span class="visually-hidden"> ${escapeHtml(w.title)}</span> ↗</a>`
      : '';
    return [
      `<li><article class="work" id="${ids[i]}">`,
      `<h3>${escapeHtml(w.title)}</h3>`,
      meta && `<p class="work-meta">${escapeHtml(meta)}</p>`,
      w.description && `<p class="work-description">${escapeHtml(w.description)}</p>`,
      w.software.length && `<p class="work-software">Logiciels : ${escapeHtml(w.software.join(', '))}</p>`,
      images && `<div class="work-images">${images}</div>`,
      `<p class="work-actions"><button type="button" data-visit="${escapeHtml(w.id)}">Voir dans le temple</button>${link}</p>`,
      `</article></li>`,
    ]
      .filter(Boolean)
      .join('\n          ');
  });
  return `<ol class="work-list">\n        ${items.join('\n        ')}\n        </ol>`;
}

/**
 * Fills the <!--app-*--> placeholders of index.html.
 * `base` is the path the site is served under (e.g. /portfolio/ on GitHub Pages);
 * `admin` adds the link to the admin panel, which only exists where the Node server runs.
 */
export function renderIndex(html, site, { siteUrl = SITE_URL, base = '/', admin = false } = {}) {
  const asset = (url) => (url.startsWith('/') ? base + url.slice(1) : url);
  const absolute = (url) => new URL(url.replace(/^\//, ''), siteUrl).href;
  const ctx = { siteUrl, asset, absolute };
  // Replacer functions, so "$&"-style sequences in the content are not treated as patterns.
  return html
    .replace('<!--app-head-->', () => head(site, ctx))
    .replace('<!--app-hud-->', () => hud(site))
    .replace('<!--app-works-->', () => workList(site, ctx))
    .replace('<!--app-admin-->', () => (admin ? '<a id="admin-link" href="/admin.html" aria-label="Administration" rel="nofollow">⚙</a>' : ''));
}

export function sitemapXml(site, siteUrl = SITE_URL) {
  const absolute = (url) => new URL(url.replace(/^\//, ''), siteUrl).href;
  const images = unique(site.works.flatMap((w) => w.images)).map(
    (src) => `    <image:image><image:loc>${escapeHtml(absolute(src))}</image:loc></image:image>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    '  <url>',
    `    <loc>${escapeHtml(siteUrl)}</loc>`,
    `    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>`,
    ...images,
    '  </url>',
    '</urlset>',
    '',
  ].join('\n');
}

export const robotsTxt = (siteUrl = SITE_URL) =>
  `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${new URL('sitemap.xml', siteUrl).href}\n`;
