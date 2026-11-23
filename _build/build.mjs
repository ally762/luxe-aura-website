// Generates the redesigned static site from the scraped content in _build/data.
// Content (headings, copy, links, meta, JSON-LD) is used verbatim; only the presentation changes.
// Usage: node _build/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(HERE, 'data', 'pages');
const ORIGIN = 'https://luxeaurahair.com';
const LOGO = 'https://images.squarespace-cdn.com/content/v1/5b36e7e0c3c16a47b4a61889/bd1d206b-ade1-495c-a38e-0807d2bde438/luxeaurahair_logo.webp';
const SKIP = new Set(['/new-page-4', '/search']);
const VERSION = Date.now().toString(36);
const MAP_EMBED = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d6046.648497310843!2d-73.9928103!3d40.7328902!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89c258a7e89a06f5%3A0xbfbf93583a371862!2sLuxe%20Aura%20Hair%20Extensions!5e0!3m2!1sen!2sus!4v1781272569194!5m2!1sen!2sus';

// ---------------------------------------------------------------- load
const pages = fs.readdirSync(DATA).map(f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')));
const norm = p => (p.replace(/\/+$/, '') || '/');
const byPath = new Map(pages.map(p => [norm(p.path), p]));
const built = new Set(pages.filter(p => !SKIP.has(p.path) && norm(p.finalPath) === norm(p.path)).map(p => norm(p.path)));
const redirects = new Map(pages.filter(p => norm(p.finalPath) !== norm(p.path)).map(p => [norm(p.path), norm(p.finalPath)]));
const blogPosts = (byPath.get('/blog')?.posts || []);

// ---------------------------------------------------------------- helpers
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = s => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const depthOf = p => (p === '/' ? 0 : p.split('/').filter(Boolean).length);

const IMAGES = fs.existsSync(path.join(HERE, 'data', 'images.json')) ? JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'images.json'), 'utf8')) : {};
let REL = '';            // path prefix of the page being rendered
let PRELOAD = null;      // hero image to preload for the page being rendered
const imgKey = src => (src || '').replace(/^\/\//, 'https://').split('?')[0];

// Responsive, self-hosted WebP <img>. Falls back to the Squarespace CDN for anything not downloaded.
function pic(src, alt = '', { sizes = '(max-width: 760px) 100vw, 50vw', eager = false, cls = '' } = {}) {
  const m = IMAGES[imgKey(src)];
  const a = `alt="${esc(alt)}"${cls ? ` class="${cls}"` : ''}${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"`;
  if (!m) return `<img src="${esc(imgUrl(src, 1000))}" ${a}>`;
  const set = m.widths.map(w => `${REL}assets/img/c/${m.id}-${w}.webp ${w}w`).join(', ');
  const mid = m.widths.find(w => w >= 960) || m.widths[m.widths.length - 1];
  const h = Math.round(m.h * 1000 / m.w);
  if (eager) PRELOAD = { set, sizes };
  return `<img src="${REL}assets/img/c/${m.id}-${mid}.webp" srcset="${set}" sizes="${sizes}" width="1000" height="${h}" ${a}>`;
}
const largest = src => { const m = IMAGES[imgKey(src)]; return m ? `${REL}assets/img/c/${m.id}-${m.widths[m.widths.length - 1]}.webp` : imgUrl(src, 1500); };

function imgUrl(src, w = 1500) {
  if (!src) return '';
  let u = src.startsWith('//') ? 'https:' + src : src;
  if (/squarespace-cdn\.com|static1\.squarespace/.test(u)) u = u.split('?')[0] + `?format=${w}w`;
  return u;
}

function makeLink(rel) {
  return function link(href) {
    if (!href) return '#';
    let h = href.trim();
    if (h.startsWith(ORIGIN)) h = h.slice(ORIGIN.length) || '/';
    if (h.startsWith('http://luxeaurahair.com')) h = h.slice('http://luxeaurahair.com'.length) || '/';
    if (!h.startsWith('/') || h.startsWith('//')) return h; // external, mailto, tel, #
    const [pth, hash = ''] = h.split('#');
    let p = norm(pth.split('?')[0]);
    if (p.startsWith('/blog/tag/')) p = '/blog';
    if (redirects.has(p)) p = redirects.get(p);
    const suffix = hash ? '#' + hash : '';
    if (p === '/') return (rel || './') + suffix;
    if (built.has(p) || redirects.has(p)) return rel + p.slice(1) + '/' + suffix;
    return ORIGIN + h; // not rebuilt (files, etc.) -> keep working on the live domain
  };
}

function rewriteHtml(html, link) {
  return html
    .replace(/<(h[1-6]|p)>(\s|&nbsp;|<br>)*<\/\1>/g, '')
    // long headings were used as body copy on the old site: keep the tag (SEO), style as text
    .replace(/<h([2-6])>([\s\S]*?)<\/h\1>/g, (m, n, inner) => strip(inner).length > 110 ? `<h${n} class="h-text">${inner}</h${n}>` : m)
    .replace(/href="([^"]*)"/g, (_, h) => `href="${esc(link(h.replace(/&amp;/g, '&')))}"`)
    .replace(/<img ([^>]*?)src="([^"]*)"([^>]*)>/g, (_, a, s, b) => pic(s, ((a + b).match(/alt="([^"]*)"/) || [])[1] || ''))
    .replace(/<a ([^>]*?)target="_blank"/g, '<a $1target="_blank" rel="noopener"');
}

const slugify = s => strip(s).toLowerCase().replace(/&amp;/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// ---------------------------------------------------------------- navigation (same labels/targets as the live site)
const NAV = [
  { label: 'Home', href: '/' },
  { label: 'Hair Extensions', href: '/hair-extention', children: [
    ['Hair Extention', '/hair-extention'], ['KTip Extensions NYC', '/k-tip-hair-extensions-nyc'], ['Microlink Extensions NYC', '/microlink-extensions-nyc'],
    ['Tape In Extensions NYC', '/tape-in-hair-extensions-nyc'], ['Invisible Beaded Weft Extensions NYC', '/invisible-beaded-row-extensions-nyc'],
    ['Hair Extensions After Chemo NYC', '/hair-extensions-after-chemo-nyc'], ['Hair Replacement for Men NYC', '/hair-replacement-for-men-nyc'],
    ['Lacefront Wigs NYC', '/lace-front-wigs-closures'], ['Hair Extensions for Thin Hair', '/hair-extensions-for-thin-hair'],
    ['Hair Extensions for Short Hair', '/hair-extensions-for-short-hair'], ['Hair Extensions For Transgender', '/hair-extensions-for-transgender'],
    ['Best Hair Extensions For Black Women', '/best-hair-extensions-for-black-women'], ['Brazilian Knots Extensions NYC', '/brazilian-knots-extensions-nyc'],
    ['Hair Extensions for Damaged Hair', '/hair-extensions-for-damaged-hair'], ['Hair Extensions for Curly Hair', '/hair-extensions-for-curly-hair'],
    ['Hair Extensions for Alopecia', '/hair-extensions-for-alopecia'],
  ] },
  { label: 'Services', href: '/balayage-highlights-nyc', children: [
    ['Balayage Highlights NYC', '/balayage-highlights-nyc'], ['Olaplex Treatment Salon NYC', '/olaplex-treatment-salon-nyc'],
    ['Brazilian Blowout Salon NYC', '/brazilian-blowout-salon-nyc'], ['Full Head Color Salon NYC', '/full-head-color-salon-nyc'],
    ['Single Process Color Salon NYC', '/single-process-color-salon-nyc'], ['Salon for Highlights NYC', '/salon-for-highlights-nyc'],
    ['Salon for Half Head Highlights NYC', '/salon-for-half-head-highlights-nyc'], ['Salon for Full Highlights NYC', '/salon-for-full-highlights-nyc'],
    ['Salon for Partial Highlights NYC', '/salon-for-partial-highlights-nyc'], ['Keratin Treatment Salon NYC', '/keratin-treatment-salon-nyc'],
    ['Salon for Toner NYC', '/salon-for-toner-nyc'], ['Salon for Relaxers NYC', '/salon-for-relaxers-nyc'], ['Grey Coverage Salon NYC', '/grey-coverage-salon-nyc'],
  ] },
  { label: 'Book Now', href: '/book-now' },
  { label: 'Blog', href: '/blog' },
  { label: 'Contact', href: '/contact' },
];
const SOCIAL = [
  ['Instagram', 'https://www.instagram.com/luxeaurahair', '<path d="M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4Zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM21 8.2c-.1-1.5-.4-2.8-1.5-3.9S17.3 2.9 15.8 2.8C14.3 2.7 9.7 2.7 8.2 2.8 6.7 2.9 5.4 3.2 4.3 4.3S2.9 6.7 2.8 8.2c-.1 1.5-.1 6.1 0 7.6.1 1.5.4 2.8 1.5 3.9s2.4 1.4 3.9 1.5c1.5.1 6.1.1 7.6 0 1.5-.1 2.8-.4 3.9-1.5s1.4-2.4 1.5-3.9c.1-1.5.1-6.1 0-7.6Zm-2 9.3a3 3 0 0 1-1.7 1.7c-1.2.5-4 .4-5.3.4s-4.1.1-5.3-.4a3 3 0 0 1-1.7-1.7c-.5-1.2-.4-4-.4-5.3s-.1-4.1.4-5.3a3 3 0 0 1 1.7-1.7c1.2-.5 4-.4 5.3-.4s4.1-.1 5.3.4a3 3 0 0 1 1.7 1.7c.5 1.2.4 4 .4 5.3s.1 4.1-.4 5.3Z"/>'],
  ['TikTok', 'https://www.tiktok.com/@luxeaurahair', '<path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 1 0 5 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4s-1.9.1-3.3-1.6Z"/>'],
  ['YouTube', 'https://youtube.com/@luxeaurahairproducts1455', '<path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z"/>'],
  ['Facebook', 'https://www.facebook.com/share/1Cc8yrJm99/', '<path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v1.7H7.5V12h2.8v9.5H14V12h2.8l.4-3.5H14Z"/>'],
];
const ICON = {
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8Z" fill="currentColor"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" fill="currentColor"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---------------------------------------------------------------- chrome (Noir Silk)
const SHADES = [
  ['Jet Black', '#0d0a08', '#2a211b', '#8c7a6a'],
  ['Espresso', '#21140c', '#4a2c1b', '#a7795a'],
  ['Chestnut', '#3a1c0f', '#7a4424', '#d08c5a'],
  ['Caramel', '#5c3517', '#b07a40', '#efc58c'],
  ['Honey Blonde', '#7d5c31', '#dcb880', '#fff0cc'],
  ['Platinum', '#9a8f82', '#efe8db', '#ffffff'],
];
const shadeButtons = () => SHADES.map(([n, a, b, c], i) => `<button type="button" class="shade${i === 4 ? ' is-active' : ''}" role="radio" aria-checked="${i === 4}" data-shade='${JSON.stringify([a, b, c])}' style="--a:${a};--b:${b}" title="${n}"><span class="sw"></span><span class="sn">${n}</span></button>`).join('');

function header(cur, link, rel) {
  const isCur = h => norm(h) === cur;
  const items = NAV.filter(n => n.label !== 'Book Now').map(n => {
    if (!n.children) return `<li><a class="nav-link${isCur(n.href) ? ' is-current' : ''}" href="${link(n.href)}">${n.label}</a></li>`;
    const active = n.children.some(([, h]) => isCur(h));
    const half = Math.ceil(n.children.length / 2);
    const cols = [n.children.slice(0, half), n.children.slice(half)].map(c => `<ul>${c.map(([l, h]) => `<li><a href="${link(h)}"${isCur(h) ? ' aria-current="page"' : ''}>${esc(l)}</a></li>`).join('')}</ul>`).join('');
    return `<li class="has-mega"><a class="nav-link${active ? ' is-current' : ''}" href="${link(n.href)}" aria-haspopup="true">${n.label} ${ICON.chev}</a>
      <div class="mega" role="region" aria-label="${n.label}"><div class="mega-inner"><div class="mega-intro"><p class="mega-title">${n.label}</p><a class="btn btn-gold btn-sm" href="${link('/book-now')}"><span>Book Now</span>${ICON.arrow}</a></div><div class="mega-cols">${cols}</div></div></div></li>`;
  }).join('');
  const mobile = NAV.map(n => n.children
    ? `<details class="m-group"><summary>${n.label} ${ICON.chev}</summary><ul>${n.children.map(([l, h]) => `<li><a href="${link(h)}">${esc(l)}</a></li>`).join('')}</ul></details>`
    : `<a class="m-link" href="${link(n.href)}">${n.label}</a>`).join('');
  return `
<a class="skip-link" href="#main">Skip to content</a>
<header class="nav" data-nav>
  <a class="nav-logo" href="${link('/')}" aria-label="Luxe Aura Hair Extensions - Home"><img src="${rel}assets/img/logo.webp" alt="Luxe Aura Hair Extensions" width="500" height="188"></a>
  <nav class="primary-nav" aria-label="Primary"><ul>${items}</ul></nav>
  <a class="nav-call" href="tel:+12122213881">${ICON.phone}<span>(212) 221 - 3881</span></a>
  <a class="btn btn-ink" href="${link('/book-now')}"><span>Book Now</span></a>
  <button class="menu-toggle" aria-label="Open menu" aria-expanded="false" data-menu-toggle><span></span><span></span></button>
</header>
<div class="mobile-menu" data-mobile-menu aria-hidden="true">
  <nav aria-label="Mobile">${mobile}<a class="m-link" href="tel:+12122213881">Call Now</a></nav>
  <a class="btn btn-gold" href="${link('/book-now')}"><span>Book Consultation + Installation</span></a>
</div>`;
}

function contactForm(id) {
  return `<form class="lux-form" data-mail-form novalidate>
    <fieldset class="field-row"><legend class="label">Name</legend>
      <label class="field"><span>First Name <em>(required)</em></span><input name="first" autocomplete="given-name" required></label>
      <label class="field"><span>Last Name <em>(required)</em></span><input name="last" autocomplete="family-name" required></label>
    </fieldset>
    <label class="field"><span>Email <em>(required)</em></span><input type="email" name="email" autocomplete="email" required></label>
    <label class="check"><input type="checkbox" name="news"> <span>Sign up for news and updates</span></label>
    <label class="field"><span>Message <em>(required)</em></span><textarea name="message" rows="4" required></textarea></label>
    <button class="btn btn-gold" type="submit"><span>Submit</span>${ICON.arrow}</button>
    <p class="form-note" role="status" aria-live="polite"></p>
  </form>`;
}

function footer(link, rel) {
  return `
<section class="cta" aria-label="Book an appointment">
  <canvas class="cta-hair hair-canvas" data-hair="cta" aria-hidden="true"></canvas>
  <div class="wrap center">
    <p class="kicker">Luxe Aura Hair Extensions</p>
    <p class="cta-title">Book Consultation <em>+</em> Installation</p>
    <div class="btn-row center"><a class="btn btn-gold" href="${link('/book-now')}"><span>Book Now</span>${ICON.arrow}</a><a class="btn btn-line" href="tel:+12122213881">${ICON.phone}<span>212.221.3881</span></a></div>
  </div>
</section>
<footer class="foot">
  <div class="wrap foot-grid">
    <div class="f-brand">
      <img class="foot-logo" src="${rel}assets/img/logo.webp" alt="Luxe Aura Hair Extensions" width="500" height="188" loading="lazy">
      <p class="foot-h">Luxe Aura Hair Extensions</p>
      <address>52 East 11th Street,<br>New York, NY, 10003,<br>United States</address>
      <p><a href="tel:+12122213881">212.221.3881</a><br><a href="mailto:help@luxeaurahair.com">help@luxeaurahair.com</a></p>
      <ul class="soc">${SOCIAL.map(([n, h, p]) => `<li><a href="${h}" target="_blank" rel="noopener" aria-label="${n}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${p}</svg></a></li>`).join('')}</ul>
    </div>
    <div>
      <p class="foot-h">Hours</p>
      <ul class="hours"><li><span>Mon</span>Closed</li><li><span>Tue</span>10:30AM to 7PM</li><li><span>Wed</span>10:30AM to 7PM</li><li><span>Thu</span>10:30AM to 7PM</li><li><span>Fri</span>10:30AM to 7PM</li><li><span>Sat</span>10:30AM to 8PM</li><li><span>Sun</span>Closed</li></ul>
    </div>
    <div class="f-form">
      <p class="foot-h">Contact Us</p>
      ${contactForm('footer')}
    </div>
    <div class="f-map">
      <p class="foot-h">Find Us</p>
      ${mapEmbed()}
    </div>
  </div>
  <div class="wrap foot-links">
    <a href="${link('/about-us')}">About Us</a><a href="${link('/location')}">Location</a><a href="${link('/hair-extensions-salon-nyc')}">Hair Extensions Salon NYC</a>
    <a href="${link('/slavic-hair-extensions-nyc')}">Slavic Hair Extensions NYC</a><a href="${link('/shop-1')}">Shop</a><a href="${link('/new-gallery')}">Gallery</a><a href="${link('/luxeaurablog')}">Blog</a>
  </div>
  <div class="wrap foot-bottom"><span>&copy; ${new Date().getFullYear()} Luxe Aura Hair Extensions. All rights reserved.</span><span>52 E 11th Street, New York, NY 10003</span></div>
</footer>
<div class="m-bookbar" aria-label="Quick actions"><a href="tel:+12122213881">${ICON.phone}<span>Call</span></a><a class="m-book" href="${link('/book-now')}"><span>Book Now</span>${ICON.arrow}</a></div>
<div class="cookie" data-cookie hidden>
  <p>By using this website, you agree to our use of cookies. We use cookies to provide you with a great experience and to help our website run effectively.</p>
  <button class="btn btn-gold btn-sm" data-cookie-ok><span>OK</span></button>
</div>
<div class="lightbox" data-lightbox hidden><button class="lb-close" aria-label="Close">&times;</button><img alt=""></div>
<div class="page-curtain" aria-hidden="true"><span></span></div>`;
}

// ---------------------------------------------------------------- blocks
function btn(b, link, cls = 'btn-gold') {
  const ext = /^https?:/.test(link(b.href)) && !link(b.href).startsWith(ORIGIN);
  return `<a class="btn ${cls}" href="${esc(link(b.href))}"${ext ? ' target="_blank" rel="noopener"' : ''}><span>${esc(b.text)}</span> ${ICON.arrow}</a>`;
}

function prose(html, link, opts = {}) {
  const h = rewriteHtml(html, link);
  return `<div class="prose${opts.cls ? ' ' + opts.cls : ''}">${h}</div>`;
}

function imageEl(it, w = 1200, cls = '', eager = false) {
  const sizes = w >= 2000 ? '100vw' : w >= 1500 ? '(max-width: 900px) 100vw, 50vw' : '(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 33vw';
  return pic(it.src, it.alt || it.title || '', { sizes, cls, eager });
}

function renderAccordion(it, link) {
  return `<div class="accordion">${it.items.map((x, i) => `
    <details class="acc-item"${i === 0 ? ' open' : ''}><summary><span>${esc(x.title)}</span><i>${ICON.plus}</i></summary><div class="acc-body">${rewriteHtml(x.html, link)}</div></details>`).join('')}</div>`;
}

function renderMenu(it) {
  return `<div class="menu-board">${it.sections.map(s => `
    <div class="menu-sec reveal">
      ${s.title ? `<h3 class="menu-sec-title">${esc(s.title)}</h3>` : ''}${s.desc ? `<p class="menu-sec-desc">${esc(s.desc)}</p>` : ''}
      <ul class="menu-items">${s.items.map(m => `<li><div class="mi-head"><span class="mi-title">${esc(m.title)}</span><span class="mi-dots"></span><span class="mi-price">${esc(m.price)}</span></div>${m.desc ? `<p class="mi-desc">${esc(m.desc)}</p>` : ''}</li>`).join('')}</ul>
    </div>`).join('')}</div>`;
}

function renderGallery(it, cls = '', cols = 0) {
  return `<div class="gallery ${cls}"${cols ? ` style="--cols:${cols}"` : ''}>${it.images.map((im, i) => `<button class="g-item reveal" style="--d:${(i % 5) * 60}ms" data-lightbox-src="${esc(largest(im.src))}" aria-label="View image ${i + 1} full size">${imageEl(im, 750)}</button>`).join('')}</div>`;
}

function renderSummary(it, link) {
  return `<div class="post-grid">${it.items.map((p, i) => postCard({ title: p.title, href: p.href, excerpt: p.excerpt, date: p.date, img: p.img }, link, i)).join('')}</div>`;
}

function postCard(p, link, i = 0) {
  return `<article class="post-card reveal" style="--d:${(i % 3) * 80}ms">
    <a class="pc-media" href="${esc(link(p.href))}" tabindex="-1" aria-hidden="true">${p.img ? imageEl(p.img, 750) : '<span class="pc-ph"></span>'}</a>
    <div class="pc-body">${p.date ? `<span class="pc-date">${esc(p.date)}</span>` : ''}
      <h3 class="pc-title"><a href="${esc(link(p.href))}">${esc(p.title)}</a></h3>
      ${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ''}
      <a class="text-link" href="${esc(link(p.href))}">Read More ${ICON.arrow}</a></div>
  </article>`;
}

function mapEmbed() {
  return `<div class="map-frame reveal"><iframe title="Map of Luxe Aura Hair Extensions, 52 E 11th Street, New York" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${MAP_EMBED}"></iframe></div>`;
}

// Column item renderer (inside grid rows)
function renderColItems(items, link) {
  const imgs = items.filter(x => x.type === 'image');
  const hasCaption = imgs.some(x => x.caption || x.title);
  if (imgs.length === 1 && (hasCaption || items.some(x => x.type === 'button'))) {
    const im = imgs[0];
    const others = items.filter(x => x !== im);
    const media = imageEl(im, 1000);
    return `<article class="card reveal">
      <div class="card-media">${im.href ? `<a href="${esc(link(im.href))}" tabindex="-1" aria-hidden="true">${media}</a>` : media}</div>
      <div class="card-body">
        ${im.caption ? `<div class="prose card-caption">${rewriteHtml(im.caption.replace(/^<p>([^<]*)<\/p>/, (m, t) => strip(t) === strip(im.title) ? `<p class="card-title">${t}</p>` : m), link)}</div>` : (im.title ? `<p class="card-title">${esc(im.title)}</p>` : '')}
        ${others.map(o => o.type === 'button' ? `<div class="btn-row">${btn(o, link, 'btn-text')}</div>` : renderFlowItem(o, link)).join('')}
      </div></article>`;
  }
  return items.map(x => renderFlowItem(x, link)).join('');
}

function renderFlowItem(it, link) {
  switch (it.type) {
    case 'html': return prose(it.html, link, { cls: it.code ? 'code-embed' : '' });
    case 'raw': return `<div class="raw-embed">${it.html}</div>`;
    case 'image': return `<figure class="figure reveal">${imageEl(it, 1500)}${it.caption ? `<figcaption>${rewriteHtml(it.caption, link)}</figcaption>` : ''}</figure>`;
    case 'button': return `<div class="btn-row">${btn(it, link)}</div>`;
    case 'hr': return '<div class="ornament" aria-hidden="true"><span></span></div>';
    case 'menu': return renderMenu(it);
    case 'accordion': return renderAccordion(it, link);
    case 'gallery': return renderGallery(it);
    case 'summary': return renderSummary(it, link);
    case 'map': return mapEmbed();
    case 'form': return `<div class="form-card">${contactForm('page')}</div>`;
    case 'marquee': return marquee(it.items);
    case 'video': return `<div class="video-frame"><iframe src="${esc(it.src)}" title="${esc(it.title || 'Video')}" loading="lazy" allowfullscreen></iframe></div>`;
    case 'quote': return `<blockquote class="pull-quote">${esc(it.text)}${it.source ? `<cite>${esc(it.source)}</cite>` : ''}</blockquote>`;
    case 'row': return `<div class="grid-row cols-${it.cols.length}">${it.cols.map(c => `<div class="grid-col" style="--span:${c.span}">${renderColItems(c.items, link)}</div>`).join('')}</div>`;
    default: return '';
  }
}

function marquee(items) {
  const seq = items.map(t => `<span>${esc(t)}</span><i aria-hidden="true">&#10022;</i>`).join('');
  return `<div class="marquee" role="marquee" aria-label="${esc(items.join(', '))}"><div class="marquee-track"><div class="marquee-seq">${seq}</div><div class="marquee-seq" aria-hidden="true">${seq}</div></div></div>`;
}

// ---------------------------------------------------------------- band layout
const isHeadingOnly = (it, re) => it?.type === 'html' && re.test(strip(it.html)) && strip(it.html).length < 80;
const isReviews = it => it?.type === 'html' && /reviews-section|^Client Reviews/i.test(it.html.slice(0, 400)) && /review/i.test(it.html);

function splitChapters(html) {
  const parts = html.split(/(?=<h2[\s>])/).filter(p => strip(p));
  return parts;
}

function bands(items, link, ctx) {
  const out = [];
  let i = 0;
  let tone = 0;
  let splitFlip = false;
  const band = (cls, inner, attrs = '') => { out.push(`<section class="band ${cls}"${attrs}><div class="container">${inner}</div></section>`); };
  while (i < items.length) {
    const it = items[i];
    const next = items[i + 1];
    if (it.type === 'anchor') { out.push(`<span id="${esc(it.id)}" class="anchor"></span>`); i++; continue; }
    // reviews
    if (isReviews(it)) {
      let inner = `<div class="reviews reveal">${rewriteHtml(it.html, link)}</div>`;
      i++;
      if (items[i]?.type === 'button') { inner += `<div class="btn-row center">${btn(items[i], link, 'btn-gold')}</div>`; i++; }
      band('band-dark band-reviews', inner);
      continue;
    }
    // instagram / gallery with heading
    if (it.type === 'html' && next?.type === 'gallery' && strip(it.html).length < 160) {
      band('band-gallery', `<div class="band-head center reveal">${prose(it.html, link)}</div>${renderGallery(next, 'gallery-strip', next.images.length % 4 === 0 ? 4 : 5)}`);
      i += 2; continue;
    }
    // FAQ
    if (it.type === 'html' && next?.type === 'accordion' && strip(it.html).length < 120) {
      band('band-faq', `<div class="faq-grid"><div class="faq-head reveal">${prose(it.html, link)}</div><div class="reveal">${renderAccordion(next, link)}</div></div>`);
      i += 2; continue;
    }
    if (it.type === 'accordion') { band('band-faq', `<div class="reveal">${renderAccordion(it, link)}</div>`); i++; continue; }
    if (it.type === 'menu') { band('band-menu', renderMenu(it)); i++; continue; }
    if (it.type === 'marquee') { out.push(marquee(it.items)); i++; continue; }
    if (it.type === 'hr') { i++; continue; }
    if (it.type === 'raw') { band('band-embed', `<div class="raw-embed reveal">${it.html}</div>`); i++; continue; }
    if (it.type === 'map') { band('band-map', mapEmbed()); i++; continue; }
    if (it.type === 'summary') { band('band-posts', renderSummary(it, link)); i++; continue; }
    if (it.type === 'gallery') { band('band-gallery', renderGallery(it, 'gallery-masonry')); i++; continue; }
    if (it.type === 'form') { band('band-form', `<div class="form-card reveal">${contactForm('page')}</div>`); i++; continue; }
    // rows: heading-html + row(s) => card grid band
    if (it.type === 'row' || (it.type === 'html' && next?.type === 'row' && strip(it.html).length < 200)) {
      let inner = '';
      if (it.type === 'html') { inner += `<div class="band-head center reveal">${prose(it.html, link)}</div>`; i++; }
      while (items[i]?.type === 'row') { inner += renderFlowItem(items[i], link); i++; }
      band('band-grid', inner);
      continue;
    }
    // image + text => split
    if (it.type === 'image' && (next?.type === 'html' || next?.type === 'button')) {
      i++;
      let text = it.caption ? prose(it.caption, link, { cls: 'split-caption' }) : (it.title ? `<p class="card-title">${esc(it.title)}</p>` : '');
      while (items[i] && (items[i].type === 'html' && !isReviews(items[i]) && !(items[i + 1]?.type === 'accordion' || items[i + 1]?.type === 'gallery' || items[i + 1]?.type === 'row')) || items[i]?.type === 'button') {
        const x = items[i];
        if (x.type === 'button') { const b = [x]; while (items[i + 1]?.type === 'button') b.push(items[++i]); text += `<div class="btn-row">${b.map(y => btn(y, link)).join('')}</div>`; }
        else text += prose(x.html, link);
        i++;
      }
      splitFlip = !splitFlip;
      band(`band-split${splitFlip ? '' : ' flip'}`, `<div class="split"><div class="split-media reveal"><div class="frame">${imageEl(it, 1500)}</div></div><div class="split-text reveal">${text}</div></div>`);
      continue;
    }
    if (it.type === 'image' && (it.caption || it.title)) {
      splitFlip = !splitFlip;
      band(`band-split${splitFlip ? '' : ' flip'}`, `<div class="split"><div class="split-media reveal"><div class="frame">${imageEl(it, 1500)}</div></div><div class="split-text reveal">${it.caption ? prose(it.caption, link, { cls: 'split-caption' }) : `<p class="card-title">${esc(it.title)}</p>`}</div></div>`);
      i++; continue;
    }
    if (it.type === 'image') { band('band-figure', `<figure class="figure wide reveal">${imageEl(it, 2000)}</figure>`); i++; continue; }
    // prose run
    if (it.type === 'html' || it.type === 'button') {
      const run = [];
      while (items[i] && (items[i].type === 'html' || items[i].type === 'button') && !isReviews(items[i]) && !(items[i].type === 'html' && ['accordion', 'gallery', 'row'].includes(items[i + 1]?.type) && strip(items[i].html).length < 200)) run.push(items[i++]);
      if (!run.length) { i++; continue; }
      let inner = '';
      for (let k = 0; k < run.length; k++) {
        const x = run[k];
        if (x.type === 'button') {
          const b = [x]; while (run[k + 1]?.type === 'button') b.push(run[++k]);
          inner += `<div class="btn-row center reveal">${b.map(y => btn(y, link)).join('')}</div>`;
          continue;
        }
        if (x.code) { inner += `<div class="reveal">${prose(x.html, link, { cls: 'code-embed' })}</div>`; continue; }
        const chapters = splitChapters(x.html);
        if (strip(x.html).length > 1200 && chapters.length >= 3) {
          const lead = /^\s*<h2[\s>]/.test(chapters[0]) ? '' : chapters.shift();
          inner += (lead ? `<div class="reveal chapter-lead">${prose(lead, link, { cls: 'prose-center' })}</div>` : '') + `<div class="chapters">${chapters.map((c, n) => { const m = c.match(/^\s*(<h2[\s\S]*?<\/h2>)([\s\S]*)$/) || [null, '', c]; return `<div class="chapter reveal"><div class="chapter-head"><span class="chapter-no" aria-hidden="true">${String(n + 1).padStart(2, '0')}</span>${prose(m[1], link)}</div><div class="chapter-body">${prose(m[2], link)}</div></div>`; }).join('')}</div>`;
        } else inner += `<div class="reveal">${prose(x.html, link, { cls: strip(x.html).length < 700 ? 'prose-center' : '' })}</div>`;
      }
      tone++;
      band(`band-prose${tone % 2 ? '' : ' band-soft'}`, `<div class="prose-wrap">${inner}</div>`);
      continue;
    }
    i++;
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- hero extraction
function extractHero(items) {
  // returns { h1, heroImg, heroButtons, rest }
  const rest = JSON.parse(JSON.stringify(items));
  let h1 = null;
  const takeH1 = (arr) => {
    for (let k = 0; k < arr.length; k++) {
      const x = arr[k];
      if (x.type === 'html' && /<h1[\s>]/.test(x.html)) {
        const m = x.html.match(/<h1[^>]*>[\s\S]*?<\/h1>/);
        h1 = m[0];
        x.html = x.html.replace(m[0], '').trim();
        if (!strip(x.html)) arr.splice(k, 1);
        return k;
      }
      if (x.type === 'row') for (const c of x.cols) { if (takeH1(c.items) >= 0) return k; }
    }
    return -1;
  };
  const at = takeH1(rest);
  let heroImg = null;
  const firstImg = rest.findIndex(x => x.type === 'image');
  if (firstImg >= 0 && firstImg <= 1 && (at < 0 || firstImg <= at) && !(rest[firstImg].caption)) heroImg = rest.splice(firstImg, 1)[0];
  return { h1, heroImg, rest };
}

// line-art diamond matching the logo icon (also the static fallback before the 3D diamond loads)
// ---------------------------------------------------------------- heroes (Noir Silk)
function hero({ h1, heroImg, crumbs, link, kicker, meta = '', variant = 'page', buttons = '' }) {
  return `<section class="hero-page${heroImg ? ' has-media' : ''} hero-${variant}">
  <canvas class="hair-canvas" data-hair="page" aria-hidden="true"></canvas>
  <div class="hero-vignette" aria-hidden="true"></div>
  <div class="wrap hp-inner">
    <div class="hp-copy">
      ${crumbs ? `<nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>` : ''}
      ${kicker ? `<p class="kicker">${kicker}</p>` : ''}
      <div class="hp-title">${h1}</div>
      ${meta}
      <div class="btn-row">${buttons || `<a class="btn btn-gold" href="${link('/book-now')}"><span>Book Now</span>${ICON.arrow}</a><a class="btn btn-line" href="tel:+12122213881">${ICON.phone}<span>Call Now</span></a>`}</div>
    </div>
    ${heroImg ? `<div class="hp-media"><div class="arch">${imageEl(heroImg, 1500, '', true)}</div></div>` : ''}
  </div>
</section>`;
}

const titleFromMeta = t => t.split(/\s[|\-–]\s/)[0].trim();

// ---------------------------------------------------------------- home (concept)
const BA_KEYS = [
  ['chemo', 'HAIR EXTENSIONS FOR CHEMO HAIR'], ['curly', 'HAIR EXTENSIONS FOR CURLY HAIR'], ['alopecia', 'HAIR EXTENSIONS FOR ALOPECIA'],
  ['short', 'HAIR EXTENSIONS FOR SHORT HAIR'], ['thin', 'HAIR EXTENSIONS FOR THIN HAIR'], ['damaged', 'HAIR EXTENSIONS FOR DAMAGED HAIR'],
];
const METHODS = [
  ['KTip Extensions NYC', '/k-tip-hair-extensions-nyc', 'shutterstock-1307360110-1200x-3ce52e'],
  ['Microlink Extensions NYC', '/microlink-extensions-nyc', 'shutterstock-1276035412-1200x-e34c70'],
  ['Tape In Extensions NYC', '/tape-in-hair-extensions-nyc', '8425b92f-55e9-45d1-b745-32cabd8a7060-5fec99'],
  ['Invisible Beaded Weft Extensions NYC', '/invisible-beaded-row-extensions-nyc', 'luxe-weft-bundles-ffec54'],
  ['Hair Replacement for Men NYC', '/hair-replacement-for-men-nyc', 'hair-extention-for-men-eccbeb'],
  ['Lacefront Wigs NYC', '/lace-front-wigs-closures', 'ytf-wig-2-89e3c2'],
  ['Slavic Hair Extensions NYC', '/slavic-hair-extensions-nyc', 'luxe-aura-1023f5'],
  ['Balayage Highlights NYC', '/balayage-highlights-nyc', 'balayage-1-27d266'],
  ['Keratin Treatment Salon NYC', '/keratin-treatment-salon-nyc', 'a9a57639321b8c371c6c2fc5cad2cb6d-1-c244e4'],
];
const picId = (id, alt, sizes) => { const m = Object.values(IMAGES).find(x => x.id === id); return m ? pic(Object.keys(IMAGES).find(k => IMAGES[k] === m), alt, { sizes }) : ''; };

function renderHome(page, link) {
  const flat = [];
  const walk = it => { if (it.type === 'row') it.cols.forEach(c => c.items.forEach(walk)); else flat.push(it); };
  page.sections.forEach(s => s.items.forEach(walk));
  const R = h => rewriteHtml(h, link);
  const h1 = flat.find(x => x.type === 'html' && /<h1/.test(x.html)).html.match(/<h1[^>]*>[\s\S]*?<\/h1>/)[0];
  const heroButtons = page.sections[1].items.filter(x => x.type === 'button');
  const marq = flat.find(x => x.type === 'marquee').items;
  const intro = flat.find(x => x.type === 'html' && /FULL SERVICE HAIR SALON/i.test(strip(x.html))).html;
  const introSmall = (intro.match(/<h3[^>]*>[\s\S]*?<\/h3>/g) || []).join('');
  const h2s = intro.match(/<h2[^>]*>[\s\S]*?<\/h2>/g) || [];
  const fill = (h2s[0] || '').replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/, (m, a, inner) => `<h2${a} class="fill-text">${strip(inner).replace(/&amp;/g, '&').split(' ').map(w => `<span>${esc(w)}</span>`).join(' ')}</h2>`);
  const cards = flat.filter(x => x.type === 'image' && x.caption);
  const nextBtn = c => { const i = flat.indexOf(c); return flat[i + 1]?.type === 'button' ? flat[i + 1] : null; };
  const BA = BA_KEYS.map(([k, title]) => { const c = cards.find(x => x.title === title); return { k, title, caption: c.caption.replace(/^<p>[^<]*<\/p>\s*/, ''), btn: nextBtn(c), img: c }; });
  const wig = cards.find(x => x.title === 'WIG FITTINGS');
  const menu = flat.find(x => x.type === 'menu');
  const reviews = flat.find(x => x.type === 'html' && /reviews-section/.test(x.html));
  const reviewsBtn = flat[flat.indexOf(reviews) + 1];
  const igHead = flat.find(x => x.type === 'html' && /instagram/i.test(strip(x.html)));
  const ig = flat.find(x => x.type === 'gallery');
  const shopHead = flat.find(x => x.type === 'html' && /SHOP HAIR EXTENSIONS/i.test(strip(x.html)));
  const shop = flat.filter((x, i) => x.type === 'image' && !x.caption && flat[i + 1]?.type === 'button' && /luxeaurahair\.store/.test(flat[i + 1].href)).map(x => [x, flat[flat.indexOf(x) + 1]]);
  const faqHead = flat.find(x => x.type === 'html' && /Frequently Asked/i.test(strip(x.html)));
  const faq = flat.find(x => x.type === 'accordion');
  const seq = marq.map(t => `<span>${esc(t)}</span><i aria-hidden="true">&#10022;</i>`).join('');

  return `
<section class="hero" data-extend id="header">
  <div class="hero-sticky">
    <canvas class="hair-canvas" data-hair="hero" aria-hidden="true"></canvas>
    <div class="hero-vignette" aria-hidden="true"></div>
    <div class="hero-copy">
      <p class="kicker">Greenwich Village &middot; New York City</p>
      <div class="hero-h1">${h1}</div>
      <div class="btn-row">${heroButtons.map((b, i) => btn(b, link, i ? 'btn-line' : 'btn-gold')).join('')}</div>
    </div>
    <div class="hero-tools">
      <div class="shade-picker" role="radiogroup" aria-label="Preview a hair shade">
        <p class="tool-label">Try a shade <span>80+ color variations</span></p>
        <div class="shades">${shadeButtons()}</div>
      </div>
      <div class="length-meter" aria-hidden="true">
        <p class="tool-label">Scroll to extend</p>
        <div class="meter"><div class="meter-fill" data-meter></div></div>
        <p class="inches"><span data-inches>12</span>&Prime;</p>
      </div>
    </div>
    <div class="scroll-hint" aria-hidden="true"><span></span></div>
  </div>
</section>
<div class="marquee" role="marquee" aria-label="${esc(marq.join(', '))}"><div class="marquee-track"><div class="marquee-seq">${seq}</div><div class="marquee-seq" aria-hidden="true">${seq}</div></div></div>

<section class="statement" data-fill id="bestextensionsnyc">
  <div class="wrap">
    <div class="statement-small">${R(introSmall)}</div>
    ${fill}
    <div class="statement-after">${R(h2s.slice(1).join(''))}</div>
  </div>
</section>

<section class="ba" id="postchemoextensions">
  <div class="wrap ba-grid">
    <div class="ba-copy">
      <p class="kicker dark">Real clients &middot; Real results</p>
      <div class="ba-tabs" role="tablist" aria-label="Transformations">
        ${BA.map((b, i) => `<button class="ba-tab${i ? '' : ' is-active'}" role="tab" aria-selected="${!i}" data-ba="${b.k}"><span class="no">${String(i + 1).padStart(2, '0')}</span><span>${esc(b.title)}</span></button>`).join('')}
      </div>
      ${BA.map((b, i) => `<div class="ba-panel" data-panel="${b.k}"${i ? ' hidden' : ''}><div class="ba-text">${R(b.caption)}</div>${b.btn ? `<a class="link-arrow" href="${esc(link(b.btn.href))}">${esc(b.btn.text)} ${ICON.arrow}</a>` : ''}</div>`).join('')}
    </div>
    <div class="ba-stage">
      <div class="ba-frame" data-ba-frame style="--pos:50%">
        <img class="ba-after" src="${REL}assets/img/ba/chemo-after.webp" alt="After: hair extensions for chemo hair" width="900" height="1550" data-after>
        <div class="ba-before-wrap"><img class="ba-before" src="${REL}assets/img/ba/chemo-before.webp" alt="Before: hair extensions for chemo hair" width="900" height="1550" data-before></div>
        <span class="ba-label l">Before</span><span class="ba-label r">After</span>
        <div class="ba-handle" aria-hidden="true"><span>${ICON.arrow}</span></div>
        <input class="ba-range" type="range" min="0" max="100" value="50" aria-label="Drag to compare before and after" data-ba-range>
      </div>
      <p class="ba-note">Drag to compare</p>
    </div>
  </div>
</section>

<section class="wig-feature">
  <div class="wrap wig-grid">
    <div class="arch reveal">${pic(wig.src, wig.alt || wig.title, { sizes: '(max-width: 860px) 90vw, 40vw' })}</div>
    <div class="prose reveal">${R(wig.caption.replace(/^<p>([^<]*)<\/p>/, '<p class="wig-title">$1</p>'))}${nextBtn(wig) ? `<div class="btn-row">${btn(nextBtn(wig), link, 'btn-gold')}</div>` : ''}</div>
  </div>
</section>

<section class="ring-section">
  <div class="wrap ring-head">
    <p class="kicker">${esc(marq.slice(0, 3).join(' · '))}</p>
    <p class="display">Hair Extensions</p>
  </div>
  <div class="ring-viewport" data-ring>
    <div class="ring" style="--n:${METHODS.length}">
      ${METHODS.map(([t, h, id], i) => `<a class="ring-card" href="${link(h)}" style="--i:${i}" draggable="false">${picId(id, t, '320px')}<span class="rc-title">${esc(t)}</span><span class="rc-cta">Learn more ${ICON.arrow}</span></a>`).join('')}
    </div>
  </div>
  <p class="ring-hint">Drag to explore</p>
</section>

<section class="menu" id="new-page-1">
  <div class="wrap">${renderMenu(menu)}</div>
</section>

<section class="reviews-band" id="new-page-3">
  <div class="wrap"><div class="reviews">${R(reviews.html)}</div>
  ${reviewsBtn?.type === 'button' ? `<div class="center">${btn(reviewsBtn, link, 'btn-dark')}</div>` : ''}</div>
</section>

<section class="ig" id="instagram">
  <div class="wrap center">${R(igHead.html)}</div>
  <div class="ig-strip">${ig.images.map(im => `<button class="g-item" data-lightbox-src="${esc(largest(im.src))}" aria-label="View image full size">${pic(im.src, im.alt, { sizes: '(max-width: 760px) 50vw, 13vw' })}</button>`).join('')}</div>
</section>

<section class="shop" id="shop-1">
  <div class="wrap">
    <div class="center">${R(shopHead.html)}</div>
    <div class="shop-grid">${shop.map(([im, b]) => `<a class="product reveal" href="${esc(b.href)}" target="_blank" rel="noopener"><div class="p-img">${pic(im.src, b.text, { sizes: '(max-width: 760px) 50vw, 25vw' })}</div><span class="p-name">${esc(b.text)} ${ICON.arrow}</span></a>`).join('')}</div>
  </div>
</section>

<section class="band-faq dark-faq">
  <div class="wrap faq-grid">
    <div class="faq-head">${R(faqHead.html)}</div>
    ${renderAccordion(faq, link)}
  </div>
</section>`;
}

function renderPage(page, link, cur) {
  const items = page.sections.flatMap(s => s.items);
  let { h1, heroImg, rest } = extractHero(items);
  const name = titleFromMeta(page.title);
  if (!h1) h1 = `<h1>${esc(name)}</h1>`;
  const crumbs = `<a href="${link('/')}">Home</a><span>/</span><span aria-current="page">${esc(strip(h1)).slice(0, 60)}</span>`;
  return hero({ h1, heroImg, crumbs, link }) + bands(rest, link, {});
}

function renderBlogIndex(page, link) {
  const name = titleFromMeta(page.title);
  const h1 = `<h1>${esc(name)}</h1>`;
  const crumbs = `<a href="${link('/')}">Home</a><span>/</span><span aria-current="page">Blog</span>`;
  const cards = page.posts.map((p, i) => postCard(p, link, i)).join('');
  return hero({ h1, crumbs, link }) + `<section class="band band-posts"><div class="container"><div class="post-grid">${cards}</div></div></section>`;
}

function renderPost(page, link) {
  const items = page.sections.flatMap(s => s.items);
  const featured = items[0]?.type === 'image' ? items[0] : null;
  const body = items.filter(x => x !== featured);
  const tocs = [];
  const bodyHtml = body.map(x => {
    if (x.type !== 'html') return renderFlowItem(x, link);
    const h = x.html.replace(/<h2>([\s\S]*?)<\/h2>/g, (m, t) => { const id = slugify(t) || 'section-' + tocs.length; tocs.push([id, strip(t)]); return `<h2 id="${id}">${t}</h2>`; });
    return prose(h, link);
  }).join('');
  const p = page.post;
  const meta = `<div class="post-meta"><span>${esc(p.author || 'Luxe Aura Hair')}</span><span>&middot;</span><time datetime="${esc(p.date)}">${esc(p.dateText || p.date)}</time></div>${p.tags.length ? `<ul class="tags">${p.tags.map(t => `<li><a href="${link('/blog')}">${esc(t)}</a></li>`).join('')}</ul>` : ''}`;
  const crumbs = `<a href="${link('/')}">Home</a><span>/</span><a href="${link('/blog')}">Blog</a>`;
  const idx = blogPosts.findIndex(b => norm(b.href) === norm(page.path));
  const related = [1, 2, 3].map(k => blogPosts[(idx + k + blogPosts.length) % blogPosts.length]).filter(Boolean);
  return hero({ h1: `<h1>${esc(p.title)}</h1>`, crumbs, link, meta, variant: 'post' }) + `
<section class="band band-article"><div class="container article-grid">
  <article class="article">${featured ? `<figure class="article-figure reveal">${imageEl(featured, 1600)}</figure>` : ''}${bodyHtml}</article>
  <aside class="article-aside">
    ${tocs.length > 1 ? `<nav class="toc" aria-label="In this article"><p class="toc-title">In this article</p><ol>${tocs.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}</ol></nav>` : ''}
    <div class="aside-card"><p class="aside-title">Luxe Aura Hair Extensions</p><p>52 E 11th Street, New York, NY 10003</p><a class="btn btn-gold btn-sm" href="${link('/book-now')}"><span>Book Now</span></a><a class="text-link" href="tel:+12122213881">(212) 221 - 3881</a></div>
  </aside>
</div></section>
<section class="band band-soft band-posts"><div class="container"><div class="band-head center reveal"><p class="eyebrow">Luxe Aura Blog</p><p class="h2-like">Read More</p></div><div class="post-grid">${related.map((r, i) => postCard(r, link, i)).join('')}</div></div></section>`;
}

// ---------------------------------------------------------------- document
function doc(page, body, cur) {
  const rel = '../'.repeat(depthOf(cur));
  const link = makeLink(rel);
  const canonical = page.canonical || ORIGIN + (cur === '/' ? '/' : cur);
  const ogImage = page.ogImage || LOGO;
  const jsonld = page.jsonld.map(j => `<script type="application/ld+json">${j.replace(/<\/script/gi, '<\\/script')}</script>`).join('\n');
  return `<!doctype html>
<html lang="en-US">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>document.documentElement.classList.add('js')</script>
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:site_name" content="Luxe Aura Hair Extensions">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:type" content="${page.kind === 'post' ? 'article' : 'website'}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="theme-color" content="#0d0a08">
<link rel="icon" type="image/png" href="${rel}assets/img/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${PRELOAD ? `<link rel="preload" as="image" imagesrcset="${PRELOAD.set}" imagesizes="${PRELOAD.sizes}" fetchpriority="high">` : ''}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@0,400;0,500;1,400&family=Jost:wght@300;400;500&display=swap">
<link rel="stylesheet" href="${rel}assets/css/style.css?v=${VERSION}">
${jsonld}
</head>
<body class="kind-${page.kind}${cur === '/' ? ' is-home' : ''}">
${header(cur, link, rel)}
<main id="main">
${body}
</main>
${footer(link, rel)}
<script src="${rel}assets/js/main.js?v=${VERSION}" defer></script>
<script src="${rel}assets/js/hair.js?v=${VERSION}" defer></script>
</body>
</html>
`;
}

function redirectDoc(from, to) {
  const rel = '../'.repeat(depthOf(from));
  const target = to === '/' ? rel || './' : rel + to.slice(1) + '/';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Redirecting…</title><link rel="canonical" href="${ORIGIN}${to}"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${target}"></head><body><a href="${target}">Continue</a></body></html>\n`;
}

// ---------------------------------------------------------------- write
const written = [];
function write(p, html) {
  const file = p === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, ...p.split('/').filter(Boolean), 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  written.push(p);
}

for (const page of pages) {
  const p = norm(page.path);
  if (SKIP.has(p)) continue;
  if (redirects.has(p)) { write(p, redirectDoc(p, redirects.get(p))); continue; }
  const rel = '../'.repeat(depthOf(p));
  const link = makeLink(rel);
  REL = rel; PRELOAD = null;
  let body;
  if (p === '/') body = renderHome(page, link);
  else if (page.kind === 'post') body = renderPost(page, link);
  else if (page.kind === 'blog') body = renderBlogIndex(page, link);
  else body = renderPage(page, link, p);
  write(p, doc(page, body, p));
}

// sitemap + robots + 404
const urls = [...built].filter(p => !SKIP.has(p)).sort();
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${ORIGIN}${u === '/' ? '/' : u}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
const nf = { title: 'Page Not Found | Luxe Aura Hair Extensions', description: '', canonical: ORIGIN + '/404', ogImage: '', jsonld: [], kind: 'page' };
const nfLink = makeLink('/'); REL = ''; PRELOAD = null;
fs.writeFileSync(path.join(ROOT, '404.html'), doc(nf, hero({ h1: '<h1>Page Not Found</h1>', link: nfLink, crumbs: `<a href="/">Home</a>` }), '/').replace(/(href|src)="(?!https?:|\/|#|mailto:|tel:)([^"]*)"/g, '$1="/$2"').replace('<meta name="description" content="">', '<meta name="robots" content="noindex">'));
console.log(`Built ${written.length} pages (${redirects.size} redirects).`);
