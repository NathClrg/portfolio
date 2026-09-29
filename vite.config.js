import fs from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { SITE_URL, normalizeSite, renderIndex, sitemapXml } from './render.js';

const ROOT = import.meta.dirname;

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
      if (ctx.server || pages) return renderIndex(html, readSite(), { base, admin: !pages });
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
  build: {
    chunkSizeWarningLimit: 800, // three.js alone is ~550 kB
    rollupOptions: {
      input: {
        main: resolve(ROOT, 'index.html'),
        // GitHub Pages only serves static files: no API, so no admin panel there.
        ...(mode !== 'pages' && { admin: resolve(ROOT, 'admin.html') }),
      },
    },
  },
}));
