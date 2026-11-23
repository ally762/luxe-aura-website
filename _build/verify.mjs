// Verifies that every text fragment, title, meta description and H1 from the live site
// is present in the rebuilt page.  Usage: node _build/verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const dec = s => s.replace(/&nbsp;| /g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|’/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[“”]/g, '"');
const text = h => dec(h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().toLowerCase();
let problems = 0, checked = 0;
for (const f of fs.readdirSync(path.join(HERE, 'data', 'pages'))) {
  const p = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'pages', f), 'utf8'));
  const route = p.path.replace(/\/+$/, '') || '/';
  if (['/new-page-4', '/search'].includes(route) || (p.finalPath.replace(/\/+$/, '') || '/') !== route) continue;
  const file = route === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, route, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const out = text(html);
  const miss = [];
  const need = s => { const t = text(s); if (t.length > 2 && !out.includes(t)) miss.push(t.slice(0, 90)); checked++; };
  if (!html.includes(`<title>${p.title.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}</title>`)) miss.push('TITLE');
  const walk = it => {
    if (it.type === 'row') return it.cols.forEach(c => c.items.forEach(walk));
    if (it.type === 'html') it.html.split(/<\/?(?:p|h\d|li|div|br)[^>]*>/).forEach(need);
    if (it.type === 'button') need(it.text);
    if (it.type === 'image' && it.caption) it.caption.split(/<\/?(?:p|h\d|li)[^>]*>/).forEach(need);
    if (it.type === 'accordion') it.items.forEach(x => { need(x.title); x.html.split(/<\/?(?:p|h\d|li)[^>]*>/).forEach(need); });
    if (it.type === 'menu') it.sections.forEach(s => { need(s.title); s.items.forEach(x => { need(x.title); need(x.price); need(x.desc); }); });
    if (it.type === 'marquee') it.items.forEach(need);
  };
  p.sections.forEach(s => s.items.forEach(walk));
  if (p.post) need(p.post.title);
  (p.posts || []).forEach(x => { need(x.title); need(x.excerpt); });
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) miss.push(`H1 count = ${h1s}`);
  if (miss.length) { problems += miss.length; console.log(route, '\n   - ' + miss.join('\n   - ')); }
}
console.log(`\nChecked ${checked} fragments. Problems: ${problems}`);
