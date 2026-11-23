// Scrapes the live luxeaurahair.com pages into structured JSON so the redesign
// keeps every word of the original (SEO) content.
// Usage: node tools/scrape.mjs   (needs `cheerio` resolvable; see tools/README)
import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'https://luxeaurahair.com';
const OUT = path.resolve('data');

const EXTRA = ['/', '/hair', '/service', '/shop-1', '/naturalbeadedrowsextensions', '/tape-hair',
  '/hair-replacement-for-men', '/hair-extensions-after-chemo', '/lacefront', '/search'];

const KEEP = new Set(['h1','h2','h3','h4','h5','h6','p','ul','ol','li','a','strong','b','em','i','br','blockquote','span','table','thead','tbody','tr','td','th','iframe','sup','sub','u','s','hr','img','figure','figcaption']);

function cleanHtml($, el, keepDivs = false) {
  const $el = $(el).clone();
  $el.find('script,style,noscript,svg,form,button,input,select,textarea').remove();
  $el.find('*').each((_, n) => {
    const tag = n.tagName?.toLowerCase();
    const keep = {};
    if (!KEEP.has(tag) && !(keepDivs && (tag === 'div' || tag === 'section' || tag === 'article'))) { $(n).replaceWith($(n).contents()); return; }
    if (keepDivs && $(n).attr('class')) keep.class = $(n).attr('class');
    if (tag === 'a') { keep.href = $(n).attr('href'); if ($(n).attr('target')) keep.target = '_blank'; }
    if (tag === 'iframe') { keep.src = $(n).attr('src') || $(n).attr('data-src'); keep.title = $(n).attr('title') || 'Embedded content'; }
    if (tag === 'img') { keep.src = $(n).attr('data-src') || $(n).attr('src'); keep.alt = $(n).attr('alt') || ''; }
    for (const a of Object.keys(n.attribs || {})) $(n).removeAttr(a);
    for (const [k, v] of Object.entries(keep)) if (v) $(n).attr(k, v);
  });
  // unwrap spans entirely (styling only)
  let guard = 0;
  if (!keepDivs) while ($el.find('span').length && guard++ < 20) $el.find('span').each((_, s) => $(s).replaceWith($(s).contents()));
  let html = $el.html() || '';
  html = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').replace(/<p>\s*(&nbsp;| )?\s*<\/p>/g, '').trim();
  return html;
}

function img($, $i) {
  const src = $i.attr('data-src') || $i.attr('data-image') || $i.attr('src');
  return src ? { src, alt: $i.attr('alt') || '' } : null;
}

function blockJson($b) {
  try { return JSON.parse($b.attr('data-block-json') || 'null'); } catch { return null; }
}

function parseBlock($, b) {
  const $b = $(b);
  const cls = ($b.attr('class') || '').split(/\s+/);
  const type = (cls.find(c => /-block$/.test(c) && c !== 'sqs-block' && c !== 'website-component-block') || 'unknown').replace(/-block$/, '');
  const $c = $b.find('.sqs-block-content').first().length ? $b.find('.sqs-block-content').first() : $b;
  switch (type) {
    case 'html': case 'markdown': case 'code': case 'embed': {
      if (/vagaro/i.test($c.html() || '')) {
        const raw = $c.find('.sqs-embed-container').html() || $c.html();
        return { type: 'raw', html: raw.trim() };
      }
      const code = type === 'code' || undefined;
      const html = cleanHtml($, $c, !!code);
      return html ? { type: 'html', html, code } : null;
    }
    case 'image': {
      const $i = $b.find('img').first();
      const im = img($, $i);
      if (!im) return null;
      const href = $b.find('a').first().attr('href');
      const title = $b.find('.image-title, .image-card-title').text().trim();
      const caption = cleanHtml($, $b.find('.image-subtitle, .image-caption, figcaption').first());
      return { type: 'image', ...im, href, title, caption };
    }
    case 'button': {
      const $a = $b.find('a').first();
      return $a.length ? { type: 'button', text: $a.text().trim(), href: $a.attr('href') || '#' } : null;
    }
    case 'horizontalrule': return { type: 'hr' };
    case 'spacer': return null;
    case 'menu': {
      const sections = [];
      $b.find('.menu-section').each((_, s) => {
        const $s = $(s);
        const items = [];
        $s.find('.menu-item').each((_, it) => {
          const $it = $(it);
          items.push({
            title: $it.find('.menu-item-title').text().trim(),
            price: ($it.find('.menu-item-price-top').text() || $it.find('.menu-item-price-bottom').text()).trim(),
            desc: $it.find('.menu-item-description').text().trim(),
          });
        });
        sections.push({ title: $s.find('.menu-section-title').text().trim(), desc: $s.find('.menu-section-description').text().trim(), items });
      });
      return { type: 'menu', sections };
    }
    case 'accordion': {
      const items = [];
      $b.find('.accordion-item').each((_, it) => {
        const $it = $(it);
        items.push({ title: $it.find('.accordion-item__title').text().trim(), html: cleanHtml($, $it.find('.accordion-item__description')) });
      });
      return { type: 'accordion', items };
    }
    case 'marquee': {
      let items = [];
      try { items = JSON.parse($b.find('[data-marquee-items]').attr('data-marquee-items') || '[]').map(x => x.text); } catch {}
      return { type: 'marquee', items: items.filter(t => t.trim() && t.trim() !== '|') };
    }
    case 'gallery': case 'instagram': case 'summary-v2': case 'summary': {
      const items = [];
      $b.find('.summary-item').each((_, it) => {
        const $it = $(it);
        const $i = $it.find('img').first();
        items.push({ title: $it.find('.summary-title').text().trim(), href: $it.find('a').first().attr('href'),
          excerpt: $it.find('.summary-excerpt').text().trim(), date: $it.find('.summary-metadata-item--date').text().trim(), img: img($, $i) });
      });
      if (items.length) return { type: 'summary', items };
      const imgs = [];
      $b.find('img').each((_, i) => { const im = img($, $(i)); if (im && !imgs.find(x => x.src === im.src)) imgs.push(im); });
      return imgs.length ? { type: 'gallery', images: imgs } : null;
    }
    case 'video': {
      const j = blockJson($b);
      const url = j?.url || $b.find('iframe').attr('src');
      const html = j?.html;
      let src = url;
      const m = (html || '').match(/src="([^"]+)"/);
      if (m) src = m[1];
      return src ? { type: 'video', src, title: j?.title || '' } : null;
    }
    case 'quote': return { type: 'quote', text: $b.find('blockquote').text().trim(), source: $b.find('figcaption, .source').text().trim() };
    case 'map': { const j = blockJson($b); return { type: 'map', location: j?.location || null }; }
    case 'form': case 'newsletter': {
      const j = blockJson($b);
      const fields = [];
      $b.find('.field, fieldset').each((_, f) => fields.push($(f).find('label, legend').first().text().replace(/\s+/g, ' ').trim()));
      return { type: 'form', kind: type, title: $b.find('.form-title, .newsletter-form-header-title').text().trim(), desc: $b.find('.newsletter-form-header-description').text().trim(), fields };
    }
    case 'socialaccountlinks-v2': case 'socialaccountlinks': {
      const links = []; $b.find('a').each((_, a) => links.push($(a).attr('href'))); return { type: 'social', links };
    }
    default: {
      const html = cleanHtml($, $c);
      return html ? { type: 'html', html, orig: type } : null;
    }
  }
}

function parseLayout($, layout) {
  // Walk Squarespace row/col grid, preserving column spans.
  const walk = (node) => {
    const $n = $(node);
    const kids = $n.children('.row, .col, .sqs-block').toArray();
    const out = [];
    for (const k of kids) {
      const $k = $(k);
      if ($k.hasClass('sqs-block')) { const b = parseBlock($, k); if (b) out.push(b); }
      else if ($k.hasClass('row')) {
        const cols = $k.children('.col').toArray().map(c => {
          const span = +((($(c).attr('class') || '').match(/span-(\d+)/) || [])[1] || 12);
          return { span, items: walk(c) };
        }).filter(c => c.items.length || c.span < 12);
        const nonEmpty = cols.filter(c => c.items.length);
        if (!nonEmpty.length) continue;
        if (cols.length === 1 || nonEmpty.length === 1 && cols.length && cols.every(c => c === nonEmpty[0] || !c.items.length) && nonEmpty[0].span >= 10) out.push(...nonEmpty[0].items);
        else out.push({ type: 'row', cols });
      } else out.push(...walk(k));
    }
    return out;
  };
  return walk(layout);
}

function parseFluid($, $sec) {
  // Squarespace 7.1 fluid engine
  const items = [];
  $sec.find('.fe-block .sqs-block').each((_, b) => { const x = parseBlock($, b); if (x) items.push(x); });
  return items;
}

async function scrape(urlPath) {
  const res = await fetch(ORIGIN + urlPath, { redirect: 'follow' });
  const finalPath = new URL(res.url).pathname;
  const html = await res.text();
  const $ = cheerio.load(html);
  const page = {
    path: urlPath, finalPath, status: res.status,
    title: $('title').first().text().trim(),
    description: $('meta[name=description]').attr('content') || '',
    ogImage: $('meta[property="og:image"]').attr('content') || '',
    canonical: $('link[rel=canonical]').attr('href') || '',
    jsonld: $('script[type="application/ld+json"]').toArray().map(s => $(s).html().trim()),
    bodyClass: $('body').attr('class') || '',
    sections: [],
  };
  const $article = $('article.BlogItem, article.entry, .BlogItem').first();
  if ($article.length) {
    page.kind = 'post';
    page.post = {
      title: $article.find('.BlogItem-title, h1').first().text().trim(),
      date: $article.find('time').first().attr('datetime') || $article.find('time').first().text().trim(),
      dateText: $article.find('time').first().text().trim(),
      author: $article.find('.Blog-meta-item--author, .author').first().text().trim(),
      tags: $article.find('.Blog-meta-item--tags a, .BlogItem-meta a[href*="/tag/"]').toArray().map(a => $(a).text().trim()),
    };
    const lay = $article.find('.sqs-layout').first();
    page.sections.push({ id: 'post', bg: null, items: lay.length ? parseLayout($, lay) : [] });
    return page;
  }
  const $blogList = $('.BlogList');
  if ($blogList.length) {
    page.kind = 'blog';
    page.posts = $blogList.find('article').toArray().map(a => {
      const $a = $(a);
      return {
        title: $a.find('.BlogList-item-title').text().trim(),
        href: $a.find('.BlogList-item-title').attr('href') || $a.find('a').attr('href'),
        excerpt: $a.find('.BlogList-item-excerpt').text().trim(),
        date: $a.find('time').text().trim(),
        img: img($, $a.find('img').first()),
      };
    });
    return page;
  }
  const $secs = $('main .Index-page, main section.page-section');
  if ($secs.length) {
    page.kind = 'index';
    $secs.each((_, s) => {
      const $s = $(s);
      const bgImg = $s.children('.Index-page-image, .section-background').find('img').first();
      const lay = $s.find('.sqs-layout').first();
      const items = $s.find('.fluid-engine').length ? parseFluid($, $s) : (lay.length ? parseLayout($, lay) : []);
      page.sections.push({ id: $s.attr('id') || '', bg: bgImg.length ? img($, bgImg) : null, items });
    });
  } else {
    page.kind = 'page';
    const lay = $('main .sqs-layout, .Main-content .sqs-layout').first();
    const items = lay.length ? parseLayout($, lay) : [];
    if (!items.length) {
      const imgs = [];
      $('main img').each((_, i) => { const im = img($, $(i)); if (im && !imgs.find(x => x.src === im.src)) imgs.push(im); });
      if (imgs.length) items.push({ type: 'gallery', images: imgs });
    }
    page.sections.push({ id: 'content', bg: null, items });
  }
  return page;
}

const sm = await (await fetch(ORIGIN + '/sitemap.xml')).text();
const paths = [...new Set([...EXTRA, ...[...sm.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).filter(u => u.startsWith(ORIGIN) && !u.includes('/tag/')).map(u => new URL(u).pathname)])];
await fs.mkdir(path.join(OUT, 'pages'), { recursive: true });
const index = [];
for (const p of paths) {
  try {
    const page = await scrape(p);
    const name = (p === '/' ? 'home' : p.slice(1).replace(/\//g, '__'));
    await fs.writeFile(path.join(OUT, 'pages', name + '.json'), JSON.stringify(page, null, 1));
    index.push({ path: p, finalPath: page.finalPath, status: page.status, kind: page.kind, title: page.title, sections: page.sections.length, items: page.sections.reduce((a, s) => a + s.items.length, 0) });
    console.log(page.status, page.kind, p, '->', page.finalPath, index.at(-1).items);
  } catch (e) { console.log('ERR', p, e.message); }
}
await fs.writeFile(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));


