// Rules shared by both admin backends, so a work is saved the same way locally and on GitHub Pages.
import { cleanVideos } from './youtube.js';

export const MAX_IMAGES = 20;
export const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
export const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const list = (v) =>
  str(v, 300)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

/** The editable fields of a work, from the editor's raw values. Videos: one link per line. */
export function workFields(raw) {
  return {
    title: str(raw.title, 120) || 'Untitled',
    description: str(raw.description, 4000),
    year: str(raw.year, 20),
    tags: list(raw.tags),
    software: list(raw.software),
    link: str(raw.link, 500),
    videos: cleanVideos(String(raw.videos ?? '').split(/\s+/)),
  };
}

export function normalizeSite(raw = {}) {
  const site = { title: 'Mon portfolio', subtitle: '', description: '', works: [], ...raw };
  site.works = site.works.map(({ image, ...w }) => ({
    ...w,
    images: w.images ?? (image ? [image] : []),
    software: w.software ?? [],
    videos: cleanVideos(w.videos),
  }));
  return site;
}
