import fs from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { SITE_URL, normalizeSite, renderIndex, sitemapXml } from './render.js';

const ROOT = import.meta.dirname;
const PKG = JSON.parse(fs.readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

function readSite() {
  try {
    return normalizeSite(JSON.parse(fs.readFileSync(resolve(ROOT, 'data/site.json'), 'utf8')));
  } catch {
    return normalizeSite({});
  }
}

/**
 * Fills index.html's placeholders from data/site.json (see render.js):
 * - dev server: on every request, so admin edits show up on reload
 * - `--mode pages` (GitHub Pages): at build time, and ships the images and a sitemap
 * - plain build (npm start): left as is, server.js renders them on each request
 */
function sitePages(mode) {
  const pages = mode === 'pages';
  const base = pages ? new URL(SITE_URL).pathname : '/';
  return {
    name: 'site-pages',
    transformIndexHtml(html, ctx) {
      if (ctx.filename.includes('/admin/')) return; // the admin page has no placeholders
      if (ctx.server || pages) return renderIndex(html, readSite(), { base });
    },
    generateBundle() {
      if (!pages) return;
      const site = readSite();
      for (const url of new Set(site.works.flatMap((w) => w.images))) {
        if (!url.startsWith('/uploads/')) continue;
        this.emitFile({ type: 'asset', fileName: url.slice(1), source: fs.readFileSync(resolve(ROOT, url.slice(1))) });
      }
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(site) });
    },
  };
}

export default defineConfig(({ mode }) => ({
  appType: 'mpa',
  base: mode === 'pages' ? new URL(SITE_URL).pathname : '/',
  plugins: [sitePages(mode)],
  // Which repository the online admin (GitHub Pages) commits to: "admin" in package.json.
  define: { __ADMIN_REPO__: JSON.stringify(PKG.admin) },
  build: {
    chunkSizeWarningLimit: 800, // three.js alone is ~550 kB
    rollupOptions: {
      input: {
        main: resolve(ROOT, 'index.html'),
        // Locally it talks to server.js; on GitHub Pages it commits through the GitHub API.
        admin: resolve(ROOT, 'admin/index.html'),
      },
    },
  },
}));
