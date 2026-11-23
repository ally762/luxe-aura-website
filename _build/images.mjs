// Downloads every content image used by the site and writes a list for optimize_images.py.
// Usage: node _build/images.mjs && python _build/optimize_images.py
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, 'cache', 'img');
fs.mkdirSync(CACHE, { recursive: true });

const urls = new Set();
const add = u => { if (!u) return; let s = u.startsWith('//') ? 'https:' + u : u; if (!/squarespace/.test(s)) return; urls.add(s.split('?')[0]); };
for (const f of fs.readdirSync(path.join(HERE, 'data', 'pages'))) {
  const p = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'pages', f), 'utf8'));
  const walk = it => {
    if (it.type === 'row') return it.cols.forEach(c => c.items.forEach(walk));
    if (it.type === 'image') add(it.src);
    if (it.type === 'gallery') it.images.forEach(i => add(i.src));
    if (it.type === 'summary') it.items.forEach(i => add(i.img?.src));
    for (const h of [it.html, it.caption]) if (h) for (const m of h.matchAll(/<img [^>]*src="([^"]+)"/g)) add(m[1]);
  };
  p.sections.forEach(s => s.items.forEach(walk));
  (p.posts || []).forEach(x => add(x.img?.src));
}

const slug = u => decodeURIComponent(path.basename(u)).replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'image';
const list = [...urls].map(u => ({ url: u, id: `${slug(u)}-${crypto.createHash('sha1').update(u).digest('hex').slice(0, 6)}` }));
let done = 0, failed = 0;
async function get(item) {
  const ext = (path.extname(item.url.split('?')[0]) || '.jpg').toLowerCase().slice(0, 6);
  item.file = path.join(CACHE, item.id + ext);
  if (fs.existsSync(item.file)) { done++; return; }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(item.url + '?format=2500w');
      if (!r.ok) throw new Error(r.status);
      fs.writeFileSync(item.file, Buffer.from(await r.arrayBuffer()));
      done++; return;
    } catch (e) { if (attempt === 2) { failed++; item.error = String(e); } }
  }
}
const queue = [...list];
await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) await get(queue.shift()); }));
fs.writeFileSync(path.join(HERE, 'cache', 'list.json'), JSON.stringify(list, null, 1));
console.log(`images: ${list.length}, downloaded/cached: ${done}, failed: ${failed}`);
