# Portfolio: the temple

A 3D low-poly temple where visitors walk a character around. Each work stands on a pedestal. Pressing **E** near a pedestal brings the work to the front, and pressing it again puts it back. A "Voir toutes les œuvres" button shows every work as a plain page, which is also what search engines index.

Live site: https://nathclrg.github.io/portfolio/

## Run locally

```bash
npm install
npm run dev          # http://localhost:5180
```

## Manage your works (no code)

1. Run `npm run dev` and open **http://localhost:5180/admin** (or click the ⚙ in the bottom-right corner).
2. The first time you visit, you create your admin username and password.
3. Add, edit, reorder or delete works (title, year, tags, software used, link, description, images). A work can have up to 20 images; the first one is the cover shown on the pedestal, and visitors can flip through the rest. You can also change the site title, subtitle, search engine description, and your password.

The temple grows with the number of works. Empty slots (fewer than 6 works) get an "Œuvre à venir" sign.

## Publish (GitHub Pages)

The online site is static: it has no admin panel. You edit locally, then publish:

```bash
git add -A
git commit -m "Update works"
git push
```

Each push to `main` runs `.github/workflows/pages.yml`, which builds the site with `npm run build:pages` (works from `data/site.json`, images from `uploads/`) and deploys it. It is live about a minute later.

To check the static build before pushing: `npm run build:pages && npm run preview:pages`.

The site address is `homepage` in `package.json`. Change it if the site moves (e.g. to a custom domain), since the canonical link, sitemap and social previews are built from it.

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
| `src/admin.js` | Admin panel |

## Controls

- **WASD / ZQSD / arrows**: move (works on both QWERTY and AZERTY)
- **Shift**: run
- **Drag**: look around. **Scroll**: zoom
- **E** near a work: bring it to the front. **E** or **Esc** again: put it back
- **← / →** (or A/D, Q/D on AZERTY) while a work is up: previous / next image. The card also has arrows and thumbnails
- Touch screens get a joystick and an E button.
