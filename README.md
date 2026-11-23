# Luxe Aura Hair Extensions — website redesign

Static redesign of [luxeaurahair.com](https://luxeaurahair.com) ("Noir Silk"): HTML, CSS and vanilla JavaScript, with interactive 3D hair rendered directly in WebGL (no libraries).

Signature features: thousands of GPU-animated hair strands that part under the cursor, a live shade switcher (remembered across pages), hair that grows longer as you scroll the homepage, a before/after drag slider built from the salon's own photos, a 3D services carousel, page transitions and a mobile booking bar.

All page copy, headings, titles, meta descriptions, canonical URLs and JSON-LD schema come from the live site unchanged, so the SEO work carries over. Every URL keeps its original path (for example `/k-tip-hair-extensions-nyc`). Old redirecting paths such as `/hair` and `/tape-hair` still forward to the same pages they did before.

## Structure

```
index.html                 Home page
<page-slug>/index.html     Each page, at its original URL
blog/<post>/index.html     Blog posts
assets/css/style.css       Design system and layout
assets/js/main.js          Navigation, reveals, before/after slider, 3D ring, accordions, lightbox, forms, page transitions
assets/js/hair.js          Interactive 3D hair (plain WebGL2, ~10 KB)
assets/img/logo.webp       Logo, used exactly as supplied
assets/img/c/              All site photos as responsive WebP (480 / 960 / 1440 / 2000 px); small originals AI-upscaled
assets/img/ba/             Before / after halves for the homepage slider
sitemap.xml, robots.txt, 404.html
_build/                    Scraper, generator and content check (not part of the live site)
```

## Rebuilding

```bash
node _build/images.mjs && python _build/optimize_images.py && python _build/split_ba.py   # images (needs opencv-contrib-python-headless<5, Pillow; EDSR/FSRCNN models in _build/cache/models)
node _build/build.mjs     # regenerate all pages from _build/data
node _build/verify.mjs    # check that every original text fragment, title and H1 is present
```

`_build/scrape.mjs` refreshes `_build/data` from the live site. It needs `npm i cheerio`.

## Notes before going live

- Contact forms open the visitor's email app with the message pre-filled, addressed to help@luxeaurahair.com. To receive submissions directly, connect a form service such as Formspree or Netlify Forms.
- The booking page uses the same Vagaro widget as the current site. It only loads on the approved domain.
