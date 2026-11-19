// YouTube links: shared by the site, the admin panel and render.js (Node).

const ID = /^[\w-]{11}$/;

/** The 11-character video id from any usual YouTube link (watch, youtu.be, shorts, embed, live), or null. */
export function youtubeId(url) {
  let u;
  try {
    u = new URL(String(url || '').trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const [, kind, value] = u.pathname.split('/');
      if (['shorts', 'embed', 'live', 'v'].includes(kind)) id = value;
    }
  }
  return id && ID.test(id) ? id : null;
}

/** Start time in seconds from ?t= / ?start= (e.g. 90, 90s, 1m30s), or 0. */
function startTime(url) {
  try {
    const t = new URL(url).searchParams.get('t') || new URL(url).searchParams.get('start') || '';
    if (/^\d+s?$/.test(t)) return parseInt(t, 10);
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  } catch {
    return 0;
  }
}

export const youtubeThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** Privacy-friendly embed address (no cookies until the visitor plays the video). */
export function youtubeEmbed(url, { autoplay = false } = {}) {
  const id = youtubeId(url);
  if (!id) return null;
  const params = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' });
  if (autoplay) params.set('autoplay', '1');
  const start = startTime(url);
  if (start) params.set('start', String(start));
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

/** Keeps only valid YouTube links, one per video, as a clean list. */
export function cleanVideos(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const url = String(raw || '').trim();
    const id = youtubeId(url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(url);
  }
  return out.slice(0, 10);
}
