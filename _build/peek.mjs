// Compact outline of a scraped page: node tools/peek.mjs <name> [maxChars]
import fs from 'node:fs';
const [name, max = 160] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(`data/pages/${name}.json`, 'utf8'));
const strip = s => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const show = (it, d) => {
  const pad = '  '.repeat(d);
  if (it.type === 'row') { console.log(pad + 'ROW ' + it.cols.map(c => c.span).join('/')); it.cols.forEach((c, i) => { console.log(pad + ' col' + i); c.items.forEach(x => show(x, d + 2)); }); return; }
  let s = it.type;
  if (it.html) s += ` [${it.html.length}] ` + strip(it.html).slice(0, max) + ' | tags:' + [...new Set((it.html.match(/<(\w+)/g) || []))].join('');
  if (it.src) s += ' ' + it.src.slice(-50) + (it.title ? ' T:' + it.title : '') + (it.href ? ' ->' + it.href : '');
  if (it.text) s += ' "' + it.text + '" ' + (it.href || '');
  if (it.items) s += ' ' + it.items.length + ' items: ' + it.items.map(x => x.title).join(' / ').slice(0, max);
  if (it.sections) s += ' ' + it.sections.map(x => `${x.title}(${x.items.length})`).join(', ');
  if (it.images) s += ' ' + it.images.length + ' imgs';
  if (it.fields) s += ' ' + JSON.stringify(it.fields);
  console.log(pad + s);
};
console.log(p.kind, p.title, '|', p.description);
if (p.post) console.log('POST', JSON.stringify(p.post));
if (p.posts) console.log('POSTS', p.posts.length);
for (const s of p.sections) { console.log(`== section #${s.id} bg:${s.bg ? s.bg.src.slice(-40) : '-'}`); s.items.forEach(i => show(i, 1)); }
