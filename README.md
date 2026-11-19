# Portfolio: the temple

A 3D low-poly temple where visitors walk a character around. Each work stands on a pedestal. Pressing **E** near a pedestal brings the work to the front, and pressing it again puts it back. A "Voir toutes les œuvres" button shows every work as a plain page, which is also what search engines index.

Live site: https://nathclrg.github.io/portfolio/

## Run locally

```bash
npm install
npm run dev          # http://localhost:5180
```

## Manage your works (no code)

### Online: https://nathclrg.github.io/portfolio/admin

Works from any device, phone included. GitHub Pages has no server, so each save is a commit to this repository, and the push redeploys the site (live about a minute later).

**First visit** (once): open `/admin`, choose your username and password, and paste a GitHub token:

1. Go to [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).
2. Repository access: **Only select repositories** → `nathclrg/portfolio`.
3. Permissions → Repository permissions → **Contents: Read and write**.
4. Generate, copy the `github_pat_…` token, paste it in the admin.

The token is saved in `data/admin-pages.json`, **encrypted with your password** (AES-GCM, key derived with PBKDF2-SHA256, 600,000 rounds). Logging in decrypts it; it stays in that browser tab only. The file is public like the rest of the repo, so a long, unusual password is what keeps it safe.

- **Forgot the password, or the token expired?** Delete `data/admin-pages.json` on GitHub, then open `/admin` again to set everything up with a new token.
- Change the password from the admin's **Password** section.

### Locally

1. Run `npm run dev` and open **http://localhost:5180/admin** (or click the ⚙ in the bottom-right corner).
2. The first time, you create your admin username and password (stored hashed in `data/admin.json`, never published).
3. Publish with `git add -A && git commit -m "Update works" && git push`.

### What a work can have

Title, year, tags, software used, link, description, up to 20 images (the first is the cover on the pedestal; visitors flip through the rest) and **YouTube videos** (one link per line: normal links, `youtu.be`, Shorts, and `?t=` start times all work). Videos play right in the work's card and in the list view. A work with only a video uses the video's thumbnail as its cover.

The temple grows with the number of works. Empty slots (fewer than 6 works) get an "Œuvre à venir" sign.

## Publish (GitHub Pages)

Saves from the online admin publish themselves. After local edits:

```bash
git add -A
git commit -m "Update works"
git push
```

Each push to `main` runs `.github/workflows/pages.yml`, which builds the site with `npm run build:pages` (works from `data/site.json`, images from `uploads/`) and deploys it. It is live about a minute later.

To check the static build before pushing: `npm run build:pages && npm run preview:pages`.

The site address is `homepage` in `package.json`, and the repository the online admin commits to is `admin` in `package.json`. Change them if the site moves.

## Search engines

Everything search engines need is rendered into the HTML by `render.js`: French title and meta description, canonical link, Open Graph / Twitter tags for link previews, schema.org structured data (the site, you, and each work), and the list of works with image alt texts. The Pages build also ships `sitemap.xml`.

To get indexed faster, add the site to [Google Search Console](https://search.google.com/search-console) as a URL-prefix property (`https://nathclrg.github.io/portfolio/`), verify it with the HTML file Google gives you (put it in `public/` and push), then submit `sitemap.xml`.

## Run your own server instead

```bash
npm run build
npm start            # serves dist/ + API on PORT (default 5180), with the admin panel
```

> If you host it this way, create the admin account right away. Until an account exists, whoever opens `/admin` first can claim it.

## Where things live

| Path | What |
| --- | --- |
| `server.js` | Express API: auth, works CRUD, image uploads |
| `render.js` | Renders the SEO tags and the work list into `index.html` |
| `data/site.json` | Title, subtitle, description and works (published) |
| `data/admin.json` | Hashed admin password, never published. Delete it to reset the login |
| `uploads/` | Uploaded images (published) |
| `src/world.js` | Temple, scenery, pedestals |
| `src/character.js` | Low-poly character and walk cycle |
| `src/main.js` | Movement, camera, E focus, image browsing, list view |
| `admin/index.html`, `src/admin.js` | Admin panel (UI) |
| `src/admin-github.js` | Online admin: login, encrypted token, commits through the GitHub API |
| `src/admin-local.js` | Local admin: talks to `server.js` |
| `src/youtube.js` | YouTube link parsing, thumbnails, embeds |
| `data/admin-pages.json` | Online admin login: the GitHub token, encrypted with your password |

## Controls

- **WASD / ZQSD / arrows**: move (works on both QWERTY and AZERTY)
- **Shift**: run
- **Drag**: look around. **Scroll**: zoom
- **E** near a work: bring it to the front. **E** or **Esc** again: put it back
- **← / →** (or A/D, Q/D on AZERTY) while a work is up: previous / next image. The card also has arrows and thumbnails
- Touch screens: joystick to walk, drag to look, **pinch to zoom**, tap the E button or the "Toucher pour voir" bubble. A work opens as a bottom sheet: swipe it down or tap ✕ to close.
